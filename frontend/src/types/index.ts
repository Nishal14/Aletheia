export type SupportLevel = "supported" | "partial" | "unsupported" | "uncertain";

export interface Claim {
  text: string;
  support_level: SupportLevel;
  confidence: number;
  evidence_refs: string[];
  type: string;
  // Loki fields
  checkworthy?: boolean;
  search_query?: string | null;
  loki_verdict?: "supported" | "refuted" | "not_enough_info" | "likely_true" | "uncertain" | "likely_false" | null;
  per_claim_evidence_ids?: string[];
}

export interface EvidenceChunk {
  id: string;
  content: string;
  source: string;
  relevance_score: number;
  metadata: Record<string, unknown>;
}

export interface EpistemicMetadata {
  overall_confidence: number;
  grounding_score: number;
  hallucination_risk: number;
  evidence_coverage: number;
  unsupported_claim_count: number;
  total_claim_count: number;
  claims: Claim[];
  evidence_chunks: EvidenceChunk[];
  verification_status: string;
  reasoning_trace: string[];
  retrieval_used: boolean;
  // LM-Polygraph verbalized confidence
  verbalized_confidence?: number | null;
  verbalized_confidence_raw?: number | null;
  // Pipeline metadata
  loki_pipeline_used?: boolean;
  confidence_method?: "cosine" | "loki+verbalized" | "verbalized_only";
  confidence_divergence?: number | null;  // |verbalized - loki_score|; >0.3 = meta-uncertain
}

export type PipelineStage =
  | "idle"
  | "retrieving"
  | "enriching"
  | "generating"
  | "confidence_probing"
  | "verifying"
  | "scoring"
  | "done"
  | "error";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  thinking?: string;
  created_at: string;
  epistemic_metadata?: EpistemicMetadata;
  retrieval_chunks?: EvidenceChunk[];
  isStreaming?: boolean;
}

export interface Session {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  mode: "normal" | "research";
  message_count: number;
}

export type StreamEvent =
  | { type: "status"; stage: PipelineStage; message: string }
  | { type: "token"; content: string; thinking: boolean }
  | { type: "thinking"; content: string }
  | { type: "retrieval"; chunks: EvidenceChunk[]; count: number }
  | { type: "epistemic"; data: EpistemicMetadata }
  | { type: "generation_end"; thinking: string | null }
  | { type: "response_complete" }
  | { type: "message_saved"; id: string }
  | { type: "done"; response?: string; thinking?: string | null }
  | { type: "error"; content: string };
