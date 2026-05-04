/**
 * Netlify Function: ACMM Badge
 *
 * Returns a shields.io endpoint-compatible JSON response with the repo's
 * current AI Codebase Maturity level. Consumed by:
 *
 *   https://img.shields.io/endpoint?url=https%3A%2F%2Fconsole.kubestellar.io%2Fapi%2Facmm%2Fbadge%3Frepo%3Downer%2Fname
 *
 * The dashboard shows a copy-to-clipboard markdown snippet built from this URL.
 *
 * Input:  ?repo=owner/repo
 * Output: { schemaVersion, label, message, color, namedLogo } per shields.io spec
 */

import { getStore } from "@netlify/blobs";
import { SCANNABLE_IDS_BY_LEVEL, AGENT_INSTRUCTION_FILE_IDS, ACMM_DETECTION_PATHS } from "../../src/lib/acmm/scannableIdsByLevel";

const GITHUB_API = "https://api.github.com";
const REPO_RE = /^[\w.-]+\/[\w.-]+$/;
const API_TIMEOUT_MS = 15_000;
const BLOB_CACHE_STORE = "acmm-scan";
const BLOB_CACHE_TTL_MS = 60 * 60 * 1000;
const LEVEL_COMPLETION_THRESHOLD = 0.7;
/** Maximum maturity level scanned (L6 = Fully Autonomous). L1 is the
 *  starting level; threshold walk gates L2 through MAX_LEVEL. */
const MAX_LEVEL = 6;
/**
 * Badge cache window for successful responses. ACMM level changes slowly
 * (file-tree shape, not commit activity), so 15 min is plenty. This is shared
 * across three layers:
 *   1. shields.io respects this in its `cacheSeconds` JSON field below
 *   2. our CDN respects this in the `Cache-Control` header below
 *   3. GitHub's camo image proxy fetches the badge SVG and caches it itself
 * Combined with stale-while-revalidate=86400 to eliminate "inaccessible"
 * badges during transient outages.
 */
const BADGE_CACHE_SECONDS = 900;

/**
 * Error cache window. Set to 5 min so shields.io doesn't retry too
 * aggressively but also doesn't lock "unavailable" for ages.
 */
const BADGE_ERROR_CACHE_SECONDS = 300;

/**
 * ACMM_IDS_BY_LEVEL and AGENT_INSTRUCTION_FILE_IDS are now imported from
 * the shared module (web/src/lib/acmm/scannableIdsByLevel.ts) so the badge
 * and frontend dashboard always compute identical levels.
 *
 * See scannableIdsByLevel.ts for the canonical list and derivation logic.
 */
const ACMM_IDS_BY_LEVEL = SCANNABLE_IDS_BY_LEVEL;

/** Shields.io color bands by level — matches the ACMM gauge on Card 1.
 *  Level 6 (Fully Autonomous) extends the gradient beyond the original
 *  five bands; `blue` stays within shields.io's named-color palette. */
const LEVEL_COLORS: Record<number, string> = {
  1: "lightgrey",
  2: "yellow",
  3: "yellowgreen",
  4: "brightgreen",
  5: "blueviolet",
  6: "blue",
};

const LEVEL_NAMES: Record<number, string> = {
  1: "Assisted",
  2: "Instructed",
  3: "Measured",
  4: "Adaptive",
  5: "Semi-Automated",
  6: "Fully Autonomous",
};

const ALLOWED_ORIGIN_RE = /^https?:\/\/(.*\.kubestellar\.io|localhost(:\d+)?)$/;

