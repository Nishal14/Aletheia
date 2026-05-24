"use client";
import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Session } from "@/types";
import { fetchSessions, createSession, deleteSession } from "@/lib/api";
import {
  Plus, Trash2, MessageSquare, ChevronLeft, ChevronRight, Sparkles,
} from "lucide-react";
import { formatRelativeTime, truncate } from "@/lib/utils";
import { StatusIndicator } from "@/components/layout/Header";
import { KnowledgePanel } from "./KnowledgePanel";

interface SidebarProps {
  activeSessionId: string | null;
  onSessionSelect: (id: string) => void;
  onNewSession: (id: string) => void;
}

export function Sidebar({ activeSessionId, onSessionSelect, onNewSession }: SidebarProps) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const [loading, setLoading] = useState(false);

  const loadSessions = useCallback(async () => {
    try {
      const s = await fetchSessions();
      setSessions(s);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    loadSessions();
    const interval = setInterval(loadSessions, 12000);
    return () => clearInterval(interval);
  }, [loadSessions]);

  const handleNew = async () => {
    setLoading(true);
    try {
      const s = await createSession();
      setSessions((prev) => [s, ...prev]);
      onNewSession(s.id);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await deleteSession(id);
    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (activeSessionId === id) {
      const remaining = sessions.filter((s) => s.id !== id);
      if (remaining.length > 0) onSessionSelect(remaining[0].id);
    }
  };

  return (
    <motion.div
      animate={{ width: collapsed ? 56 : 264 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="h-full flex flex-col border-r border-border/40 bg-card/30 backdrop-blur-md overflow-hidden flex-shrink-0 relative"
    >
      {/* Subtle top gradient accent */}
      <div className="absolute top-0 inset-x-0 h-24 bg-gradient-to-b from-primary/4 to-transparent pointer-events-none" />

      {/* Header */}
      <div className="flex items-center justify-between px-3 py-3 relative">
        {!collapsed && (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            onClick={handleNew}
            title="New conversation"
            className="flex items-center gap-2.5 hover:opacity-80 active:scale-95 transition-all"
          >
            <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-primary/30 to-indigo-500/20 flex items-center justify-center shadow-sm">
              <Sparkles className="w-3.5 h-3.5 text-primary" />
            </div>
            <div className="flex flex-col items-start">
              <span className="font-bold text-sm leading-tight">Aletheia</span>
              <span className="text-[9px] text-muted-foreground/50 leading-tight tracking-wide">Epistemic AI</span>
            </div>
          </motion.button>
        )}
        {collapsed && (
          <button
            onClick={handleNew}
            title="New conversation"
            className="w-7 h-7 rounded-xl bg-gradient-to-br from-primary/30 to-indigo-500/20 flex items-center justify-center mx-auto hover:opacity-80 active:scale-95 transition-all"
          >
            <Sparkles className="w-3.5 h-3.5 text-primary" />
          </button>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1.5 rounded-lg hover:bg-white/5 text-muted-foreground/50 hover:text-muted-foreground transition-all flex-shrink-0"
        >
          {collapsed
            ? <ChevronRight className="w-3.5 h-3.5" />
            : <ChevronLeft className="w-3.5 h-3.5" />
          }
        </button>
      </div>

      {/* New chat button */}
      <div className="px-2 pb-2">
        <button
          onClick={handleNew}
          disabled={loading}
          className={`w-full flex items-center gap-2 p-2 rounded-xl border border-dashed border-border/40 hover:border-primary/30 hover:bg-primary/4 transition-all text-muted-foreground/60 hover:text-foreground/70 disabled:opacity-50 text-xs ${
            collapsed ? "justify-center" : "justify-start px-3"
          }`}
        >
          <Plus className="w-3.5 h-3.5 flex-shrink-0" />
          {!collapsed && <span>New conversation</span>}
        </button>
      </div>

      {/* Sessions list */}
      <div className="flex-1 overflow-y-auto px-2 pb-1 space-y-0.5">
        {!collapsed && sessions.length > 0 && (
          <p className="text-[10px] text-muted-foreground/35 uppercase tracking-widest px-2 pb-1 pt-0.5 font-medium">
            Recent
          </p>
        )}
        <AnimatePresence>
          {sessions.map((session) => (
            <motion.div
              key={session.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              onClick={() => onSessionSelect(session.id)}
              className={`group relative flex items-center gap-2 rounded-xl px-2 py-2 cursor-pointer transition-all ${
                activeSessionId === session.id
                  ? "bg-primary/10 border border-primary/15 shadow-sm"
                  : "hover:bg-white/3 border border-transparent"
              } ${collapsed ? "justify-center" : ""}`}
            >
              {/* Active indicator */}
              {activeSessionId === session.id && !collapsed && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-primary rounded-r-full" />
              )}
              <MessageSquare className={`w-3.5 h-3.5 flex-shrink-0 ${
                activeSessionId === session.id ? "text-primary" : "text-muted-foreground/50"
              }`} />
              {!collapsed && (
                <div className="flex-1 min-w-0">
                  <p className={`text-xs truncate leading-tight ${
                    activeSessionId === session.id ? "text-foreground/90 font-medium" : "text-foreground/60"
                  }`}>
                    {truncate(session.title, 28)}
                  </p>
                  <p className="text-[10px] text-muted-foreground/40 mt-0.5">
                    {formatRelativeTime(session.updated_at)}
                  </p>
                </div>
              )}
              {!collapsed && (
                <button
                  onClick={(e) => handleDelete(session.id, e)}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded-lg hover:bg-red-500/10 hover:text-red-400 text-muted-foreground/40 transition-all flex-shrink-0"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </motion.div>
          ))}
        </AnimatePresence>

        {sessions.length === 0 && !collapsed && (
          <div className="text-center py-8 space-y-1">
            <p className="text-xs text-muted-foreground/30">No conversations yet</p>
            <p className="text-[10px] text-muted-foreground/20">Click + to start one</p>
          </div>
        )}
      </div>

      {/* Bottom section */}
      <div className="flex-shrink-0 pb-2 space-y-1">
        {/* Knowledge base panel */}
        <KnowledgePanel collapsed={collapsed} />

        {/* Status */}
        {!collapsed && (
          <div className="px-3 pt-2 border-t border-border/30">
            <StatusIndicator />
          </div>
        )}
      </div>
    </motion.div>
  );
}
