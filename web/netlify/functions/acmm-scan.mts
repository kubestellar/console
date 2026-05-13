/**
 * Netlify Function: ACMM Scan
 *
 * Scans any GitHub repo and returns detected criteria from the multi-source
 * ACMM registry plus weekly AI-vs-human contribution activity. Powers the
 * /acmm dashboard's four cards.
 *
 * Input:  ?repo=owner/repo&force=true
 *         (`force` bypasses cache *reads*; on a successful live scan the
 *         cached entry is refreshed. Demo-fallback responses are not
 *         cached, and all writes are best-effort — `store.set()` errors
 *         are swallowed so a blob-store outage never fails the request.)
 *
 * Response body (JSON) — discriminated by HTTP status, and for 200 also
 * by the `demoFallback` / `fromCache` flags (both 200 shapes share the
 * same status code):
 *
 *   200 live/cache-hit:
 *     { repo, scannedAt, detectedIds, weeklyActivity, fromCache? }
 *     (`fromCache: true` iff served from blob cache; omitted on a live scan)
 *
 *   200 demo fallback (live fetch failed — soft degradation):
 *     { repo, scannedAt, detectedIds, weeklyActivity, demoFallback: true, error }
 *
 *   400 invalid repo slug:   { error: "Invalid repo — must be owner/name" }
 *   404 repo not found:      { error: "Repo not found" }
 *   405 non-GET method:      { error: "Method not allowed" }
 *   204 OPTIONS preflight:   (no body — CORS only)
 *
 * Field notes:
 *   - detectedIds: array of criterion IDs (source-prefixed) matched against
 *     the repo tree. Frontend computes ACMM level + role + recommendations
 *     from this. Field is named `detectedIds`, not `detectedLoops`, because
 *     the registry includes non-loop criteria from non-ACMM sources.
 *   - weeklyActivity: 16 weeks of WeeklyActivity entries —
 *     `{ week, aiPrs, humanPrs, aiIssues, humanIssues }`. `week` is an ISO
 *     `YYYY-Www` bucket. Counts are split AI vs human by `isAIContribution`:
 *     item is AI if the author login is in `AI_AUTHORS`, OR ends in `[bot]`,
 *     OR any attached label is `ai-generated` — human otherwise.
 *   - fromCache: true on cache-hit 200 responses; omitted on live and demo.
 *   - demoFallback: true only on the 200 demo-fallback path; omitted
 *     otherwise.
 *   - error (200 demo fallback): upstream GitHub error message so the UI
 *     can surface it (rate-limited, network error, etc.) while still
 *     rendering the demo catalog.
 *   - error (400/404/405): short description of why the request was
 *     rejected; never combined with the scan fields above.
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
/**
 * Per-repo cache TTL: 1 hour. Scans are expensive (full repo tree fetch) and
 * the maturity signal changes on the order of days, not minutes. Aligned with
 * the badge function's `cacheSeconds: 3600` so badge re-fetches almost always
 * land on a warm blob and never re-hit GitHub.
 */
