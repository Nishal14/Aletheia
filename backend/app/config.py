from pydantic_settings import BaseSettings
from typing import List, Optional


class Settings(BaseSettings):
    # ── Provider: "ollama" (local) | "groq" | "together" | "openrouter" ──────
    PROVIDER: str = "ollama"
    API_KEY: Optional[str] = None          # required for cloud providers
    API_BASE_URL: Optional[str] = None     # auto-set from PROVIDER if not given

    # ── Model names (change for your cloud provider) ──────────────────────────
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    PRIMARY_MODEL: str = "qwen3:4b"
    VERIFIER_MODEL: str = "phi4-mini"
    EMBEDDING_MODEL: str = "nomic-embed-text"

    # ── Embedding provider (separate from chat if needed) ─────────────────────
    EMBEDDING_PROVIDER: str = "ollama"     # "ollama" | "together" | "jina"
    EMBEDDING_API_KEY: Optional[str] = None

    QDRANT_HOST: str = "localhost"
    QDRANT_PORT: int = 6333
    QDRANT_COLLECTION: str = "aletheia_knowledge"
    QDRANT_MEMORY_COLLECTION: str = "aletheia_memory"
    EMBEDDING_DIM: int = 768

    DATABASE_URL: str = "sqlite+aiosqlite:///./aletheia.db"

    CORS_ORIGINS: List[str] = ["http://localhost:3000"]

    HIGH_CONFIDENCE_THRESHOLD: float = 0.75
    LOW_CONFIDENCE_THRESHOLD: float = 0.40

    TOP_K_CHUNKS: int = 5
    CHUNK_SIZE: int = 512
    CHUNK_OVERLAP: int = 64
    LOKI_MAX_CLAIMS: int = 8
    VERBALIZED_CONF_WEIGHT: float = 0.40

    class Config:
        env_file = ".env"


settings = Settings()
