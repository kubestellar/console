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

const GITHUB_API_URL = "https://api.github.com";
const KB_REPO = "kubestellar/console-kb";
const DEFAULT_REF = "master";

/** Request timeout in milliseconds */
const FETCH_TIMEOUT_MS = 30_000;

/** Cache TTL: serve cached content for 1 hour before re-fetching from GitHub */
const CACHE_TTL_MS = 60 * 60 * 1000;

/** CDN edge cache: tell Netlify CDN to cache successful responses for 10 minutes */
const CDN_CACHE_MAX_AGE_S = 600;

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

export default async (request: Request): Promise<Response> => {
  if (request.method === "OPTIONS") {
    return handlePreflight(request, CORS_OPTS);
  }

  const corsHeaders = buildCorsHeaders(request, CORS_OPTS);

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
          ...corsHeaders,
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
            ...corsHeaders,
          },
        });
      }
      const code = resp.status === 403 || resp.status === 429 ? "rate_limited" : "github_error";
      return jsonResponse(corsHeaders, { error: "GitHub API error", status: resp.status, code }, resp.status);
    }

    const ghEntries = (await resp.json()) as GitHubEntry[];

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
    store.setJSON(cacheKey, entry).catch(() => {});

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
    return jsonResponse(corsHeaders, { error: "upstream request failed", detail: message }, 502);
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