const CACHE_TTL_MS = 60 * 60 * 1000;
/** Request timeout for GitHub API calls */
const API_TIMEOUT_MS = 15_000;
/** How many weeks of contribution history to return */
const WEEKS_OF_HISTORY = 16;
/** Valid repo slug: owner/name with ASCII letters, digits, underscores, dots, dashes */
const REPO_RE = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/;
const UNKNOWN_REPO = "unknown/repo";
/** Allowed CORS origins (exact match) */
const ALLOWED_ORIGINS = [
  "https://console.kubestellar.io",
  "https://kubestellar.io",
  "https://www.kubestellar.io",
];
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
  // ACMM L0 — Prerequisites (soft indicator, not gating)
  { id: "acmm:prereq-test-suite", source: "acmm", level: 0, category: "prerequisite", name: "Test suite", detection: { type: "any-of", pattern: ["vitest.config.ts", "vitest.config.js", "jest.config.js", "jest.config.ts", "go.mod", "pytest.ini", "pyproject.toml", "test/", "tests/", "__tests__/", "spec/"] } },
  { id: "acmm:prereq-e2e", source: "acmm", level: 0, category: "prerequisite", name: "E2E tests", detection: { type: "any-of", pattern: ["playwright.config.ts", "playwright.config.js", "cypress.config.ts", "e2e/"] } },
  { id: "acmm:prereq-cicd", source: "acmm", level: 0, category: "prerequisite", name: "CI/CD pipeline", detection: { type: "any-of", pattern: [".github/workflows/", ".gitlab-ci.yml", "Jenkinsfile", ".circleci/"] } },
  { id: "acmm:prereq-pr-template", source: "acmm", level: 0, category: "prerequisite", name: "PR template", detection: { type: "any-of", pattern: [".github/pull_request_template.md", ".github/PULL_REQUEST_TEMPLATE.md"] } },
  { id: "acmm:prereq-issue-template", source: "acmm", level: 0, category: "prerequisite", name: "Issue templates", detection: { type: "any-of", pattern: [".github/ISSUE_TEMPLATE/", ".github/issue_template.md"] } },
  { id: "acmm:prereq-contrib-guide", source: "acmm", level: 0, category: "prerequisite", name: "Contributing guide", detection: { type: "any-of", pattern: ["CONTRIBUTING.md", "docs/contributing.md", ".github/CONTRIBUTING.md"] } },
  { id: "acmm:prereq-code-style", source: "acmm", level: 0, category: "prerequisite", name: "Code style config", detection: { type: "any-of", pattern: [".eslintrc", ".eslintrc.json", ".eslintrc.js", "eslint.config.js", "eslint.config.mjs", ".prettierrc", ".prettierrc.json", "prettier.config.js", "ruff.toml", ".golangci.yml", "biome.json"] } },
  { id: "acmm:prereq-coverage-gate", source: "acmm", level: 0, category: "prerequisite", name: "Coverage gate", detection: { type: "any-of", pattern: ["codecov.yml", ".codecov.yml", ".github/workflows/coverage-gate.yml", "coverage.yml", ".coverage-thresholds.json"] } },

  // ACMM L2 — Instructed
  { id: "acmm:claude-md", source: "acmm", level: 2, category: "feedback-loop", name: "CLAUDE.md instruction file", detection: { type: "any-of", pattern: ["CLAUDE.md", ".claude/CLAUDE.md"] } },
  { id: "acmm:copilot-instructions", source: "acmm", level: 2, category: "feedback-loop", name: "Copilot instructions", detection: { type: "path", pattern: ".github/copilot-instructions.md" } },
  { id: "acmm:agents-md", source: "acmm", level: 2, category: "feedback-loop", name: "AGENTS.md", detection: { type: "path", pattern: "AGENTS.md" } },
  { id: "acmm:cursor-rules", source: "acmm", level: 2, category: "feedback-loop", name: "Cursor rules", detection: { type: "any-of", pattern: [".cursorrules", ".cursor/rules"] } },
  { id: "acmm:prompts-catalog", source: "acmm", level: 2, category: "feedback-loop", name: "Prompts catalog", detection: { type: "any-of", pattern: ["prompts/", ".prompts/", "docs/prompts/", ".github/prompts/", ".github/agents/"] } },
  { id: "acmm:editor-config", source: "acmm", level: 2, category: "feedback-loop", name: "EditorConfig", detection: { type: "path", pattern: ".editorconfig" } },
  { id: "acmm:simple-skills", source: "acmm", level: 2, category: "feedback-loop", name: "Simple skills", detection: { type: "any-of", pattern: [".claude/skills/", ".claude/commands/", "skills/"] } },
  { id: "acmm:correction-capture", source: "acmm", level: 2, category: "learning", name: "Correction capture", detection: { type: "any-of", pattern: [".claude/memory/", ".memory/", "corrections.jsonl"] } },

  // ACMM L3 — Measured / Enforced
  { id: "acmm:pr-acceptance-metric", source: "acmm", level: 3, category: "feedback-loop", name: "PR acceptance metric", detection: { type: "any-of", pattern: ["scripts/build-accm-history.mjs", ".github/workflows/accm-history-update.yml", "scripts/pr-metrics.mjs", ".github/workflows/pr-metrics.yml", "docs/metrics.md"] } },
  { id: "acmm:pr-review-rubric", source: "acmm", level: 3, category: "feedback-loop", name: "PR review rubric", detection: { type: "any-of", pattern: [".github/workflows/review.yml", "docs/review-rubric.md", ".github/review-checklist.md", ".github/prompts/review.md", "docs/qa/"] } },
  { id: "acmm:quality-dashboard", source: "acmm", level: 3, category: "observability", name: "Quality dashboard", detection: { type: "any-of", pattern: ["public/analytics.js", "web/public/analytics.js", "web/src/components/analytics/", "docs/quality.md", ".github/workflows/quality-report.yml", "docs/AI-QUALITY-ASSURANCE.md", "web/app.py", "web/blueprints/", "web/watchtower/"] } },
  { id: "acmm:ci-matrix", source: "acmm", level: 3, category: "feedback-loop", name: "CI test matrix", detection: { type: "any-of", pattern: [".github/workflows/ci.yml", ".github/workflows/test.yml", ".github/workflows/build.yml", ".github/workflows/build-deploy.yml"] } },
  { id: "acmm:layered-safety", source: "acmm", level: 3, category: "governance", name: "Layered safety model", detection: { type: "any-of", pattern: [".claude/settings.json", ".claude/settings.local.json"] } },
  { id: "acmm:mechanical-enforcement", source: "acmm", level: 3, category: "governance", name: "Mechanical enforcement", detection: { type: "any-of", pattern: [".claude/settings.json"] } },
  { id: "acmm:session-summary", source: "acmm", level: 3, category: "learning", name: "Session summary artifact", detection: { type: "any-of", pattern: [".claude/session-summary.md", ".claude/checkpoint.md"] } },
  { id: "acmm:structural-gates", source: "acmm", level: 3, category: "traceability", name: "Structural gates", detection: { type: "any-of", pattern: [".claude/settings.json"] } },

  // ACMM L4 — Adaptive / Structured
  { id: "acmm:auto-qa-tuning", source: "acmm", level: 4, category: "self-tuning", name: "Auto-QA self-tuning", detection: { type: "any-of", pattern: [".github/auto-qa-tuning.json", ".github/workflows/auto-qa.yml", "scripts/auto-qa-tuner.mjs"] } },
  { id: "acmm:nightly-compliance", source: "acmm", level: 4, category: "feedback-loop", name: "Nightly compliance", detection: { type: "any-of", pattern: [".github/workflows/nightly-compliance.yml", ".github/workflows/nightly.yml", ".github/workflows/nightly-test.yml", ".github/workflows/nightly-test-suite.yml", ".context/cron/", "cron-registry.yaml"] } },
  { id: "acmm:copilot-review-apply", source: "acmm", level: 4, category: "feedback-loop", name: "Automated review application", detection: { type: "any-of", pattern: [".github/workflows/copilot-review-apply.yml", ".github/workflows/apply-copilot.yml", ".github/workflows/ai-fix.yml", ".github/workflows/auto-review.yml"] } },
  { id: "acmm:auto-label", source: "acmm", level: 4, category: "feedback-loop", name: "Automated issue labeling", detection: { type: "any-of", pattern: [".github/labeler.yml", ".github/workflows/labeler.yml", ".github/workflows/triage.yml"] } },
  { id: "acmm:ai-fix-workflow", source: "acmm", level: 4, category: "feedback-loop", name: "AI-fix-requested workflow", detection: { type: "any-of", pattern: [".github/workflows/ai-fix.yml", ".github/workflows/ai-fix-requested.yml", ".github/workflows/claude.yml"] } },
  { id: "acmm:tier-classifier", source: "acmm", level: 4, category: "governance", name: "Change classification", detection: { type: "any-of", pattern: [".github/workflows/tier-classifier.yml", "docs/risk-tiers.md", ".github/risk-tiers.yml", ".github/workflows/pr-size.yml"] } },
  { id: "acmm:security-ai-md", source: "acmm", level: 4, category: "governance", name: "AI security policy", detection: { type: "any-of", pattern: ["docs/security/SECURITY-AI.md", "SECURITY-AI.md", "docs/SECURITY-AI.md"] } },
  { id: "acmm:session-continuity", source: "acmm", level: 4, category: "learning", name: "Session continuity", detection: { type: "any-of", pattern: [".claude/checkpoint.md", ".claude/session-summary.md"] } },
  { id: "acmm:cross-session-knowledge", source: "acmm", level: 4, category: "learning", name: "Cross-session knowledge", detection: { type: "any-of", pattern: ["knowledge.jsonl", ".knowledge/", "docs/reflections/"] } },

  // ACMM L5 — Automated / Self-Sustaining
  { id: "acmm:github-actions-ai", source: "acmm", level: 5, category: "feedback-loop", name: "GitHub Actions AI integration", detection: { type: "any-of", pattern: [".github/workflows/claude.yml", ".github/workflows/claude-code-review.yml"] } },
  { id: "acmm:auto-qa-self-tuning", source: "acmm", level: 5, category: "self-tuning", name: "Auto-QA with self-tuning", detection: { type: "any-of", pattern: [".github/workflows/auto-qa.yml", ".github/auto-qa-tuning.json"] } },
  { id: "acmm:public-metrics", source: "acmm", level: 5, category: "observability", name: "Public metrics", detection: { type: "any-of", pattern: ["web/netlify/functions/analytics-accm.mts", "web/public/analytics.js", "docs/metrics/"] } },
  { id: "acmm:policy-as-code", source: "acmm", level: 5, category: "governance", name: "Policy-as-code", detection: { type: "any-of", pattern: ["policies/", ".github/policies/", "kyverno/", "conftest.yaml", "opa/"] } },
  { id: "acmm:reflection-log", source: "acmm", level: 5, category: "feedback-loop", name: "Reflection log", detection: { type: "any-of", pattern: [".claude/reflections/", "memory/", ".memory/", "docs/reflections/", "REFLECTIONS.md"] } },

  // ACMM L6 — Autonomous (moved from old L5 + new items)
  { id: "acmm:auto-issue-gen", source: "acmm", level: 6, category: "autonomy", name: "Auto issue generation", detection: { type: "any-of", pattern: [".github/workflows/auto-issues.yml", ".github/workflows/auto-issue.yml", ".github/workflows/issue-gen.yml", ".github/workflows/auto-generate-issues.yml", "scripts/generate-issues.mjs"] } },
  { id: "acmm:multi-agent-orchestration", source: "acmm", level: 6, category: "autonomy", name: "Multi-agent orchestration", detection: { type: "any-of", pattern: [".github/workflows/dispatcher.yml", ".github/workflows/orchestrate.yml", "scripts/orchestrate.mjs", "docs/multi-agent.md", ".claude/dispatcher/", "orchestrator/", ".mcp.json", "agents/dispatch/", ".framework.yaml"] } },
  { id: "acmm:strategic-dashboard", source: "acmm", level: 6, category: "observability", name: "Strategic dashboard", detection: { type: "any-of", pattern: ["web/src/components/acmm/", "docs/strategy.md", ".github/workflows/strategy-report.yml", "docs/autonomous-work-log.md"] } },
  { id: "acmm:merge-queue", source: "acmm", level: 6, category: "autonomy", name: "Merge queue", detection: { type: "any-of", pattern: [".github/workflows/merge-queue.yml", ".github/merge-queue.yml", ".prow.yaml", "tide.yaml"] } },
  { id: "acmm:risk-assessment-config", source: "acmm", level: 6, category: "governance", name: "Risk assessment config", detection: { type: "any-of", pattern: ["risk-config.json", ".claude/risk-config.json", ".github/risk-assessment.yml", ".fabric/subsystems.yaml", ".fabric/components/", "agents/fabric/"] } },
  { id: "acmm:observability-runbook", source: "acmm", level: 6, category: "governance", name: "Observability runbook", detection: { type: "any-of", pattern: ["docs/ai-ops-runbook.md", "docs/runbook/", "RUNBOOK.md"] } },

  // Fullsend
  { id: "fullsend:test-coverage", source: "fullsend", category: "readiness", name: "Test coverage threshold", detection: { type: "any-of", pattern: ["codecov.yml", ".codecov.yml", "coverage.yml", ".github/workflows/coverage-gate.yml"] } },
  { id: "fullsend:ci-cd-maturity", source: "fullsend", category: "readiness", name: "CI/CD pipeline", detection: { type: "any-of", pattern: [".github/workflows/"] } },
  { id: "fullsend:auto-merge-policy", source: "fullsend", category: "autonomy", name: "Auto-merge policy", detection: { type: "any-of", pattern: [".github/auto-merge.yml", ".prow.yaml", "tide.yaml", ".github/workflows/auto-merge.yml"] } },
  { id: "fullsend:branch-protection-doc", source: "fullsend", category: "governance", name: "Branch protection doc", detection: { type: "any-of", pattern: ["docs/branch-protection.md", "docs/governance.md", ".github/branch-protection.yml"] } },
  { id: "fullsend:production-feedback", source: "fullsend", category: "observability", name: "Production feedback", detection: { type: "any-of", pattern: ["monitoring/", "grafana/", ".github/workflows/post-deploy-check.yml", "scripts/production-feedback.mjs"] } },
  { id: "fullsend:observability-runbook", source: "fullsend", category: "observability", name: "Observability runbook", detection: { type: "any-of", pattern: ["docs/runbook.md", "docs/runbooks/", "RUNBOOK.md", "docs/operations/"] } },
  { id: "fullsend:risk-assessment", source: "fullsend", category: "autonomy", name: "Risk assessment config", detection: { type: "any-of", pattern: [".github/risk-assessment.yml", "docs/risk-tiers.md", ".github/workflows/tier-classifier.yml"] } },
  { id: "fullsend:rollback-drill", source: "fullsend", category: "readiness", name: "Rollback drill", detection: { type: "any-of", pattern: ["docs/rollback.md", ".github/workflows/rollback.yml", "scripts/rollback.sh"] } },

  // Agentic Engineering Framework
  { id: "aef:task-traceability", source: "agentic-engineering-framework", category: "governance", name: "Task traceability", detection: { type: "any-of", pattern: [".agent/tasks/", "docs/agent-tasks/", ".github/agent-log/", "agent-tasks.md", ".tasks/active/", ".tasks/completed/", ".tasks/templates/", ".context/episodic/"] } },
  { id: "aef:structural-gates", source: "agentic-engineering-framework", category: "governance", name: "Structural gates", detection: { type: "any-of", pattern: ["CODEOWNERS", ".github/CODEOWNERS", ".agent/boundaries.yml", "docs/agent-boundaries.md", "policy/escalation-patterns.yaml", ".context/bypass-log.yaml"] } },
  { id: "aef:session-continuity", source: "agentic-engineering-framework", category: "governance", name: "Session continuity", detection: { type: "any-of", pattern: ["CLAUDE.md", "AGENTS.md", ".cursorrules", ".github/copilot-instructions.md", "docs/agent-context.md", "CONTEXT.md", ".context/handovers/", ".context/working/", ".context/project/", ".context/sessions/"] } },
  { id: "aef:audit-trail", source: "agentic-engineering-framework", category: "governance", name: "Audit trail workflow", detection: { type: "any-of", pattern: [".github/workflows/ai-audit.yml", ".github/workflows/agent-audit.yml", "scripts/ai-audit-report.mjs", ".context/audits/", ".context/cron/", ".context/cron-registry.yaml", "action.yml"] } },
  { id: "aef:cross-tool-config", source: "agentic-engineering-framework", category: "governance", name: "Cross-tool agent config", detection: { type: "any-of", pattern: ["AGENTS.md", "docs/ai-contributors.md", ".github/ai-config.yml"] } },
  { id: "aef:change-classification", source: "agentic-engineering-framework", category: "governance", name: "Change classification", detection: { type: "any-of", pattern: ["docs/change-classification.md", ".github/change-tiers.yml", "docs/risk-tiers.md", "policy/anti-patterns.yaml", "policy/escalation-patterns.yaml"] } },
  { id: "aef:component-fabric", source: "agentic-engineering-framework", category: "governance", name: "Component dependency fabric", detection: { type: "any-of", pattern: [".fabric/subsystems.yaml", ".fabric/components/", ".fabric/watch-patterns.yaml", "agents/fabric/"] } },

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

