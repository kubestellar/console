/**
 * Netlify Function: ACMM Scan
 *
 * Scans any GitHub repo and returns detected criteria from the multi-source
 * ACMM registry plus weekly AI-vs-human contribution activity. Powers the
 * /acmm dashboard's four cards.
 *
 * Input:  ?repo=owner/repo
 * Output: { repo, scannedAt, detectedLoops, weeklyActivity, level, ... }
 *
 * Optional env var:
 *   GITHUB_TOKEN — enables higher rate limits (5000 req/hr vs 60)
 */

import { getStore } from "@netlify/blobs";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GITHUB_API = "https://api.github.com";
const CACHE_STORE = "acmm-scan";
/** Per-repo cache TTL: 15 minutes. Scans are expensive and state changes slowly. */
const CACHE_TTL_MS = 15 * 60 * 1000;
/** Request timeout for GitHub API calls */
const API_TIMEOUT_MS = 15_000;
/** How many weeks of contribution history to return */
const WEEKS_OF_HISTORY = 16;
/** Valid repo slug: owner/name with word chars, dots, dashes */
const REPO_RE = /^[\w.-]+\/[\w.-]+$/;
/** CORS origins: *.kubestellar.io and localhost */
const ALLOWED_ORIGIN_RE = /^https?:\/\/(.*\.kubestellar\.io|localhost(:\d+)?)$/;
/** AI-generated label used to classify AI contributions */
const AI_LABEL = "ai-generated";
/** Known AI authors (shared logins + bots) */
const AI_AUTHORS = new Set([
  "clubanderson",
  "Copilot",
  "copilot-swe-agent[bot]",
]);

// ---------------------------------------------------------------------------
// Criterion catalog — mirrors web/src/lib/acmm/sources/
// (Duplicated here because Netlify Functions are self-contained; kept in sync
// with the frontend catalog manually. See sources/index.ts for source of truth.)
// ---------------------------------------------------------------------------

interface DetectionHint {
  type: "path" | "glob" | "any-of";
  pattern: string | string[];
}

interface Criterion {
  id: string;
  source: string;
  level?: number;
  category: string;
  name: string;
  detection: DetectionHint;
}

