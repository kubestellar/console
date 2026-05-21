/**
 * Netlify Function: Missions File Proxy
 *
 * GET /api/missions/file?path=fixes/index.json&ref=master
 * Fetches raw file content from kubestellar/console-kb on GitHub.
 * Caches responses in Netlify Blobs to avoid hitting GitHub on every request.
 * No GITHUB_TOKEN required — the repo is public.
 */
import { getStore } from "@netlify/blobs";
import {
  buildCorsHeaders,
  checkInMemoryRateLimit,
  getClientIp,
  handlePreflight,
  rateLimitResponse,
} from "./_shared";
import type { InMemoryRateLimitEntry } from "./_shared";

const GITHUB_RAW_URL = "https://raw.githubusercontent.com";
const KB_REPO = "kubestellar/console-kb";
const DEFAULT_REF = "master";

/** Maximum response size (10MB) */
const MAX_BODY_BYTES = 10 * 1024 * 1024;

/** Request timeout in milliseconds */
const FETCH_TIMEOUT_MS = 30_000;

/** Cache TTL: serve cached content for 15 minutes before re-fetching from GitHub */
const CACHE_TTL_MS = 15 * 60 * 1000;

/** Browser cache TTL for public mission files. */
const FILE_BROWSER_CACHE_MAX_AGE_S = 3_600;
/** CDN edge cache TTL for public mission files. */
const FILE_EDGE_CACHE_MAX_AGE_S = 86_400;
const FILE_CACHE_CONTROL = `public, max-age=${FILE_BROWSER_CACHE_MAX_AGE_S}, s-maxage=${FILE_EDGE_CACHE_MAX_AGE_S}`;

/** Allow cache-miss fetches at a bounded per-IP rate. */
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 60;
const RATE_LIMIT_RETRY_CACHE_CONTROL = "private, no-store";

/** Number of retry attempts for transient upstream errors (#10966, #11033) */
const MAX_RETRIES = 3;
/** Base delay between retries in milliseconds */
const RETRY_BASE_DELAY_MS = 500;

// See web/netlify/functions/_shared/cors.ts for allowlist rationale (#9879).
const CORS_OPTS = {
  methods: "GET, OPTIONS",
  headers: "Content-Type",
} as const;

interface CacheEntry {
  body: string;
  contentType: string;
  fetchedAt: number;
}

const fileRateLimitMap = new Map<string, InMemoryRateLimitEntry>();

function hasInvalidPathInput(value: string): boolean {
  return value.includes("..") || value.startsWith("/") || value.includes("#") || value.includes("?");
}

function hasInvalidRefInput(value: string): boolean {
  return value.includes("..") || value.startsWith("/") || value.includes("#") || value.includes("?");
}

export default async (request: Request): Promise<Response> => {
  if (request.method === "OPTIONS") {
    return handlePreflight(request, CORS_OPTS);
  }

  const corsHeaders = buildCorsHeaders(request, CORS_OPTS);

  const url = new URL(request.url);
  const path = url.searchParams.get("path");
  if (!path) {
    return jsonResponse(corsHeaders, { error: "path query parameter is required" }, 400);
  }
  // Reject path traversal patterns and URL control characters before they
  // reach cache keys or the upstream URL (#12323). GitHub would refuse some
  // of these requests anyway, but fragments / query delimiters could still
  // create cache-key variants that do not match what gets fetched upstream.
  if (hasInvalidPathInput(path)) {
    return jsonResponse(corsHeaders, { error: "invalid path" }, 400);
  }
  const ref = url.searchParams.get("ref") || DEFAULT_REF;
  if (hasInvalidRefInput(ref)) {
    return jsonResponse(corsHeaders, { error: "invalid ref" }, 400);
  }
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
          "Cache-Control": FILE_CACHE_CONTROL,
          "X-Cache": "HIT",
          ...corsHeaders,
        },
      });
    }

    const rateLimit = checkInMemoryRateLimit(
      getClientIp(request),
      fileRateLimitMap,
      RATE_LIMIT_MAX_REQUESTS,
      RATE_LIMIT_WINDOW_MS,
    );
    if (!rateLimit.allowed) {
      return rateLimitResponse(rateLimit.retryAfterSeconds, {
        "Cache-Control": RATE_LIMIT_RETRY_CACHE_CONTROL,
        ...corsHeaders,
      });
    }

    // Fetch from GitHub with retry for transient errors (#10966)
    const rawUrl = `${GITHUB_RAW_URL}/${KB_REPO}/${ref}/${path}`;
    let resp: Response | null = null;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, RETRY_BASE_DELAY_MS * (1 << (attempt - 1))));
      }
      resp = await fetch(rawUrl, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      const isRateLimited = resp.status === 403 && resp.headers.get("x-ratelimit-remaining") === "0";
      const isPermanentClientError = !resp.ok && resp.status < 500 && !isRateLimited;
      // Retry transient 5xx responses and GitHub rate-limit 403s only.
      if (resp.ok || resp.status === 404 || isPermanentClientError) break;
      console.warn(`[missions-file] Upstream ${resp.status}, attempt ${attempt + 1}/${MAX_RETRIES + 1}`);
    }

    if (!resp) {
      return jsonResponse(corsHeaders, { error: "upstream request failed" }, 502);
    }

    if (resp.status === 404) {
      return jsonResponse(corsHeaders, { error: "file not found" }, 404, FILE_CACHE_CONTROL);
    }
    if (!resp.ok) {
      // If GitHub fails but we have stale cache, serve it
      if (cached) {
        return new Response(cached.body, {
          status: 200,
          headers: {
            "Content-Type": cached.contentType,
            "Cache-Control": FILE_CACHE_CONTROL,
            "X-Cache": "STALE",
            ...corsHeaders,
          },
        });
      }
      return jsonResponse(corsHeaders, { error: "upstream request failed" }, 502);
    }

    const body = await resp.text();
    if (body.length > MAX_BODY_BYTES) {
      return jsonResponse(corsHeaders, { error: "response too large" }, 413);
    }

    const contentType = path.endsWith(".json") ? "application/json" : "text/plain";

    // Store in cache (best-effort, don't block response)
    const entry: CacheEntry = { body, contentType, fetchedAt: Date.now() };
    store.setJSON(cacheKey, entry).catch((err) => { console.warn("[missions-file] blob cache write failed:", err instanceof Error ? err.message : err) });

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": FILE_CACHE_CONTROL,
        "X-Cache": "MISS",
        ...corsHeaders,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error("[missions-file] Error:", message);
    return jsonResponse(corsHeaders, { error: "upstream request failed" }, 502);
  }
};

function jsonResponse(
  corsHeaders: Record<string, string>,
  data: Record<string, unknown>,
  status = 200,
  cacheControl = status >= 400 ? "no-store" : FILE_CACHE_CONTROL,
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": cacheControl,
      ...corsHeaders,
    },
  });
}
