"use client";
import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import {
  ChatBubble, ChatBubbleAvatar, ChatBubbleMessage,
  ChatBubbleAction, ChatBubbleActionWrapper,
} from "@/components/ui/chat-bubble";
import { ConfidencePanel } from "@/components/epistemic/ConfidencePanel";
import { EvidencePanel } from "@/components/epistemic/EvidencePanel";
import { Loader } from "@/components/loader";
import { Card } from "@/components/card";
import { ChatMessage, PipelineStage } from "@/types";
import {
  Copy, Check, BarChart2, Brain, Pencil, RotateCcw,
  X, CornerRightUp, ChevronDown, ChevronUp,
} from "lucide-react";
import { formatRelativeTime, formatConfidence, cn } from "@/lib/utils";

interface MessageBubbleProps {
  message: ChatMessage;
  isLoadingEpistemic?: boolean;
  onEdit?: (messageId: string, newContent: string) => void;
  onRegenerate?: (afterMessageId: string) => void;
  streamingStage?: PipelineStage;
  streamingMessage?: string;
  retrievedChunksCount?: number;
}

export function MessageBubble({
  message, isLoadingEpistemic = false, onEdit, onRegenerate,
  streamingStage, streamingMessage, retrievedChunksCount = 0,
}: MessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [showThinking, setShowThinking] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(message.content);
  const editRef = useRef<HTMLTextAreaElement>(null);

  const isUser = message.role === "user";
  const hasEpistemic = !!message.epistemic_metadata;
  const responseComplete = !message.isStreaming;
  const noContentYet = message.isStreaming && !message.content;
  const evidenceChunks = message.retrieval_chunks || message.epistemic_metadata?.evidence_chunks || [];

  useEffect(() => {
    if (isEditing && editRef.current) {
      editRef.current.focus();
      editRef.current.selectionStart = editRef.current.value.length;
      editRef.current.style.height = "auto";
      editRef.current.style.height = editRef.current.scrollHeight + "px";
    }
  }, [isEditing]);

  const copyContent = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleEditSubmit = () => {
    const trimmed = editValue.trim();
    if (!trimmed || trimmed === message.content) { setIsEditing(false); return; }
    onEdit?.(message.id, trimmed);
    setIsEditing(false);
  };

  const handleEditKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleEditSubmit(); }
    if (e.key === "Escape") { setIsEditing(false); setEditValue(message.content); }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      className="group/msg"
    >
      <ChatBubble variant={isUser ? "sent" : "received"} layout={isUser ? "default" : "ai"}>
        {/* Avatar */}
        <ChatBubbleAvatar
          fallback={isUser ? "U" : "AI"}
          className={cn(
            "text-[10px] font-bold ring-2 ring-offset-2 ring-offset-background",
            isUser
              ? "bg-gradient-to-br from-primary/40 to-primary/20 text-primary ring-primary/20"
              : "bg-gradient-to-br from-indigo-500/25 to-violet-500/15 text-indigo-300 ring-indigo-500/15"
          )}
        />

        <div className={cn("flex flex-col gap-2 min-w-0 flex-1", isUser ? "items-end" : "items-start")}>

          {/* ── User: view mode ── */}
          {isUser && !isEditing && (
            <div className="relative max-w-[85%]">
              <div className={cn(
                "rounded-2xl rounded-tr-sm px-4 py-3",
                "bg-gradient-to-br from-primary/18 to-primary/10",
                "border border-primary/20 shadow-sm",
                "hover:border-primary/30 transition-colors"
              )}>
                <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">
                  {message.content}
                </p>
              </div>
              {onEdit && (
                <div className="absolute -bottom-6 right-0 flex items-center gap-1 opacity-0 group-hover/msg:opacity-100 transition-all duration-200">
                  <button onClick={() => { setEditValue(message.content); setIsEditing(true); }}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all">
                    <Pencil className="w-2.5 h-2.5" /> Edit
                  </button>
                  {onRegenerate && (
                    <button onClick={() => onRegenerate(message.id)}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all">
                      <RotateCcw className="w-2.5 h-2.5" /> Resend
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── User: edit mode ── */}
          {isUser && isEditing && (
            <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }}
              className="w-full max-w-[90%] rounded-2xl border border-primary/30 bg-card/80 backdrop-blur-sm overflow-hidden shadow-lg">
              <textarea ref={editRef} value={editValue}
                onChange={(e) => { setEditValue(e.target.value); e.target.style.height = "auto"; e.target.style.height = e.target.scrollHeight + "px"; }}
                onKeyDown={handleEditKeyDown}
                className="w-full bg-transparent text-sm text-foreground px-4 pt-3 pb-1 resize-none outline-none leading-relaxed min-h-[60px] max-h-[280px]"
                rows={1} />
              <div className="flex items-center justify-between px-3 pb-3 pt-1">
                <span className="text-[10px] text-muted-foreground/40">↵ Submit · Esc Cancel</span>
                <div className="flex items-center gap-2">
                  <button onClick={() => { setIsEditing(false); setEditValue(message.content); }}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all">
                    <X className="w-3 h-3" /> Cancel
                  </button>
                  <button onClick={handleEditSubmit} disabled={!editValue.trim()}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-primary/20 text-primary hover:bg-primary/30 border border-primary/20 disabled:opacity-40 transition-all">
                    <CornerRightUp className="w-3 h-3" /> Submit
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {/* ── Thinking block (before response) ── */}
          {!isUser && !!message.thinking && (
            <ThinkingBlock
              content={message.thinking}
              isStreaming={!!message.isStreaming && !message.content}
              expanded={showThinking || (!!message.isStreaming && !message.content)}
              onToggle={() => setShowThinking(!showThinking)}
            />
          )}

          {/* ── Assistant bubble ── */}
          {!isUser && (
            <div className={cn(
              "w-full rounded-2xl rounded-tl-sm border",
              "bg-card/60 border-border/50 backdrop-blur-sm",
              "shadow-sm hover:shadow-md hover:border-border/70",
              "transition-all duration-300"
            )}>
              <div className="px-4 py-3.5">
                {noContentYet && streamingStage ? (
                  <StageLoadingCard stage={streamingStage} message={streamingMessage || ""} chunksCount={retrievedChunksCount} />
                ) : noContentYet ? (
                  <DefaultLoadingDots />
                ) : (
                  <div className="prose-aletheia text-sm">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        code({ className, children, ...props }: any) {
                          const match = /language-(\w+)/.exec(className || "");
                          return match ? (
                            <SyntaxHighlighter style={oneDark as any} language={match[1]} PreTag="div"
                              className="!rounded-xl !text-xs !my-3 !border !border-border/40">
                              {String(children).replace(/\n$/, "")}
                            </SyntaxHighlighter>
                          ) : (
                            <code className={className} {...props}>{children}</code>
                          );
                        },
                      }}
                    >
                      {message.content}
                    </ReactMarkdown>
                    {message.isStreaming && (
                      <span className="inline-block w-0.5 h-[1.1em] bg-primary/70 ml-0.5 align-middle cursor-blink" />
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Actions bar ── */}
          {!isUser && responseComplete && (
            <div className="flex items-center gap-1 px-1">
              <button onClick={copyContent}
                className="p-1.5 rounded-lg text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/30 transition-all">
                {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
              {onRegenerate && (
                <button onClick={() => onRegenerate(message.id)}
                  className="p-1.5 rounded-lg text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/30 transition-all">
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              )}
              <div className="w-px h-3 bg-border/50 mx-0.5" />

              {hasEpistemic ? (
                <button
                  onClick={() => setShowAnalysis(!showAnalysis)}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-all",
                    showAnalysis
                      ? "bg-primary/12 text-primary border border-primary/20"
                      : "text-muted-foreground/60 hover:text-muted-foreground hover:bg-muted/30"
                  )}
                >
                  <BarChart2 className="w-3 h-3" />
                  <span className="font-medium">{formatConfidence(message.epistemic_metadata!.overall_confidence)}</span>
                  {message.epistemic_metadata!.total_claim_count > 0 && (
                    <span className="text-muted-foreground/50">
                      · {message.epistemic_metadata!.total_claim_count} claims
                    </span>
                  )}
                  <div className={cn("w-1.5 h-1.5 rounded-full ml-0.5", {
                    "bg-green-400": message.epistemic_metadata!.overall_confidence >= 0.75,
                    "bg-yellow-400": message.epistemic_metadata!.overall_confidence >= 0.45 && message.epistemic_metadata!.overall_confidence < 0.75,
                    "bg-red-400": message.epistemic_metadata!.overall_confidence < 0.45,
                  })} />
                </button>
              ) : isLoadingEpistemic ? (
                <div className="flex items-center gap-1.5 px-2 py-1 text-xs text-muted-foreground/40">
                  <Loader size="xs" variant="muted" />
                  <span>Verifying...</span>
                </div>
              ) : null}
            </div>
          )}

          {/* ── Epistemic panels ── */}
          <AnimatePresence>
            {showAnalysis && hasEpistemic && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }} className="w-full space-y-2 overflow-hidden">
                <ConfidencePanel metadata={message.epistemic_metadata!} />
                {evidenceChunks.length > 0 && <EvidencePanel chunks={evidenceChunks} />}
              </motion.div>
            )}
          </AnimatePresence>

          <span className="text-[10px] text-muted-foreground/30 px-1 select-none">
            {formatRelativeTime(message.created_at)}
          </span>
        </div>
      </ChatBubble>
    </motion.div>
  );
}

/* ── Stage loading card ── */
import { Search, Sparkles, Gauge, ShieldCheck, Database, Download } from "lucide-react";

const STAGE_CFG: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  retrieving:         { icon: <Search className="w-4 h-4" />,     color: "text-blue-400",   label: "Retrieving" },
  enriching:          { icon: <Download className="w-4 h-4" />,   color: "text-amber-400",  label: "Enriching" },
  generating:         { icon: <Sparkles className="w-4 h-4" />,   color: "text-indigo-400", label: "Generating" },
  confidence_probing: { icon: <Gauge className="w-4 h-4" />,      color: "text-purple-400", label: "Probing" },
  verifying:          { icon: <ShieldCheck className="w-4 h-4" />,color: "text-emerald-400",label: "Verifying" },
  scoring:            { icon: <Database className="w-4 h-4" />,   color: "text-yellow-400", label: "Scoring" },
};

function StageLoadingCard({ stage, message, chunksCount }: {
  stage: string; message: string; chunksCount: number;
}) {
  const cfg = STAGE_CFG[stage] ?? STAGE_CFG.generating;
  return (
    <div className="space-y-3.5 py-0.5">
      <div className="flex items-center gap-3">
        <motion.div animate={{ scale: [1, 1.15, 1] }} transition={{ duration: 1.8, repeat: Infinity }}
          className={cn("flex-shrink-0", cfg.color)}>
          {cfg.icon}
        </motion.div>
        <motion.span key={message} initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }}
          className="text-sm text-muted-foreground/80">
          {message || `${cfg.label}...`}
        </motion.span>
      </div>
      {chunksCount > 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="flex items-center gap-1.5 text-xs text-muted-foreground/50">
          <Database className="w-3 h-3" />
          <span>{chunksCount} chunk{chunksCount !== 1 ? "s" : ""} retrieved</span>
        </motion.div>
      )}
      <div className="h-0.5 w-full bg-border/30 rounded-full overflow-hidden">
        <motion.div
          animate={{ x: ["-100%", "200%"] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
          style={{ width: "45%" }}
          className={cn("h-full rounded-full opacity-60", {
            "bg-blue-500": stage === "retrieving",
            "bg-amber-500": stage === "enriching",
            "bg-indigo-500": stage === "generating",
            "bg-purple-500": stage === "confidence_probing",
            "bg-emerald-500": stage === "verifying",
            "bg-yellow-500": stage === "scoring",
          })}
        />
      </div>
    </div>
  );
}