const CRITERIA: Criterion[] = [
  // ACMM L2 — Instructed
  { id: "acmm:claude-md", source: "acmm", level: 2, category: "feedback-loop", name: "CLAUDE.md instruction file", detection: { type: "any-of", pattern: ["CLAUDE.md", ".claude/CLAUDE.md"] } },
  { id: "acmm:copilot-instructions", source: "acmm", level: 2, category: "feedback-loop", name: "Copilot instructions", detection: { type: "path", pattern: ".github/copilot-instructions.md" } },
  { id: "acmm:agents-md", source: "acmm", level: 2, category: "feedback-loop", name: "AGENTS.md", detection: { type: "path", pattern: "AGENTS.md" } },
  { id: "acmm:cursor-rules", source: "acmm", level: 2, category: "feedback-loop", name: "Cursor rules", detection: { type: "any-of", pattern: [".cursorrules", ".cursor/rules"] } },
  { id: "acmm:prompts-catalog", source: "acmm", level: 2, category: "feedback-loop", name: "Prompts catalog", detection: { type: "any-of", pattern: ["prompts/", ".prompts/", "docs/prompts/", ".github/prompts/", ".github/agents/"] } },
  { id: "acmm:pr-template", source: "acmm", level: 2, category: "feedback-loop", name: "PR template", detection: { type: "any-of", pattern: [".github/pull_request_template.md", ".github/PULL_REQUEST_TEMPLATE.md"] } },
  { id: "acmm:issue-template", source: "acmm", level: 2, category: "feedback-loop", name: "Issue templates", detection: { type: "any-of", pattern: [".github/ISSUE_TEMPLATE/", ".github/issue_template.md"] } },
  { id: "acmm:contrib-guide", source: "acmm", level: 2, category: "feedback-loop", name: "Contributing guide", detection: { type: "any-of", pattern: ["CONTRIBUTING.md", "docs/contributing.md"] } },
  { id: "acmm:style-config", source: "acmm", level: 2, category: "feedback-loop", name: "Style config", detection: { type: "any-of", pattern: [".eslintrc", ".eslintrc.json", ".eslintrc.js", "eslint.config.js", "eslint.config.mjs", ".prettierrc", ".prettierrc.json", "prettier.config.js", "ruff.toml", ".golangci.yml", "biome.json"] } },
  { id: "acmm:editor-config", source: "acmm", level: 2, category: "feedback-loop", name: "EditorConfig", detection: { type: "path", pattern: ".editorconfig" } },

  // ACMM L3 — Measured
  { id: "acmm:coverage-gate", source: "acmm", level: 3, category: "feedback-loop", name: "Coverage gate", detection: { type: "any-of", pattern: ["codecov.yml", ".codecov.yml", ".github/workflows/coverage-gate.yml", "coverage.yml"] } },
  { id: "acmm:pr-acceptance-metric", source: "acmm", level: 3, category: "feedback-loop", name: "PR acceptance metric", detection: { type: "any-of", pattern: ["scripts/build-accm-history.mjs", ".github/workflows/accm-history-update.yml", "scripts/pr-metrics.mjs", ".github/workflows/pr-metrics.yml", "docs/metrics.md"] } },
  { id: "acmm:test-suite", source: "acmm", level: 3, category: "feedback-loop", name: "Test suite", detection: { type: "any-of", pattern: ["vitest.config.ts", "vitest.config.js", "jest.config.js", "jest.config.ts", "go.mod", "pytest.ini", "pyproject.toml", "test/", "tests/", "__tests__/", "spec/"] } },
  { id: "acmm:e2e-tests", source: "acmm", level: 3, category: "feedback-loop", name: "E2E tests", detection: { type: "any-of", pattern: ["playwright.config.ts", "playwright.config.js", "cypress.config.ts", "e2e/"] } },
  { id: "acmm:pr-review-rubric", source: "acmm", level: 3, category: "feedback-loop", name: "PR review rubric", detection: { type: "any-of", pattern: [".github/workflows/review.yml", "docs/review-rubric.md", ".github/review-checklist.md", ".github/prompts/review.md", "docs/qa/"] } },
  { id: "acmm:quality-dashboard", source: "acmm", level: 3, category: "feedback-loop", name: "Quality dashboard", detection: { type: "any-of", pattern: ["public/analytics.js", "web/public/analytics.js", "web/src/components/analytics/", "docs/quality.md", ".github/workflows/quality-report.yml", "docs/AI-QUALITY-ASSURANCE.md"] } },
  { id: "acmm:ci-matrix", source: "acmm", level: 3, category: "feedback-loop", name: "CI test matrix", detection: { type: "any-of", pattern: [".github/workflows/ci.yml", ".github/workflows/test.yml", ".github/workflows/build.yml"] } },

  // ACMM L4 — Adaptive
  { id: "acmm:auto-qa-tuning", source: "acmm", level: 4, category: "feedback-loop", name: "Auto-QA self-tuning", detection: { type: "any-of", pattern: [".github/auto-qa-tuning.json", ".github/workflows/auto-qa.yml", "scripts/auto-qa-tuner.mjs"] } },
  { id: "acmm:nightly-compliance", source: "acmm", level: 4, category: "feedback-loop", name: "Nightly compliance", detection: { type: "any-of", pattern: [".github/workflows/nightly-compliance.yml", ".github/workflows/nightly.yml", ".github/workflows/nightly-test.yml", ".github/workflows/nightly-test-suite.yml"] } },
  { id: "acmm:copilot-review-apply", source: "acmm", level: 4, category: "feedback-loop", name: "Copilot review apply", detection: { type: "any-of", pattern: [".github/workflows/copilot-review-apply.yml", ".github/workflows/apply-copilot.yml"] } },
  { id: "acmm:auto-label", source: "acmm", level: 4, category: "feedback-loop", name: "Auto-label workflow", detection: { type: "any-of", pattern: [".github/labeler.yml", ".github/workflows/labeler.yml"] } },
  { id: "acmm:ai-fix-workflow", source: "acmm", level: 4, category: "feedback-loop", name: "AI fix workflow", detection: { type: "any-of", pattern: [".github/workflows/ai-fix.yml", ".github/workflows/ai-fix-requested.yml"] } },
  { id: "acmm:tier-classifier", source: "acmm", level: 4, category: "feedback-loop", name: "Tier classifier", detection: { type: "any-of", pattern: [".github/workflows/tier-classifier.yml", "docs/risk-tiers.md", ".github/risk-tiers.yml"] } },
  { id: "acmm:security-ai-md", source: "acmm", level: 4, category: "feedback-loop", name: "SECURITY-AI.md", detection: { type: "any-of", pattern: ["docs/security/SECURITY-AI.md", "SECURITY-AI.md", "docs/SECURITY-AI.md"] } },

  // ACMM L5 — Self-Sustaining
  { id: "acmm:auto-issue-gen", source: "acmm", level: 5, category: "feedback-loop", name: "Auto issue generation", detection: { type: "any-of", pattern: [".github/workflows/auto-issues.yml", "scripts/generate-issues.mjs"] } },
  { id: "acmm:multi-agent-orchestration", source: "acmm", level: 5, category: "feedback-loop", name: "Multi-agent orchestration", detection: { type: "any-of", pattern: [".github/workflows/dispatcher.yml", "docs/multi-agent.md", ".claude/dispatcher/"] } },
  { id: "acmm:strategic-dashboard", source: "acmm", level: 5, category: "feedback-loop", name: "Strategic dashboard", detection: { type: "any-of", pattern: ["web/src/components/acmm/", "docs/strategy.md", ".github/workflows/strategy-report.yml", "docs/autonomous-work-log.md"] } },
  { id: "acmm:merge-queue", source: "acmm", level: 5, category: "feedback-loop", name: "Merge queue", detection: { type: "any-of", pattern: [".github/workflows/merge-queue.yml", ".github/merge-queue.yml"] } },
  { id: "acmm:policy-as-code", source: "acmm", level: 5, category: "feedback-loop", name: "Policy-as-code", detection: { type: "any-of", pattern: ["policies/", ".github/policies/", "kyverno/"] } },
  { id: "acmm:public-metrics", source: "acmm", level: 5, category: "feedback-loop", name: "Public metrics", detection: { type: "any-of", pattern: ["public/analytics.js", "docs/metrics/", ".github/workflows/public-metrics.yml"] } },
  { id: "acmm:reflection-log", source: "acmm", level: 5, category: "feedback-loop", name: "Reflection log", detection: { type: "any-of", pattern: [".claude/reflections/", "memory/", "docs/reflections/"] } },

  // Fullsend
  { id: "fullsend:test-coverage", source: "fullsend", category: "readiness", name: "Test coverage threshold", detection: { type: "any-of", pattern: ["codecov.yml", ".codecov.yml", "coverage.yml", ".github/workflows/coverage-gate.yml"] } },
  { id: "fullsend:ci-cd-maturity", source: "fullsend", category: "readiness", name: "CI/CD pipeline", detection: { type: "any-of", pattern: [".github/workflows/ci.yml", ".github/workflows/build.yml", ".github/workflows/test.yml", ".github/workflows/pr-check.yml"] } },
  { id: "fullsend:auto-merge-policy", source: "fullsend", category: "autonomy", name: "Auto-merge policy", detection: { type: "any-of", pattern: [".github/auto-merge.yml", ".prow.yaml", "tide.yaml", ".github/workflows/auto-merge.yml"] } },
  { id: "fullsend:branch-protection-doc", source: "fullsend", category: "governance", name: "Branch protection doc", detection: { type: "any-of", pattern: ["docs/branch-protection.md", "docs/governance.md", ".github/branch-protection.yml"] } },
  { id: "fullsend:production-feedback", source: "fullsend", category: "observability", name: "Production feedback", detection: { type: "any-of", pattern: ["monitoring/", "grafana/", ".github/workflows/post-deploy-check.yml", "scripts/production-feedback.mjs"] } },
  { id: "fullsend:observability-runbook", source: "fullsend", category: "observability", name: "Observability runbook", detection: { type: "any-of", pattern: ["docs/runbook.md", "docs/runbooks/", "RUNBOOK.md", "docs/operations/"] } },
  { id: "fullsend:risk-assessment", source: "fullsend", category: "autonomy", name: "Risk assessment config", detection: { type: "any-of", pattern: [".github/risk-assessment.yml", "docs/risk-tiers.md", ".github/workflows/tier-classifier.yml"] } },
  { id: "fullsend:rollback-drill", source: "fullsend", category: "readiness", name: "Rollback drill", detection: { type: "any-of", pattern: ["docs/rollback.md", ".github/workflows/rollback.yml", "scripts/rollback.sh"] } },

  // Agentic Engineering Framework
  { id: "aef:task-traceability", source: "agentic-engineering-framework", category: "governance", name: "Task traceability", detection: { type: "any-of", pattern: [".agent/tasks/", "docs/agent-tasks/", ".github/agent-log/", "agent-tasks.md"] } },
  { id: "aef:structural-gates", source: "agentic-engineering-framework", category: "governance", name: "Structural gates", detection: { type: "any-of", pattern: ["CODEOWNERS", ".github/CODEOWNERS", ".agent/boundaries.yml", "docs/agent-boundaries.md"] } },
  { id: "aef:session-continuity", source: "agentic-engineering-framework", category: "governance", name: "Session continuity", detection: { type: "any-of", pattern: ["CLAUDE.md", "AGENTS.md", ".cursorrules", ".github/copilot-instructions.md", "docs/agent-context.md"] } },
  { id: "aef:audit-trail", source: "agentic-engineering-framework", category: "governance", name: "Audit trail workflow", detection: { type: "any-of", pattern: [".github/workflows/ai-audit.yml", ".github/workflows/agent-audit.yml", "scripts/ai-audit-report.mjs"] } },
  { id: "aef:cross-tool-config", source: "agentic-engineering-framework", category: "governance", name: "Cross-tool agent config", detection: { type: "any-of", pattern: ["AGENTS.md", "docs/ai-contributors.md", ".github/ai-config.yml"] } },
  { id: "aef:change-classification", source: "agentic-engineering-framework", category: "governance", name: "Change classification", detection: { type: "any-of", pattern: ["docs/change-classification.md", ".github/change-tiers.yml", "docs/risk-tiers.md"] } },

  // Claude Reflect
  { id: "claude-reflect:correction-capture", source: "claude-reflect", category: "self-tuning", name: "Correction capture", detection: { type: "any-of", pattern: [".claude/reflections/", "memory/feedback_", ".github/ai-corrections.yml", "scripts/capture-corrections.mjs"] } },
  { id: "claude-reflect:positive-reinforcement", source: "claude-reflect", category: "self-tuning", name: "Positive reinforcement", detection: { type: "any-of", pattern: [".claude/reflections/", "memory/feedback_", "docs/ai-reinforcement.md"] } },
  { id: "claude-reflect:claude-md-sync", source: "claude-reflect", category: "self-tuning", name: "CLAUDE.md auto-sync", detection: { type: "any-of", pattern: [".github/workflows/claude-md-sync.yml", "scripts/sync-claude-md.mjs", "scripts/update-claude-md.mjs"] } },
  { id: "claude-reflect:preference-index", source: "claude-reflect", category: "self-tuning", name: "Preference index", detection: { type: "any-of", pattern: [".claude/preferences.json", "memory/MEMORY.md", ".github/agent-preferences.yml"] } },
  { id: "claude-reflect:reflection-review", source: "claude-reflect", category: "self-tuning", name: "Reflection review", detection: { type: "any-of", pattern: [".github/workflows/reflection-review.yml", "scripts/review-reflections.mjs", "docs/reflection-review.md"] } },
  { id: "claude-reflect:session-summary", source: "claude-reflect", category: "self-tuning", name: "Session summary", detection: { type: "any-of", pattern: [".claude/sessions/", "docs/session-summaries/", "memory/session_"] } },
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WeeklyActivity {
  week: string;
  aiPrs: number;
  humanPrs: number;
  aiIssues: number;
  humanIssues: number;
}

interface ScanResult {
  repo: string;
  scannedAt: string;
  detectedIds: string[];
  weeklyActivity: WeeklyActivity[];
}

interface CacheEntry {
  data: ScanResult;
  expiresAt: number;
}

interface GitTreeEntry {
  path: string;
  type: "blob" | "tree";
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed =
    origin && ALLOWED_ORIGIN_RE.test(origin) ? origin : "https://console.kubestellar.io";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "public, max-age=900",
    Vary: "Origin",
  };
}

function isoWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function lastNWeeks(n: number): string[] {
  const weeks: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i * 7);
    const w = isoWeek(d);
    if (!weeks.includes(w)) weeks.push(w);
  }
  return weeks;
}

function matchesHint(treePaths: Set<string>, hint: DetectionHint): boolean {
  const patterns = Array.isArray(hint.pattern) ? hint.pattern : [hint.pattern];
  for (const pattern of patterns) {
    for (const path of treePaths) {
      if (pattern.endsWith("/")) {
        // Directory pattern: match at root or any subdirectory
        if (
          path.startsWith(pattern) ||
          path === pattern.replace(/\/$/, "") ||
          path.includes(`/${pattern}`)
        )
          return true;
      } else {
        // File pattern: match at root or any subdirectory
        if (
          path === pattern ||
          path.endsWith(`/${pattern}`) ||
          path.startsWith(`${pattern}/`)
        )
          return true;
      }
    }
  }
  return false;
}

function isAIContribution(
  labels: { name: string }[],
  author: string,
): boolean {
  if (AI_AUTHORS.has(author)) return true;
  if (author && author.endsWith("[bot]")) return true;
  return (labels || []).some((l) => l.name === AI_LABEL);
}

// ---------------------------------------------------------------------------
// GitHub API calls
// ---------------------------------------------------------------------------

