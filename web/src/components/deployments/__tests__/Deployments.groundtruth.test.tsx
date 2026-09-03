import React from 'react'
/**
 * Test: the groundtruth fields attested by the /deployments stat tiles are
 * computed from the unfiltered deployment listing, not from the
 * cluster-filtered/cached tile values.
 *
 * Regression guard for the live-promote failure where /deployments attested
 * deployments-total=0 (expected 88) and deployments-available=0 (expected 12)
 * while the route still reported routeState='loaded'. The tile values are
 * scoped to the global cluster filter and fall back to a cached value during
 * refresh, so they can legitimately read 0 — and because
 * createMergedStatValueGetter treats 0 as a real value, that 0 won over the
 * unfiltered universal stats instead of falling through to them.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ReactNode } from 'react'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en', changeLanguage: vi.fn() } }),
}))

vi.mock('../../../hooks/useMCP', () => ({
  useClusters: () => ({ clusters: [], deduplicatedClusters: [], isLoading: false, isRefreshing: false, lastUpdated: null, refetch: vi.fn(), error: null }),
}))

type MockDeployment = {
  cluster: string
  readyReplicas: number
  replicas: number
  availableReplicas: number
}

let mockDeployments: MockDeployment[] = []
let mockSelectedClusters: string[] = []
let mockIsAllClustersSelected = true

vi.mock('../../../hooks/useCachedData', () => ({
  useCachedDeployments: () => ({
    deployments: mockDeployments,
    isLoading: false, isRefreshing: false, lastRefresh: null, refetch: vi.fn(), error: null,
  }),
  useCachedDeploymentIssues: () => ({ issues: [], refetch: vi.fn(), error: null }),
  useCachedPodIssues: () => ({ issues: [], error: null }),
}))

vi.mock('../../../hooks/useGlobalFilters', () => ({
  useGlobalFilters: () => ({
    selectedClusters: mockSelectedClusters,
    isAllClustersSelected: mockIsAllClustersSelected,
  }),
}))

vi.mock('../../../hooks/useDrillDown', () => ({
  useDrillDownActions: () => ({ drillToAllDeployments: vi.fn(), drillToAllPods: vi.fn() }),
}))

vi.mock('../../../hooks/useUniversalStats', () => ({
  useUniversalStats: () => ({ getStatValue: vi.fn() }),
  createMergedStatValueGetter: () => vi.fn(),
}))

vi.mock('../../../config/dashboards', () => ({
  getDefaultCards: () => [],
  deploymentsDashboardConfig: { storageKey: 'test-deployments-key' },
}))

vi.mock('../../../lib/dashboards/migrateStorageKey', () => ({
  migrateStorageKey: vi.fn(),
}))

type CapturedStatValue = {
  value: number
  groundtruthFields?: Record<string, string | number | null | undefined>
}

let capturedGetStatValue: ((blockId: string) => CapturedStatValue) | null = null

vi.mock('../../../lib/dashboards/DashboardPage', () => ({
  DashboardPage: ({ getStatValue }: { getStatValue: (blockId: string) => CapturedStatValue; children?: ReactNode }) => {
    capturedGetStatValue = getStatValue
    return <div data-testid="dashboard-page" />
  },
}))

vi.mock('../../ui/RotatingTip', () => ({
  RotatingTip: () => null,
}))

vi.mock('../../PageErrorBoundary', () => ({
  PageErrorBoundary: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

import { render } from '@testing-library/react'

const IMPORT_TIMEOUT_MS = 30000

/** 3 deployments, 2 of which satisfy availableReplicas >= replicas. */
const THREE_DEPLOYMENTS: MockDeployment[] = [
  { cluster: 'ci-1', readyReplicas: 1, replicas: 1, availableReplicas: 1 },
  { cluster: 'ci-2', readyReplicas: 1, replicas: 1, availableReplicas: 1 },
  { cluster: 'ci-3', readyReplicas: 0, replicas: 2, availableReplicas: 0 },
]

// The /deployments dashboard renders the 'namespaces' block relabeled
// "Total Deployments" (see DEPLOYMENTS_STAT_BLOCKS), so that is the block
// that carries the attestation on the live route.
const ATTESTING_BLOCKS = ['namespaces', 'deployments'] as const

describe('Deployments groundtruth attestation', () => {
  beforeEach(() => {
    capturedGetStatValue = null
    mockDeployments = []
    mockSelectedClusters = []
    mockIsAllClustersSelected = true
  })

  it.each(ATTESTING_BLOCKS)('attests unfiltered cluster-wide totals from block %s', async blockId => {
    mockDeployments = THREE_DEPLOYMENTS
    const { Deployments } = await import('../Deployments')
    render(<Deployments />)
    expect(capturedGetStatValue).not.toBeNull()
    expect(capturedGetStatValue!(blockId).groundtruthFields).toEqual({
      'deployments-total': 3,
      'deployments-available': 2,
    })
  }, IMPORT_TIMEOUT_MS)

  it.each(ATTESTING_BLOCKS)('block %s still attests true totals when the cluster filter excludes every deployment', async blockId => {
    mockDeployments = THREE_DEPLOYMENTS
    // A filter selecting a cluster that owns none of the deployments drives the
    // tile value to 0. The attested fields must stay cluster-wide, because the
    // harness compares them against an unfiltered kubectl listing.
    mockIsAllClustersSelected = false
    mockSelectedClusters = ['cluster-with-no-deployments']
    const { Deployments } = await import('../Deployments')
    render(<Deployments />)
    expect(capturedGetStatValue).not.toBeNull()
    const stat = capturedGetStatValue!(blockId)
    expect(stat.value).toBe(0)
    expect(stat.groundtruthFields).toEqual({
      'deployments-total': 3,
      'deployments-available': 2,
    })
  }, IMPORT_TIMEOUT_MS)

  it.each(ATTESTING_BLOCKS)('block %s attests a real zero when no deployments are loaded', async blockId => {
    // Attest 0 rather than suppressing the markers. An earlier revision omitted
    // the fields here, which made the live harness report markerCount: 0 /
    // reason "missing" — strictly less informative than a rendered 0, which
    // states plainly that the page believes there are no deployments. That is
    // the exact condition worth failing on when the listing feed is broken.
    mockDeployments = []
    const { Deployments } = await import('../Deployments')
    render(<Deployments />)
    expect(capturedGetStatValue).not.toBeNull()
    expect(capturedGetStatValue!(blockId).groundtruthFields).toEqual({
      'deployments-total': 0,
      'deployments-available': 0,
    })
  }, IMPORT_TIMEOUT_MS)
})
