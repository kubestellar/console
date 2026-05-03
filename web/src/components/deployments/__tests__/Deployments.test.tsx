/**
 * Deployments component smoke tests
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en', changeLanguage: vi.fn() } }),
}))

vi.mock('../../../hooks/useMCP', () => ({
  useClusters: () => ({
    clusters: [], deduplicatedClusters: [], isLoading: false, isRefreshing: false,
    lastUpdated: null, refetch: vi.fn(), error: null,
  }),
}))

vi.mock('../../../hooks/useCachedData', () => ({
  useCachedDeployments: () => ({
    deployments: [], isLoading: false, isRefreshing: false,
    lastRefresh: null, refetch: vi.fn(), error: null,
  }),
  useCachedDeploymentIssues: () => ({
    issues: [], refetch: vi.fn(), error: null,
  }),
  useCachedPodIssues: () => ({
    issues: [], error: null,
  }),
}))

vi.mock('../../../hooks/useGlobalFilters', () => ({
  useGlobalFilters: () => ({
    selectedClusters: [], isAllClustersSelected: true,
  }),
}))

vi.mock('../../../hooks/useDrillDown', () => ({
  useDrillDownActions: () => ({
    drillToAllDeployments: vi.fn(), drillToAllPods: vi.fn(),
  }),
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

vi.mock('../../../lib/dashboards/DashboardPage', () => ({
  DashboardPage: ({ children }: { children?: React.ReactNode }) => <div data-testid="dashboard-page">{children}</div>,
}))

/** Timeout for importing heavy modules */
const IMPORT_TIMEOUT_MS = 30000

describe('Deployments', () => {
  it('exports Deployments component', async () => {
    const mod = await import('../Deployments')
    expect(mod.Deployments).toBeDefined()
  }, IMPORT_TIMEOUT_MS)
})