function DefaultLoadingDots() {
  return (
    <div className="flex gap-1.5 items-center py-0.5">
      {[0, 1, 2].map((i) => (
        <motion.div key={i} className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40"
          animate={{ scale: [1, 1.5, 1], opacity: [0.3, 0.8, 0.3] }}
          transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.2 }} />
      ))}
    </div>
  );
}

/* ── Thinking block ── */
function ThinkingBlock({ content, isStreaming, expanded, onToggle }: {
  content: string; isStreaming: boolean; expanded: boolean; onToggle: () => void;
}) {
  const [timer, setTimer] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isStreaming) { setTimer(0); return; }
    const id = setInterval(() => setTimer((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [isStreaming]);

  useEffect(() => {
    if (isStreaming && contentRef.current)
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
  }, [content, isStreaming]);

  return (
    <div className="w-full">
      <button onClick={onToggle}
        className="flex items-center gap-2 text-xs transition-colors group/think mb-1">
        <div className={cn("w-5 h-5 rounded-lg flex items-center justify-center transition-colors",
          isStreaming ? "bg-indigo-500/15" : "bg-muted/50 group-hover/think:bg-muted"
        )}>
          {isStreaming ? <Loader size="xs" className="text-indigo-400" /> : <Brain className="w-3 h-3 text-muted-foreground/60" />}
        </div>
        <span className={cn("transition-all font-medium", isStreaming
          ? "bg-[linear-gradient(110deg,#818cf8,40%,#c7d2fe,55%,#818cf8)] bg-[length:200%_100%] bg-clip-text text-transparent animate-[shimmer_2s_linear_infinite]"
          : "text-muted-foreground/50 group-hover/think:text-muted-foreground/70"
        )}>
          {isStreaming ? `Thinking... ${timer}s` : "View reasoning"}
        </span>
        {!isStreaming && (expanded
          ? <ChevronUp className="w-3 h-3 text-muted-foreground/40" />
          : <ChevronDown className="w-3 h-3 text-muted-foreground/40" />
        )}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }} className="mt-1 overflow-hidden">
            <div className={cn(
              "relative rounded-xl border overflow-hidden",
              isStreaming ? "bg-indigo-950/25 border-indigo-500/15 h-40" : "bg-muted/20 border-border/30 h-36"
            )}>
              <div className="absolute top-0 inset-x-0 h-6 bg-gradient-to-b from-background/50 to-transparent z-10 pointer-events-none" />
              <div className="absolute bottom-0 inset-x-0 h-6 bg-gradient-to-t from-background/50 to-transparent z-10 pointer-events-none" />
              <div ref={contentRef} className="h-full overflow-y-auto px-3 py-3" style={{ scrollbarWidth: "none" }}>
                <p className={cn("text-xs font-mono leading-relaxed whitespace-pre-wrap",
                  isStreaming ? "text-indigo-200/60" : "text-muted-foreground/55"
                )}>
                  {content}
                </p>
              </div>
              {isStreaming && (
                <span className="absolute bottom-3 left-3 inline-block w-0.5 h-3 bg-indigo-400/70 cursor-blink" />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
