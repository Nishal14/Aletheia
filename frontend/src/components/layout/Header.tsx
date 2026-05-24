"use client";
import { useEffect, useState } from "react";
import { fetchHealth } from "@/lib/api";
import { FlaskConical, Cpu, Database, Wifi, WifiOff } from "lucide-react";

interface HealthData {
  status: string;
  ollama: boolean;
  qdrant: boolean;
  primary_model: string;
}

export function Header({
  sessionTitle, mode,
}: {
  sessionTitle?: string;
  mode?: "normal" | "research";
}) {
  return (
    <div className="h-12 border-b border-border/40 flex items-center justify-between px-4 bg-card/30 backdrop-blur-sm flex-shrink-0">
      <div className="flex items-center gap-3">
        {sessionTitle && (
          <h1 className="text-sm font-medium text-foreground/80 truncate max-w-[280px]">
            {sessionTitle}
          </h1>
        )}
      </div>

      <div className="flex items-center gap-3">
        {mode === "research" && (
          <div className="flex items-center gap-1.5 text-xs text-purple-400 bg-purple-500/10 border border-purple-500/20 rounded-full px-2.5 py-1">
            <FlaskConical className="w-3 h-3" />
            <span>Research Mode</span>
          </div>
        )}
      </div>
    </div>
  );
}

export function StatusIndicator() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const check = async () => {
      try {
        const h = await fetchHealth();
        setHealth(h);
        setError(false);
      } catch {
        setError(true);
      }
    };
    check();
    const interval = setInterval(check, 15000);
    return () => clearInterval(interval);
  }, []);

  if (error) {
    return (
      <div className="flex items-center gap-2 text-xs text-red-400/70">
        <WifiOff className="w-3 h-3" />
        <span>Backend offline</span>
      </div>
    );
  }

  if (!health) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground/50">
        <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30 animate-pulse" />
        <span>Connecting...</span>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 text-xs">
        <Cpu className="w-3 h-3 text-muted-foreground/50" />
        <span className="text-muted-foreground/50 truncate font-mono text-[10px]">
          {health.primary_model}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <StatusDot ok={health.ollama} label="LLM" />
        <StatusDot ok={health.qdrant} label="Vector DB" />
      </div>
    </div>
  );
}

function StatusDot({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-1">
      <div className={`w-1.5 h-1.5 rounded-full ${ok ? "bg-green-400" : "bg-red-400/60"}`} />
      <span className="text-[10px] text-muted-foreground/50">{label}</span>
    </div>
  );
}
