from typing import List, Optional
import re
from app.services.ollama_service import ollama_service
from app.services.qdrant_service import qdrant_service
from app.models.epistemic import EvidenceChunk
from app.config import settings

_STOP_WORDS = {"what", "which", "how", "when", "where", "why", "who", "tell",
               "explain", "describe", "summarize", "about", "the", "a", "an",
               "paper", "article", "work", "study", "research", "is", "are", "was"}

def _extract_title(query: str) -> Optional[str]:
    """Find a likely paper title in the query by locating Title_Case word sequences."""
    # Prefer multi-word Title_Case sequences (e.g. "Deep Ignorance")
    for m in re.finditer(r'\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b', query):
        words = m.group(1).split()
        if 2 <= len(words) <= 8 and not any(w.lower() in _STOP_WORDS for w in words):
            return m.group(1)
    # Fallback: single significant capitalized word
    for m in re.finditer(r'\b([A-Z][a-z]{3,})\b', query):
        if m.group(1).lower() not in _STOP_WORDS:
            return m.group(1)
    return None


def chunk_text(text: str, chunk_size: int = None, overlap: int = None) -> List[str]:
    chunk_size = chunk_size or settings.CHUNK_SIZE
    overlap = overlap or settings.CHUNK_OVERLAP
    sentences = re.split(r"(?<=[.!?])\s+", text.strip())
    chunks, current, current_len = [], [], 0
    for sentence in sentences:
        wc = len(sentence.split())
        if current_len + wc > chunk_size and current:
            chunks.append(" ".join(current))
            # overlap: keep last few sentences
            overlap_words = 0
            overlap_sentences = []
            for s in reversed(current):
                overlap_words += len(s.split())
                if overlap_words >= overlap:
                    break
                overlap_sentences.insert(0, s)
            current = overlap_sentences
            current_len = sum(len(s.split()) for s in current)
        current.append(sentence)
        current_len += wc
    if current:
        chunks.append(" ".join(current))
    return [c for c in chunks if len(c.strip()) > 20]


async def ingest_document(text: str, source: str, metadata: dict = None) -> int:
    chunks = chunk_text(text)
    count = 0
    for i, chunk in enumerate(chunks):
        embedding = await ollama_service.get_embedding(chunk)
        if not embedding:
            continue
        payload = {
            "content": chunk,
            "source": source,
            "chunk_index": i,
            "total_chunks": len(chunks),
            **(metadata or {}),
        }
        await qdrant_service.upsert(
            collection=settings.QDRANT_COLLECTION,
            vector=embedding,
            payload=payload,
        )
        count += 1
    return count


async def retrieve(
    query: str,
    top_k: int = None,
    filter_conditions: Optional[dict] = None,
) -> List[EvidenceChunk]:
    if not qdrant_service.available:
        return []
    top_k = top_k or settings.TOP_K_CHUNKS
    embedding = await ollama_service.get_embedding(query)
    if not embedding:
        return []

    def _to_chunks(results: list) -> List[EvidenceChunk]:
        return [
            EvidenceChunk(
                id=r["id"],
                content=r["payload"].get("content", ""),
                source=r["payload"].get("source", "knowledge_base"),
                relevance_score=r["score"],
                metadata={k: v for k, v in r["payload"].items() if k not in ("content", "source")},
            )
            for r in results
        ]

    # If query asks about a specific paper by title, also search using just
    # the extracted title — this gives much better scores for named-entity lookups.
    title = _extract_title(query)
    title_embedding = None
    if title:
        title_embedding = await ollama_service.get_embedding(title)

    # Semantic search
    results = await qdrant_service.search(
        collection=settings.QDRANT_COLLECTION,
        vector=embedding,
        top_k=top_k,
        filter_conditions=filter_conditions,
        score_threshold=0.20,
    ) or await qdrant_service.search(
        collection=settings.QDRANT_COLLECTION,
        vector=embedding,
        top_k=top_k,
        filter_conditions=filter_conditions,
        score_threshold=0.10,
    )

    # Keyword search for the extracted title — ALWAYS runs when a title is found.
    # This surfaces papers with metaphorical titles (e.g. "Deep Ignorance") that
    # score poorly on semantic similarity despite being the exact requested paper.
    if title:
        kw_results = await qdrant_service.keyword_search(
            collection=settings.QDRANT_COLLECTION,
            keyword=title,
            top_k=2,
        )
        if kw_results:
            seen = {r["id"] for r in kw_results}
            merged = kw_results + [r for r in results if r["id"] not in seen]
            return _to_chunks(merged[:top_k])

    return _to_chunks(results)


def build_context_string(chunks: List[EvidenceChunk]) -> str:
    if not chunks:
        return ""
    parts = ["### Retrieved Evidence\n"]
    for i, chunk in enumerate(chunks, 1):
        parts.append(f"[{i}] (Source: {chunk.source}, Relevance: {chunk.relevance_score:.2f})\n{chunk.content}\n")
    return "\n".join(parts)
