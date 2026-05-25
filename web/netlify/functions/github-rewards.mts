/**
 * Netlify Function: GitHub Rewards
 *
 * Returns a user's contribution data by looking them up in the
 * pre-generated leaderboard JSON at kubestellar.io/data/leaderboard.json.
 * That file is produced daily by a GitHub Action in kubestellar/docs
 * (scripts/generate-leaderboard.mjs) and is the single source of truth
 * for contribution scoring — including bonus points.
 *
 * By reading the static JSON instead of hitting the GitHub Search API,
 * this function makes zero GitHub API calls, is never rate-limited,
 * and always matches the public leaderboard exactly.
 */

import { getStore } from "@netlify/blobs";
import {
  LEADERBOARD_URL,
  CACHE_STORE,
  LEADERBOARD_CACHE_TTL_MS,
  LEADERBOARD_CACHE_KEY,
  FETCH_TIMEOUT_MS,
  MAX_RESPONSE_BYTES,
  type LeaderboardData,
  type LeaderboardCacheEntry,
  type GitHubRewardsResponse,
} from "./_shared/github-rewards.constants";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fetchLeaderboard(): Promise<LeaderboardData> {
  const store = getStore(CACHE_STORE);

  try {
    const cached = (await store.get(LEADERBOARD_CACHE_KEY, {
      type: "json",
    })) as LeaderboardCacheEntry | null;
    if (cached && Date.now() - cached.storedAt < LEADERBOARD_CACHE_TTL_MS) {
      return cached.data;
    }
  } catch {
    // Cache miss — proceed to fetch
  }

  const res = await fetch(LEADERBOARD_URL, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(
      `Leaderboard fetch failed: ${res.status} ${res.statusText}`
    );
  }
  const contentLength = parseInt(res.headers.get("content-length") ?? "0", 10);
  if (contentLength > MAX_RESPONSE_BYTES) {
    throw new Error("Leaderboard response too large");
  }
  const rawText = await res.text();
  if (rawText.length > MAX_RESPONSE_BYTES) {
    throw new Error("Leaderboard response too large");
  }
  const data = JSON.parse(rawText) as LeaderboardData;

  try {
    const entry: LeaderboardCacheEntry = { data, storedAt: Date.now() };
    await store.setJSON(LEADERBOARD_CACHE_KEY, entry);
  } catch {
    // Cache write failure is non-fatal
  }

  return data;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export default async (req: Request) => {
  const corsHeaders: Record<string, string> = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept",
    "Cache-Control": "no-cache, no-store",
    "X-Content-Type-Options": "nosniff",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const url = new URL(req.url);
  const login = url.searchParams.get("login");

  if (!login || !/^[a-zA-Z0-9_-]+$/.test(login)) {
    return new Response(
      JSON.stringify({ error: "Missing or invalid login parameter" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  try {
    const leaderboard = await fetchLeaderboard();
    const entry = leaderboard.entries.find(
      (e) => e.login.toLowerCase() === login.toLowerCase()
    );

    const response: GitHubRewardsResponse = entry
      ? {
          total_points: entry.total_points,
          contributions: [],
          breakdown: entry.breakdown,
          bonus_points: entry.bonus_points,
          level: entry.level,
          rank: entry.rank,
          cached_at: new Date().toISOString(),
          leaderboard_generated_at: leaderboard.generated_at,
          from_cache: true,
        }
      : {
          total_points: 0,
          contributions: [],
          breakdown: {
            bug_issues: 0,
            feature_issues: 0,
            other_issues: 0,
            prs_opened: 0,
            prs_merged: 0,
          },
          bonus_points: 0,
          level: "Newcomer",
          rank: 0,
          cached_at: new Date().toISOString(),
          leaderboard_generated_at: leaderboard.generated_at,
          from_cache: true,
        };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[github-rewards] Leaderboard unavailable:", err instanceof Error ? err.message : err);
    return new Response(
      JSON.stringify({ error: "Leaderboard unavailable" }),
      {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
};

export const config = {
  path: "/api/rewards/github",
};
