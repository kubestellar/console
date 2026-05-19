/**
 * Analytics ACCM — Types and helper utilities
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const GITHUB_API = "https://api.github.com";
export const REPO = "kubestellar/console";
export const CACHE_STORE = "analytics-accm";
export const CACHE_KEY = "accm-data";
/** Cache TTL: 1 hour */
export const CACHE_TTL_MS = 60 * 60 * 1000;
/** Project start date — kubestellar/console repo creation date */
export const PROJECT_START_DATE = "2026-01-16";
/** Hard ceiling on history length */
export const MAX_WEEKS_OF_HISTORY = 260;
/** GitHub API results per page (max 100) */
export const PER_PAGE = 100;
/** Max pages to fetch per endpoint */
export const MAX_PAGES = 30;
/** Request timeout for GitHub API calls */
export const API_TIMEOUT_MS = 15_000;
/** AI-generated label used to classify AI contributions */
export const AI_LABEL = "ai-generated";
/** Known AI authors */
export const AI_AUTHORS = new Set([
  "clubanderson",
  "Copilot",
  "copilot-swe-agent[bot]",
]);
/** Workflow filenames to track for CI pass rates */
export const CI_WORKFLOWS: Record<string, string> = {
  coverage: "Coverage Suite",
  nightly: "Nightly Compliance & Perf",
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WeeklyActivity {
  week: string;
  prsOpened: number;
  prsMerged: number;
  issuesOpened: number;
  issuesClosed: number;
  aiPrs: number;
  humanPrs: number;
  aiIssues: number;
  humanIssues: number;
  uniqueContributors: number;
}

export interface WorkflowWeekStats {
  total: number;
  passed: number;
  rate: number;
}

export interface CIPassRate {
  week: string;
  coverage: WorkflowWeekStats;
  nightly: WorkflowWeekStats;
}

export interface ContributorGrowth {
  total: number;
  weekly: { week: string; newContributors: number; totalToDate: number }[];
}

export interface ACCMData {
  weeklyActivity: WeeklyActivity[];
  ciPassRates: CIPassRate[];
  contributorGrowth: ContributorGrowth;
  cachedAt: string;
}

export interface CacheEntry {
  data: ACCMData;
  expiresAt: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Number of milliseconds in one week */
const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

/** Return the ISO week string (e.g. "2026-W14") for a given date */
export function isoWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

/** Generate the last N ISO week strings ending with the current week */
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

/** Number of weeks between PROJECT_START_DATE and today, capped */
export function weeksSinceProjectStart(): number {
  const start = new Date(PROJECT_START_DATE);
  const elapsedMs = Date.now() - start.getTime();
  const weeks = Math.ceil(elapsedMs / MS_PER_WEEK) + 1;
  return Math.max(1, Math.min(MAX_WEEKS_OF_HISTORY, weeks));
}

/** Days between PROJECT_START_DATE and today */
export function daysSinceProjectStart(): number {
  const start = new Date(PROJECT_START_DATE);
  const elapsedMs = Date.now() - start.getTime();
  const days = Math.ceil(elapsedMs / (24 * 60 * 60 * 1000));
  return Math.max(1, days);
}

export function isAIContribution(labels: { name: string }[], author: string): boolean {
  if (AI_AUTHORS.has(author)) return true;
  if (author && author.endsWith("[bot]")) return true;
  return (labels || []).some((l) => l.name === AI_LABEL);
}
