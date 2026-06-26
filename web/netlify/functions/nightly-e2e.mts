/**
 * Netlify Function: Nightly E2E Status
 *
 * Fetches GitHub Actions workflow run data for llm-d nightly E2E tests.
 * Ported from pkg/api/handlers/nightly_e2e.go for serverless deployment.
 *
 * GITHUB_TOKEN must be set as a Netlify environment variable (runtime only,
 * never in source code or build config). It is used server-side to call the
 * GitHub API and is never exposed to the client.
 */
import { getStore } from "@netlify/blobs";
import { buildCorsHeaders, handlePreflight } from "./_shared/cors";
import {
  CACHE_ACTIVE_TTL_MS,
  CACHE_IDLE_TTL_MS,
  CACHE_KEY,
  CACHE_STORE,
  STALE_SERVE_WINDOW_MS,
  fetchAll,
  hasInProgressRuns,
  type CacheEntry,
} from "./_shared/nightly-e2e";

function jsonResponse(
  body: unknown,
  status: number,
  headers: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...headers,
      "Content-Type": "application/json",
    },
  });
}

export default async (req: Request): Promise<Response> => {
  // See web/netlify/functions/_shared/cors.ts for allowlist rationale (#9879).
  const corsOpts = {
    methods: "GET, OPTIONS",
    headers: "Content-Type, Authorization, Accept",
  };
  const corsHeaders = {
    ...buildCorsHeaders(req, corsOpts),
    "Cache-Control": "no-cache, no-store",
  };

  if (req.method === "OPTIONS") {
    return handlePreflight(req, corsOpts);
  }

  const token = process.env.GITHUB_TOKEN || "";
  if (!token) {
    return jsonResponse(
      {
        error: "GITHUB_TOKEN not configured",
        hint: "Set GITHUB_TOKEN in Netlify dashboard with Functions scope",
      },
      503,
      corsHeaders,
    );
  }

  const store = getStore(CACHE_STORE);
  let staleEntry: CacheEntry | null = null;

  try {
    const cached = await store.get(CACHE_KEY, { type: "text" });
    if (cached) {
      const entry = JSON.parse(cached) as CacheEntry;
      const now = Date.now();
      if (now < entry.expiresAt) {
        return jsonResponse(
          {
            guides: entry.guides,
            cachedAt: entry.cachedAt,
            fromCache: true,
          },
          200,
          corsHeaders,
        );
      }
      if (now < entry.expiresAt + STALE_SERVE_WINDOW_MS) {
        staleEntry = entry;
      }
    }
  } catch {
    // Cache miss or parse error — proceed to fetch
  }

  try {
    const guides = await fetchAll(token, store);
    const cachedAt = new Date().toISOString();
    const ttl = hasInProgressRuns(guides) ? CACHE_ACTIVE_TTL_MS : CACHE_IDLE_TTL_MS;
    const cacheEntry: CacheEntry = {
      guides,
      cachedAt,
      expiresAt: Date.now() + ttl,
    };

    store.set(CACHE_KEY, JSON.stringify(cacheEntry)).catch((error) => {
      console.warn("[nightly-e2e] blob cache write failed:", error instanceof Error ? error.message : error);
    });

    return jsonResponse(
      {
        guides,
        cachedAt,
        fromCache: false,
      },
      200,
      corsHeaders,
    );
  } catch (error) {
    if (staleEntry) {
      return jsonResponse(
        {
          guides: staleEntry.guides,
          cachedAt: staleEntry.cachedAt,
          fromCache: true,
          stale: true,
        },
        200,
        corsHeaders,
      );
    }

    console.error(
      "[nightly-e2e] Failed to fetch nightly E2E data:",
      error instanceof Error ? error.message : error,
    );
    return jsonResponse(
      { error: "Failed to fetch nightly E2E data" },
      502,
      corsHeaders,
    );
  }
};
