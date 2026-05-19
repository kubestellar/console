/**
 * ACMM Scan — Demo fallback data
 */

import { REPO_RE, UNKNOWN_REPO, WEEKS_OF_HISTORY, lastNWeeks } from "./helpers";
import type { ScanResult } from "./helpers";

export function demoScan(repo: string): ScanResult {
  const weeks = lastNWeeks(WEEKS_OF_HISTORY);
  const safeRepo = REPO_RE.test(repo) ? repo : UNKNOWN_REPO;
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
