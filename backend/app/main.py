from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import logging
from app.config import settings
from app.models.chat import init_db
from app.services.qdrant_service import qdrant_service
from app.services.ollama_service import ollama_service
from app.api import chat, sessions, documents, knowledge

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting Aletheia backend...")
    await init_db()
    await qdrant_service.connect()
    ollama_ok = await ollama_service.health_check()
    if ollama_ok:
        models = await ollama_service.list_models()
        logger.info(f"Ollama available. Models: {models}")
    else:
        logger.warning("Ollama not reachable. Start Ollama and pull required models.")
    logger.info("Aletheia backend ready.")
    yield
    logger.info("Shutting down...")


app = FastAPI(
    title="Aletheia API",
    description="Epistemic reasoning assistant backend",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chat.router)
app.include_router(sessions.router, prefix="/api")
app.include_router(documents.router, prefix="/api")
app.include_router(knowledge.router, prefix="/api")


@app.get("/api/health")
async def health():
    ollama_ok = await ollama_service.health_check()
    return {
        "status": "ok",
        "ollama": ollama_ok,
        "qdrant": qdrant_service.available,
        "primary_model": settings.PRIMARY_MODEL,
        "embedding_model": settings.EMBEDDING_MODEL,
    }
