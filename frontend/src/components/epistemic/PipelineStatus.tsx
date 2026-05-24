"use client";
import { motion } from "framer-motion";
import { PipelineStage } from "@/types";
import { Search, Brain, Gauge, ShieldCheck, BarChart2, CheckCircle2, AlertCircle, Download } from "lucide-react";
import { cn } from "@/lib/utils";

interface PipelineStatusProps {
  stage: PipelineStage;
  message: string;
}

const STAGES: { key: PipelineStage; label: string; icon: React.ReactNode; color: string }[] = [
  { key: "retrieving",         label: "Retrieve",  icon: <Search className="w-3 h-3" />,      color: "text-blue-400" },
  { key: "enriching",          label: "Enrich",    icon: <Download className="w-3 h-3" />,    color: "text-amber-400" },
  { key: "generating",         label: "Generate",  icon: <Brain className="w-3 h-3" />,        color: "text-indigo-400" },
  { key: "confidence_probing", label: "Probe",     icon: <Gauge className="w-3 h-3" />,        color: "text-purple-400" },
  { key: "verifying",          label: "Verify",    icon: <ShieldCheck className="w-3 h-3" />,  color: "text-emerald-400" },
  { key: "scoring",            label: "Score",     icon: <BarChart2 className="w-3 h-3" />,    color: "text-yellow-400" },
  { key: "done",               label: "Done",      icon: <CheckCircle2 className="w-3 h-3" />, color: "text-green-400" },
];

const stageOrder: Record<string, number> = {
  retrieving: 0, enriching: 1, generating: 2,
  confidence_probing: 3, verifying: 4, scoring: 5, done: 6,
};

export function PipelineStatus({ stage, message }: PipelineStatusProps) {
  if (stage === "idle") return null;
  const currentIdx = stageOrder[stage] ?? -1;
  const isError = stage === "error";

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 6 }}
      className="flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-card/50 border border-border/40 backdrop-blur-sm shadow-sm"
    >
      {/* Stage dots */}
      <div className="flex items-center gap-1">
        {STAGES.map((s, i) => {
          const isActive = s.key === stage;
          const isDone = i < currentIdx;
          return (
            <div key={s.key} className="flex items-center gap-1">
              <motion.div
                animate={isActive ? { scale: [1, 1.1, 1] } : {}}
                transition={{ duration: 1.4, repeat: Infinity }}
                title={s.label}
                className={cn(
                  "w-5 h-5 rounded-lg flex items-center justify-center transition-all duration-300",
                  isError && isActive ? "bg-red-500/15 text-red-400" :
                  isActive ? cn("bg-primary/15", s.color) :
                  isDone ? "bg-green-500/10 text-green-500/60" :
                  "bg-muted/30 text-muted-foreground/20"
                )}
              >
                {s.icon}
              </motion.div>
              {i < STAGES.length - 1 && (
                <div className={cn("w-2 h-px rounded-full transition-colors duration-500",
                  i < currentIdx ? "bg-green-500/30" : "bg-border/40"
                )} />
              )}
            </div>
          );
        })}
      </div>

      {/* Separator */}
      <div className="w-px h-3 bg-border/40 flex-shrink-0" />

      {/* Message */}
      <div className="flex items-center gap-2 min-w-0">
        {isError
          ? <AlertCircle className="w-3 h-3 text-red-400 flex-shrink-0" />
          : stage !== "done" && (
            <motion.div
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0"
            />
          )
        }
        <motion.span
          key={message}
          initial={{ opacity: 0, x: -4 }}
          animate={{ opacity: 1, x: 0 }}
          className={cn("text-xs truncate", isError ? "text-red-400" : "text-muted-foreground/70")}
        >
          {message}
        </motion.span>
      </div>
    </motion.div>
  );
}
