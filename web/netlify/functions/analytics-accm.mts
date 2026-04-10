/**
 * Netlify Function: ACCM (AI Codebase Maturity Model) Analytics
 *
 * Aggregates GitHub activity metrics for kubestellar/console to power
 * the ACCM dashboard: weekly PR/issue activity, CI pass rates,
 * contributor growth, and AI vs human classification.
 *
 * Optional env var:
 *   GITHUB_TOKEN — enables higher rate limits (5000 req/hr vs 60)
 */

import { getStore } from "@netlify/blobs";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GITHUB_API = "https://api.github.com";
const REPO = "kubestellar/console";
const CACHE_STORE = "analytics-accm";
const CACHE_KEY = "accm-data";
/** Cache TTL: 1 hour */
const CACHE_TTL_MS = 60 * 60 * 1000;
/** Project start date — kubestellar/console repo creation date (verified
 *  via the GitHub Repos API: created_at). History windows are computed
 *  from this date so the charts always show the full project history
 *  rather than a sliding window. */
const PROJECT_START_DATE = "2026-01-16";
/** Hard ceiling on history length, in case PROJECT_START_DATE drifts.
 *  At ~5 years this is generous but bounded. */
const MAX_WEEKS_OF_HISTORY = 260;
/** GitHub API results per page (max 100) */
const PER_PAGE = 100;
/**
 * Max pages to fetch per endpoint. With the full project history window
 * (~18+ weeks at the time of writing) and recent weeks exceeding 300 PRs,
 * we need a generous page cap to avoid older weeks rendering as 0.
 */
const MAX_PAGES = 30;
/** Request timeout for GitHub API calls */
const API_TIMEOUT_MS = 15_000;
/** Public gist (raw URL) holding the precomputed full ACCM history.
 *  Updated daily by .github/workflows/accm-history-update.yml. Reading
 *  this gist sidesteps the GitHub Search API's 1000-result hard cap so
 *  the chart can show every week since PROJECT_START_DATE. If the gist
 *  fetch fails for any reason, the function falls back to a live
 *  computation (which only covers the most recent slice). */
const ACCM_HISTORY_GIST_URL =
  "https://gist.githubusercontent.com/clubanderson/21a665e2a49ced34f83bc290c3fd6a23/raw/accm-history.json";
/** Timeout for the gist fetch (short — we want to fall back fast). */
const GIST_FETCH_TIMEOUT_MS = 5_000;
/** AI-generated label used to classify AI contributions */
const AI_LABEL = "ai-generated";
/**
 * Authors whose PRs/issues are always AI-generated.
 *   - clubanderson: the shared login Claude Code writes from
 *   - Copilot / copilot-swe-agent[bot]: GitHub Copilot coding agent
 * Any login ending in `[bot]` is also treated as AI (see isAIContribution).
 */
const AI_AUTHORS = new Set([
  "clubanderson",
  "Copilot",
  "copilot-swe-agent[bot]",
]);

/** Workflow filenames to track for CI pass rates */
const CI_WORKFLOWS: Record<string, string> = {
  coverage: "Coverage Suite",
  nightly: "Nightly Compliance & Perf",
};

