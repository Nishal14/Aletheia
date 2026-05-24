"use client";
import { useState, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import { Sidebar } from "@/components/sidebar/Sidebar";
import { ChatInterface } from "@/components/chat/ChatInterface";
import { fetchSessions, createSession } from "@/lib/api";

export default function Home() {
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      try {
        const sessions = await fetchSessions();
        if (sessions.length > 0) {
          setActiveSessionId(sessions[0].id);
        } else {
          const s = await createSession();
          setActiveSessionId(s.id);
        }
      } catch {
        // Fallback: create local session ID (will be created on first message)
        setActiveSessionId(uuidv4());
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  const handleSessionSelect = (id: string) => {
    setActiveSessionId(id);
  };

  const handleNewSession = (id: string) => {
    setActiveSessionId(id);
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
            <svg className="w-5 h-5 text-primary animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
          <p className="text-sm text-muted-foreground">Initializing Aletheia...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex overflow-hidden bg-background">
      {/* Background gradient */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/3 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-indigo-500/3 rounded-full blur-3xl" />
      </div>

      {/* Sidebar */}
      <Sidebar
        activeSessionId={activeSessionId}
        onSessionSelect={handleSessionSelect}
        onNewSession={handleNewSession}
      />

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        {activeSessionId ? (
          <ChatInterface key={activeSessionId} sessionId={activeSessionId} />
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground/50 text-sm">
            Select a conversation or start a new one
          </div>
        )}
      </div>
    </div>
  );
}