/** Validate CORS origin via URL-parsed hostname check */
function corsOrigin(origin: string | null): string {
  if (!origin) return ALLOWED_ORIGINS[0];
  if (ALLOWED_ORIGINS.includes(origin)) return origin;
  try {
    const host = new URL(origin).hostname.toLowerCase();
    if (host === "localhost") return origin;
    if (host === "kubestellar.io" || host.endsWith(".kubestellar.io")) return origin;
  } catch { /* invalid URL */ }
  return ALLOWED_ORIGINS[0];
}

function corsHeaders(origin: string | null): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": corsOrigin(origin),
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

  // Resolve the default branch first — the trees endpoint accepts a branch
  // name or commit SHA, NOT "HEAD" (HEAD is git-CLI shorthand, not REST).
  // #8271.
  const repoRes = await fetch(`${GITHUB_API}/repos/${repo}`, {
    headers,
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  });
  if (!repoRes.ok) {
    if (repoRes.status === 404) throw new Error("Repo not found");
    throw new Error(`GitHub repo API ${repoRes.status}`);
  }
  const repoInfo = (await repoRes.json()) as { default_branch?: string };
  const branch = repoInfo.default_branch || "main";

  const url = `${GITHUB_API}/repos/${repo}/git/trees/${branch}?recursive=1`;
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

  const prItems = await searchAllPages(
    `${GITHUB_API}/search/issues?q=repo:${repo}+type:pr+created:>=${sinceStr}`,
    headers,
  );
  for (const item of prItems) {
    const week = isoWeek(new Date(item.created_at));
    const b = buckets.get(week);
    if (!b) continue;
    if (isAIContribution(item.labels, item.user.login)) b.aiPrs++;
    else b.humanPrs++;
  }

  const issueItems = await searchAllPages(
    `${GITHUB_API}/search/issues?q=repo:${repo}+type:issue+created:>=${sinceStr}`,
    headers,
  );
  for (const item of issueItems) {
    if (item.pull_request) continue;
    const week = isoWeek(new Date(item.created_at));
    const b = buckets.get(week);
    if (!b) continue;
    if (isAIContribution(item.labels, item.user.login)) b.aiIssues++;
    else b.humanIssues++;
  }

  return weeks.map((w) => buckets.get(w)!);
}

