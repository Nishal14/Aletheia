"use client";
import { useState, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useChat } from "@/hooks/useChat";
import { MessageBubble } from "./MessageBubble";
import { ChatInput } from "./ChatInput";
import { PipelineStatus } from "@/components/epistemic/PipelineStatus";
import { EvidencePanel } from "@/components/epistemic/EvidencePanel";
import { ChatMessageList } from "@/components/ui/chat-message-list";
import { uploadDocument } from "@/lib/api";
import { Sparkles, Upload } from "lucide-react";

interface ChatInterfaceProps {
  sessionId: string;
}

export function ChatInterface({ sessionId }: ChatInterfaceProps) {
  const [mode, setMode] = useState<"normal" | "research">("normal");
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);

  const { messages, isLoading, stage, stageMessage, currentChunks, sendMessage, editMessage, regenerateFrom } =
    useChat({ sessionId, mode });

  const handleFileUpload = useCallback(async (file: File) => {
    setUploadStatus(`Ingesting ${file.name}...`);
    try {
      const result = await uploadDocument(file);
      setUploadStatus(`✓ ${result.chunks_ingested} chunks ingested from ${file.name}`);
      setTimeout(() => setUploadStatus(null), 4000);
    } catch {
      setUploadStatus(`✗ Failed to upload ${file.name}`);
      setTimeout(() => setUploadStatus(null), 4000);
    }
  }, []);

  const isEmpty = messages.length === 0 && !isLoading;

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 min-h-0">
        <ChatMessageList smooth className="gap-0">
          {isEmpty ? (
            <EmptyState onSuggestion={sendMessage} />
          ) : (
            <>
              {messages.map((message, idx) => {
                const isLast = idx === messages.length - 1;
                const isActiveStreaming = isLast && !!message.isStreaming;
                const isLoadingEpistemic =
                  isLast && isLoading && !message.isStreaming && !message.epistemic_metadata;
                return (
                  <MessageBubble
                    key={message.id}
                    message={message}
                    isLoadingEpistemic={isLoadingEpistemic}
                    onEdit={message.role === "user" ? editMessage : undefined}
                    onRegenerate={regenerateFrom}
                    streamingStage={isActiveStreaming ? stage : undefined}
                    streamingMessage={isActiveStreaming ? stageMessage : undefined}
                    retrievedChunksCount={isActiveStreaming ? currentChunks.length : 0}
                  />
                );
              })}

              {/* Live retrieval preview during streaming */}
              {isLoading && currentChunks.length > 0 && stage === "retrieving" && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="pl-10 pr-4"
                >
                  <EvidencePanel chunks={currentChunks} />
                </motion.div>
              )}
            </>
          )}
        </ChatMessageList>
      </div>

      {/* Upload toast */}
      <AnimatePresence>
        {uploadStatus && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="mx-4 mb-2 px-3 py-2 rounded-xl bg-muted/60 border border-border/50 text-xs text-muted-foreground flex items-center gap-2"
          >
            <Upload className="w-3 h-3 flex-shrink-0" />
            {uploadStatus}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Pipeline status */}
      <div className="px-4 pb-2">
        <AnimatePresence>
          {(isLoading || stage === "error") && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-2 overflow-hidden"
            >
              <PipelineStatus stage={stage} message={stageMessage} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Input */}
      <div className="px-4 pb-4">
        <ChatInput
          onSend={sendMessage}
          isLoading={isLoading}
          mode={mode}
          onModeToggle={() => setMode(mode === "normal" ? "research" : "normal")}
          onFileUpload={handleFileUpload}
        />
      </div>
    </div>
  );
}

