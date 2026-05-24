"""
Claim verification pipeline.
Extraction uses regex heuristics (fast, reliable on any hardware).
NLI verification uses a minimal LLM prompt via chat endpoint.
"""
import json
import re
import logging
from typing import List, Tuple
import numpy as np
from app.services.ollama_service import ollama_service
from app.models.epistemic import Claim, SupportLevel, EvidenceChunk
from app.config import settings

logger = logging.getLogger(__name__)

# ─── Regex-based claim extraction (no LLM, instant) ─────────────────────────

# Sentence patterns that strongly suggest a verifiable factual claim
CLAIM_PATTERNS = [
    r'\b\d{4}\b',                          # years
    r'\b\d+(?:\.\d+)?(?:\s*(?:million|billion|percent|%|ms|GB|MB|TB|km|kg|Hz))?\b',
    r'\b[A-Z][a-z]+ [A-Z][a-z]+\b',       # proper names (two capitalized words)
    r'\b(?:published|authored|written|invented|created|developed|founded|released)\b',
    r'\b(?:equation|formula|defined as|given by|computed as|denoted)\b',
    r'\b(?:parameter|dimension|layer|head|model|dataset|benchmark|accuracy|score)\b',
    r'=\s*[\d\w]',                          # assignments like d_model=512
    r'\b(?:arxiv|doi|proceedings|journal|conference|NeurIPS|ICML|ACL|ICLR)\b',
]

COMPILED = [re.compile(p, re.IGNORECASE) for p in CLAIM_PATTERNS]


def _is_checkworthy(sentence: str) -> bool:
    return any(p.search(sentence) for p in COMPILED)


def _extract_sentences(text: str) -> List[str]:
    """Split text into sentences, strip markdown."""
    # Remove markdown formatting
    text = re.sub(r'\*{1,3}([^*\n]+)\*{1,3}', r'\1', text)
    text = re.sub(r'\[([^\]]+)\]\([^)]*\)', r'\1', text)
    text = re.sub(r'^#{1,6}\s+', '', text, flags=re.MULTILINE)
    text = re.sub(r'```[\s\S]*?```', '', text)
    text = re.sub(r'`([^`]+)`', r'\1', text)
    # Split table rows into cells
    text = re.sub(r'\|', '. ', text)
    text = re.sub(r'[-:]{3,}', '', text)
    # Split on sentence boundaries
    sentences = re.split(r'(?<=[.!?])\s+|\n{2,}', text)
    return [s.strip() for s in sentences if len(s.strip()) > 20]


async def run_loki_stages_123(response_text: str) -> List[Claim]:
    """Extract factual claims using regex heuristics. Fast and reliable."""
    if not response_text.strip():
        return []

    sentences = _extract_sentences(response_text)
    claims = []
    seen = set()

    for sent in sentences:
        if not _is_checkworthy(sent):
            continue
        # Deduplicate near-identical claims
        key = re.sub(r'\s+', ' ', sent.lower().strip())[:80]
        if key in seen:
            continue
        seen.add(key)
        claims.append(Claim(
            text=sent[:300],
            checkworthy=True,
            search_query=re.sub(r'[^\w\s]', ' ', sent)[:100].strip(),
        ))
        if len(claims) >= settings.LOKI_MAX_CLAIMS:
            break

    logger.info(f"Regex extraction found {len(claims)} claims")
    return claims


# ─── FIRE-local: per-claim targeted retrieval ────────────────────────────────

async def retrieve_per_claim(
    claims: List[Claim],
    top_k_per_claim: int = 2,
) -> Tuple[List[Claim], List[EvidenceChunk]]:
    from app.core import retrieval as retrieval_core
    from app.services.qdrant_service import qdrant_service
    if not qdrant_service.available:
        return claims, []
    seen_ids: set = set()
    all_chunks: List[EvidenceChunk] = []
    for claim in claims:
        query = claim.search_query or claim.text
        chunks = await retrieval_core.retrieve(query, top_k=top_k_per_claim)
        for chunk in chunks:
            if chunk.id not in seen_ids:
                seen_ids.add(chunk.id)
                all_chunks.append(chunk)
            claim.per_claim_evidence_ids.append(chunk.id)
    return claims, all_chunks


# ─── Loki Stage 5: NLI verdict ───────────────────────────────────────────────

NLI_PROMPT = """For each claim, output its verdict on one line: SUPPORTED, REFUTED, or UNCERTAIN.
Use REFUTED when you are confident the claim is wrong.
Use SUPPORTED when you are confident it is correct.

{claims_block}

Verdicts (one per line, format: N. VERDICT):"""

KB_PROMPT = """For each numbered claim, output: N. LIKELY_TRUE, N. LIKELY_FALSE, or N. UNCERTAIN.
Flag LIKELY_FALSE for clear factual errors you know about.

{claims_block}

Verdicts:"""

VERDICT_MAP_EVIDENCE = {
    "supported": SupportLevel.SUPPORTED,
    "refuted": SupportLevel.UNSUPPORTED,
    "uncertain": SupportLevel.UNCERTAIN,
}
VERDICT_MAP_KB = {
    "likely_true": SupportLevel.PARTIAL,
    "likely_false": SupportLevel.UNSUPPORTED,
    "uncertain": SupportLevel.UNCERTAIN,
}


async def run_loki_stage5(
    claims: List[Claim],
    evidence_chunks: List[EvidenceChunk],
) -> List[Claim]:
    checkworthy = [c for c in claims if c.checkworthy]
    if not checkworthy:
        for c in claims:
            c.support_level = SupportLevel.UNCERTAIN
            c.confidence = 0.4
        return claims

    if evidence_chunks:
        return await _nli_with_evidence(claims, checkworthy, evidence_chunks)
    return await _nli_knowledge(claims, checkworthy)


