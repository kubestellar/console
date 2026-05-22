/**
 * Shared fixtures for ACMM card RTL tests (issue #15342).
 * Detected IDs mirror useCachedACMMScan demoScan so level/recommendations match production demo.
 */
import { computeLevel } from '../../../lib/acmm/computeLevel'
import { computeRecommendations } from '../../../lib/acmm/computeRecommendations'
import type { Recommendation } from '../../../lib/acmm/computeRecommendations'
import type { ACMMScanData, UseACMMScanResult } from '../../../hooks/useCachedACMMScan'

export const TEST_REPO = 'kubestellar/console'

/** Fixed timestamps — avoids non-determinism from Date.now() in fixtures. */
export const FIXTURE_SCANNED_AT = '2026-05-22T12:00:00.000Z'
export const FIXTURE_LAST_REFRESH_MS = Date.parse(FIXTURE_SCANNED_AT)

/** Same seed set as demoScan() in useCachedACMMScan — lands at L4+ in computeLevel. */
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
    scannedAt: FIXTURE_SCANNED_AT,
    detectedIds,
    weeklyActivity: [],
  }
}

export function buildScanResult(
  overrides: Partial<{
    detectedIds: string[]
    recommendations: Recommendation[]
    isLoading: boolean
    isRefreshing: boolean
    isDemoData: boolean
    isDemoFallback: boolean
    isFailed: boolean
    consecutiveFailures: number
    lastRefresh: number | null
    repo: string
    forceRefetch: () => Promise<void>
  }> = {},
): UseACMMScanResult {
  const detectedList = overrides.detectedIds ?? DEMO_DETECTED_IDS
  const detectedIds = new Set(detectedList)
  const level = computeLevel(detectedIds)
  const recommendations =
    overrides.recommendations ?? computeRecommendations(detectedIds, level)
  const data = buildScanData(detectedList, overrides.repo ?? TEST_REPO)
  const isDemoData = overrides.isDemoData ?? false
  const isDemoFallback = overrides.isDemoFallback ?? isDemoData

  return {
    data,
    detectedIds,
    level,
    recommendations,
    isLoading: overrides.isLoading ?? false,
    isRefreshing: overrides.isRefreshing ?? false,
    isDemoFallback,
    isDemoData,
    error: null,
    isFailed: overrides.isFailed ?? false,
    consecutiveFailures: overrides.consecutiveFailures ?? 0,
    lastRefresh: overrides.lastRefresh ?? FIXTURE_LAST_REFRESH_MS,
    refetch: async () => {},
    forceRefetch: overrides.forceRefetch ?? (async () => {}),
  }
}

export function buildACMMContext(
  scanOverrides?: Parameters<typeof buildScanResult>[0],
  targetLevel?: number,
) {
  const scan = buildScanResult(scanOverrides)
  return buildACMMContextFromScan(scan, targetLevel)
}

/** Use when tests need the same scan instance for assertions and mocked context. */
export function buildACMMContextFromScan(
  scan: UseACMMScanResult,
  targetLevel?: number,
) {
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
