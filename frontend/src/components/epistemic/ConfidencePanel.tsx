"use client";
import { motion } from "framer-motion";
import { EpistemicMetadata } from "@/types";
import { useEpistemic } from "@/hooks/useEpistemic";
import {
  formatConfidence,
  supportLevelBg,
  supportLevelDot,
  verificationStatusLabel,
  truncate,
} from "@/lib/utils";
import { ShieldCheck, AlertTriangle, TrendingUp, BookOpen, ChevronDown, ChevronUp, Gauge, FlaskConical } from "lucide-react";
import { useState } from "react";

interface ConfidencePanelProps {
  metadata: EpistemicMetadata;
}

export function ConfidencePanel({ metadata }: ConfidencePanelProps) {
  const ep = useEpistemic(metadata);
  const [showClaims, setShowClaims] = useState(false);

  if (!ep) return null;

  const isLokiPipeline = metadata.loki_pipeline_used ?? false;
  const verbalizedConf = metadata.verbalized_confidence ?? null;
  const divergence = metadata.confidence_divergence ?? null;
  const isMetaUncertain = divergence !== null && divergence > 0.30;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="glass-card p-4 space-y-4"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-primary/20 flex items-center justify-center">
            <ShieldCheck className="w-3.5 h-3.5 text-primary" />
          </div>
          <span className="text-xs font-semibold text-foreground/80 uppercase tracking-wider">
            Epistemic Analysis
          </span>
          {isLokiPipeline && (
            <span className="text-[10px] text-purple-400 bg-purple-500/10 border border-purple-500/20 rounded-full px-1.5 py-0.5 flex items-center gap-1">
              <FlaskConical className="w-2.5 h-2.5" />
              Loki+LM-Polygraph
            </span>
          )}
        </div>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${
          ep.confidenceLevel === "high"
            ? "bg-green-500/10 border-green-500/30 text-green-400"
            : ep.confidenceLevel === "moderate"
            ? "bg-yellow-500/10 border-yellow-500/30 text-yellow-400"
            : "bg-red-500/10 border-red-500/30 text-red-400"
        }`}>
          {verificationStatusLabel(ep.verification_status)}
        </span>
      </div>

      {/* Meta-uncertainty warning: shown when verbalized and NLI signals conflict */}
      {isMetaUncertain && (
        <div className="flex items-start gap-2 text-xs bg-orange-500/8 border border-orange-500/20 rounded-lg px-3 py-2">
          <AlertTriangle className="w-3.5 h-3.5 text-orange-400 flex-shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <p className="text-orange-300 font-medium">Conflicting confidence signals</p>
            <p className="text-muted-foreground/70 leading-relaxed">
              Self-assessed ({formatConfidence(verbalizedConf!)}) and evidence-grounded ({formatConfidence(ep.grounding_score)}) scores diverge by {Math.round(divergence! * 100)}pp. The uncertainty estimate itself is uncertain. Treat this response with extra caution.
            </p>
          </div>
        </div>
      )}

      {/* LM-Polygraph verbalized confidence badge */}
      {isLokiPipeline && verbalizedConf !== null && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 rounded-lg px-3 py-2 border border-border/30">
          <Gauge className="w-3 h-3 text-indigo-400 flex-shrink-0" />
          <span className="text-muted-foreground/70">Self-assessed (LM-Polygraph):</span>
          <span className={`font-semibold ${
            verbalizedConf >= 0.75 ? "text-green-400" :
            verbalizedConf >= 0.45 ? "text-yellow-400" : "text-red-400"
          }`}>
            {formatConfidence(verbalizedConf)}
          </span>
          {metadata.verbalized_confidence_raw !== null && metadata.verbalized_confidence_raw !== undefined && (
            <span className="text-muted-foreground/40 font-mono">({metadata.verbalized_confidence_raw}/100)</span>
          )}
          <span className="ml-auto text-[10px] text-muted-foreground/40 font-mono">
            {metadata.confidence_method ?? "cosine"}
          </span>
        </div>
      )}

      {/* Confidence gauge + metrics */}
      <div className="flex items-center gap-6">
        {/* SVG arc gauge */}
        <div className="relative w-24 h-14 flex-shrink-0">
          <svg viewBox="0 0 96 56" className="w-full h-full">
            <path
              d="M 8 48 A 40 40 0 0 1 88 48"
              fill="none"
              stroke="rgba(99,102,241,0.15)"
              strokeWidth="8"
              strokeLinecap="round"
            />
            <path
              d="M 8 48 A 40 40 0 0 1 88 48"
              fill="none"
              stroke={
                ep.overall_confidence >= 0.75 ? "#22c55e" :
                ep.overall_confidence >= 0.45 ? "#eab308" : "#ef4444"
              }
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={`${ep.overall_confidence * 125.6} 125.6`}
            />
            <text
              x="48" y="44" textAnchor="middle" fontSize="13" fontWeight="700"
              fill={
                ep.overall_confidence >= 0.75 ? "#22c55e" :
                ep.overall_confidence >= 0.45 ? "#eab308" : "#ef4444"
              }
              fontFamily="Inter, sans-serif"
            >
              {Math.round(ep.overall_confidence * 100)}%
            </text>
          </svg>
        </div>

        {/* Sub-metrics: only meaningful when claims were verified */}
        {ep.totalClaims > 0 ? (
          <div className="flex-1 grid grid-cols-3 gap-2">
            <MetricCard icon={<BookOpen className="w-3 h-3" />} label="Grounding" value={ep.grounding_score} colorize />
            <MetricCard icon={<TrendingUp className="w-3 h-3" />} label="Coverage" value={ep.evidence_coverage} colorize />
            <MetricCard icon={<AlertTriangle className="w-3 h-3" />} label="Halluc." value={ep.hallucination_risk} invert colorize />
          </div>
        ) : (
          <div className="flex-1 flex items-center">
            <p className="text-xs text-muted-foreground/60 leading-relaxed">
              No verifiable claims were extracted. Grounding and hallucination metrics require at least one factual claim to compute.
              {ep.verbalized_confidence !== null && ep.verbalized_confidence !== undefined && (
                <span className="block mt-1">Confidence reflects self-assessment only.</span>
              )}
            </p>
          </div>
        )}
      </div>

      {/* Claims summary */}
      {ep.totalClaims > 0 && (
        <div className="space-y-2">
          <button
            onClick={() => setShowClaims(!showClaims)}
            className="w-full flex items-center justify-between text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <span>
              {ep.totalClaims} claim{ep.totalClaims !== 1 ? "s" : ""}{" "}verified:{" "}
              <span className="text-green-400">{ep.claimStats.supported} supported</span>
              {ep.claimStats.partial > 0 && <span className="text-yellow-400">, {ep.claimStats.partial} partial</span>}
              {ep.claimStats.unsupported > 0 && <span className="text-red-400">, {ep.claimStats.unsupported} refuted</span>}
              {ep.claimStats.uncertain > 0 && <span className="text-gray-400">, {ep.claimStats.uncertain} uncertain</span>}
            </span>
            {showClaims ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>

          {/* Stacked bar */}
          <div className="h-1.5 rounded-full overflow-hidden flex gap-0.5">
            {ep.claimStats.supported > 0 && (
              <div className="bg-green-500 rounded-full" style={{ width: `${(ep.claimStats.supported / ep.totalClaims) * 100}%` }} />
            )}
            {ep.claimStats.partial > 0 && (
              <div className="bg-yellow-500 rounded-full" style={{ width: `${(ep.claimStats.partial / ep.totalClaims) * 100}%` }} />
            )}
            {ep.claimStats.unsupported > 0 && (
              <div className="bg-red-500 rounded-full" style={{ width: `${(ep.claimStats.unsupported / ep.totalClaims) * 100}%` }} />
            )}
            {ep.claimStats.uncertain > 0 && (
              <div className="bg-gray-500 rounded-full" style={{ width: `${(ep.claimStats.uncertain / ep.totalClaims) * 100}%` }} />
            )}
          </div>
        </div>
      )}

      {/* Claims list */}
      {showClaims && ep.claims.length > 0 && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="space-y-1.5 max-h-56 overflow-y-auto pr-1"
        >
          {ep.claims.map((claim, i) => (
            <div
              key={i}
              className={`flex items-start gap-2 text-xs rounded-md px-2.5 py-2 border ${supportLevelBg(claim.support_level)}`}
            >
              <div className={`w-1.5 h-1.5 rounded-full mt-1 flex-shrink-0 ${supportLevelDot(claim.support_level)}`} />
              <div className="flex-1 min-w-0">
                <p className="leading-relaxed opacity-90">{truncate(claim.text, 120)}</p>
                {claim.loki_verdict && (
                  <p className="text-[10px] opacity-50 mt-0.5 font-mono">
                    loki: {claim.loki_verdict}
                    {claim.checkworthy === false && " · skipped (not checkworthy)"}
                  </p>
                )}
              </div>
              <span className="ml-auto flex-shrink-0 font-mono opacity-70">
                {Math.round(claim.confidence * 100)}%
              </span>
            </div>
          ))}
        </motion.div>
      )}
    </motion.div>
  );
}

function MetricCard({
  icon, label, value, colorize = false, invert = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  colorize?: boolean;
  invert?: boolean;
}) {
  const colorScore = invert ? 1 - value : value;
  const color = colorize
    ? colorScore >= 0.7 ? "text-green-400" : colorScore >= 0.4 ? "text-yellow-400" : "text-red-400"
    : "text-foreground";

  return (
    <div className="metric-card text-center">
      <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">{icon}</div>
      <div className={`text-sm font-bold ${color}`}>{Math.round(value * 100)}%</div>
      <div className="text-[10px] text-muted-foreground leading-tight">{label}</div>
    </div>
  );
}
