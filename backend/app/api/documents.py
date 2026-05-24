from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from pydantic import BaseModel
from typing import Optional
from app.core.retrieval import ingest_document
from app.services.qdrant_service import qdrant_service
from app.config import settings

router = APIRouter()


class IngestTextRequest(BaseModel):
    text: str
    source: str = "manual"
    metadata: dict = {}


class IngestResponse(BaseModel):
    chunks_ingested: int
    source: str
    status: str


@router.post("/documents/ingest", response_model=IngestResponse)
async def ingest_text(req: IngestTextRequest):
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")
    if len(req.text) > 100_000:
        raise HTTPException(status_code=400, detail="Text too large (max 100k chars)")
    count = await ingest_document(req.text, req.source, req.metadata)
    return IngestResponse(chunks_ingested=count, source=req.source, status="success")


@router.post("/documents/upload", response_model=IngestResponse)
async def upload_file(
    file: UploadFile = File(...),
    source: Optional[str] = Form(None),
):
    content = await file.read()
    try:
        text = content.decode("utf-8")
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="File must be UTF-8 encoded text")
    src = source or file.filename or "uploaded_file"
    count = await ingest_document(text, src, {"filename": file.filename})
    return IngestResponse(chunks_ingested=count, source=src, status="success")


@router.get("/documents/stats")
async def get_stats():
    knowledge_count = await qdrant_service.count(settings.QDRANT_COLLECTION)
    memory_count = await qdrant_service.count(settings.QDRANT_MEMORY_COLLECTION)
    return {
        "knowledge_chunks": knowledge_count,
        "memory_entries": memory_count,
        "qdrant_available": qdrant_service.available,
    }
