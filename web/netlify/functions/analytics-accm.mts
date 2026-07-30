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
import { buildCorsHeaders, handlePreflight } from "./_shared";
import {
  CACHE_STORE,
  CACHE_KEY,
  CACHE_TTL_MS,
  CI_WORKFLOWS,
  lastNWeeks,
  weeksSinceProjectStart,
} from "./analytics-accm/helpers";
import type { ACCMData, CacheEntry } from "./analytics-accm/helpers";
import { fetchRecentPRs, fetchRecentIssues, fetchWorkflowRuns } from "./analytics-accm/fetchers";
import { aggregateWeeklyActivity, aggregateCIPassRates, aggregateContributorGrowth } from "./analytics-accm/aggregation";
import { fetchACCMFromGist } from "./analytics-accm/gist";

// ---------------------------------------------------------------------------
// Main data fetch + aggregation
// ---------------------------------------------------------------------------

async function fetchACCMData(token: string): Promise<ACCMData> {
  const weeks = lastNWeeks(weeksSinceProjectStart());

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
  const headers = {
    ...buildCorsHeaders(req, {
      methods: "GET, OPTIONS",
      headers: "Content-Type",
    }),
    "Cache-Control": "public, max-age=3600",
  };

  if (req.method === "OPTIONS") {
    return handlePreflight(req, {
      methods: "GET, OPTIONS",
      headers: "Content-Type",
    });
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

  // Prefer the precomputed gist (full project history)
  const gistData = await fetchACCMFromGist();
  if (gistData) {
    const cacheEntry: CacheEntry = {
      data: gistData,
      expiresAt: Date.now() + CACHE_TTL_MS,
    };
    store.set(CACHE_KEY, JSON.stringify(cacheEntry)).catch((err) => { console.warn("[analytics-accm] blob cache write failed:", err instanceof Error ? err.message : err) });
    return new Response(JSON.stringify({ ...gistData, source: "gist" }), {
      status: 200,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  // Fall back to live computation
  try {
    const data = await fetchACCMData(token);

    const cacheEntry: CacheEntry = {
      data,
      expiresAt: Date.now() + CACHE_TTL_MS,
    };
    store.set(CACHE_KEY, JSON.stringify(cacheEntry)).catch((err) => { console.warn("[analytics-accm] blob cache write failed:", err instanceof Error ? err.message : err) });

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
