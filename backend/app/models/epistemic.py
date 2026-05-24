from pydantic import BaseModel, Field
from typing import List, Optional
from enum import Enum


class SupportLevel(str, Enum):
    SUPPORTED = "supported"
    PARTIAL = "partial"
    UNSUPPORTED = "unsupported"
    UNCERTAIN = "uncertain"


class Claim(BaseModel):
    text: str
    support_level: SupportLevel = SupportLevel.UNCERTAIN
    confidence: float = Field(default=0.5, ge=0.0, le=1.0)
    evidence_refs: List[str] = []
    type: str = "factual"
    # Loki fields
    checkworthy: bool = True
    search_query: Optional[str] = None
    loki_verdict: Optional[str] = None          # supported | refuted | not_enough_info
    per_claim_evidence_ids: List[str] = []


class EvidenceChunk(BaseModel):
    id: str
    content: str
    source: str = "knowledge_base"
    relevance_score: float = Field(default=0.0, ge=0.0, le=1.0)
    metadata: dict = {}


class EpistemicMetadata(BaseModel):
    overall_confidence: float = Field(default=0.5, ge=0.0, le=1.0)
    grounding_score: float = Field(default=0.0, ge=0.0, le=1.0)
    hallucination_risk: float = Field(default=0.5, ge=0.0, le=1.0)
    evidence_coverage: float = Field(default=0.0, ge=0.0, le=1.0)
    unsupported_claim_count: int = 0
    total_claim_count: int = 0
    claims: List[Claim] = []
    evidence_chunks: List[EvidenceChunk] = []
    verification_status: str = "unverified"
    reasoning_trace: List[str] = []
    retrieval_used: bool = False
    # LM-Polygraph verbalized confidence fields
    verbalized_confidence: Optional[float] = None
    verbalized_confidence_raw: Optional[int] = None
    # Pipeline metadata
    loki_pipeline_used: bool = False
    confidence_method: str = "cosine"           # cosine | loki+verbalized
    confidence_divergence: Optional[float] = None  # |verbalized - loki_score|; high = meta-uncertain


class PipelineStage(str, Enum):
    IDLE = "idle"
    RETRIEVING = "retrieving"
    GENERATING = "generating"
    CONFIDENCE_PROBING = "confidence_probing"
    VERIFYING = "verifying"
    SCORING = "scoring"
    DONE = "done"
    ERROR = "error"


class StreamEvent(BaseModel):
    type: str
    content: Optional[str] = None
    data: Optional[dict] = None
    stage: Optional[str] = None
    message: Optional[str] = None