/** GitHub Search API caps at 1000 results (10 pages × 100). Walk all pages. */
const SEARCH_PAGE_SIZE = 100;
const SEARCH_MAX_PAGES = 10;

async function searchAllPages(
  baseUrl: string,
  headers: Record<string, string>,
): Promise<SearchItem[]> {
  const items: SearchItem[] = [];
  for (let page = 1; page <= SEARCH_MAX_PAGES; page++) {
    const url = `${baseUrl}&per_page=${SEARCH_PAGE_SIZE}&page=${page}`;
    const res = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });
    if (!res.ok) break;
    const body = (await res.json()) as { items?: SearchItem[] };
    const pageItems = body.items || [];
    items.push(...pageItems);
    if (pageItems.length < SEARCH_PAGE_SIZE) break;
  }
  return items;
}

// ---------------------------------------------------------------------------
// Demo fallback
// ---------------------------------------------------------------------------

function demoScan(repo: string): ScanResult {
  const weeks = lastNWeeks(WEEKS_OF_HISTORY);
  const safeRepo = REPO_RE.test(repo) ? repo : UNKNOWN_REPO;
  // Issue #8978: match the current CRITERIA IDs so the demo fallback
  // doesn't compute down to L1 for repos that are clearly at a higher
  // maturity level (e.g. kubestellar/console is L5 in reality). The IDs
  // here must track CRITERIA[].id above; sync both when IDs change.
  return {
    repo: safeRepo,
    scannedAt: new Date().toISOString(),
    detectedIds: [
      "acmm:prereq-test-suite",
      "acmm:prereq-e2e",
      "acmm:prereq-cicd",
      "acmm:prereq-pr-template",
      "acmm:prereq-issue-template",
      "acmm:prereq-contrib-guide",
      "acmm:prereq-code-style",
      "acmm:prereq-coverage-gate",
      "acmm:claude-md",
      "acmm:copilot-instructions",
      "acmm:agents-md",
      "acmm:prompts-catalog",
      "acmm:editor-config",
      "acmm:pr-acceptance-metric",
      "acmm:pr-review-rubric",
      "acmm:quality-dashboard",
      "acmm:ci-matrix",
      "acmm:auto-qa-tuning",
      "acmm:nightly-compliance",
      "acmm:auto-label",
      "acmm:ai-fix-workflow",
      "acmm:tier-classifier",
      "acmm:security-ai-md",
      "acmm:github-actions-ai",
      "acmm:auto-qa-self-tuning",
      "acmm:public-metrics",
      "acmm:policy-as-code",
      "acmm:strategic-dashboard",
      "fullsend:test-coverage",
      "fullsend:ci-cd-maturity",
      "aef:session-continuity",
      "aef:cross-tool-config",
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
  /** User-triggered refresh: bypass the blob cache read (still writes a new entry). */
  const force = url.searchParams.get("force") === "true";

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

  // Check blob cache (per-repo key) — skipped when ?force=true
  const store = getStore(CACHE_STORE);
  const cacheKey = `scan:${repo}`;
  if (!force) {
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
    store.set(cacheKey, JSON.stringify(entry)).catch((err) => { console.warn("[acmm-scan] blob cache write failed:", err instanceof Error ? err.message : err) });

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (msg === "Repo not found") {
      return new Response(
        JSON.stringify({ error: "Repo not found" }),
        {
          status: 404,
          headers: { ...headers, "Content-Type": "application/json" },
        },
      );
    }
    console.error("[acmm-scan] Fetch error:", msg);
    // Degrade to demo data rather than failing the card
    return new Response(
      JSON.stringify({ ...demoScan(repo), demoFallback: true, error: "Scan temporarily unavailable" }),
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
