"use client";
import { useState, useRef, useCallback, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import { ChatMessage, EvidenceChunk, PipelineStage, StreamEvent } from "@/types";
import { createWebSocket, fetchMessages } from "@/lib/api";

interface UseChatOptions {
  sessionId: string;
  mode: "normal" | "research";
}

export function useChat({ sessionId, mode }: UseChatOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [stage, setStage] = useState<PipelineStage>("idle");
  const [stageMessage, setStageMessage] = useState("");
  const [currentChunks, setCurrentChunks] = useState<EvidenceChunk[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const streamingIdRef = useRef<string | null>(null);

  const loadHistory = useCallback(async () => {
    try {
      const msgs = await fetchMessages(sessionId);
      setMessages(msgs);
    } catch {
      setMessages([]);
    }
  }, [sessionId]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const connectWs = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return wsRef.current;
    const ws = createWebSocket(sessionId);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const data: StreamEvent = JSON.parse(event.data);
        handleStreamEvent(data);
      } catch { /* ignore */ }
    };

    ws.onerror = () => {
      setStage("error");
      setStageMessage("Cannot reach backend. Is it running on port 8000?");
      setIsLoading(false);
      if (streamingIdRef.current) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === streamingIdRef.current
              ? { ...m, content: "⚠ Cannot reach backend. Start it with: `uvicorn app.main:app --port 8000`", isStreaming: false }
              : m
          )
        );
        streamingIdRef.current = null;
      }
    };

    ws.onclose = () => { setIsLoading(false); setStage("idle"); };
    return ws;
  }, [sessionId, stage]);

  const handleStreamEvent = useCallback((event: StreamEvent) => {
    // Capture ref value immediately: the `done` handler nulls this ref synchronously,
    // and if `done` arrives in the same JS task as an earlier event, the ref would be
    // null by the time React flushes the queued setMessages updater.
    const sid = streamingIdRef.current;

    switch (event.type) {
      case "status":
        setStage(event.stage);
        setStageMessage(event.message);
        break;
      case "retrieval":
        setCurrentChunks(event.chunks);
        break;
      case "token":
        if (sid) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === sid ? { ...m, content: m.content + (event.content || "") } : m
            )
          );
        }
        break;
      case "thinking":
        if (sid) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === sid ? { ...m, thinking: (m.thinking || "") + (event.content || "") } : m
            )
          );
        }
        break;
      case "epistemic":
        if (sid) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === sid
                ? { ...m, epistemic_metadata: event.data, retrieval_chunks: event.data.evidence_chunks }
                : m
            )
          );
        }
        break;
      case "response_complete":
        if (sid) {
          setMessages((prev) =>
            prev.map((m) => (m.id === sid ? { ...m, isStreaming: false } : m))
          );
        }
        break;
      case "done":
        streamingIdRef.current = null;
        setIsLoading(false);
        setStage("done");
        break;
      case "error":
        setStage("error");
        setStageMessage(event.content);
        setIsLoading(false);
        if (sid) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === sid
                ? { ...m, content: m.content || `Error: ${event.content}`, isStreaming: false }
                : m
            )
          );
        }
        break;
    }
  }, []);

  const sendMessage = useCallback(
    (content: string) => {
      if (!content.trim() || isLoading) return;

      const userMsg: ChatMessage = {
        id: uuidv4(),
        role: "user",
        content,
        created_at: new Date().toISOString(),
      };
      const assistantId = uuidv4();
      streamingIdRef.current = assistantId;
      const assistantMsg: ChatMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
        created_at: new Date().toISOString(),
        isStreaming: true,
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setIsLoading(true);
      setStage("retrieving");
      setCurrentChunks([]);

      const ws = connectWs();
      const send = () => ws.send(JSON.stringify({ type: "query", content, mode }));
      if (ws.readyState === WebSocket.OPEN) send();
      else ws.onopen = send;
    },
    [isLoading, connectWs, mode]
  );

  // Edit a user message: truncate from that message, resend with new content.
  // React 18 auto-batches both setMessages calls so sendMessage's prev=>
  // updater correctly receives the already-truncated array.
  const editMessage = useCallback(
    (messageId: string, newContent: string) => {
      if (!newContent.trim() || isLoading) return;
      const idx = messages.findIndex((m) => m.id === messageId);
      if (idx === -1) return;
      setMessages(messages.slice(0, idx));
      sendMessage(newContent);
    },
    [isLoading, messages, sendMessage]
  );

  // Regenerate: works for both user messages (resend that message) and
  // assistant messages (find the preceding user message and resend it).
  const regenerateFrom = useCallback(
    (messageId: string) => {
      if (isLoading) return;
      const idx = messages.findIndex((m) => m.id === messageId);
      if (idx === -1) return;

      const msg = messages[idx];
      let userContent: string;
      let truncateIdx: number;

      if (msg.role === "user") {
        userContent = msg.content;
        truncateIdx = idx;
      } else {
        const userMsg = [...messages.slice(0, idx)].reverse().find((m) => m.role === "user");
        if (!userMsg) return;
        truncateIdx = messages.findIndex((m) => m.id === userMsg.id);
        userContent = userMsg.content;
      }

      setMessages(messages.slice(0, truncateIdx));
      sendMessage(userContent);
    },
    [isLoading, messages, sendMessage]
  );

  useEffect(() => { return () => { wsRef.current?.close(); }; }, [sessionId]);

  return {
    messages,
    isLoading,
    stage,
    stageMessage,
    currentChunks,
    sendMessage,
    editMessage,
    regenerateFrom,
    loadHistory,
  };
}
