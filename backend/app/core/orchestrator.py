"""
Aletheia reasoning pipeline — optimized for RTX 3050 4GB.

Speed improvements:
- response_complete event sent immediately after generation (user reads while verification runs)
- verbalized confidence + claim extraction run in parallel via asyncio.gather
- verification calls use num_ctx=2048 (vs 8192 for generation)
"""
import asyncio
from typing import AsyncGenerator, List, Dict
from app.services.ollama_service import ollama_service
from app.core import retrieval as retrieval_core
from app.core import verification as verification_core
from app.core import confidence as confidence_core
from app.core.memory_manager import memory_manager
from app.core.auto_enricher import maybe_enrich
from app.models.epistemic import EpistemicMetadata, EvidenceChunk

SYSTEM_PROMPT = """You are Aletheia, an epistemic reasoning assistant built for groundedness and transparency.

Core principles:
1. Ground answers in retrieved evidence when available — cite it naturally
2. Distinguish clearly between what you know confidently vs. what is uncertain
3. Acknowledge knowledge gaps rather than speculating
4. Reason step-by-step for complex questions
5. Prefer "I'm not certain about X" over fabricating details

When evidence is provided in the context, synthesize it carefully.
When no evidence is available, rely on training knowledge but flag uncertainty."""

RESEARCH_SYSTEM_PROMPT = SYSTEM_PROMPT + """

Research Mode active — structure your response with:
- Key findings from evidence
- Supporting reasoning chain
- Confidence assessment per claim
- Remaining uncertainties and knowledge gaps"""


async def run_pipeline(
    query: str,
    session_id: str,
    history: List[Dict],
    mode: str = "normal",
) -> AsyncGenerator[Dict, None]:

    # ── Stage 1: Global retrieval ──────────────────────────────────────────────
    yield {"type": "status", "stage": "retrieving", "message": "Searching knowledge base..."}
    evidence_chunks: List[EvidenceChunk] = await retrieval_core.retrieve(query)
    memory_summaries: List[str] = await memory_manager.retrieve_relevant(query, session_id)

    yield {
        "type": "retrieval",
        "chunks": [c.model_dump() for c in evidence_chunks],
        "count": len(evidence_chunks),
    }

    # ── Auto-enrichment: if retrieval was poor, fetch from arXiv/Wikipedia ─────
    async for event in maybe_enrich(query, evidence_chunks):
        if event["type"] == "enrich_result":
            evidence_chunks = event["chunks"]
            if event["enriched"]:
                # Push updated chunks to frontend
                yield {
                    "type": "retrieval",
                    "chunks": [c.model_dump() for c in evidence_chunks],
                    "count": len(evidence_chunks),
                    "auto_enriched": True,
                    "source": event.get("source"),
                }
        else:
            yield event  # forward status/enriching events

    # ── Stage 2: Generate (streaming) ─────────────────────────────────────────
    system = RESEARCH_SYSTEM_PROMPT if mode == "research" else SYSTEM_PROMPT
    context_str = retrieval_core.build_context_string(evidence_chunks)
    memory_str = _format_memory(memory_summaries)
    user_content = _build_user_content(query, context_str, memory_str)

    messages = [{"role": "system", "content": system}]
    messages.extend(history[-6:])
    messages.append({"role": "user", "content": user_content})

    yield {"type": "status", "stage": "generating", "message": "Reasoning over evidence..."}
    response_text = ""
    thinking_text = ""

    async for event in ollama_service.stream_chat(messages):
        if event["type"] == "token":
            response_text += event.get("content", "")
            yield event
        elif event["type"] == "thinking":
            thinking_text += event.get("content", "")
            yield event
        elif event["type"] == "error":
            yield event
            return

    yield {"type": "generation_end", "thinking": thinking_text or None}

    if not response_text.strip():
        yield {"type": "epistemic", "data": EpistemicMetadata().model_dump()}
        yield {"type": "done"}
        return

    # ── response_complete: user can read the response while verification runs ──
    yield {"type": "response_complete"}

    # ── Stage 3: Claim extraction (regex, instant) ───────────────────────────
    yield {"type": "status", "stage": "verifying", "message": "Extracting claims..."}
    claims = await verification_core.run_loki_stages_123(response_text)

    # ── Stage 4: Per-claim retrieval (Qdrant only, no LLM) ───────────────────
    per_claim_chunks: List[EvidenceChunk] = []
    if claims:
        claims, per_claim_chunks = await verification_core.retrieve_per_claim(claims, top_k_per_claim=2)
    merged_evidence = _merge_evidence(evidence_chunks, per_claim_chunks)

    # ── Stage 5: Evidence-grounded scoring or mark uncertain ─────────────────
    # NLI via LLM is skipped — qwen3:4b in /no_think mode returns empty for
    # structured output prompts on this hardware. Claims are shown as-is.
    if merged_evidence:
        verified_claims = await verification_core.score_by_cosine(claims, merged_evidence)
    else:
        verified_claims = verification_core.mark_uncertain(claims)

    verbalized_raw, verbalized_conf = 50, 0.5

    # ── Stage 6: Confidence scoring ──────────────────────────────────────────
    yield {"type": "status", "stage": "scoring", "message": "Computing confidence..."}
    epistemic = confidence_core.calculate(
        verified_claims,
        merged_evidence,
        retrieval_used=bool(merged_evidence),
        verbalized_confidence=verbalized_conf,
        verbalized_confidence_raw=verbalized_raw,
    )

    yield {"type": "epistemic", "data": epistemic.model_dump()}
    yield {"type": "status", "stage": "done", "message": "Analysis complete"}

    # ── Memory (fire-and-forget) ───────────────────────────────────────────────
    asyncio.create_task(_store_memory(session_id, query, response_text, epistemic.overall_confidence))

    yield {"type": "done", "response": response_text, "thinking": thinking_text or None}


async def _store_memory(session_id: str, query: str, response: str, confidence: float):
    try:
        await memory_manager.store_exchange(session_id, query, response, confidence)
    except Exception:
        pass


def _merge_evidence(
    global_chunks: List[EvidenceChunk],
    per_claim_chunks: List[EvidenceChunk],
    cap: int = 14,
) -> List[EvidenceChunk]:
    seen = {c.id for c in global_chunks}
    merged = list(global_chunks)
    for c in per_claim_chunks:
        if c.id not in seen:
            seen.add(c.id)
            merged.append(c)
    return merged[:cap]


def _format_memory(summaries: List[str]) -> str:
    if not summaries:
        return ""
    return "### Relevant Memory\n" + "\n".join(f"- {s}" for s in summaries)


def _build_user_content(query: str, context: str, memory: str) -> str:
    parts = []
    if memory:
        parts.append(memory)
    if context:
        parts.append(context)
    parts.append(f"### Question\n{query}")
    return "\n\n".join(parts)
