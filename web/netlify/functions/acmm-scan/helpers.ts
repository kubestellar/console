/**
 * ACMM Scan — Types and helper utilities
 */

import type { DetectionHint } from "./criteria";

// ---------------------------------------------------------------------------
// Constants (exported for use in main handler)
// ---------------------------------------------------------------------------

export const GITHUB_API = "https://api.github.com";
export const CACHE_STORE = "acmm-scan";
/** Per-repo cache TTL: 1 hour */
export const CACHE_TTL_MS = 60 * 60 * 1000;
/** Request timeout for GitHub API calls */
export const API_TIMEOUT_MS = 15_000;
/** How many weeks of contribution history to return */
export const WEEKS_OF_HISTORY = 16;
/** Valid repo slug: owner/name with ASCII letters, digits, underscores, dots, dashes */
export const REPO_RE = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/;
export const UNKNOWN_REPO = "unknown/repo";
/** Allowed CORS origins (exact match) */
export const ALLOWED_ORIGINS = [
  "https://console.kubestellar.io",
  "https://kubestellar.io",
  "https://www.kubestellar.io",
];
/** AI-generated label used to classify AI contributions */
export const AI_LABEL = "ai-generated";
/** Known AI authors (shared logins + bots) */
export const AI_AUTHORS = new Set([
  "clubanderson",
  "Copilot",
  "copilot-swe-agent[bot]",
]);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WeeklyActivity {
  week: string;
  aiPrs: number;
  humanPrs: number;
  aiIssues: number;
  humanIssues: number;
}

export interface ScanResult {
  repo: string;
  scannedAt: string;
  detectedIds: string[];
  weeklyActivity: WeeklyActivity[];
}

export interface CacheEntry {
  data: ScanResult;
  expiresAt: number;
}

export interface GitTreeEntry {
  path: string;
  type: "blob" | "tree";
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Validate CORS origin via URL-parsed hostname check */
export function corsOrigin(origin: string | null): string {
  if (!origin) return ALLOWED_ORIGINS[0];
  if (ALLOWED_ORIGINS.includes(origin)) return origin;
  try {
    const host = new URL(origin).hostname.toLowerCase();
    if (host === "localhost") return origin;
    if (host === "kubestellar.io" || host.endsWith(".kubestellar.io")) return origin;
  } catch { /* invalid URL */ }
  return ALLOWED_ORIGINS[0];
}

export function corsHeaders(origin: string | null): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": corsOrigin(origin),
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "public, max-age=900",
    Vary: "Origin",
  };
}

export function isoWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

export function lastNWeeks(n: number): string[] {
  const weeks: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i * 7);
    const w = isoWeek(d);
    if (!weeks.includes(w)) weeks.push(w);
  }
  return weeks;
}

const GLOBSTAR_TOKEN = "__ACMM_GLOBSTAR__";
const GLOB_SPECIAL_RE = /[|\\{}()[\]^$+?.]/g;

function globToRegExp(pattern: string): RegExp {
  const regexPattern = pattern
    .replaceAll("**", GLOBSTAR_TOKEN)
    .replace(GLOB_SPECIAL_RE, "\\$&")
    .replaceAll("*", "[^/]*")
    .replaceAll(GLOBSTAR_TOKEN, ".*");

  return new RegExp(`^${regexPattern}$`);
}

export function matchesHint(treePaths: Set<string>, hint: DetectionHint): boolean {
  const patterns = Array.isArray(hint.pattern) ? hint.pattern : [hint.pattern];

  if (hint.type === "glob") {
    return patterns.some((pattern) => {
      const regex = globToRegExp(pattern);
      return Array.from(treePaths).some((path) => regex.test(path));
    });
  }

  for (const pattern of patterns) {
    for (const path of treePaths) {
      if (pattern.endsWith("/")) {
        if (
          path.startsWith(pattern) ||
          path === pattern.replace(/\/$/, "") ||
          path.includes(`/${pattern}`)
        )
          return true;
      } else {
        if (
          path === pattern ||
          path.endsWith(`/${pattern}`) ||
          path.startsWith(`${pattern}/`)
        )
          return true;
      }
    }
  }
  return false;
}

export function isAIContribution(
  labels: { name: string }[],
  author: string,
): boolean {
  if (AI_AUTHORS.has(author)) return true;
  if (author && author.endsWith("[bot]")) return true;
  return (labels || []).some((l) => l.name === AI_LABEL);
}
