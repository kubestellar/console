/**
 * ACMM Scan — Criterion catalog
 *
 * Mirrors web/src/lib/acmm/sources/. Duplicated here because Netlify
 * Functions are self-contained; kept in sync with the frontend catalog
 * manually. See sources/index.ts for source of truth.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DetectionHint {
  type: "path" | "glob" | "any-of";
  pattern: string | string[];
}

export interface Criterion {
  id: string;
  source: string;
  level?: number;
  category: string;
  name: string;
  detection: DetectionHint;
}

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

export const CRITERIA: Criterion[] = [
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