async function fetchTreePaths(repo: string, token: string): Promise<Set<string>> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const url = `${GITHUB_API}/repos/${repo}/git/trees/HEAD?recursive=1`;
  const res = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  });
  if (!res.ok) {
    if (res.status === 404) throw new Error("Repo not found");
    throw new Error(`GitHub tree API ${res.status}`);
  }
  const data = (await res.json()) as { tree?: GitTreeEntry[] };
  const paths = new Set<string>();
  for (const entry of data.tree || []) {
    paths.add(entry.path);
  }
  return paths;
}

interface SearchItem {
  created_at: string;
  pull_request?: { merged_at?: string | null };
  closed_at?: string | null;
  user: { login: string };
  labels: { name: string }[];
}

async function fetchWeeklyActivity(
  repo: string,
  token: string,
): Promise<WeeklyActivity[]> {
  const weeks = lastNWeeks(WEEKS_OF_HISTORY);
  const buckets = new Map<string, WeeklyActivity>();
  for (const w of weeks) {
    buckets.set(w, {
      week: w,
      aiPrs: 0,
      humanPrs: 0,
      aiIssues: 0,
      humanIssues: 0,
    });
  }

  const since = new Date();
  since.setDate(since.getDate() - WEEKS_OF_HISTORY * 7);
  const sinceStr = since.toISOString().split("T")[0];

  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const prUrl = `${GITHUB_API}/search/issues?q=repo:${repo}+type:pr+created:>=${sinceStr}&per_page=100`;
  const issueUrl = `${GITHUB_API}/search/issues?q=repo:${repo}+type:issue+created:>=${sinceStr}&per_page=100`;

  const [prRes, issueRes] = await Promise.all([
    fetch(prUrl, { headers, signal: AbortSignal.timeout(API_TIMEOUT_MS) }),
    fetch(issueUrl, { headers, signal: AbortSignal.timeout(API_TIMEOUT_MS) }),
  ]);

  if (prRes.ok) {
    const body = (await prRes.json()) as { items?: SearchItem[] };
    for (const item of body.items || []) {
      const week = isoWeek(new Date(item.created_at));
      const b = buckets.get(week);
      if (!b) continue;
      if (isAIContribution(item.labels, item.user.login)) b.aiPrs++;
      else b.humanPrs++;
    }
  }

  if (issueRes.ok) {
    const body = (await issueRes.json()) as { items?: SearchItem[] };
    for (const item of body.items || []) {
      if (item.pull_request) continue;
      const week = isoWeek(new Date(item.created_at));
      const b = buckets.get(week);
      if (!b) continue;
      if (isAIContribution(item.labels, item.user.login)) b.aiIssues++;
      else b.humanIssues++;
    }
  }

  return weeks.map((w) => buckets.get(w)!);
}

