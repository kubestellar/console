/**
 * Netlify Function: Missions Scores Proxy
 *
 * GET /api/missions/scores
 * GET /api/missions/scores/:project/:id
 * Fetches score-related data from fixes/index.json in kubestellar/console-kb.
 * Caches responses in Netlify Blobs to avoid hitting GitHub on every request.
 */
import { getStore } from "@netlify/blobs";
import { buildCorsHeaders, handlePreflight } from "./_shared/cors";

const GITHUB_RAW_URL = "https://raw.githubusercontent.com";
const KB_REPO = "kubestellar/console-kb";
const DEFAULT_REF = "master";

/** Maximum response size (10MB) */
const MAX_BODY_BYTES = 10 * 1024 * 1024;
/** Request timeout in milliseconds */
const FETCH_TIMEOUT_MS = 30_000;
/** Cache TTL: serve cached content for 15 minutes before re-fetching from GitHub */
const CACHE_TTL_MS = 15 * 60 * 1000;
/** CDN edge cache: tell Netlify CDN to cache successful responses for 10 minutes */
const CDN_CACHE_MAX_AGE_S = 600;

// See web/netlify/functions/_shared/cors.ts for allowlist rationale (#9879).
const CORS_OPTS = {
  methods: "GET, OPTIONS",
  headers: "Content-Type, X-Demo-Mode",
} as const;

interface CacheEntry {
  body: string;
  contentType: string;
  fetchedAt: number;
}

/** Mirrors the relevant fields of indexJsonFormat in pkg/api/handlers/missions.go */
interface IndexEntry {
  path: string;
  title: string;
  cncfProjects?: string[];
  qualityScore?: number;
  qualityPass?: boolean;
  qualityBreakdown?: Record<string, number>;
  qualityIssues?: string[];
  qualitySuggestions?: string[];
}

interface MissionIndex {
  missions: IndexEntry[];
}

/** Shape returned by GET /api/missions/scores (list) */
interface ScoreEntry {
  path: string;
  title: string;
  project: string;
  qualityScore: number;
  qualityPass: boolean;
}

export default async (request: Request): Promise<Response> => {
  if (request.method === "OPTIONS") {
    return handlePreflight(request, CORS_OPTS);
  }

  const corsHeaders = buildCorsHeaders(request, CORS_OPTS);

  const url = new URL(request.url);
  const projectParam = url.searchParams.get("project");
  const idParam = url.searchParams.get("id");

  // Check for demo mode
  if (request.headers.get("X-Demo-Mode") === "true") {
    if (projectParam && idParam) {
      return jsonResponse(corsHeaders, {
        path: "fixes/demo/demo-123.json",
        project: "demo",
        title: "Demo Mission",
        qualityScore: 85,
        qualityBreakdown: { structure: 90, completeness: 80 },
        qualityIssues: [],
        qualitySuggestions: ["Improve context"]
      }, 200);
    } else {
      return jsonResponse(corsHeaders, {
        count: 1,
        scores: [
          {
            path: "fixes/demo/demo-123.json",
            title: "Demo Mission",
            project: "demo",
            qualityScore: 85,
            qualityPass: true
          }
        ]
      }, 200);
    }
  }

  const cacheKey = `index:${DEFAULT_REF}:fixes/index.json`;

  try {
    const store = getStore("missions-cache");
    let bodyText: string | null = null;
    let servedFromCache = false;

    const cached = await store.get(cacheKey, { type: "json" }) as CacheEntry | null;
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      bodyText = cached.body;
      servedFromCache = true;
    } else {
      const rawUrl = `${GITHUB_RAW_URL}/${KB_REPO}/${DEFAULT_REF}/fixes/index.json`;
      const resp = await fetch(rawUrl, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });

      if (!resp.ok) {
        if (cached) {
          bodyText = cached.body;
          servedFromCache = true;
        } else {
          return jsonResponse(corsHeaders, { error: "GitHub raw content error", status: resp.status }, resp.status);
        }
      } else {
        bodyText = await resp.text();
        if (bodyText.length > MAX_BODY_BYTES) {
          return jsonResponse(corsHeaders, { error: "response too large" }, 413);
        }
        const entry: CacheEntry = { body: bodyText, contentType: "application/json", fetchedAt: Date.now() };
        store.setJSON(cacheKey, entry).catch(() => {});
      }
    }

    if (!bodyText) {
      return jsonResponse(corsHeaders, { error: "failed to fetch index" }, 502);
    }

    let index: MissionIndex;
    try {
      index = JSON.parse(bodyText) as MissionIndex;
    } catch {
      return jsonResponse(corsHeaders, { error: "failed to parse index" }, 502);
    }

    if (projectParam && idParam) {
      for (const m of (index.missions || [])) {
        const mProject = Array.isArray(m.cncfProjects) && m.cncfProjects.length > 0 ? m.cncfProjects[0] : "unknown";
        const mBase = m.path ? m.path.split('/').pop() ?? "" : "";
        const mBaseNoExt = mBase.endsWith(".json") ? mBase.slice(0, -5) : mBase;
        const idNoExt = idParam.endsWith(".json") ? idParam.slice(0, -5) : idParam;
        if (mProject === projectParam && mBaseNoExt === idNoExt) {
          if (m.qualityScore == null) {
            return jsonResponse(corsHeaders, { error: "Mission found but has no score associated" }, 404);
          }
          return jsonResponse(corsHeaders, {
            path: m.path,
            project: mProject,
            title: m.title,
            qualityScore: m.qualityScore,
            qualityBreakdown: m.qualityBreakdown,
            qualityIssues: m.qualityIssues || [],
            qualitySuggestions: m.qualitySuggestions || []
          }, 200, servedFromCache ? "HIT" : "MISS");
        }
      }
      return jsonResponse(corsHeaders, { error: "KB mission not found" }, 404);
    } else {
      const results: ScoreEntry[] = [];
      for (const m of (index.missions || [])) {
        if (m.qualityScore != null) {
          const mProject = Array.isArray(m.cncfProjects) && m.cncfProjects.length > 0 ? m.cncfProjects[0] : "unknown";
          results.push({
            path: m.path,
            title: m.title,
            project: mProject,
            qualityScore: m.qualityScore,
            qualityPass: m.qualityPass
          });
        }
      }
      return jsonResponse(corsHeaders, { count: results.length, scores: results }, 200, servedFromCache ? "HIT" : "MISS");
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error("[missions-scores] Error:", message);
    return jsonResponse(corsHeaders, { error: "upstream request failed", detail: message }, 502);
  }
};

function jsonResponse(
  corsHeaders: Record<string, string>,
  data: Record<string, unknown>,
  status = 200,
  cacheHead = "NONE",
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": `public, max-age=${CDN_CACHE_MAX_AGE_S}`,
      "X-Cache": cacheHead,
      ...corsHeaders,
    },
  });
}
