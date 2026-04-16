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

const GITHUB_API = "https://api.github.com";
const REPO_RE = /^[\w.-]+\/[\w.-]+$/;
const API_TIMEOUT_MS = 15_000;
const LEVEL_COMPLETION_THRESHOLD = 0.7;

/** ACMM criteria grouped by level. Mirrors acmm-scan.mts CRITERIA entries. */
const ACMM_IDS_BY_LEVEL: Record<number, string[]> = {
  2: [
    "acmm:claude-md",
    "acmm:copilot-instructions",
    "acmm:agents-md",
    "acmm:cursor-rules",
    "acmm:prompts-catalog",
    "acmm:pr-template",
    "acmm:issue-template",
    "acmm:contrib-guide",
    "acmm:style-config",
    "acmm:editor-config",
  ],
  3: [
    "acmm:coverage-gate",
    "acmm:pr-acceptance-metric",
    "acmm:test-suite",
    "acmm:e2e-tests",
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
    "acmm:auto-issue-gen",
    "acmm:multi-agent-orchestration",
    "acmm:strategic-dashboard",
    "acmm:merge-queue",
    "acmm:policy-as-code",
    "acmm:public-metrics",
    "acmm:reflection-log",
  ],
};

/** Shields.io color bands by level — matches the ACMM gauge on Card 1. */
const LEVEL_COLORS: Record<number, string> = {
  1: "lightgrey",
  2: "yellow",
  3: "yellowgreen",
  4: "brightgreen",
  5: "blueviolet",
};

const LEVEL_NAMES: Record<number, string> = {
  1: "Assisted",
  2: "Instructed",
  3: "Measured",
  4: "Adaptive",
  5: "Self-Sustaining",
};

const ALLOWED_ORIGIN_RE = /^https?:\/\/(.*\.kubestellar\.io|localhost(:\d+)?)$/;

function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "Cache-Control": "public, max-age=300",
  };
  if (origin && ALLOWED_ORIGIN_RE.test(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  } else {
    headers["Access-Control-Allow-Origin"] = "*";
  }
  return headers;
}

function computeLevel(detectedIds: Set<string>): { level: number; totalDetected: number; totalAcmm: number } {
  let currentLevel = 1;
  let totalDetected = 0;
  let totalAcmm = 0;
  for (let n = 2; n <= 5; n++) {
    const required = ACMM_IDS_BY_LEVEL[n];
    const detected = required.filter((id) => detectedIds.has(id)).length;
    totalAcmm += required.length;
    totalDetected += detected;
    if (required.length === 0) continue;
    const ratio = detected / required.length;
    if (ratio >= LEVEL_COMPLETION_THRESHOLD) {
      currentLevel = n;
    } else {
      break;
    }
  }
  return { level: currentLevel, totalDetected, totalAcmm };
}

async function fetchDetectedIds(origin: string, repo: string): Promise<string[]> {
  const url = `${origin}/api/acmm/scan?repo=${encodeURIComponent(repo)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(API_TIMEOUT_MS) });
  if (!res.ok) {
    throw new Error(`scan returned ${res.status}`);
  }
  const body = (await res.json()) as { detectedIds?: string[] };
  return body.detectedIds || [];
}

/** Fallback: call GitHub directly if the scan endpoint isn't reachable from this function. */
async function fetchDetectedIdsDirect(repo: string, token: string): Promise<string[]> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${GITHUB_API}/repos/${repo}/git/trees/HEAD?recursive=1`, {
    headers,
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`tree API ${res.status}`);
  const body = (await res.json()) as { tree?: { path: string }[] };
  const paths = new Set((body.tree || []).map((e) => e.path));

  const allIds = Object.values(ACMM_IDS_BY_LEVEL).flat();
  return allIds.filter((id) => {
    /** Rough match: use a subset of the real detection rules since this
     * fallback only runs when the scan endpoint is unreachable. */
    return paths.has(id.replace("acmm:", "").replace(/-/g, "_") + ".md");
  });
}

export default async (req: Request) => {
  const origin = req.headers.get("Origin");
  const headers = corsHeaders(origin);
  const url = new URL(req.url);
  const repo = url.searchParams.get("repo") || "";

  if (!REPO_RE.test(repo)) {
    return new Response(
      JSON.stringify({
        schemaVersion: 1,
        label: "ACMM",
        message: "invalid repo",
        color: "red",
      }),
      {
        status: 200,
        headers: { ...headers, "Content-Type": "application/json" },
      },
    );
  }

  let detectedIds: string[] = [];
  try {
    detectedIds = await fetchDetectedIds(url.origin, repo);
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