function EmptyState({ onSuggestion }: { onSuggestion: (text: string) => void }) {
  const suggestions = [
    { label: "Transformer paper", text: "Who wrote the original Transformer paper, when was it published, and what were the exact model sizes described?" },
    { label: "MBZUAI research", text: "When was MBZUAI founded, who is its provost, and what NLP research groups does it have?" },
    { label: "Attention vs RNN", text: "How does self-attention in Transformers differ from RNNs, and what are the computational advantages?" },
    { label: "AlphaGo results", text: "What benchmarks did AlphaGo achieve and in what year did it defeat Lee Sedol by what score?" },
  ];

  return (
    <div className="relative flex flex-col items-center justify-center min-h-[65vh] py-12 gap-10 px-6 overflow-hidden">

      {/* ── Animated background orbs ── */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {/* Large slow-drifting orbs */}
        {[
          { w: 500, h: 380, top: "5%",   left: "10%",  dur: 22, delay: 0,   color: "rgba(99,102,241,0.28)" },
          { w: 420, h: 340, top: "50%",  left: "55%",  dur: 28, delay: 4,   color: "rgba(139,92,246,0.22)" },
          { w: 360, h: 280, top: "25%",  left: "68%",  dur: 18, delay: 8,   color: "rgba(79,70,229,0.20)" },
          { w: 300, h: 240, top: "60%",  left: "5%",   dur: 24, delay: 12,  color: "rgba(167,139,250,0.18)" },
          { w: 260, h: 200, top: "2%",   left: "50%",  dur: 30, delay: 6,   color: "rgba(99,102,241,0.15)" },
        ].map((orb, i) => (
          <motion.div
            key={i}
            className="absolute rounded-full"
            style={{
              width: orb.w,
              height: orb.h,
              top: orb.top,
              left: orb.left,
              background: `radial-gradient(ellipse, ${orb.color}, transparent 70%)`,
              filter: "blur(60px)",
            }}
            animate={{
              x: [0, 30, -20, 15, 0],
              y: [0, -20, 25, -10, 0],
              scale: [1, 1.08, 0.94, 1.04, 1],
            }}
            transition={{ duration: orb.dur, delay: orb.delay, repeat: Infinity, ease: "easeInOut" }}
          />
        ))}

        {/* Subtle dot grid */}
        <svg className="absolute inset-0 w-full h-full opacity-[0.025]" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="dots" x="0" y="0" width="32" height="32" patternUnits="userSpaceOnUse">
              <circle cx="1" cy="1" r="1" fill="currentColor" className="text-foreground" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#dots)" />
        </svg>
      </div>

      {/* Hero */}
      <div className="relative text-center space-y-4 max-w-md">
        <div className="relative mx-auto w-16 h-16">
          <div className="absolute inset-0 rounded-2xl bg-primary/10 blur-2xl animate-pulse-slow" />
          <motion.div
            animate={{ rotate: [0, 4, -4, 0] }}
            transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
            className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/25 to-indigo-500/15 border border-primary/20 flex items-center justify-center shadow-lg"
          >
            <Sparkles className="w-7 h-7 text-primary" />
          </motion.div>
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Aletheia</h1>
          <p className="text-sm text-muted-foreground/50 font-medium tracking-widest uppercase mt-1">
            Epistemic Reasoning Assistant
          </p>
        </div>
        <p className="text-sm text-muted-foreground/60 leading-relaxed max-w-sm mx-auto">
          Every response is retrieved, verified against evidence, and annotated
          with claim-level confidence. Ask anything, the system shows its work.
        </p>
      </div>

      {/* Suggestions */}
      <div className="relative w-full max-w-2xl space-y-2">
        <p className="text-[10px] text-muted-foreground/40 uppercase tracking-widest text-center font-medium mb-3">
          Try a question
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {suggestions.map((s, i) => (
            <motion.button
              key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              onClick={() => onSuggestion(s.text)}
              className="group p-3.5 rounded-xl border border-border/40 bg-muted/15 hover:bg-primary/5 hover:border-primary/25 cursor-pointer transition-all text-left space-y-1"
            >
              <span className="text-[10px] font-semibold text-primary/60 uppercase tracking-wider">
                {s.label}
              </span>
              <p className="text-xs text-muted-foreground/70 group-hover:text-foreground/75 leading-relaxed transition-colors">
                {s.text}
              </p>
            </motion.button>
          ))}
        </div>
      </div>
    </div>
  );
}
