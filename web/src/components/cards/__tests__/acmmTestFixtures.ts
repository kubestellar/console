/**
 * Shared fixtures for ACMM card RTL tests (issue #15342).
 * Detected IDs mirror useCachedACMMScan demoScan so level/recommendations match production demo.
 */
import { computeLevel } from '../../../lib/acmm/computeLevel'
import { computeRecommendations } from '../../../lib/acmm/computeRecommendations'
import type { UseACMMScanResult } from '../../../hooks/useCachedACMMScan'
import type { ACMMScanData } from '../../../hooks/useCachedACMMScan'

export const TEST_REPO = 'kubestellar/console'

/** Same seed set as demoScan() in useCachedACMMScan — lands at L5+ in computeLevel. */
export const DEMO_DETECTED_IDS: string[] = [
  'acmm:prereq-test-suite',
  'acmm:prereq-e2e',
  'acmm:prereq-cicd',
  'acmm:prereq-pr-template',
  'acmm:prereq-issue-template',
  'acmm:prereq-contrib-guide',
  'acmm:prereq-code-style',
  'acmm:prereq-coverage-gate',
  'acmm:claude-md',
  'acmm:copilot-instructions',
  'acmm:agents-md',
  'acmm:prompts-catalog',
  'acmm:editor-config',
  'acmm:pr-acceptance-metric',
  'acmm:pr-review-rubric',
  'acmm:quality-dashboard',
  'acmm:ci-matrix',
  'acmm:auto-qa-tuning',
  'acmm:nightly-compliance',
  'acmm:auto-label',
  'acmm:ai-fix-workflow',
  'acmm:tier-classifier',
  'acmm:security-ai-md',
  'acmm:github-actions-ai',
  'acmm:auto-qa-self-tuning',
  'acmm:public-metrics',
  'acmm:policy-as-code',
  'acmm:strategic-dashboard',
  'fullsend:test-coverage',
  'fullsend:ci-cd-maturity',
  'aef:session-continuity',
  'aef:cross-tool-config',
]

export function buildScanData(
  detectedIds: string[] = DEMO_DETECTED_IDS,
  repo: string = TEST_REPO,
): ACMMScanData {
  return {
    repo,
    scannedAt: '2026-05-22T12:00:00.000Z',
    detectedIds,
    weeklyActivity: [],
  }
}

export function buildScanResult(
  overrides: Partial<{
    detectedIds: string[]
    isLoading: boolean
    isRefreshing: boolean
    isDemoData: boolean
    isFailed: boolean
    consecutiveFailures: number
    repo: string
    forceRefetch: () => Promise<void>
  }> = {},
): UseACMMScanResult {
  const detectedList = overrides.detectedIds ?? DEMO_DETECTED_IDS
  const detectedIds = new Set(detectedList)
  const level = computeLevel(detectedIds)
  const recommendations = computeRecommendations(detectedIds, level)
  const data = buildScanData(detectedList, overrides.repo ?? TEST_REPO)

  return {
    data,
    detectedIds,
    level,
    recommendations,
    isLoading: overrides.isLoading ?? false,
    isRefreshing: overrides.isRefreshing ?? false,
    isDemoFallback: overrides.isDemoData ?? false,
    isDemoData: overrides.isDemoData ?? false,
    error: null,
    isFailed: overrides.isFailed ?? false,
    consecutiveFailures: overrides.consecutiveFailures ?? 0,
    lastRefresh: Date.now(),
    refetch: async () => {},
    forceRefetch: overrides.forceRefetch ?? (async () => {}),
  }
}

export function buildACMMContext(
  scanOverrides?: Parameters<typeof buildScanResult>[0],
  targetLevel?: number,
) {
  const scan = buildScanResult(scanOverrides)
  return {
    repo: scan.data.repo,
    setRepo: () => {},
    recentRepos: [TEST_REPO],
    clearRepo: () => {},
    scan,
    introOpen: false,
    openIntro: () => {},
    closeIntro: () => {},
    targetLevel: targetLevel ?? Math.min(6, scan.level.level + 1),
    setTargetLevel: () => {},
  }
}
