"use client";
import { useMemo } from "react";
import { EpistemicMetadata } from "@/types";

export function useEpistemic(metadata?: EpistemicMetadata) {
  return useMemo(() => {
    if (!metadata) return null;

    const {
      overall_confidence,
      grounding_score,
      hallucination_risk,
      evidence_coverage,
      claims,
      verification_status,
      verbalized_confidence,
      loki_pipeline_used,
      confidence_method,
    } = metadata;

    const supported  = claims.filter((c) => c.support_level === "supported").length;
    const partial    = claims.filter((c) => c.support_level === "partial").length;
    const unsupported = claims.filter((c) => c.support_level === "unsupported").length;
    const uncertain  = claims.filter((c) => c.support_level === "uncertain").length;

    const confidenceLevel =
      overall_confidence >= 0.75 ? "high" :
      overall_confidence >= 0.45 ? "moderate" : "low";

    const riskLevel =
      hallucination_risk >= 0.6 ? "high" :
      hallucination_risk >= 0.35 ? "moderate" : "low";

    return {
      overall_confidence,
      grounding_score,
      hallucination_risk,
      evidence_coverage,
      confidenceLevel,
      riskLevel,
      verification_status,
      claimStats: { supported, partial, unsupported, uncertain },
      totalClaims: claims.length,
      claims,
      // LM-Polygraph / Loki fields
      verbalized_confidence: verbalized_confidence ?? null,
      loki_pipeline_used: loki_pipeline_used ?? false,
      confidence_method: confidence_method ?? "cosine",
    };
  }, [metadata]);
}
