"use client";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { EvidenceChunk } from "@/types";
import { Database, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { truncate, cn } from "@/lib/utils";

interface EvidencePanelProps { chunks: EvidenceChunk[]; }

export function EvidencePanel({ chunks }: EvidencePanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [expandedChunk, setExpandedChunk] = useState<string | null>(null);
  if (!chunks?.length) return null;

  const avgScore = chunks.reduce((s, c) => s + c.relevance_score, 0) / chunks.length;

  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }} className="glass-card overflow-hidden">
      <button onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/2 transition-colors">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-md bg-indigo-500/15 flex items-center justify-center">
            <Database className="w-3 h-3 text-indigo-400" />
          </div>
          <span className="text-xs font-semibold text-foreground/70">Retrieved Evidence</span>
          <span className="text-[10px] text-muted-foreground/50">
            {chunks.length} chunk{chunks.length !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Mini relevance bars */}
          <div className="flex items-end gap-0.5 h-4">
            {chunks.slice(0, 6).map((c, i) => (
              <div key={i} className="w-1 rounded-full bg-indigo-500/40"
                style={{ height: `${Math.max(20, c.relevance_score * 100)}%` }} />
            ))}
          </div>
          <span className="text-[10px] font-mono text-muted-foreground/40">
            avg {Math.round(avgScore * 100)}%
          </span>
          {expanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground/40" />
                    : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/40" />}
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
            <div className="px-3 pb-3 space-y-2 max-h-72 overflow-y-auto">
              {chunks.map((chunk, i) => (
                <ChunkCard key={chunk.id} chunk={chunk} index={i}
                  isExpanded={expandedChunk === chunk.id}
                  onToggle={() => setExpandedChunk(expandedChunk === chunk.id ? null : chunk.id)} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function ChunkCard({ chunk, index, isExpanded, onToggle }: {
  chunk: EvidenceChunk; index: number; isExpanded: boolean; onToggle: () => void;
}) {
  const score = chunk.relevance_score;
  const scoreColor = score >= 0.65 ? "text-green-400 bg-green-500/8 border-green-500/15"
    : score >= 0.40 ? "text-yellow-400 bg-yellow-500/8 border-yellow-500/15"
    : "text-muted-foreground bg-muted/20 border-border/30";
  const barColor = score >= 0.65 ? "bg-green-500" : score >= 0.40 ? "bg-yellow-500" : "bg-muted-foreground/40";

  // Format source nicely
  const sourceParts = chunk.source.split(":");
  const sourceType = sourceParts[0];
  const sourceId = sourceParts.slice(1).join(":");

  return (
    <div className="rounded-xl border border-border/40 bg-muted/15 overflow-hidden hover:border-border/60 transition-colors">
      <button onClick={onToggle}
        className="w-full flex items-start gap-2.5 px-3 py-2.5 text-left hover:bg-white/2 transition-colors">
        <span className="text-[10px] text-muted-foreground/30 font-mono mt-0.5 w-4 flex-shrink-0">{index + 1}</span>
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-1.5">
            <span className={cn("text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full border",
              sourceType === "arxiv" ? "text-blue-400 bg-blue-500/8 border-blue-500/15"
              : sourceType === "wikipedia" ? "text-green-400 bg-green-500/8 border-green-500/15"
              : "text-muted-foreground bg-muted/30 border-border/30"
            )}>
              {sourceType}
            </span>
            {sourceId && (
              <span className="text-[10px] text-muted-foreground/40 font-mono truncate">{sourceId}</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground/70 leading-relaxed">
            {truncate(chunk.content, isExpanded ? 999 : 80)}
          </p>
        </div>
        <div className={cn("flex-shrink-0 text-[10px] font-mono font-semibold px-2 py-0.5 rounded-lg border", scoreColor)}>
          {Math.round(score * 100)}%
        </div>
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="px-3 pb-3 pt-0 border-t border-border/30">
              {/* Relevance bar */}
              <div className="flex items-center gap-2 mb-2 mt-2">
                <span className="text-[10px] text-muted-foreground/40 w-14">Relevance</span>
                <div className="flex-1 h-1 bg-border/30 rounded-full overflow-hidden">
                  <motion.div initial={{ width: 0 }} animate={{ width: `${score * 100}%` }}
                    transition={{ duration: 0.6, ease: "easeOut" }}
                    className={cn("h-full rounded-full", barColor)} />
                </div>
                <span className="text-[10px] font-mono text-muted-foreground/50 w-8 text-right">
                  {Math.round(score * 100)}%
                </span>
              </div>
              <p className="text-xs text-foreground/70 leading-relaxed">{chunk.content}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