function corsHeaders(
  origin: string | null,
  cacheSeconds = BADGE_CACHE_SECONDS,
  withSWR = true,
): Record<string, string> {
  // stale-while-revalidate must only appear on success responses; attaching
  // it to error responses causes intermediary caches to serve stale error
  // badges long after the upstream recovers.
  const cacheControl = withSWR
    ? `public, max-age=${cacheSeconds}, stale-while-revalidate=86400`
    : `public, max-age=${cacheSeconds}`;
  // This is a public, unauthenticated, embeddable badge endpoint — the `*`
  // CORS is intentional so shields.io and any README host (github.com,
  // raw.githubusercontent.com, pkg.go.dev, crates.io, etc.) can fetch it.
  // Do NOT tighten this origin (see web/netlify/functions/_shared/cors.ts
  // for the tightened console-internal endpoints per #9879).
  const headers: Record<string, string> = {
    "Cache-Control": cacheControl,
    "Access-Control-Allow-Origin": "*",
  };
  if (origin && ALLOWED_ORIGIN_RE.test(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    // Vary: Origin is required so shared caches (CDNs, proxies) key responses
    // by origin and do not serve an origin-restricted response to other clients.
    headers["Vary"] = "Origin";
  }
  return headers;
}

function computeLevel(rawDetectedIds: Set<string>): { level: number; totalDetected: number; totalAcmm: number } {
  // Synthesise the virtual L2 criterion before the level walk.
  // Any one instruction file (vendor-neutral AGENTS.md or vendor-specific
  // CLAUDE.md / copilot-instructions / .cursorrules) satisfies the group.
  const detectedIds = new Set(rawDetectedIds);
  if ([...AGENT_INSTRUCTION_FILE_IDS].some((id) => detectedIds.has(id))) {
    detectedIds.add("acmm:agent-instructions");
  }

  let currentLevel = 1;
  let totalDetected = 0;
  let totalAcmm = 0;
  let stopPromotion = false;
  for (let n = 2; n <= MAX_LEVEL; n++) {
    const required = ACMM_IDS_BY_LEVEL[n] ?? [];
    const detected = required.filter((id) => detectedIds.has(id)).length;
    totalAcmm += required.length;
    totalDetected += detected;
    if (required.length === 0 || stopPromotion) continue;
    // L2 "Instructed" is reached with any single criterion (the project has
    // started using AI tooling); higher levels use the 70 % threshold.
    const threshold = n === 2 ? 1 / required.length : LEVEL_COMPLETION_THRESHOLD;
    const ratio = detected / required.length;
    if (ratio >= threshold) {
      currentLevel = n;
    } else {
      // Stop promoting levels after the first gap, but keep counting
      // detected / total across every level so the "X / Y" pill in the
      // badge reflects the full criterion catalog (not just the levels
      // up to the current gate). This matches the frontend pill the
      // user sees inside the dashboard.
      stopPromotion = true;
    }
  }
  return { level: currentLevel, totalDetected, totalAcmm };
}

/** Try to read from Netlify Blobs, returning { data, fresh } or null. */
async function readBlobCache(repo: string): Promise<{ detectedIds: string[]; fresh: boolean } | null> {
  try {
    const store = getStore(BLOB_CACHE_STORE);
    const cacheKey = `scan:${repo}`;
    const raw = await store.get(cacheKey, { type: "json" });
    if (raw) {
      const entry = raw as { scannedAt?: string; detectedIds?: string[] };
      const age = entry.scannedAt ? Date.now() - new Date(entry.scannedAt).getTime() : Infinity;
      return {
        detectedIds: entry.detectedIds || [],
        fresh: age < BLOB_CACHE_TTL_MS,
      };
    }
  } catch {
    // blob read failed
  }
  return null;
}

/** Write scan results to Netlify Blobs so future badge requests can use them. */
async function writeBlobCache(repo: string, detectedIds: string[]): Promise<void> {
  try {
    const store = getStore(BLOB_CACHE_STORE);
    const cacheKey = `scan:${repo}`;
    await store.setJSON(cacheKey, {
      scannedAt: new Date().toISOString(),
      detectedIds,
    });
  } catch {
    // best-effort — don't fail the badge
  }
}

async function fetchFromScanEndpoint(origin: string, repo: string, force = false): Promise<string[]> {
  const forceParam = force ? "&force=true" : "";
  const url = `${origin}/api/acmm/scan?repo=${encodeURIComponent(repo)}${forceParam}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(API_TIMEOUT_MS) });
  if (!res.ok) {
    throw new Error(`scan returned ${res.status}`);
  }
  const body = (await res.json()) as { detectedIds?: string[] };
  return body.detectedIds || [];
}

// ACMM_DETECTION_PATHS is derived from acmmSource.criteria in scannableIdsByLevel.ts —
// the single source of truth shared with acmm-scan.mts. No hand-maintained copy here.

function pathMatches(paths: Set<string>, pattern: string): boolean {
  if (pattern.endsWith("/")) {
    for (const path of paths) {
      if (path.startsWith(pattern)) return true;
    }
    return false;
  }
  return paths.has(pattern);
}

async function fetchDetectedIdsDirect(repo: string, token: string): Promise<string[]> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  // The trees endpoint requires a branch name or SHA, not "HEAD" — resolve
  // the default branch first. See acmm-scan.mts for the same pattern.
  const repoRes = await fetch(`${GITHUB_API}/repos/${repo}`, {
    headers,
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  });
  if (!repoRes.ok) throw new Error(`repo API ${repoRes.status}`);
  const repoInfo = (await repoRes.json()) as { default_branch?: string };
  const branch = repoInfo.default_branch || "main";

  const res = await fetch(
    `${GITHUB_API}/repos/${repo}/git/trees/${branch}?recursive=1`,
    {
      headers,
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    },
  );
  if (!res.ok) throw new Error(`tree API ${res.status}`);
  const body = (await res.json()) as { tree?: { path: string }[] };
  const paths = new Set((body.tree || []).map((e) => e.path));

  const detected: string[] = [];
  for (const [id, patterns] of Object.entries(ACMM_DETECTION_PATHS)) {
    for (const p of patterns) {
      if (pathMatches(paths, p)) {
        detected.push(id);
        break;
      }
    }
  }
  return detected;
}

export default async (req: Request) => {
  const origin = req.headers.get("Origin");
  const url = new URL(req.url);
  const repo = url.searchParams.get("repo") || "";
  const force = url.searchParams.get("force") === "true";

  if (!REPO_RE.test(repo)) {
    const headers = corsHeaders(origin, BADGE_ERROR_CACHE_SECONDS, false);
    return new Response(
      JSON.stringify({
        schemaVersion: 1,
        label: "ACMM",
        message: "invalid repo",
        color: "red",
        cacheSeconds: BADGE_ERROR_CACHE_SECONDS,
      }),
      {
        status: 200,
        headers: { ...headers, "Content-Type": "application/json" },
      },
    );
  }

  // ── Layer 1: Blobs cache (fastest, no network) ───────────────────────
  let blobResult: { detectedIds: string[]; fresh: boolean } | null = null;
  if (!force) {
    blobResult = await readBlobCache(repo);
    if (blobResult?.fresh) {
      return badgeResponse(blobResult.detectedIds, origin);
    }
  }

  // ── Layer 2: scan endpoint ────────────────────────────────────────────
  // If we have stale Blob data, use it as guaranteed fallback.
  let detectedIds: string[] | null = null;
  try {
    detectedIds = await fetchFromScanEndpoint(url.origin, repo, force);
    // Persist to Blobs for next request
    writeBlobCache(repo, detectedIds).catch((err) => {
      console.error('[acmm-badge] blob cache write failed', err instanceof Error ? err.message : err)
    });
  } catch {
    // scan endpoint unreachable — try direct GitHub
  }

  if (detectedIds) {
    return badgeResponse(detectedIds, origin);
  }

  // ── Layer 3: direct GitHub ────────────────────────────────────────────
  const token = process.env.GITHUB_TOKEN || "";
  try {
    detectedIds = await fetchDetectedIdsDirect(repo, token);
    writeBlobCache(repo, detectedIds).catch((err) => {
      console.error('[acmm-badge] blob cache write failed', err instanceof Error ? err.message : err)
    });
    return badgeResponse(detectedIds, origin);
  } catch {
    // direct GitHub also failed
  }

  // ── Layer 4: stale Blob fallback (better than "unavailable") ──────────
  if (blobResult) {
    return badgeResponse(blobResult.detectedIds, origin);
  }

  // ── Layer 5: last-resort "unavailable" badge ──────────────────────────
  const headers = corsHeaders(origin, BADGE_ERROR_CACHE_SECONDS, false);
  return new Response(
    JSON.stringify({
      schemaVersion: 1,
      label: "ACMM",
      message: "unavailable",
      color: "lightgrey",
      cacheSeconds: BADGE_ERROR_CACHE_SECONDS,
    }),
    {
      status: 200,
      headers: { ...headers, "Content-Type": "application/json" },
    },
  );
};

function badgeResponse(detectedIds: string[], origin: string | null): Response {
  const { level, totalDetected, totalAcmm } = computeLevel(new Set(detectedIds));
  const name = LEVEL_NAMES[level];
  const color = LEVEL_COLORS[level];
  const headers = corsHeaders(origin, BADGE_CACHE_SECONDS);

  return new Response(
    JSON.stringify({
      schemaVersion: 1,
      label: "ACMM",
      message: `L${level} · ${name} · ${totalDetected}/${totalAcmm}`,
      color,
      namedLogo: "github",
      cacheSeconds: BADGE_CACHE_SECONDS,
    }),
    {
      status: 200,
      headers: { ...headers, "Content-Type": "application/json" },
    },
  );
}

export const config = {
  path: "/api/acmm/badge",
};