/** CORS origins: *.kubestellar.io and localhost */
const ALLOWED_ORIGIN_RE = /^https?:\/\/(.*\.kubestellar\.io|localhost(:\d+)?)$/;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WeeklyActivity {
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

interface WorkflowWeekStats {
  total: number;
  passed: number;
  rate: number;
}

interface CIPassRate {
  week: string;
  coverage: WorkflowWeekStats;
  nightly: WorkflowWeekStats;
}

interface ContributorGrowth {
  total: number;
  weekly: { week: string; newContributors: number; totalToDate: number }[];
}

interface ACCMData {
  weeklyActivity: WeeklyActivity[];
  ciPassRates: CIPassRate[];
  contributorGrowth: ContributorGrowth;
  cachedAt: string;
}

interface CacheEntry {
  data: ACCMData;
  expiresAt: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build CORS headers, reflecting the origin if it matches the allow list */
function corsHeaders(origin: string | null): Record<string, string> {
  const allowed =
    origin && ALLOWED_ORIGIN_RE.test(origin) ? origin : "https://console.kubestellar.io";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "public, max-age=3600",
    Vary: "Origin",
  };
}

/** Return the ISO week string (e.g. "2026-W14") for a given date */
function isoWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7; // Sunday = 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum); // Thursday of the week
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

/** Generate the last N ISO week strings ending with the current week */
function lastNWeeks(n: number): string[] {
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

/** Number of milliseconds in one week */
const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

/** Number of weeks between PROJECT_START_DATE and today, capped at
 *  MAX_WEEKS_OF_HISTORY. Always returns at least 1. */
function weeksSinceProjectStart(): number {
  const start = new Date(PROJECT_START_DATE);
  const elapsedMs = Date.now() - start.getTime();
  const weeks = Math.ceil(elapsedMs / MS_PER_WEEK) + 1;
  return Math.max(1, Math.min(MAX_WEEKS_OF_HISTORY, weeks));
}

/** Days between PROJECT_START_DATE and today, used as the GitHub
 *  search `since` window. Always returns at least 1. */
function daysSinceProjectStart(): number {
  const start = new Date(PROJECT_START_DATE);
  const elapsedMs = Date.now() - start.getTime();
  const days = Math.ceil(elapsedMs / (24 * 60 * 60 * 1000));
  return Math.max(1, days);
}

/** Fetch paginated results from GitHub REST API */
async function fetchPaginated<T>(
  url: string,
  token: string,
  extractItems: (body: Record<string, unknown>) => T[],
): Promise<T[]> {
  const allItems: T[] = [];
  const separator = url.includes("?") ? "&" : "?";

  for (let page = 1; page <= MAX_PAGES; page++) {
    const pageUrl = `${url}${separator}per_page=${PER_PAGE}&page=${page}`;
    const headers: Record<string, string> = {
      Accept: "application/vnd.github.v3+json",
    };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch(pageUrl, {
      headers,
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });

    if (!res.ok) {
      // 404 means the endpoint doesn't exist (e.g. workflow not found)
      if (res.status === 404) return allItems;
      const body = await res.text();
      throw new Error(`GitHub API ${res.status}: ${body.slice(0, 300)}`);
    }

    const data = await res.json();
    const items = extractItems(data as Record<string, unknown>);
    allItems.push(...items);

    // Stop if we got fewer than a full page (no more data)
    if (items.length < PER_PAGE) break;
  }

  return allItems;
}

// ---------------------------------------------------------------------------
// Data fetchers
// ---------------------------------------------------------------------------

interface PRItem {
  created_at: string;
  merged_at: string | null;
  user: { login: string };
  labels: { name: string }[];
}

interface IssueItem {
  created_at: string;
  closed_at: string | null;
  user: { login: string };
  labels: { name: string }[];
  pull_request?: unknown;
}

interface WorkflowRunItem {
  created_at: string;
  conclusion: string | null;
  status: string;
}

/** Fetch PRs created since the project start date */
async function fetchRecentPRs(token: string): Promise<PRItem[]> {
  const since = new Date();
  since.setDate(since.getDate() - daysSinceProjectStart());
  const sinceStr = since.toISOString().split("T")[0];

  // Use search API to get PRs with label info
  const url = `${GITHUB_API}/search/issues?q=repo:${REPO}+type:pr+created:>=${sinceStr}&sort=created&order=desc`;
  return fetchPaginated(url, token, (body) => {
    const items = (body.items || []) as Array<{
      created_at: string;
      pull_request?: { merged_at?: string | null };
      user: { login: string };
      labels: { name: string }[];
    }>;
    return items.map((item) => ({
      created_at: item.created_at,
      merged_at: item.pull_request?.merged_at ?? null,
      user: item.user,
      labels: item.labels || [],
    }));
  });
}

/** Fetch issues created since the project start date */
async function fetchRecentIssues(token: string): Promise<IssueItem[]> {
  const since = new Date();
  since.setDate(since.getDate() - daysSinceProjectStart());
  const sinceStr = since.toISOString().split("T")[0];

  // Search for issues (excluding PRs)
  const url = `${GITHUB_API}/search/issues?q=repo:${REPO}+type:issue+created:>=${sinceStr}&sort=created&order=desc`;
  return fetchPaginated(url, token, (body) => {
    const items = (body.items || []) as IssueItem[];
    return items.filter((item) => !item.pull_request);
  });
}

/** Fetch workflow runs for a named workflow */
async function fetchWorkflowRuns(
  workflowName: string,
  token: string,
): Promise<WorkflowRunItem[]> {
  // First, list workflows to find the ID by name
  const listUrl = `${GITHUB_API}/repos/${REPO}/actions/workflows`;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const listRes = await fetch(listUrl, {
    headers,
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  });
  if (!listRes.ok) return [];

  const listData = await listRes.json();
  const workflows = (listData.workflows || []) as Array<{
    id: number;
    name: string;
  }>;
  const workflow = workflows.find(
    (w) => w.name.toLowerCase() === workflowName.toLowerCase(),
  );
  if (!workflow) return [];

  // Fetch runs for this workflow
  const since = new Date();
  since.setDate(since.getDate() - daysSinceProjectStart());
  const sinceStr = since.toISOString().split("T")[0];

  const runsUrl = `${GITHUB_API}/repos/${REPO}/actions/workflows/${workflow.id}/runs?created=>${sinceStr}&status=completed`;
  return fetchPaginated(runsUrl, token, (body) => {
    const runs = (body.workflow_runs || []) as WorkflowRunItem[];
    return runs;
  });
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

function isAIContribution(labels: { name: string }[], author: string): boolean {
  // Known AI authors, any GitHub App/bot account, or PRs explicitly labeled.
  if (AI_AUTHORS.has(author)) return true;
  if (author && author.endsWith("[bot]")) return true;
  return (labels || []).some((l) => l.name === AI_LABEL);
}

function aggregateWeeklyActivity(
  prs: PRItem[],
  issues: IssueItem[],
  weeks: string[],
): WeeklyActivity[] {
  // Initialize week buckets
  const buckets = new Map<string, WeeklyActivity>();
  for (const week of weeks) {
    buckets.set(week, {
      week,
      prsOpened: 0,
      prsMerged: 0,
      issuesOpened: 0,
      issuesClosed: 0,
      aiPrs: 0,
      humanPrs: 0,
      aiIssues: 0,
      humanIssues: 0,
      uniqueContributors: 0,
    });
  }

  // Track contributors per week
  const weekContributors = new Map<string, Set<string>>();
  for (const week of weeks) {
    weekContributors.set(week, new Set());
  }

  // Tally PRs
  for (const pr of prs) {
    const createdWeek = isoWeek(new Date(pr.created_at));
    const bucket = buckets.get(createdWeek);
    if (bucket) {
      bucket.prsOpened++;
      if (isAIContribution(pr.labels, pr.user.login)) {
        bucket.aiPrs++;
      } else {
        bucket.humanPrs++;
      }
      weekContributors.get(createdWeek)?.add(pr.user.login);
    }

    if (pr.merged_at) {
      const mergedWeek = isoWeek(new Date(pr.merged_at));
      const mBucket = buckets.get(mergedWeek);
      if (mBucket) mBucket.prsMerged++;
    }
  }

  // Tally issues
  for (const issue of issues) {
    const createdWeek = isoWeek(new Date(issue.created_at));
    const bucket = buckets.get(createdWeek);
    if (bucket) {
      bucket.issuesOpened++;
      if (isAIContribution(issue.labels, issue.user.login)) {
        bucket.aiIssues++;
      } else {
        bucket.humanIssues++;
      }
      weekContributors.get(createdWeek)?.add(issue.user.login);
    }

    if (issue.closed_at) {
      const closedWeek = isoWeek(new Date(issue.closed_at));
      const cBucket = buckets.get(closedWeek);
      if (cBucket) cBucket.issuesClosed++;
    }
  }

  // Fill in unique contributor counts
  for (const week of weeks) {
    const bucket = buckets.get(week);
    const contributors = weekContributors.get(week);
    if (bucket && contributors) {
      bucket.uniqueContributors = contributors.size;
    }
  }

  return weeks.map((w) => buckets.get(w)!);
}

function aggregateCIPassRates(
  coverageRuns: WorkflowRunItem[],
  nightlyRuns: WorkflowRunItem[],
  weeks: string[],
): CIPassRate[] {
  function weekStats(
    runs: WorkflowRunItem[],
    week: string,
  ): WorkflowWeekStats {
    const weekRuns = runs.filter(
      (r) => isoWeek(new Date(r.created_at)) === week,
    );
    const total = weekRuns.length;
    const passed = weekRuns.filter((r) => r.conclusion === "success").length;
    const rate = total > 0 ? Math.round((passed / total) * 1000) / 10 : 0;
    return { total, passed, rate };
  }

  return weeks.map((week) => ({
    week,
    coverage: weekStats(coverageRuns, week),
    nightly: weekStats(nightlyRuns, week),
  }));
}

function aggregateContributorGrowth(
  prs: PRItem[],
  issues: IssueItem[],
  weeks: string[],
): ContributorGrowth {
  // Collect all authors with their earliest contribution date
  const firstSeen = new Map<string, string>(); // login → ISO week of first contribution

  // Consider all PRs and issues (not just recent ones — but we only have recent data)
  for (const pr of prs) {
    const week = isoWeek(new Date(pr.created_at));
    const login = pr.user.login;
    const existing = firstSeen.get(login);
    if (!existing || week < existing) {
      firstSeen.set(login, week);
    }
  }
  for (const issue of issues) {
    const week = isoWeek(new Date(issue.created_at));
    const login = issue.user.login;
    const existing = firstSeen.get(login);
    if (!existing || week < existing) {
      firstSeen.set(login, week);
    }
  }

  const total = firstSeen.size;

  // For each week, count how many contributors were first seen that week
  // and compute running total
  let runningTotal = 0;
  // Count contributors first seen BEFORE our window
  const earliestWeek = weeks[0] || "";
  for (const [, week] of firstSeen) {
    if (week < earliestWeek) runningTotal++;
  }

  const weekly = weeks.map((week) => {
    let newContributors = 0;
    for (const [, firstWeek] of firstSeen) {
      if (firstWeek === week) newContributors++;
    }
    runningTotal += newContributors;
    return { week, newContributors, totalToDate: runningTotal };
  });

  return { total, weekly };
}

// ---------------------------------------------------------------------------
// Gist fetch — precomputed historical data
// ---------------------------------------------------------------------------

/** Fetch the precomputed full-history ACCM dataset from the public gist
 *  written daily by the accm-history-update workflow. Returns null on any
 *  failure so callers fall back to live computation. */
async function fetchACCMFromGist(): Promise<ACCMData | null> {
  // Skip if the gist URL hasn't been wired up yet (placeholder still present).
  if (ACCM_HISTORY_GIST_URL.includes("__GIST_ID__")) return null;
  try {
    const res = await fetch(ACCM_HISTORY_GIST_URL, {
      signal: AbortSignal.timeout(GIST_FETCH_TIMEOUT_MS),
      // Bypass intermediate caches — the gist is the source of truth and
      // we want the freshest version after the daily update job runs.
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as ACCMData;
    if (!Array.isArray(data.weeklyActivity) || data.weeklyActivity.length === 0) {
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main data fetch + aggregation
// ---------------------------------------------------------------------------

async function fetchACCMData(token: string): Promise<ACCMData> {
  const weeks = lastNWeeks(weeksSinceProjectStart());

  // Fetch all data in parallel
  const [prs, issues, coverageRuns, nightlyRuns] = await Promise.all([
    fetchRecentPRs(token),
    fetchRecentIssues(token),
    fetchWorkflowRuns(CI_WORKFLOWS.coverage, token),
    fetchWorkflowRuns(CI_WORKFLOWS.nightly, token),
  ]);

  const weeklyActivity = aggregateWeeklyActivity(prs, issues, weeks);
  const ciPassRates = aggregateCIPassRates(coverageRuns, nightlyRuns, weeks);
  const contributorGrowth = aggregateContributorGrowth(prs, issues, weeks);

  return {
    weeklyActivity,
    ciPassRates,
    contributorGrowth,
    cachedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export default async (req: Request) => {
  const origin = req.headers.get("Origin");
  const headers = corsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  const token =
    Netlify.env.get("GITHUB_TOKEN") || process.env.GITHUB_TOKEN || "";

  // Check blob cache
  const store = getStore(CACHE_STORE);
  try {
    const cached = await store.get(CACHE_KEY, { type: "text" });
    if (cached) {
      const entry: CacheEntry = JSON.parse(cached);
      if (Date.now() < entry.expiresAt) {
        return new Response(
          JSON.stringify({ ...entry.data, fromCache: true }),
          {
            status: 200,
            headers: { ...headers, "Content-Type": "application/json" },
          },
        );
      }
    }
  } catch {
    // Cache miss or parse error — proceed to fetch
  }

  // Prefer the precomputed gist (full project history). The daily
  // accm-history-update workflow refreshes this gist using a windowed
  // fetch that bypasses the GitHub Search 1000-result hard cap.
  const gistData = await fetchACCMFromGist();
  if (gistData) {
    const cacheEntry: CacheEntry = {
      data: gistData,
      expiresAt: Date.now() + CACHE_TTL_MS,
    };
    store.set(CACHE_KEY, JSON.stringify(cacheEntry)).catch(() => {});
    return new Response(JSON.stringify({ ...gistData, source: "gist" }), {
      status: 200,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  // Fall back to live computation (limited to recent weeks by the
  // GitHub Search 1000-result cap).
  try {
    const data = await fetchACCMData(token);

    // Cache result (best-effort)
    const cacheEntry: CacheEntry = {
      data,
      expiresAt: Date.now() + CACHE_TTL_MS,
    };
    store.set(CACHE_KEY, JSON.stringify(cacheEntry)).catch(() => {});

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(
      "[analytics-accm] Fetch error:",
      err instanceof Error ? err.message : err,
    );
    return new Response(
      JSON.stringify({
        error: "Failed to fetch ACCM metrics",
        detail: err instanceof Error ? err.message : "Unknown error",
      }),
      {
        status: 502,
        headers: { ...headers, "Content-Type": "application/json" },
      },
    );
  }
};

export const config = {
  path: "/api/analytics-accm",
};
