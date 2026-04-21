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
 * (file-tree shape, not commit activity), so 5 min is plenty. This is shared
 * across three layers:
 *   1. shields.io respects this in its `cacheSeconds` JSON field below
 *   2. our CDN respects this in the `Cache-Control` header below
 *   3. GitHub's camo image proxy fetches the badge SVG and caches it itself
 * Kept at 5 min (was 1 h) so a transient Netlify outage doesn't lock the
 * badge into "inaccessible" for an hour (#4086).
 */
const BADGE_CACHE_SECONDS = 300;

/**
 * Short cache for error/unavailable responses so shields.io retries quickly
 * after a transient failure instead of caching "inaccessible" for 5 min.
 */
const BADGE_ERROR_CACHE_SECONDS = 60;

/**
 * Agent instruction files are an OR group for L2: any one vendor-specific or
 * vendor-neutral file satisfies the "Instructed" signal. A project using the
 * vendor-agnostic AGENTS.md (agents.md spec) should reach L2 just as easily
 * as one that stacks multiple vendor-specific configs. The virtual criterion
 * "acmm:agent-instructions" is synthesised in computeLevel() before the level
 * walk if any member of this set is present in detectedIds. Issue #9169.
 */
const AGENT_INSTRUCTION_FILE_IDS = new Set([
  "acmm:claude-md",
  "acmm:copilot-instructions",
  "acmm:agents-md",
  "acmm:cursor-rules",
]);

/**
 * ACMM criteria grouped by level. MUST stay in sync with the scannable
 * criteria in web/src/data/acmm.ts — only IDs where scannable !== false
 * belong here. Non-scannable criteria (layered-safety, mechanical-enforcement,
 * session-summary, structural-gates, session-continuity, cross-session-knowledge)
 * are excluded because the frontend cannot detect them automatically.
 *
 * Issue #8979: the previous map used legacy short IDs (acmm:pr-template,
 * acmm:style-config, acmm:test-suite, …) that no longer exist in the scan
 * taxonomy, so the badge always computed to L1 ("5/10" for kubestellar/
 * console) regardless of the repo's real maturity. When adding / renaming
 * criteria in acmm-scan.mts, update this map and the LEVEL_NAMES below.
 *
 * L2 uses a virtual "acmm:agent-instructions" criterion (synthesised in
 * computeLevel) rather than the four individual instruction-file IDs, so that
 * any one vendor-neutral or vendor-specific file satisfies the L2 gate.
 */
const ACMM_IDS_BY_LEVEL: Record<number, string[]> = {
  2: [
    "acmm:agent-instructions", // virtual OR: any of claude-md / agents-md / copilot-instructions / cursor-rules
    "acmm:prompts-catalog",
    "acmm:editor-config",
    "acmm:correction-capture",
    "acmm:positive-reinforcement",
  ],
  3: [
    "acmm:pr-acceptance-metric",
    "acmm:pr-review-rubric",
    "acmm:quality-dashboard",
    "acmm:ci-matrix",
  ],
  4: [
    "acmm:auto-qa-tuning",
    "acmm:nightly-compliance",
    "acmm:copilot-review-apply",
    "acmm:auto-label",
    "acmm:ai-fix-workflow",
    "acmm:tier-classifier",
    "acmm:security-ai-md",
  ],
  5: [
    "acmm:github-actions-ai",
    "acmm:auto-qa-self-tuning",
    "acmm:public-metrics",
    "acmm:policy-as-code",
    "acmm:reflection-log",
  ],
  6: [
    "acmm:auto-issue-gen",
    "acmm:multi-agent-orchestration",
    "acmm:strategic-dashboard",
    "acmm:merge-queue",
    "acmm:risk-assessment-config",
    "acmm:observability-runbook",
  ],
};

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

function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "Cache-Control": `public, max-age=${BADGE_CACHE_SECONDS}`,
  };
  if (origin && ALLOWED_ORIGIN_RE.test(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  } else {
    headers["Access-Control-Allow-Origin"] = "*";
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

async function fetchDetectedIds(origin: string, repo: string, force = false): Promise<string[]> {
  // Fast path: read directly from Netlify Blobs (same store the scan function writes to).
  // This avoids a same-origin HTTP round-trip that frequently times out inside
  // Netlify Functions (cold-start + CDN routing overhead exceeds API_TIMEOUT_MS).
  if (!force) {
    try {
      const store = getStore(BLOB_CACHE_STORE);
      const cacheKey = `scan:${repo}`;
      const raw = await store.get(cacheKey, { type: "json" });
      if (raw) {
        const entry = raw as { scannedAt?: string; detectedIds?: string[] };
        const age = entry.scannedAt ? Date.now() - new Date(entry.scannedAt).getTime() : Infinity;
        if (age < BLOB_CACHE_TTL_MS) {
          return entry.detectedIds || [];
        }
      }
    } catch {
      // blob read failed — fall through to HTTP
    }
  }

  // HTTP path: call the scan endpoint (forces a fresh GitHub scan when force=true).
  const forceParam = force ? "&force=true" : "";
  const url = `${origin}/api/acmm/scan?repo=${encodeURIComponent(repo)}${forceParam}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(API_TIMEOUT_MS) });
  if (!res.ok) {
    throw new Error(`scan returned ${res.status}`);
  }
  const body = (await res.json()) as { detectedIds?: string[] };
  return body.detectedIds || [];
}

/**
 * Fallback: call GitHub directly when the scan endpoint isn't reachable
 * from this function (same-origin fetch timed out, scan function cold-
 * started, etc.). Detects a representative subset of criteria by path —
 * enough to produce a plausible level for the badge so we never show
 * "custom badge inaccessible" (issue #8979). Previously this used a
 * naive `id.replace("acmm:", "").replace(/-/g, "_") + ".md"` heuristic
 * that never matched anything real (e.g. `claude_md.md` is not a file
 * on any repo), so every fallback path computed to L1.
 */
const BADGE_FALLBACK_PATHS: Record<string, readonly string[]> = {
  // L2 — individual instruction files still detected; computeLevel synthesises
  // the virtual "acmm:agent-instructions" from any one of these matches.
  "acmm:claude-md": ["CLAUDE.md", ".claude/CLAUDE.md"],
  "acmm:copilot-instructions": [".github/copilot-instructions.md"],
  "acmm:agents-md": ["AGENTS.md"],
  "acmm:cursor-rules": [".cursorrules", ".cursor/rules"],
  "acmm:prompts-catalog": [
    "prompts/",
    ".prompts/",
    "docs/prompts/",
    ".github/prompts/",
    ".github/agents/",
  ],
  "acmm:editor-config": [".editorconfig"],
  // L3
  "acmm:pr-review-rubric": [
    ".github/review-rubric.md",
    "docs/review-criteria.md",
    ".github/prompts/review.md",
  ],
  "acmm:ci-matrix": [
    ".github/workflows/ci.yml",
    ".github/workflows/test.yml",
    ".github/workflows/build.yml",
    ".github/workflows/build-deploy.yml",
  ],
  // L4
  "acmm:security-ai-md": [
    "docs/security/SECURITY-AI.md",
    "SECURITY-AI.md",
    "docs/SECURITY-AI.md",
  ],
  "acmm:ai-fix-workflow": [
    ".github/workflows/ai-fix.yml",
    ".github/workflows/ai-fix-requested.yml",
    ".github/workflows/claude.yml",
  ],
  "acmm:nightly-compliance": [
    ".github/workflows/nightly-compliance.yml",
    ".github/workflows/nightly.yml",
    ".github/workflows/nightly-test.yml",
  ],
  "acmm:auto-label": [
    ".github/labeler.yml",
    ".github/workflows/labeler.yml",
    ".github/workflows/triage.yml",
  ],
  // L5
  "acmm:policy-as-code": [
    ".github/policies/",
    "policies/",
  ],
  "acmm:github-actions-ai": [
    ".github/workflows/claude.yml",
    ".github/workflows/claude-code-review.yml",
  ],
  // L6
  "acmm:merge-queue": [
    ".github/workflows/merge-queue.yml",
    ".github/merge-queue.yml",
    ".prow.yaml",
    "tide.yaml",
  ],
};

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
  for (const [id, patterns] of Object.entries(BADGE_FALLBACK_PATHS)) {
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
  const headers = corsHeaders(origin);
  const url = new URL(req.url);
  const repo = url.searchParams.get("repo") || "";
  const force = url.searchParams.get("force") === "true";

  if (!REPO_RE.test(repo)) {
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

  let detectedIds: string[] = [];
  try {
    detectedIds = await fetchDetectedIds(url.origin, repo, force);
  } catch {
    const token = process.env.GITHUB_TOKEN || "";
    try {
      detectedIds = await fetchDetectedIdsDirect(repo, token);
    } catch {
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
    }
  }

  const { level, totalDetected, totalAcmm } = computeLevel(new Set(detectedIds));
  const name = LEVEL_NAMES[level];
  const color = LEVEL_COLORS[level];

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
};

export const config = {
  path: "/api/acmm/badge",
};
