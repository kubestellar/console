/**
 * ACMM Scan Hook
 *
 * Fetches /api/acmm/scan?repo=owner/repo and returns the card-rules shape.
 * Powers the 4 cards on /acmm. One hook per repo — changing the repo
 * changes the cache key and triggers a fresh fetch.
 */

import { useCallback, useRef } from 'react'
import { useCache, type RefreshCategory } from '../lib/cache'
import { computeLevel, type LevelComputation } from '../lib/acmm/computeLevel'
import { computeRecommendations, type Recommendation } from '../lib/acmm/computeRecommendations'

const API_PATH = '/api/acmm/scan'
/** Scan results change slowly; 10-min refresh avoids GitHub rate limits. */
const REFRESH_CATEGORY: RefreshCategory = 'costs'

export interface WeeklyActivity {
  week: string
  aiPrs: number
  humanPrs: number
  aiIssues: number
  humanIssues: number
}

export interface ACMMScanData {
  repo: string
  scannedAt: string
  detectedIds: string[]
  weeklyActivity: WeeklyActivity[]
}

export interface UseACMMScanResult {
  data: ACMMScanData
  detectedIds: Set<string>
  level: LevelComputation
  recommendations: Recommendation[]
  isLoading: boolean
  isRefreshing: boolean
  isDemoData: boolean
  error: string | null
  isFailed: boolean
  consecutiveFailures: number
  lastRefresh: number | null
  refetch: () => Promise<void>
  /** Bypasses the server blob cache for one fetch — use for user-initiated refresh */
  forceRefetch: () => Promise<void>
}

const DEFAULT_REPO = 'kubestellar/console'

function emptyScan(repo: string): ACMMScanData {
  return {
    repo,
    scannedAt: '',
    detectedIds: [],
    weeklyActivity: [],
  }
}

function demoScan(repo: string): ACMMScanData {
  const WEEKS = 16
  const weeks: WeeklyActivity[] = []
  for (let i = WEEKS - 1; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i * 7)
    const year = d.getUTCFullYear()
    const jan1 = new Date(Date.UTC(year, 0, 1))
    const week = Math.ceil(
      ((d.getTime() - jan1.getTime()) / (24 * 60 * 60 * 1000) + 1) / 7,
    )
    weeks.push({
      week: `${year}-W${String(week).padStart(2, '0')}`,
      aiPrs: 25 + Math.floor(Math.sin(i) * 5 + 10),
      humanPrs: 4 + Math.floor(Math.cos(i) * 2 + 1),
      aiIssues: 12 + Math.floor(Math.sin(i * 2) * 3),
      humanIssues: 3,
    })
  }
  return {
    repo,
    scannedAt: new Date().toISOString(),
    detectedIds: [
      'acmm:claude-md',
      'acmm:copilot-instructions',
      'acmm:pr-template',
      'acmm:contrib-guide',
      'acmm:style-config',
      'acmm:editor-config',
      'acmm:coverage-gate',
      'acmm:test-suite',
      'acmm:e2e-tests',
      'acmm:ci-matrix',
      'acmm:nightly-compliance',
      'acmm:auto-label',
      'acmm:ai-fix-workflow',
      'acmm:security-ai-md',
      'acmm:public-metrics',
      'acmm:reflection-log',
      'fullsend:test-coverage',
      'fullsend:ci-cd-maturity',
      'aef:structural-gates',
      'aef:session-continuity',
      'claude-reflect:preference-index',
      'claude-reflect:session-summary',
    ],
    weeklyActivity: weeks,
  }
}

async function fetchACMMScan(repo: string, force: boolean): Promise<ACMMScanData> {
  const qs = force ? `&force=true` : ''
  const res = await fetch(`${API_PATH}?repo=${encodeURIComponent(repo)}${qs}`)
  if (!res.ok) {
    throw new Error(`ACMM scan failed: ${res.status} ${res.statusText}`)
  }
  const body = (await res.json()) as ACMMScanData & { demoFallback?: boolean }
  return body
}

export function useCachedACMMScan(repo: string = DEFAULT_REPO): UseACMMScanResult {
  /** Set to true for the next fetch to bypass the server blob cache (user-triggered refresh). */
  const forceNextRef = useRef(false)

  const cacheResult = useCache<ACMMScanData>({
    key: `acmm:scan:${repo}`,
    category: REFRESH_CATEGORY,
    initialData: emptyScan(repo),
    demoData: demoScan(repo),
    fetcher: () => {
      const force = forceNextRef.current
      forceNextRef.current = false
      return fetchACMMScan(repo, force)
    },
    liveInDemoMode: true,
  })

  const refetch = cacheResult.refetch
  const forceRefetch = useCallback(async () => {
    forceNextRef.current = true
    await refetch()
  }, [refetch])

  const detectedIds = new Set(cacheResult.data.detectedIds ?? [])
  const level = computeLevel(detectedIds)
  const recommendations = computeRecommendations(detectedIds, level)

  const isDemoData =
    cacheResult.isDemoFallback && !cacheResult.isLoading

  return {
    data: cacheResult.data,
    detectedIds,
    level,
    recommendations,
    isLoading: cacheResult.isLoading,
    isRefreshing: cacheResult.isRefreshing,
    isDemoData,
    error: cacheResult.error,
    isFailed: cacheResult.isFailed,
    consecutiveFailures: cacheResult.consecutiveFailures,
    lastRefresh: cacheResult.lastRefresh,
    refetch: cacheResult.refetch,
    forceRefetch,
  }
}
