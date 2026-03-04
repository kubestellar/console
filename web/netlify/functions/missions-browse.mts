/**
 * Netlify Function: Missions Browse Proxy
 *
 * GET /api/missions/browse?path=solutions
 * Lists directory contents from kubestellar/console-kb via GitHub Contents API.
 * Caches responses in Netlify Blobs to avoid hitting GitHub on every request.
 * No GITHUB_TOKEN required — the repo is public.
 */
import { getStore } from "@netlify/blobs";

const GITHUB_API_URL = "https://api.github.com";
const KB_REPO = "kubestellar/console-kb";
const DEFAULT_REF = "master";

/** Request timeout in milliseconds */
const FETCH_TIMEOUT_MS = 30_000;

/** Cache TTL: serve cached content for 1 hour before re-fetching from GitHub */
const CACHE_TTL_MS = 60 * 60 * 1000;

/** CDN edge cache: tell Netlify CDN to cache successful responses for 10 minutes */
const CDN_CACHE_MAX_AGE_S = 600;

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

interface GitHubEntry {
  type: string;
  name: string;
  path: string;
  size: number;
}

interface BrowseCacheEntry {
  body: string;
  fetchedAt: number;
}

export default async (request: Request): Promise<Response> => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const url = new URL(request.url);
  const path = url.searchParams.get("path") || "";
  const cacheKey = `browse:${path}`;

  try {
    // Check Netlify Blobs cache first
    const store = getStore("missions-cache");
    const cached = await store.get(cacheKey, { type: "json" }) as BrowseCacheEntry | null;
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return new Response(cached.body, {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": `public, max-age=${CDN_CACHE_MAX_AGE_S}`,
          "X-Cache": "HIT",
          ...CORS_HEADERS,
        },
      });
    }

    // Fetch from GitHub Contents API
    const apiUrl = `${GITHUB_API_URL}/repos/${KB_REPO}/contents/${path}?ref=${DEFAULT_REF}`;
    const resp = await fetch(apiUrl, {
      headers: { Accept: "application/vnd.github.v3+json" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!resp.ok) {
      // If GitHub fails but we have stale cache, serve it
      if (cached) {
        return new Response(cached.body, {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "X-Cache": "STALE",
            ...CORS_HEADERS,
          },
        });
      }
      const code = resp.status === 403 || resp.status === 429 ? "rate_limited" : "github_error";
      return jsonResponse({ error: "GitHub API error", status: resp.status, code }, resp.status);
    }

    const ghEntries = (await resp.json()) as GitHubEntry[];

    // Transform GitHub's "dir" type to "directory" (frontend expects this)
    const entries = ghEntries.map((e) => ({
      name: e.name,
      path: e.path,
      type: e.type === "dir" ? "directory" : e.type,
      size: e.size || 0,
    }));

    const body = JSON.stringify(entries);

    // Store in cache (best-effort, don't block response)
    const entry: BrowseCacheEntry = { body, fetchedAt: Date.now() };
    store.setJSON(cacheKey, entry).catch(() => {});

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": `public, max-age=${CDN_CACHE_MAX_AGE_S}`,
        "X-Cache": "MISS",
        ...CORS_HEADERS,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error("[missions-browse] Error:", message);
    return jsonResponse({ error: "upstream request failed", detail: message }, 502);
  }
};

function jsonResponse(data: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}
