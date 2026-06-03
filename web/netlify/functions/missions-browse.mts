/**
 * Netlify Function: Missions Browse Proxy
 *
 * GET /api/missions/browse?path=fixes
 * Lists directory contents from kubestellar/console-kb via GitHub Contents API.
 * Caches responses in Netlify Blobs to avoid hitting GitHub on every request.
 * No GITHUB_TOKEN required — the repo is public.
 */
import { getStore } from "@netlify/blobs";
import { buildCorsHeaders, handlePreflight } from "./_shared/cors";
import { enforceSimpleRateLimit } from "./_shared/rate-limit";

const GITHUB_API_URL = "https://api.github.com";
const KB_REPO = "kubestellar/console-kb";
const DEFAULT_REF = "master";

/** Request timeout in milliseconds */
const FETCH_TIMEOUT_MS = 30_000;

/** Cache TTL: serve cached content for 1 hour before re-fetching from GitHub */
const CACHE_TTL_MS = 60 * 60 * 1000;

/** CDN edge cache: tell Netlify CDN to cache successful responses for 10 minutes */
const CDN_CACHE_MAX_AGE_S = 600;

/** Maximum upstream response size (512 KB — directory listings are typically < 50 KB) */
const MAX_RESPONSE_BYTES = 512_000;

/** Number of retry attempts for transient upstream errors (#10966) */
const MAX_RETRIES = 2;
/** Base delay between retries in milliseconds */
const RETRY_BASE_DELAY_MS = 500;

/** Rate limit: max requests per IP per window to prevent cache-miss amplification (#16817) */
const RATE_LIMIT_MAX_REQUESTS = 60;
const RATE_LIMIT_WINDOW_MS = 60_000;

// See web/netlify/functions/_shared/cors.ts for allowlist rationale (#9879).
const CORS_OPTS = {
  methods: "GET, OPTIONS",
  headers: "Content-Type",
} as const;

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

/** Maximum path depth to prevent unbounded cache-key proliferation (#16817). */
const MAX_PATH_SEGMENTS = 5;

/** Allowlist pattern: only alphanumeric, hyphens, underscores, dots, forward slashes (#16817). */
const VALID_PATH_CHARS = /^[a-zA-Z0-9\-_./]+$/;

/** Reject path traversal patterns, URL control characters, and excessively long inputs (#13230, #14500, #16817). */
function hasInvalidPathInput(value: string): boolean {
  if (value.length > 200 || value.includes("..") || value.startsWith("/") || value.includes("#") || value.includes("?")) {
    return true;
  }
  // Only allow safe characters to prevent arbitrary cache-key creation
  if (!VALID_PATH_CHARS.test(value)) {
    return true;
  }
  // Cap directory depth to prevent unbounded cache-miss amplification
  if (value.split("/").length > MAX_PATH_SEGMENTS) {
    return true;
  }
  return false;
}

export default async (request: Request): Promise<Response> => {
  if (request.method === "OPTIONS") {
    return handlePreflight(request, CORS_OPTS);
  }

  const corsHeaders = buildCorsHeaders(request, CORS_OPTS);

  // Rate limit per IP to prevent cache-miss amplification (#16817)
  const clientIP = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rateLimitResult = await enforceSimpleRateLimit({
    storeName: "missions-rate-limit",
    prefix: "browse:",
    subject: clientIP,
    maxRequests: RATE_LIMIT_MAX_REQUESTS,
    windowMs: RATE_LIMIT_WINDOW_MS,
  });
  if (rateLimitResult.limited) {
    return new Response(JSON.stringify({ error: "rate_limited" }), {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(rateLimitResult.retryAfterSeconds),
        ...corsHeaders,
      },
    });
  }

  const url = new URL(request.url);
  const path = url.searchParams.get("path") || "";
  if (path && hasInvalidPathInput(path)) {
    return jsonResponse(corsHeaders, { error: "invalid path" }, 400);
  }
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
          ...corsHeaders,
        },
      });
    }

    // Fetch from GitHub Contents API with retry for transient errors (#10966)
    const apiUrl = `${GITHUB_API_URL}/repos/${KB_REPO}/contents/${path}?ref=${DEFAULT_REF}`;
    let resp: Response | null = null;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, RETRY_BASE_DELAY_MS * (1 << (attempt - 1))));
      }
      resp = await fetch(apiUrl, {
        headers: { Accept: "application/vnd.github.v3+json" },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      // Don't retry 4xx (client errors) — only transient 5xx
      if (resp.ok || resp.status < 500) break;
      console.warn(`[missions-browse] Upstream ${resp.status}, attempt ${attempt + 1}/${MAX_RETRIES + 1}`);
    }

    if (!resp) {
      return jsonResponse(corsHeaders, { error: "upstream request failed" }, 502);
    }

    if (!resp.ok) {
      // If GitHub fails but we have stale cache, serve it
      if (cached) {
        return new Response(cached.body, {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "X-Cache": "STALE",
            ...corsHeaders,
          },
        });
      }
      const code = resp.status === 403 || resp.status === 429 ? "rate_limited" : "github_error";
      return jsonResponse(corsHeaders, { error: "upstream request failed", code }, 502);
    }

    // Guard against oversized upstream responses
    const contentLength = parseInt(resp.headers.get("content-length") ?? "0", 10);
    if (contentLength > MAX_RESPONSE_BYTES) {
      return jsonResponse(corsHeaders, { error: "upstream response too large" }, 502);
    }
    const rawText = await resp.text();
    if (rawText.length > MAX_RESPONSE_BYTES) {
      return jsonResponse(corsHeaders, { error: "upstream response too large" }, 502);
    }
    const ghEntries = JSON.parse(rawText) as GitHubEntry[];

    /** Files to hide from the browser — infrastructure/metadata, not missions */
    const HIDDEN_FILES = new Set([".gitkeep", "index.json", "search-state.json"]);
    /** Directories to hide from the browser */
    const HIDDEN_DIRS = new Set([".github"]);

    // Transform GitHub's "dir" type to "directory" (frontend expects this)
    // and filter out internal/infrastructure entries
    const entries = ghEntries
      .map((e) => ({
        name: e.name,
        path: e.path,
        type: e.type === "dir" ? "directory" : e.type,
        size: e.size || 0,
      }))
      .filter((e) => {
        // Skip dotfiles/dotdirs
        if (e.name.startsWith(".")) return false;
        // Skip known infrastructure files
        if (e.type === "file" && HIDDEN_FILES.has(e.name)) return false;
        // Skip known infrastructure directories
        if (e.type === "directory" && HIDDEN_DIRS.has(e.name)) return false;
        return true;
      });

    const body = JSON.stringify(entries);

    // Store in cache (best-effort, don't block response)
    const entry: BrowseCacheEntry = { body, fetchedAt: Date.now() };
    store.setJSON(cacheKey, entry).catch((err) => { console.warn("[missions-browse] blob cache write failed:", err instanceof Error ? err.message : err) });

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": `public, max-age=${CDN_CACHE_MAX_AGE_S}`,
        "X-Cache": "MISS",
        ...corsHeaders,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error("[missions-browse] Error:", message);
    return jsonResponse(corsHeaders, { error: "upstream request failed" }, 502);
  }
};

function jsonResponse(
  corsHeaders: Record<string, string>,
  data: Record<string, unknown>,
  status = 200,
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}