async def _nli_with_evidence(all_claims, checkworthy, evidence_chunks):
    ev_text = "\n".join(f"[{i+1}] {c.content[:300]}" for i, c in enumerate(evidence_chunks[:6]))
    claims_block = "\n".join(f"{i+1}. {c.text[:150]}" for i, c in enumerate(checkworthy))
    prompt = f"Evidence:\n{ev_text}\n\nClaims:\n{claims_block}\n\n" + \
             "For each claim: SUPPORTED, REFUTED, or UNCERTAIN. Format: N. VERDICT"
    raw = await ollama_service.complete(prompt, temperature=0.0, max_tokens=2000, num_ctx=3072)
    return _parse_line_verdicts(all_claims, checkworthy, raw, VERDICT_MAP_EVIDENCE)


async def _nli_knowledge(all_claims, checkworthy):
    claims_block = "\n".join(f"{i+1}. {c.text[:150]}" for i, c in enumerate(checkworthy))
    prompt = KB_PROMPT.format(claims_block=claims_block)
    raw = await ollama_service.complete(prompt, temperature=0.0, max_tokens=2000, num_ctx=2048)
    return _parse_line_verdicts(all_claims, checkworthy, raw, VERDICT_MAP_KB)


def _parse_line_verdicts(all_claims, checkworthy, raw, verdict_map):
    """Parse 'N. VERDICT' lines from LLM output."""
    raw = re.sub(r"<think>.*?</think>", "", raw, flags=re.DOTALL)
    verdicts = {}
    for line in raw.split("\n"):
        m = re.match(r"^\s*(\d+)[.)]\s*(\w+)", line.strip())
        if m:
            idx = int(m.group(1)) - 1
            verdict_str = m.group(2).lower()
            verdicts[idx] = verdict_str

    for i, claim in enumerate(checkworthy):
        vstr = verdicts.get(i, "uncertain")
        claim.loki_verdict = vstr
        claim.support_level = verdict_map.get(vstr, SupportLevel.UNCERTAIN)
        claim.confidence = 0.75 if claim.support_level == SupportLevel.SUPPORTED else \
                           0.75 if claim.support_level == SupportLevel.UNSUPPORTED else 0.4

    for c in all_claims:
        if not c.checkworthy:
            c.support_level = SupportLevel.UNCERTAIN
            c.confidence = 0.5
    return all_claims


# ─── Simple scoring helpers (no LLM) ─────────────────────────────────────────

def mark_uncertain(claims: List[Claim]) -> List[Claim]:
    """Mark all claims uncertain when no evidence is available."""
    for c in claims:
        c.support_level = SupportLevel.UNCERTAIN
        c.confidence = 0.5
        c.loki_verdict = "not_enough_info"
    return claims


async def score_by_cosine(
    claims: List[Claim],
    evidence_chunks: List[EvidenceChunk],
) -> List[Claim]:
    """Score claims against evidence using embedding cosine similarity."""
    if not evidence_chunks:
        return mark_uncertain(claims)
    ev_embs = [await ollama_service.get_embedding(c.content) for c in evidence_chunks]
    for claim in claims:
        emb = await ollama_service.get_embedding(claim.text)
        if not emb:
            claim.support_level = SupportLevel.UNCERTAIN
            claim.confidence = 0.4
            continue
        scores = [cosine_similarity(emb, e) for e in ev_embs]
        best = max(scores) if scores else 0.0
        best_idx = scores.index(best) if scores else -1
        if best >= 0.65:
            claim.support_level = SupportLevel.SUPPORTED
            claim.confidence = min(0.9, best)
        elif best >= 0.40:
            claim.support_level = SupportLevel.PARTIAL
            claim.confidence = best
        else:
            claim.support_level = SupportLevel.UNCERTAIN
            claim.confidence = max(0.2, best)
        if best_idx >= 0:
            claim.evidence_refs = [evidence_chunks[best_idx].id]
    return claims


# ─── Legacy / cosine fallback ─────────────────────────────────────────────────

async def extract_claims(response_text: str) -> List[Claim]:
    return await run_loki_stages_123(response_text)


async def verify_claims(claims: List[Claim], evidence_chunks: List[EvidenceChunk]) -> List[Claim]:
    if not claims or not evidence_chunks:
        for c in claims:
            c.support_level = SupportLevel.UNSUPPORTED
            c.confidence = 0.2
        return claims
    ev_embs = [await ollama_service.get_embedding(c.content) for c in evidence_chunks]
    for claim in claims:
        emb = await ollama_service.get_embedding(claim.text)
        if not emb:
            continue
        scores = [cosine_similarity(emb, e) for e in ev_embs]
        best = max(scores) if scores else 0.0
        claim.support_level = SupportLevel.SUPPORTED if best >= 0.65 else \
                              SupportLevel.PARTIAL if best >= 0.40 else SupportLevel.UNSUPPORTED
        claim.confidence = min(0.95, best)
    return claims


def cosine_similarity(a, b):
    if not a or not b:
        return 0.0
    na, nb = np.array(a), np.array(b)
    n1, n2 = np.linalg.norm(na), np.linalg.norm(nb)
    return float(np.dot(na, nb) / (n1 * n2)) if n1 and n2 else 0.0


def _parse_json_block(text: str):
    if not text:
        return None
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL)
    text = re.sub(r"```(?:json)?\s*", "", text).strip()
    try:
        return json.loads(text)
    except Exception:
        m = re.search(r"\{[\s\S]*\}", text)
        if m:
            try:
                return json.loads(m.group())
            except Exception:
                pass
    return None
