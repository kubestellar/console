/**
 * Test: critical stat value returned by getStatValue('critical') matches
 * filteredDeploymentIssues.length — regression guard for bug #15906.
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

let mockDeployments: { cluster: string; readyReplicas: number; replicas: number }[] = []
let mockDeploymentIssues: { cluster: string }[] = []

vi.mock('../../../hooks/useCachedData', () => ({
  useCachedDeployments: () => ({
    deployments: mockDeployments,
    isLoading: false, isRefreshing: false, lastRefresh: null, refetch: vi.fn(), error: null,
  }),
  useCachedDeploymentIssues: () => ({ issues: mockDeploymentIssues, refetch: vi.fn(), error: null }),
  useCachedPodIssues: () => ({ issues: [], error: null }),
}))

vi.mock('../../../hooks/useGlobalFilters', () => ({
  useGlobalFilters: () => ({ selectedClusters: [], isAllClustersSelected: true }),
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

let capturedGetStatValue: ((blockId: string) => { value: number }) | null = null

vi.mock('../../../lib/dashboards/DashboardPage', () => ({
  DashboardPage: ({ getStatValue }: { getStatValue: (blockId: string) => { value: number }; children?: ReactNode }) => {
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

describe('Deployments critical issues badge (#15906)', () => {
  beforeEach(() => {
    capturedGetStatValue = null
    mockDeployments = []
    mockDeploymentIssues = []
    vi.resetModules()
  })

  it('critical stat value is 0 when there are no deployment issues', async () => {
    mockDeployments = [{ cluster: 'minikube', readyReplicas: 1, replicas: 1 }]
    mockDeploymentIssues = []
    const { Deployments } = await import('../Deployments')
    render(<Deployments />)
    expect(capturedGetStatValue).not.toBeNull()
    expect(capturedGetStatValue!('critical').value).toBe(0)
  }, IMPORT_TIMEOUT_MS)

  it('critical stat value matches filteredDeploymentIssues.length when issues exist', async () => {
    mockDeployments = [{ cluster: 'minikube', readyReplicas: 1, replicas: 1 }]
    mockDeploymentIssues = [{ cluster: 'minikube' }, { cluster: 'minikube' }]
    const { Deployments } = await import('../Deployments')
    render(<Deployments />)
    expect(capturedGetStatValue).not.toBeNull()
    expect(capturedGetStatValue!('critical').value).toBe(2)
  }, IMPORT_TIMEOUT_MS)

  it('critical stat value does not exceed actual issue count', async () => {
    mockDeployments = [{ cluster: 'minikube', readyReplicas: 1, replicas: 1 }]
    mockDeploymentIssues = [{ cluster: 'minikube' }]
    const { Deployments } = await import('../Deployments')
    render(<Deployments />)
    expect(capturedGetStatValue).not.toBeNull()
    expect(capturedGetStatValue!('critical').value).toBeLessThanOrEqual(mockDeploymentIssues.length)
  }, IMPORT_TIMEOUT_MS)
})
