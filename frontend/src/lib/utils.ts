import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { SupportLevel } from "@/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatConfidence(score: number): string {
  return `${Math.round(score * 100)}%`;
}

export function confidenceLabel(score: number): string {
  if (score >= 0.75) return "High";
  if (score >= 0.45) return "Moderate";
  return "Low";
}

export function confidenceColor(score: number): string {
  if (score >= 0.75) return "text-green-400";
  if (score >= 0.45) return "text-yellow-400";
  return "text-red-400";
}

export function confidenceBg(score: number): string {
  if (score >= 0.75) return "bg-green-500/10 border-green-500/20";
  if (score >= 0.45) return "bg-yellow-500/10 border-yellow-500/20";
  return "bg-red-500/10 border-red-500/20";
}

export function supportLevelColor(level: SupportLevel): string {
  switch (level) {
    case "supported": return "text-green-400";
    case "partial": return "text-yellow-400";
    case "unsupported": return "text-red-400";
    default: return "text-gray-400";
  }
}

export function supportLevelBg(level: SupportLevel): string {
  switch (level) {
    case "supported": return "bg-green-500/10 border-green-500/30 text-green-300";
    case "partial": return "bg-yellow-500/10 border-yellow-500/30 text-yellow-300";
    case "unsupported": return "bg-red-500/10 border-red-500/30 text-red-300";
    default: return "bg-gray-500/10 border-gray-500/30 text-gray-400";
  }
}

export function supportLevelDot(level: SupportLevel): string {
  switch (level) {
    case "supported": return "bg-green-400";
    case "partial": return "bg-yellow-400";
    case "unsupported": return "bg-red-400";
    default: return "bg-gray-400";
  }
}

export function verificationStatusLabel(status: string): string {
  switch (status) {
    case "well_grounded": return "Well Grounded";
    case "partially_grounded": return "Partially Grounded";
    case "poorly_grounded": return "Poorly Grounded";
    case "no_claims": return "No Factual Claims";
    case "unverified": return "Unverified";
    default: return "Unknown";
  }
}

export function formatRelativeTime(isoString: string): string {
  // Ensure UTC interpretation: server sends timestamps without Z, add it if missing
  const normalized = isoString.endsWith("Z") || isoString.includes("+")
    ? isoString
    : isoString + "Z";
  const date = new Date(normalized);
  const now = new Date();
  const diff = (now.getTime() - date.getTime()) / 1000;
  if (diff < 5) return "just now";
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "…";
}
