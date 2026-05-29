import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const mockUseCachedDeployments = vi.fn()
const mockUseCachedDeploymentIssues = vi.fn()
const mockUseCachedPodIssues = vi.fn()
const mockUseClusters = vi.fn()
const mockUseGlobalFilters = vi.fn()
const mockUseDrillDownActions = vi.fn()

vi.mock('../../../hooks/useMCP', () => ({
  useClusters: () => mockUseClusters(),
}))

vi.mock('../../../hooks/useCachedData', () => ({
  useCachedDeployments: () => mockUseCachedDeployments(),
  useCachedDeploymentIssues: () => mockUseCachedDeploymentIssues(),
  useCachedPodIssues: () => mockUseCachedPodIssues(),
}))

vi.mock('../../../hooks/useGlobalFilters', () => ({
  useGlobalFilters: () => mockUseGlobalFilters(),
}))

vi.mock('../../../hooks/useDrillDown', () => ({
  useDrillDownActions: () => mockUseDrillDownActions(),
}))

vi.mock('../../../lib/dashboards/DashboardPage', () => ({
  DashboardPage: ({ getStatValue }: { getStatValue: (id: string) => { value: number; sublabel: string } }) => {
    const criticalStat = getStatValue('critical')
    return (
      <div>
        <div data-testid="critical-badge">{criticalStat.value}</div>
        <div data-testid="critical-sublabel">{criticalStat.sublabel}</div>
      </div>
    )
  },
}))

vi.mock('../../../config/dashboards', () => ({
  getDefaultCards: () => [],
  deploymentsDashboardConfig: { storageKey: 'test-deployments-key' },
}))

vi.mock('../../../lib/dashboards/migrateStorageKey', () => ({
  migrateStorageKey: vi.fn(),
}))

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback || key,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}))

vi.mock('../../ui/RotatingTip', () => ({
  RotatingTip: () => null,
}))

import { Deployments } from '../Deployments'

