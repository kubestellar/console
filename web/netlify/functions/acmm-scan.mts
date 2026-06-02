/**
 * Netlify Function: ACMM Scan
 *
 * Scans any GitHub repo and returns detected criteria from the multi-source
 * ACMM registry plus weekly AI-vs-human contribution activity. Powers the
 * /acmm dashboard's four cards.
 *
 * Input:  ?repo=owner/repo&force=true
 *         (`force` bypasses cache *reads*; on a successful live scan the
 *         cached entry is refreshed. Demo-fallback responses are not
 *         cached, and all writes are best-effort — `store.set()` errors
 *         are swallowed so a blob-store outage never fails the request.)
 *
 * Response body (JSON) — discriminated by HTTP status, and for 200 also
 * by the `demoFallback` / `fromCache` flags (both 200 shapes share the
 * same status code):
 *
 *   200 live/cache-hit:
 *     { repo, scannedAt, detectedIds, weeklyActivity, fromCache? }
 *     (`fromCache: true` iff served from blob cache; omitted on a live scan)
 *
 *   200 demo fallback (live fetch failed — soft degradation):
 *     { repo, scannedAt, detectedIds, weeklyActivity, demoFallback: true, error }
 *
 *   400 invalid repo slug:   { error: "Invalid repo — must be owner/name" }
 *   404 repo not found:      { error: "Repo not found" }
 *   405 non-GET method:      { error: "Method not allowed" }
 *   204 OPTIONS preflight:   (no body — CORS only)
 *
 * Optional env var:
 *   GITHUB_TOKEN — enables higher rate limits (5000 req/hr vs 60)
 */

import { getStore } from "@netlify/blobs";
import { CRITERIA } from "./acmm-scan/criteria";
import {
  CACHE_STORE,
  CACHE_TTL_MS,
  REPO_NOT_ALLOWED_ERROR,
  REPO_RE,
  corsHeaders,
  isAllowedRepo,
  matchesHint,
} from "./acmm-scan/helpers";
import type { CacheEntry, ScanResult } from "./acmm-scan/helpers";
import { fetchTreePaths, fetchWeeklyActivity } from "./acmm-scan/fetchers";
import { demoScan } from "./acmm-scan/demo";

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

  const url = new URL(req.url);
  const repo = url.searchParams.get("repo") || "";
  const force = url.searchParams.get("force") === "true";

  if (!REPO_RE.test(repo)) {
    return new Response(
      JSON.stringify({ error: "Invalid repo — must be owner/name" }),
      {
        status: 400,
        headers: { ...headers, "Content-Type": "application/json" },
      },
    );
  }

  if (!isAllowedRepo(repo)) {
    return new Response(
      JSON.stringify({ error: REPO_NOT_ALLOWED_ERROR }),
      {
        status: 403,
        headers: { ...headers, "Content-Type": "application/json" },
      },
    );
  }

  const token =
    Netlify.env.get("GITHUB_TOKEN") || process.env.GITHUB_TOKEN || "";

  // Check blob cache (per-repo key) — skipped when ?force=true
  const store = getStore(CACHE_STORE);
  const cacheKey = `scan:${repo}`;
  if (!force) {
    try {
      const cached = await store.get(cacheKey, { type: "text" });
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
      // cache miss — continue
    }
  }

  // Live scan
  try {
    const [treePaths, weeklyActivity] = await Promise.all([
      fetchTreePaths(repo, token),
      fetchWeeklyActivity(repo, token),
    ]);

    const detectedIds = CRITERIA.filter((c) =>
      matchesHint(treePaths, c.detection),
    ).map((c) => c.id);

    const data: ScanResult = {
      repo,
      scannedAt: new Date().toISOString(),
      detectedIds,
      weeklyActivity,
    };

    const entry: CacheEntry = {
      data,
      expiresAt: Date.now() + CACHE_TTL_MS,
    };
    store.set(cacheKey, JSON.stringify(entry)).catch((err) => { console.warn("[acmm-scan] blob cache write failed:", err instanceof Error ? err.message : err) });

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (msg === "Repo not found") {
      return new Response(
        JSON.stringify({ error: "Repo not found" }),
        {
          status: 404,
          headers: { ...headers, "Content-Type": "application/json" },
        },
      );
    }
    console.error("[acmm-scan] Fetch error:", msg);
    // Degrade to demo data rather than failing the card
    return new Response(
      JSON.stringify({ ...demoScan(repo), demoFallback: true, error: "Scan temporarily unavailable" }),
      {
        status: 200,
        headers: { ...headers, "Content-Type": "application/json" },
      },
    );
  }
};

export const config = {
  path: "/api/acmm/scan",
};
