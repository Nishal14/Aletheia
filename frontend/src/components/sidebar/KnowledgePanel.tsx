"use client";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { searchArxiv, fetchWikipedia } from "@/lib/api";
import { useKnowledgeStats } from "@/hooks/useKnowledgeStats";
import {
  BookOpen, Search, Globe, CheckCircle2, AlertCircle,
  Loader2, ChevronDown, ChevronUp, Database, Layers,
} from "lucide-react";

interface KnowledgePanelProps {
  collapsed: boolean;
}

export function KnowledgePanel({ collapsed }: KnowledgePanelProps) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"arxiv" | "wiki">("arxiv");
  const [query, setQuery] = useState("");
  const [maxResults, setMaxResults] = useState(3);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ message: string; ok: boolean } | null>(null);
  const { stats, refresh, justGrew } = useKnowledgeStats();

  const chunkCount = stats?.knowledge_chunks ?? 0;

  const handleSubmit = async () => {
    if (!query.trim() || loading) return;
    setLoading(true);
    setResult(null);
    try {
      let res;
      if (tab === "arxiv") {
        res = await searchArxiv(query.trim(), maxResults);
        setResult({
          ok: res.chunks_ingested > 0,
          message: res.chunks_ingested > 0
            ? `${res.sources_ingested} paper${res.sources_ingested !== 1 ? "s" : ""} ingested · ${res.chunks_ingested} chunks added`
            : "No papers found for that query",
        });
      } else {
        res = await fetchWikipedia(query.trim());
        setResult({
          ok: res.chunks_ingested > 0,
          message: res.chunks_ingested > 0
            ? `"${(res.results[0] as any)?.title}" ingested · ${res.chunks_ingested} chunks`
            : `Article not found: "${query}"`,
        });
      }
      await refresh();
      setQuery("");
    } catch {
      setResult({ ok: false, message: "Request failed. Check backend connection." });
    } finally {
      setLoading(false);
    }
  };

  if (collapsed) {
    return (
      <button
        onClick={() => setOpen(!open)}
        title={`Knowledge Base · ${chunkCount} chunks`}
        className="relative w-7 h-7 rounded-lg bg-muted/40 flex items-center justify-center mx-auto text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all"
      >
        <Database className="w-3.5 h-3.5" />
        {chunkCount > 0 && (
          <motion.span
            animate={justGrew ? { scale: [1, 1.4, 1] } : {}}
            className={`absolute -top-1 -right-1 min-w-[14px] h-3.5 px-1 rounded-full text-[9px] font-bold flex items-center justify-center ${
              justGrew ? "bg-green-500 text-white" : "bg-primary/80 text-white"
            }`}
          >
            {chunkCount > 99 ? "99+" : chunkCount}
          </motion.span>
        )}
      </button>
    );
  }

  return (
    <div className="border-t border-border/40 pt-2 mx-1">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-2 py-2 rounded-xl text-xs hover:bg-white/3 transition-all group"
      >
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-md bg-indigo-500/15 flex items-center justify-center">
            <Database className="w-3 h-3 text-indigo-400" />
          </div>
          <span className="text-muted-foreground group-hover:text-foreground/80 transition-colors font-medium">
            Knowledge Base
          </span>
        </div>
        <div className="flex items-center gap-2">
          <motion.div
            animate={justGrew ? { scale: [1, 1.3, 1] } : {}}
            transition={{ duration: 0.4 }}
            className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full transition-colors ${
              justGrew
                ? "bg-green-500/15 text-green-400"
                : chunkCount > 0
                ? "bg-primary/10 text-primary/80"
                : "bg-muted/50 text-muted-foreground/50"
            }`}
          >
            <Layers className="w-2.5 h-2.5" />
            {chunkCount > 0 ? `${chunkCount} chunks` : "empty"}
          </motion.div>
          {open ? <ChevronUp className="w-3 h-3 text-muted-foreground/50" /> : <ChevronDown className="w-3 h-3 text-muted-foreground/50" />}
        </div>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="px-1 pt-2 pb-3 space-y-3">
              {/* Growth indicator */}
              <AnimatePresence>
                {justGrew && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center gap-2 text-xs text-green-400 bg-green-500/8 border border-green-500/15 rounded-lg px-2.5 py-1.5"
                  >
                    <CheckCircle2 className="w-3 h-3" />
                    Knowledge base grew to {chunkCount} chunks
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Tab selector */}
              <div className="flex rounded-lg overflow-hidden border border-border/40 bg-muted/20">
                {(["arxiv", "wiki"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => { setTab(t); setQuery(""); setResult(null); }}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[11px] font-medium transition-all ${
                      tab === t
                        ? "bg-primary/15 text-primary"
                        : "text-muted-foreground hover:text-foreground/70"
                    }`}
                  >
                    {t === "arxiv" ? <BookOpen className="w-3 h-3" /> : <Globe className="w-3 h-3" />}
                    {t === "arxiv" ? "arXiv" : "Wikipedia"}
                  </button>
                ))}
              </div>

              {/* Query input */}
              <div className="space-y-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground/40" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                    placeholder={tab === "arxiv" ? "attention mechanism transformers" : "Transformer (deep learning)"}
                    className="w-full bg-muted/30 border border-border/40 rounded-lg pl-7 pr-3 py-2 text-[11px] text-foreground placeholder:text-muted-foreground/35 outline-none focus:border-primary/40 focus:bg-muted/50 transition-all"
                  />
                </div>

                {tab === "arxiv" && (
                  <div className="flex items-center gap-1.5 px-0.5">
                    <span className="text-[10px] text-muted-foreground/50">Papers:</span>
                    {[1, 3, 5].map((n) => (
                      <button
                        key={n}
                        onClick={() => setMaxResults(n)}
                        className={`text-[10px] w-6 h-5 rounded-md transition-all font-medium ${
                          maxResults === n
                            ? "bg-primary/20 text-primary"
                            : "text-muted-foreground/50 hover:text-muted-foreground bg-muted/30"
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Ingest button */}
              <button
                onClick={handleSubmit}
                disabled={!query.trim() || loading}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-[11px] font-medium bg-primary/12 text-primary border border-primary/15 hover:bg-primary/20 hover:border-primary/25 disabled:opacity-35 disabled:cursor-not-allowed transition-all"
              >
                {loading
                  ? <><Loader2 className="w-3 h-3 animate-spin" /> Fetching...</>
                  : <><Search className="w-3 h-3" /> Fetch &amp; Ingest</>
                }
              </button>

              {/* Result */}
              <AnimatePresence>
                {result && (
                  <motion.div
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className={`flex items-start gap-2 text-[11px] px-2.5 py-2 rounded-lg border ${
                      result.ok
                        ? "bg-green-500/8 border-green-500/20 text-green-300"
                        : "bg-red-500/8 border-red-500/20 text-red-300"
                    }`}
                  >
                    {result.ok
                      ? <CheckCircle2 className="w-3 h-3 flex-shrink-0 mt-0.5" />
                      : <AlertCircle className="w-3 h-3 flex-shrink-0 mt-0.5" />
                    }
                    <span className="leading-relaxed">{result.message}</span>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Hint text */}
              {!result && !loading && (
                <p className="text-[10px] text-muted-foreground/35 px-0.5 leading-relaxed">
                  {tab === "arxiv"
                    ? 'Try: "RAG retrieval grounding", "hallucination LLM", "BERT language model"'
                    : 'Use exact Wikipedia article titles for best results.'}
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
