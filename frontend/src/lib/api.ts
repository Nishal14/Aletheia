import { Session, ChatMessage } from "@/types";

const BASE_URL = "/api";

export async function fetchSessions(): Promise<Session[]> {
  const res = await fetch(`${BASE_URL}/sessions`);
  if (!res.ok) throw new Error("Failed to fetch sessions");
  return res.json();
}

export async function createSession(): Promise<Session> {
  const res = await fetch(`${BASE_URL}/sessions`, { method: "POST" });
  if (!res.ok) throw new Error("Failed to create session");
  return res.json();
}

export async function deleteSession(id: string): Promise<void> {
  await fetch(`${BASE_URL}/sessions/${id}`, { method: "DELETE" });
}

export async function updateSessionTitle(id: string, title: string): Promise<void> {
  await fetch(`${BASE_URL}/sessions/${id}/title`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
}

export async function fetchMessages(sessionId: string): Promise<ChatMessage[]> {
  const res = await fetch(`${BASE_URL}/sessions/${sessionId}/messages`);
  if (!res.ok) throw new Error("Failed to fetch messages");
  return res.json();
}

export async function fetchHealth(): Promise<{
  status: string;
  ollama: boolean;
  qdrant: boolean;
  primary_model: string;
}> {
  const res = await fetch(`${BASE_URL}/health`);
  if (!res.ok) throw new Error("Health check failed");
  return res.json();
}

export async function ingestText(
  text: string,
  source: string,
  metadata?: Record<string, unknown>
): Promise<{ chunks_ingested: number; source: string; status: string }> {
  const res = await fetch(`${BASE_URL}/documents/ingest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, source, metadata: metadata || {} }),
  });
  if (!res.ok) throw new Error("Failed to ingest text");
  return res.json();
}

export async function uploadDocument(
  file: File,
  source?: string
): Promise<{ chunks_ingested: number; source: string; status: string }> {
  const formData = new FormData();
  formData.append("file", file);
  if (source) formData.append("source", source);
  const res = await fetch(`${BASE_URL}/documents/upload`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) throw new Error("Failed to upload document");
  return res.json();
}

export async function fetchDocumentStats(): Promise<{
  knowledge_chunks: number;
  memory_entries: number;
  qdrant_available: boolean;
}> {
  const res = await fetch(`${BASE_URL}/documents/stats`);
  if (!res.ok) throw new Error("Failed to fetch stats");
  return res.json();
}

export async function searchArxiv(
  query: string,
  maxResults = 5
): Promise<{ sources_ingested: number; chunks_ingested: number; results: Record<string, unknown>[] }> {
  const res = await fetch(`${BASE_URL}/knowledge/arxiv`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, max_results: maxResults }),
  });
  if (!res.ok) throw new Error("arXiv fetch failed");
  return res.json();
}

export async function fetchWikipedia(
  title: string
): Promise<{ sources_ingested: number; chunks_ingested: number; results: Record<string, unknown>[] }> {
  const res = await fetch(`${BASE_URL}/knowledge/wikipedia`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  if (!res.ok) throw new Error("Wikipedia fetch failed");
  return res.json();
}

export async function fetchKnowledgeStats(): Promise<{
  knowledge_chunks: number;
  memory_entries: number;
  qdrant_available: boolean;
}> {
  const res = await fetch(`${BASE_URL}/knowledge/stats`);
  if (!res.ok) throw new Error("Stats fetch failed");
  return res.json();
}

export function createWebSocket(sessionId: string): WebSocket {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return new WebSocket(`${protocol}//localhost:8000/ws/${sessionId}`);
}