// ---------------------------------------------------------------------------
// Demo fallback
// ---------------------------------------------------------------------------

function demoScan(repo: string): ScanResult {
  const weeks = lastNWeeks(WEEKS_OF_HISTORY);
  return {
    repo,
    scannedAt: new Date().toISOString(),
    detectedIds: [
      "acmm:claude-md",
      "acmm:copilot-instructions",
      "acmm:pr-template",
      "acmm:contrib-guide",
      "acmm:style-config",
      "acmm:editor-config",
      "acmm:coverage-gate",
      "acmm:test-suite",
      "acmm:e2e-tests",
      "acmm:ci-matrix",
      "acmm:nightly-compliance",
      "acmm:auto-label",
      "acmm:ai-fix-workflow",
      "acmm:security-ai-md",
      "acmm:public-metrics",
      "acmm:reflection-log",
      "fullsend:test-coverage",
      "fullsend:ci-cd-maturity",
      "aef:structural-gates",
      "aef:session-continuity",
      "claude-reflect:preference-index",
      "claude-reflect:session-summary",
    ],
    weeklyActivity: weeks.map((w, i) => ({
      week: w,
      aiPrs: 25 + Math.floor(Math.sin(i) * 5 + 10),
      humanPrs: 4 + Math.floor(Math.cos(i) * 2 + 1),
      aiIssues: 12 + Math.floor(Math.sin(i * 2) * 3),
      humanIssues: 3,
    })),
  };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export default async (req: Request) => {
  const origin = req.headers.get("Origin");
  const headers = corsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  const url = new URL(req.url);
  const repo = url.searchParams.get("repo") || "";

  if (!REPO_RE.test(repo)) {
    return new Response(
      JSON.stringify({ error: "Invalid repo — must be owner/name" }),
      {
        status: 400,
        headers: { ...headers, "Content-Type": "application/json" },
      },
    );
  }

  const token =
    Netlify.env.get("GITHUB_TOKEN") || process.env.GITHUB_TOKEN || "";

  // Check blob cache (per-repo key)
  const store = getStore(CACHE_STORE);
  const cacheKey = `scan:${repo}`;
  try {
    const cached = await store.get(cacheKey, { type: "text" });
    if (cached) {
      const entry: CacheEntry = JSON.parse(cached);
      if (Date.now() < entry.expiresAt) {
        return new Response(
          JSON.stringify({ ...entry.data, fromCache: true }),
          {
            status: 200,
            headers: { ...headers, "Content-Type": "application/json" },
          },
        );
      }
    }
  } catch {
    // cache miss — continue
  }

  // Live scan
  try {
    const [treePaths, weeklyActivity] = await Promise.all([
      fetchTreePaths(repo, token),
      fetchWeeklyActivity(repo, token),
    ]);

    const detectedIds = CRITERIA.filter((c) =>
      matchesHint(treePaths, c.detection),
    ).map((c) => c.id);

    const data: ScanResult = {
      repo,
      scannedAt: new Date().toISOString(),
      detectedIds,
      weeklyActivity,
    };

    const entry: CacheEntry = {
      data,
      expiresAt: Date.now() + CACHE_TTL_MS,
    };
    store.set(cacheKey, JSON.stringify(entry)).catch(() => {});

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (msg === "Repo not found") {
      return new Response(
        JSON.stringify({ error: "Repo not found", detail: repo }),
        {
          status: 404,
          headers: { ...headers, "Content-Type": "application/json" },
        },
      );
    }
    console.error("[acmm-scan] Fetch error:", msg);
    // Degrade to demo data rather than failing the card
    return new Response(
      JSON.stringify({ ...demoScan(repo), demoFallback: true, error: msg }),
      {
        status: 200,
        headers: { ...headers, "Content-Type": "application/json" },
      },
    );
  }
};

export const config = {
  path: "/api/acmm/scan",
};
