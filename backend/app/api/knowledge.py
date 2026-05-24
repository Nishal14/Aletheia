from fastapi import APIRouter
from pydantic import BaseModel
from typing import List, Optional
from app.services.knowledge_fetcher import fetch_arxiv, fetch_wikipedia
from app.core.retrieval import ingest_document
from app.services.qdrant_service import qdrant_service
from app.config import settings

router = APIRouter()


class ArxivRequest(BaseModel):
    query: str
    max_results: int = 5


class WikipediaRequest(BaseModel):
    title: str


class ArxivResult(BaseModel):
    id: str
    title: str
    authors: str
    published: str
    chunks_ingested: int


class IngestResponse(BaseModel):
    sources_ingested: int
    chunks_ingested: int
    results: List[dict] = []


@router.post("/knowledge/arxiv", response_model=IngestResponse)
async def ingest_arxiv(req: ArxivRequest):
    if not req.query.strip():
        return IngestResponse(sources_ingested=0, chunks_ingested=0)

    papers = await fetch_arxiv(req.query, max_results=min(req.max_results, 10))
    total_chunks = 0
    results = []

    for paper in papers:
        chunks = await ingest_document(
            text=paper["text"],
            source=paper["source"],
            metadata={"title": paper["title"], "authors": paper["authors"], "type": "arxiv"},
        )
        total_chunks += chunks
        results.append({
            "id": paper["id"],
            "title": paper["title"],
            "authors": paper["authors"],
            "published": paper["published"],
            "chunks": chunks,
        })

    return IngestResponse(
        sources_ingested=len(papers),
        chunks_ingested=total_chunks,
        results=results,
    )


@router.post("/knowledge/wikipedia", response_model=IngestResponse)
async def ingest_wikipedia(req: WikipediaRequest):
    if not req.title.strip():
        return IngestResponse(sources_ingested=0, chunks_ingested=0)

    article = await fetch_wikipedia(req.title)
    if not article:
        return IngestResponse(sources_ingested=0, chunks_ingested=0)

    chunks = await ingest_document(
        text=article["text"],
        source=article["source"],
        metadata={"title": article["title"], "type": "wikipedia"},
    )
    return IngestResponse(
        sources_ingested=1,
        chunks_ingested=chunks,
        results=[{"title": article["title"], "chars": article["chars"], "chunks": chunks}],
    )


@router.get("/knowledge/stats")
async def knowledge_stats():
    knowledge_count = await qdrant_service.count(settings.QDRANT_COLLECTION)
    memory_count = await qdrant_service.count(settings.QDRANT_MEMORY_COLLECTION)
    return {
        "knowledge_chunks": knowledge_count,
        "memory_entries": memory_count,
        "qdrant_available": qdrant_service.available,
    }
