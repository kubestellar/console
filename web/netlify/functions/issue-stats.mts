/**
 * Netlify Function: Issue Activity Stats
 *
 * Returns daily issue opened/closed counts and PR merge counts for a
 * given GitHub repository over a configurable lookback period.
 *
 * Query params:
 *   repo  — owner/repo (default: kubestellar/console)
 *   days  — lookback in days (default: 90, max: 365)
 *
 * GITHUB_TOKEN must be set as a Netlify environment variable.
 */

import { getStore } from "@netlify/blobs";
import { buildCorsHeaders, handlePreflight } from "./_shared/cors";

const GITHUB_API = "https://api.github.com";
const CACHE_STORE = "issue-stats";
/** Server-side cache TTL (1 hour) */
const CACHE_TTL_MS = 60 * 60 * 1000;
/** GitHub API results per page (max 100) */
const PER_PAGE = 100;
/** Max pages to paginate through per query */
const MAX_PAGES = 5;
/** Request timeout for GitHub API calls (30 seconds) */
const API_TIMEOUT_MS = 30_000;
/** Milliseconds per day */
const MS_PER_DAY = 86_400_000;
/** Default lookback in days */
const DEFAULT_DAYS = 90;
/** Maximum lookback in days */
const MAX_DAYS = 365;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DailyStats {
  date: string;
  opened: number;
  closed: number;
  prsMerged: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function generateDateRange(start: Date, end: Date): string[] {
  const dates: string[] = [];
  const current = new Date(start);
  current.setHours(0, 0, 0, 0);
  const endDate = new Date(end);
  endDate.setHours(0, 0, 0, 0);
  while (current <= endDate) {
    dates.push(toDateString(current));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

async function fetchAllPages(
  url: string,
  token: string,
): Promise<Record<string, unknown>[]> {
  const allItems: Record<string, unknown>[] = [];
  let page = 1;
  while (page <= MAX_PAGES) {
    const separator = url.includes("?") ? "&" : "?";
    const fullUrl = `${url}${separator}per_page=${PER_PAGE}&page=${page}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
    try {
      const resp = await fetch(fullUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "KubeStellar-Console-Netlify",
        },
        signal: controller.signal,
      });
      if (!resp.ok) break;
      const data = (await resp.json()) as Record<string, unknown>[];
      if (!Array.isArray(data) || data.length === 0) break;
      allItems.push(...data);
      if (data.length < PER_PAGE) break;
      page++;
    } finally {
      clearTimeout(timeout);
    }
  }
  return allItems;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export default async function handler(request: Request): Promise<Response> {
  // See web/netlify/functions/_shared/cors.ts for allowlist rationale (#9879).
  const corsOpts = {
    methods: "GET, OPTIONS",
    headers: "Content-Type",
  };
  const corsHeaders = buildCorsHeaders(request, corsOpts);

  if (request.method === "OPTIONS") {
    return handlePreflight(request, corsOpts);
  }

  if (request.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const token = process.env.GITHUB_TOKEN || "";
  if (!token) {
    return new Response(
      JSON.stringify({ error: "GITHUB_TOKEN not configured" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const url = new URL(request.url);
  const repo = url.searchParams.get("repo") || "kubestellar/console";
  const daysParam = parseInt(url.searchParams.get("days") || String(DEFAULT_DAYS), 10);
  const days = Math.min(Math.max(1, daysParam), MAX_DAYS);

  const cacheKey = `${repo.replace("/", "_")}_${days}`;

  // Check Netlify Blobs cache
  try {
    const store = getStore(CACHE_STORE);
    const cached = await store.get(cacheKey, { type: "json" }) as {
      timestamp: number;
      stats: DailyStats[];
    } | null;
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return new Response(JSON.stringify(cached.stats), {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "X-Cache": "HIT",
        },
      });
    }
  } catch {
    // Cache miss or error — continue to fetch
  }

  try {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - days * MS_PER_DAY);
    const sinceISO = startDate.toISOString();

    // Fetch issues and closed PRs in parallel
    const [issues, closedPRs] = await Promise.all([
      fetchAllPages(
        `${GITHUB_API}/repos/${repo}/issues?state=all&since=${sinceISO}&sort=updated&direction=desc`,
        token,
      ),
      fetchAllPages(
        `${GITHUB_API}/repos/${repo}/pulls?state=closed&sort=updated&direction=desc`,
        token,
      ),
    ]);

    // Build stats map
    const dateRange = generateDateRange(startDate, endDate);
    const statsMap = new Map<string, DailyStats>();
    for (const date of dateRange) {
      statsMap.set(date, { date, opened: 0, closed: 0, prsMerged: 0 });
    }

    for (const issue of issues) {
      if ((issue as Record<string, unknown>).pull_request) continue;
      const createdDate = toDateString(new Date(issue.created_at as string));
      const entry = statsMap.get(createdDate);
      if (entry) entry.opened++;
      if (issue.state === "closed" && issue.closed_at) {
        const closedDate = toDateString(new Date(issue.closed_at as string));
        const closedEntry = statsMap.get(closedDate);
        if (closedEntry) closedEntry.closed++;
      }
    }

    for (const pr of closedPRs) {
      if (!pr.merged_at) continue;
      const mergedDate = toDateString(new Date(pr.merged_at as string));
      const entry = statsMap.get(mergedDate);
      if (entry) entry.prsMerged++;
    }

    const stats = dateRange.map((d) => statsMap.get(d)!).filter(Boolean);

    // Cache in Netlify Blobs
    try {
      const store = getStore(CACHE_STORE);
      await store.setJSON(cacheKey, { timestamp: Date.now(), stats });
    } catch {
      // Caching failure is non-fatal
    }

    return new Response(JSON.stringify(stats), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "X-Cache": "MISS",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}
