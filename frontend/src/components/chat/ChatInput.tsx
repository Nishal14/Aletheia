"use client";
import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import { useAutoResizeTextarea } from "@/hooks/use-auto-resize-textarea";
import {
  CornerRightUp, Paperclip, FlaskConical, Upload,
} from "lucide-react";

interface ChatInputProps {
  onSend: (message: string) => void;
  isLoading: boolean;
  mode: "normal" | "research";
  onModeToggle: () => void;
  onFileUpload?: (file: File) => void;
}

export function ChatInput({
  onSend, isLoading, mode, onModeToggle, onFileUpload,
}: ChatInputProps) {
  const [value, setValue] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { textareaRef, adjustHeight } = useAutoResizeTextarea({
    minHeight: 52,
    maxHeight: 180,
  });

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || isLoading) return;
    onSend(trimmed);
    setValue("");
    adjustHeight(true);
  }, [value, isLoading, onSend, adjustHeight]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && onFileUpload) onFileUpload(file);
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      className="space-y-2"
    >
      {/* Research mode badge */}
      <AnimatePresence>
        {mode === "research" && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            className="flex items-center gap-2 px-1"
          >
            <div className="flex items-center gap-1.5 text-xs text-purple-400 bg-purple-500/10 border border-purple-500/20 rounded-full px-2.5 py-1">
              <FlaskConical className="w-3 h-3" />
              <span>Research Mode: deeper analysis enabled</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input container */}
      <div
        className={cn(
          "relative rounded-3xl border transition-all backdrop-blur-sm",
          dragOver
            ? "border-primary/60 bg-primary/5 scale-[1.01]"
            : isLoading
            ? "border-primary/20 bg-card/60"
            : "border-border/60 bg-card/60 focus-within:border-primary/40 focus-within:bg-card/80"
        )}
      >
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            adjustHeight();
          }}
          onKeyDown={handleKeyDown}
          placeholder="Ask anything. I'll reason, retrieve, and verify..."
          disabled={isLoading}
          rows={1}
          className={cn(
            "w-full bg-transparent pl-4 pr-24 py-4 text-sm text-foreground",
            "placeholder:text-muted-foreground/40 resize-none outline-none",
            "border-none ring-0 focus-visible:ring-0 focus-visible:ring-offset-0",
            "min-h-[52px] max-h-[180px] leading-relaxed [&::-webkit-resizer]:hidden",
            "disabled:opacity-50"
          )}
        />

        {/* Right-side controls */}
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {/* File upload */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.md,.csv,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f && onFileUpload) onFileUpload(f);
              e.target.value = "";
            }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-1.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all"
            title="Upload document"
          >
            <Paperclip className="w-4 h-4" />
          </button>

          {/* Research mode toggle */}
          <button
            onClick={onModeToggle}
            title="Toggle Research Mode"
            className={cn(
              "p-1.5 rounded-xl transition-all",
              mode === "research"
                ? "text-purple-400 bg-purple-500/10"
                : "text-muted-foreground hover:text-foreground hover:bg-white/5"
            )}
          >
            <FlaskConical className="w-4 h-4" />
          </button>

          {/* Submit */}
          <motion.button
            onClick={handleSubmit}
            disabled={!value.trim() || isLoading}
            whileTap={{ scale: 0.9 }}
            className={cn(
              "p-1.5 rounded-xl transition-all",
              value.trim() && !isLoading
                ? "bg-primary/20 text-primary hover:bg-primary/30"
                : "bg-black/5 dark:bg-white/5 text-muted-foreground/40 cursor-not-allowed"
            )}
          >
            {isLoading ? (
              <motion.div
                className="w-4 h-4 rounded-full border-2 border-primary/40 border-t-primary"
                animate={{ rotate: 360 }}
                transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
              />
            ) : (
              <CornerRightUp className="w-4 h-4" />
            )}
          </motion.button>
        </div>

        {/* Drag overlay */}
        {dragOver && (
          <div className="absolute inset-0 rounded-3xl border-2 border-primary/50 border-dashed flex items-center justify-center bg-primary/5 pointer-events-none">
            <div className="flex items-center gap-2 text-sm text-primary/80">
              <Upload className="w-4 h-4" />
              Drop to add to knowledge base
            </div>
          </div>
        )}
      </div>

      <p className="text-center text-[10px] text-muted-foreground/30">
        ↵ Send · Shift+↵ New line · Drag & drop files to ingest
      </p>
    </div>
  );
}
