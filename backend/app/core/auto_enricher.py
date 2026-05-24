"""
Auto-enrichment: when Qdrant retrieval is poor, automatically fetch
from arXiv or Wikipedia, ingest, and re-retrieve before answering.
This gives the bot a self-expanding knowledge base.
"""
import logging
import re
from typing import List, Tuple, AsyncGenerator
from app.models.epistemic import EvidenceChunk
from app.services.knowledge_fetcher import fetch_arxiv, fetch_wikipedia
from app.core.retrieval import ingest_document, retrieve
from app.config import settings

logger = logging.getLogger(__name__)

# Keywords that suggest an arXiv paper query
_PAPER_KEYWORDS = {
    "paper", "arxiv", "preprint", "research", "study", "article",
    "authors", "published", "journal", "conference", "proceedings",
    "propose", "method", "algorithm", "model", "dataset", "benchmark",
    "experiment", "ablation", "sota", "state-of-the-art",
}


def _needs_enrichment(chunks: List[EvidenceChunk], threshold: float = 0.45) -> bool:
    """Return True if retrieval quality is too poor to ground an answer."""
    if not chunks:
        return True
    best_score = max(c.relevance_score for c in chunks)
    return best_score < threshold


def _is_paper_query(query: str) -> bool:
    words = set(query.lower().split())
    return bool(words & _PAPER_KEYWORDS)


def _build_search_query(query: str) -> str:
    """Strip question words and extract the core search terms."""
    stop = {"what", "is", "the", "a", "an", "about", "tell", "me", "explain",
            "describe", "who", "wrote", "are", "does", "how", "does"}
    words = [w for w in re.sub(r"[?.,!]", "", query).split() if w.lower() not in stop]
    return " ".join(words[:8])


async def maybe_enrich(
    query: str,
    existing_chunks: List[EvidenceChunk],
) -> AsyncGenerator[dict, None]:
    """
    Generator that:
    1. Checks if enrichment is needed
    2. Streams status events
    3. Fetches from arXiv or Wikipedia
    4. Ingests into Qdrant
    5. Yields the enriched chunks as a final event
    """
    if not _needs_enrichment(existing_chunks):
        yield {"type": "enrich_result", "chunks": existing_chunks, "enriched": False}
        return

    search_q = _build_search_query(query)
    is_paper = _is_paper_query(query)
    enriched_chunks: List[EvidenceChunk] = []
    source_name = "arXiv" if is_paper else "Wikipedia"

    yield {
        "type": "status",
        "stage": "enriching",
        "message": f"No local knowledge found — searching {source_name} for '{search_q[:50]}'...",
    }

    try:
        if is_paper:
            papers = await fetch_arxiv(search_q, max_results=2)
            if papers:
                for paper in papers:
                    count = await ingest_document(
                        paper["text"], paper["source"],
                        {"title": paper["title"], "authors": paper["authors"], "type": "arxiv"},
                    )
                    logger.info(f"Auto-ingested {paper['source']}: {count} chunks")
                    if count > 0:
                        yield {
                            "type": "status",
                            "stage": "enriching",
                            "message": f"Ingested '{paper['title'][:60]}' ({count} chunks)",
                        }
            else:
                # Fallback to Wikipedia
                article = await fetch_wikipedia(search_q)
                if article:
                    await ingest_document(article["text"], article["source"],
                                          {"title": article["title"], "type": "wikipedia"})
        else:
            article = await fetch_wikipedia(search_q)
            if article:
                count = await ingest_document(article["text"], article["source"],
                                              {"title": article["title"], "type": "wikipedia"})
                if count > 0:
                    yield {
                        "type": "status",
                        "stage": "enriching",
                        "message": f"Ingested Wikipedia: '{article['title'][:60]}' ({count} chunks)",
                    }

        # Re-retrieve with fresh data
        enriched_chunks = await retrieve(query)

    except Exception as e:
        logger.warning(f"Auto-enrichment failed: {e}")
        enriched_chunks = existing_chunks

    was_enriched = len(enriched_chunks) > len(existing_chunks) or (
        enriched_chunks and not existing_chunks
    )

    yield {
        "type": "enrich_result",
        "chunks": enriched_chunks if enriched_chunks else existing_chunks,
        "enriched": was_enriched,
        "source": source_name if was_enriched else None,
    }
