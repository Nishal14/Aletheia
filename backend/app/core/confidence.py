"""
Confidence scoring combining:
- Loki NLI-grounding score (claim-level verdicts)
- Evidence coverage (retrieval quality)
- LM-Polygraph verbalized confidence (black-box self-assessment)

Blending formula (when verbalized confidence available):
  overall = 0.60 * loki_score + 0.40 * verbalized_confidence
  loki_score = 0.55 * grounding_score + 0.45 * evidence_coverage

Fallback (cosine mode, no verbalized confidence):
  overall = 0.55 * grounding_score + 0.45 * evidence_coverage
"""
from typing import List, Optional
from app.models.epistemic import Claim, EvidenceChunk, EpistemicMetadata, SupportLevel
from app.config import settings


def calculate(
    claims: List[Claim],
    evidence_chunks: List[EvidenceChunk],
    retrieval_used: bool = True,
    verbalized_confidence: Optional[float] = None,
    verbalized_confidence_raw: Optional[int] = None,
) -> EpistemicMetadata:

    loki_used = verbalized_confidence is not None
    evidence_coverage = _evidence_coverage(evidence_chunks)

    if not claims:
        # No claims extracted — grounding/hallucination metrics are meaningless.
        # Only verbalized confidence is a valid signal here.
        self_conf = verbalized_confidence if verbalized_confidence is not None else 0.5
        return EpistemicMetadata(
            overall_confidence=round(self_conf, 4),
            grounding_score=0.0,        # not computable — no claims verified
            hallucination_risk=0.5,     # unknown — do not display as meaningful
            evidence_coverage=evidence_coverage,
            unsupported_claim_count=0,
            total_claim_count=0,
            claims=[],
            evidence_chunks=evidence_chunks,
            verification_status="no_claims",
            retrieval_used=retrieval_used,
            verbalized_confidence=verbalized_confidence,
            verbalized_confidence_raw=verbalized_confidence_raw,
            loki_pipeline_used=loki_used,
            confidence_method="verbalized_only" if loki_used else "cosine",
            confidence_divergence=None,
        )

    total = len(claims)
    supported = sum(1 for c in claims if c.support_level == SupportLevel.SUPPORTED)
    partial = sum(1 for c in claims if c.support_level == SupportLevel.PARTIAL)
    unsupported = sum(1 for c in claims if c.support_level == SupportLevel.UNSUPPORTED)

    grounding_score = (supported + 0.5 * partial) / total

    if evidence_chunks:
        loki_score = 0.55 * grounding_score + 0.45 * evidence_coverage
    else:
        loki_score = 0.4 * grounding_score

    divergence = None
    if verbalized_confidence is not None:
        weight = settings.VERBALIZED_CONF_WEIGHT
        overall = (1.0 - weight) * loki_score + weight * verbalized_confidence
        method = "loki+verbalized"
        divergence = round(abs(verbalized_confidence - loki_score), 4)
    else:
        overall = loki_score
        method = "cosine"

    overall = max(0.05, min(0.98, overall))
    grounding_score = max(0.0, min(1.0, grounding_score))
    hallucination_risk = max(0.02, min(0.98, 1.0 - grounding_score))

    return EpistemicMetadata(
        overall_confidence=round(overall, 4),
        grounding_score=round(grounding_score, 4),
        hallucination_risk=round(hallucination_risk, 4),
        evidence_coverage=round(evidence_coverage, 4),
        unsupported_claim_count=unsupported,
        total_claim_count=total,
        claims=claims,
        evidence_chunks=evidence_chunks,
        verification_status=_verification_status(grounding_score, unsupported, total),
        retrieval_used=retrieval_used,
        verbalized_confidence=round(verbalized_confidence, 4) if verbalized_confidence is not None else None,
        verbalized_confidence_raw=verbalized_confidence_raw,
        loki_pipeline_used=loki_used,
        confidence_method=method,
        confidence_divergence=divergence,
    )


def _evidence_coverage(chunks: List[EvidenceChunk]) -> float:
    if not chunks:
        return 0.0
    high_quality = sum(1 for c in chunks if c.relevance_score >= 0.5)
    return min(1.0, high_quality / max(len(chunks), 1))


def _verification_status(grounding: float, unsupported: int, total: int) -> str:
    if total == 0:
        return "no_claims"
    if grounding >= 0.80:
        return "well_grounded"
    if grounding >= 0.50:
        return "partially_grounded"
    if unsupported / total >= 0.60:
        return "poorly_grounded"
    return "uncertain"