describe('Deployments Badge Count', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseClusters.mockReturnValue({
      clusters: [],
      deduplicatedClusters: [],
      isLoading: false,
      isRefreshing: false,
      lastUpdated: null,
      refetch: vi.fn(),
      error: null,
    })
    mockUseGlobalFilters.mockReturnValue({
      selectedClusters: [],
      isAllClustersSelected: true,
    })
    mockUseDrillDownActions.mockReturnValue({
      drillToAllDeployments: vi.fn(),
      drillToAllPods: vi.fn(),
    })
    mockUseCachedDeployments.mockReturnValue({
      deployments: [],
      isLoading: false,
      isRefreshing: false,
      lastRefresh: null,
      refetch: vi.fn(),
      error: null,
    })
    mockUseCachedDeploymentIssues.mockReturnValue({
      issues: [],
      refetch: vi.fn(),
      error: null,
    })
    mockUseCachedPodIssues.mockReturnValue({
      issues: [],
      error: null,
    })
  })

  it('badge value equals filteredDeploymentIssues.length when deployments are loaded', () => {
    mockUseGlobalFilters.mockReturnValue({
      selectedClusters: ['cluster-1'],
      isAllClustersSelected: false,
    })
    mockUseCachedDeployments.mockReturnValue({
      deployments: [
        { name: 'dep1', namespace: 'default', cluster: 'cluster-1', replicas: 3, readyReplicas: 3 },
        { name: 'dep2', namespace: 'default', cluster: 'cluster-1', replicas: 2, readyReplicas: 1 },
      ],
      isLoading: false,
      isRefreshing: false,
      lastRefresh: null,
      refetch: vi.fn(),
      error: null,
    })
    mockUseCachedDeploymentIssues.mockReturnValue({
      issues: [
        { deployment: 'dep1', cluster: 'cluster-1', severity: 'critical', message: 'Issue 1' },
        { deployment: 'dep2', cluster: 'cluster-1', severity: 'critical', message: 'Issue 2' },
        { deployment: 'dep3', cluster: 'cluster-2', severity: 'critical', message: 'Issue 3' },
      ],
      refetch: vi.fn(),
      error: null,
    })

    render(<Deployments />)

    expect(screen.getByTestId('critical-badge').textContent).toBe('2')
  })

  it('badge value falls back to cachedStats.current.issues when currentTotalDeployments === 0', () => {
    mockUseCachedDeployments.mockReturnValue({
      deployments: [
        { name: 'dep1', namespace: 'default', cluster: 'cluster-1', replicas: 3, readyReplicas: 3 },
      ],
      isLoading: false,
      isRefreshing: false,
      lastRefresh: null,
      refetch: vi.fn(),
      error: null,
    })
    mockUseCachedDeploymentIssues.mockReturnValue({
      issues: [
        { deployment: 'dep1', cluster: 'cluster-1', severity: 'critical', message: 'Issue 1' },
        { deployment: 'dep2', cluster: 'cluster-1', severity: 'critical', message: 'Issue 2' },
      ],
      refetch: vi.fn(),
      error: null,
    })

    const { rerender } = render(<Deployments />)
    expect(screen.getByTestId('critical-badge').textContent).toBe('2')

    mockUseCachedDeployments.mockReturnValue({
      deployments: [],
      isLoading: false,
      isRefreshing: true,
      lastRefresh: null,
      refetch: vi.fn(),
      error: null,
    })
    mockUseCachedDeploymentIssues.mockReturnValue({
      issues: [],
      refetch: vi.fn(),
      error: null,
    })

    rerender(<Deployments />)

    expect(screen.getByTestId('critical-badge').textContent).toBe('2')
  })

  it('badge shows 0 when both live count and cached count are 0', () => {
    render(<Deployments />)

    expect(screen.getByTestId('critical-badge').textContent).toBe('0')
  })

  it('currentIssueCount updates when cluster filter changes', () => {
    mockUseGlobalFilters.mockReturnValue({
      selectedClusters: ['cluster-1'],
      isAllClustersSelected: false,
    })
    mockUseCachedDeployments.mockReturnValue({
      deployments: [
        { name: 'dep1', namespace: 'default', cluster: 'cluster-1', replicas: 3, readyReplicas: 3 },
        { name: 'dep2', namespace: 'default', cluster: 'cluster-2', replicas: 2, readyReplicas: 2 },
      ],
      isLoading: false,
      isRefreshing: false,
      lastRefresh: null,
      refetch: vi.fn(),
      error: null,
    })
    mockUseCachedDeploymentIssues.mockReturnValue({
      issues: [
        { deployment: 'dep1', cluster: 'cluster-1', severity: 'critical', message: 'Issue 1' },
        { deployment: 'dep2', cluster: 'cluster-2', severity: 'critical', message: 'Issue 2' },
        { deployment: 'dep3', cluster: 'cluster-2', severity: 'critical', message: 'Issue 3' },
      ],
      refetch: vi.fn(),
      error: null,
    })

    const { rerender } = render(<Deployments />)
    expect(screen.getByTestId('critical-badge').textContent).toBe('1')

    mockUseGlobalFilters.mockReturnValue({
      selectedClusters: ['cluster-2'],
      isAllClustersSelected: false,
    })

    rerender(<Deployments />)

    expect(screen.getByTestId('critical-badge').textContent).toBe('2')
  })

  it('badge value and stats panel are consistent (both use issueCount variable)', () => {
    mockUseCachedDeployments.mockReturnValue({
      deployments: [
        { name: 'dep1', namespace: 'default', cluster: 'cluster-1', replicas: 3, readyReplicas: 3 },
      ],
      isLoading: false,
      isRefreshing: false,
      lastRefresh: null,
      refetch: vi.fn(),
      error: null,
    })
    mockUseCachedDeploymentIssues.mockReturnValue({
      issues: [
        { deployment: 'dep1', cluster: 'cluster-1', severity: 'critical', message: 'Issue 1' },
        { deployment: 'dep2', cluster: 'cluster-1', severity: 'critical', message: 'Issue 2' },
        { deployment: 'dep3', cluster: 'cluster-1', severity: 'critical', message: 'Issue 3' },
      ],
      refetch: vi.fn(),
      error: null,
    })

    render(<Deployments />)

    expect(screen.getByTestId('critical-badge').textContent).toBe('3')
    expect(screen.getByTestId('critical-sublabel').textContent).toContain('with issues')
  })
})
