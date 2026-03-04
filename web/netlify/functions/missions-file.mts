/**
 * Netlify Function: Missions File Proxy
 *
 * GET /api/missions/file?path=solutions/index.json&ref=master
 * Fetches raw file content from kubestellar/console-kb on GitHub.
 * Caches responses in Netlify Blobs to avoid hitting GitHub on every request.
 * No GITHUB_TOKEN required — the repo is public.
 */
import { getStore } from "@netlify/blobs";

const GITHUB_RAW_URL = "https://raw.githubusercontent.com";
const KB_REPO = "kubestellar/console-kb";
const DEFAULT_REF = "master";

/** Maximum response size (10MB) */
const MAX_BODY_BYTES = 10 * 1024 * 1024;

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

interface CacheEntry {
  body: string;
  contentType: string;
  fetchedAt: number;
}

export default async (request: Request): Promise<Response> => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const url = new URL(request.url);
  const path = url.searchParams.get("path");
  if (!path) {
    return jsonResponse({ error: "path query parameter is required" }, 400);
  }
  const ref = url.searchParams.get("ref") || DEFAULT_REF;
  const cacheKey = `file:${ref}:${path}`;

  try {
    // Check Netlify Blobs cache first
    const store = getStore("missions-cache");
    const cached = await store.get(cacheKey, { type: "json" }) as CacheEntry | null;
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return new Response(cached.body, {
        status: 200,
        headers: {
          "Content-Type": cached.contentType,
          "Cache-Control": `public, max-age=${CDN_CACHE_MAX_AGE_S}`,
          "X-Cache": "HIT",
          ...CORS_HEADERS,
        },
      });
    }

    // Fetch from GitHub
    const rawUrl = `${GITHUB_RAW_URL}/${KB_REPO}/${ref}/${path}`;
    const resp = await fetch(rawUrl, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (resp.status === 404) {
      return jsonResponse({ error: "file not found" }, 404);
    }
    if (!resp.ok) {
      // If GitHub fails but we have stale cache, serve it
      if (cached) {
        return new Response(cached.body, {
          status: 200,
          headers: {
            "Content-Type": cached.contentType,
            "X-Cache": "STALE",
            ...CORS_HEADERS,
          },
        });
      }
      return jsonResponse({ error: "GitHub raw content error", status: resp.status }, resp.status);
    }

    const body = await resp.text();
    if (body.length > MAX_BODY_BYTES) {
      return jsonResponse({ error: "response too large" }, 413);
    }

    const contentType = path.endsWith(".json") ? "application/json" : "text/plain";

    // Store in cache (best-effort, don't block response)
    const entry: CacheEntry = { body, contentType, fetchedAt: Date.now() };
    store.setJSON(cacheKey, entry).catch(() => {});

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": `public, max-age=${CDN_CACHE_MAX_AGE_S}`,
        "X-Cache": "MISS",
        ...CORS_HEADERS,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error("[missions-file] Error:", message);
    return jsonResponse({ error: "upstream request failed", detail: message }, 502);
  }
};

function jsonResponse(data: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}
