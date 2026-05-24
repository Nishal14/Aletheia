"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { fetchKnowledgeStats } from "@/lib/api";

export interface KnowledgeStats {
  knowledge_chunks: number;
  memory_entries: number;
  qdrant_available: boolean;
}

export function useKnowledgeStats(pollInterval = 20000) {
  const [stats, setStats] = useState<KnowledgeStats | null>(null);
  const [justGrew, setJustGrew] = useState(false);
  const prevCountRef = useRef(0);

  const refresh = useCallback(async () => {
    try {
      const s = await fetchKnowledgeStats();
      setStats(s);
      if (prevCountRef.current > 0 && s.knowledge_chunks > prevCountRef.current) {
        setJustGrew(true);
        setTimeout(() => setJustGrew(false), 2500);
      }
      prevCountRef.current = s.knowledge_chunks;
    } catch { /* qdrant offline */ }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, pollInterval);
    return () => clearInterval(id);
  }, [refresh, pollInterval]);

  return { stats, refresh, justGrew };
}
