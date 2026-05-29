import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const mockUseCachedDeployments = vi.fn()
const mockUseCachedDeploymentIssues = vi.fn()
const mockUseCachedPodIssues = vi.fn()
const mockUseClusters = vi.fn()
const mockUseGlobalFilters = vi.fn()
const mockUseDrillDownActions = vi.fn()

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string, fallback?: string) => fallback ?? key, i18n: { language: 'en', changeLanguage: vi.fn() } }),
}))

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

vi.mock('../../../config/dashboards', () => ({
  getDefaultCards: () => [],
  deploymentsDashboardConfig: { storageKey: 'test-deployments-key' },
}))

vi.mock('../../../lib/dashboards/migrateStorageKey', () => ({
  migrateStorageKey: vi.fn(),
}))

vi.mock('../../../lib/dashboards/DashboardPage', () => ({
  DashboardPage: ({ children, afterTitle, getStatValue }: { children?: React.ReactNode; afterTitle?: React.ReactNode; getStatValue?: (id: string) => { value: number } }) => (
    <div data-testid="dashboard-page">
      <div data-testid="deployment-health-badge">{afterTitle}</div>
      <div data-testid="stat-healthy">{getStatValue?.('healthy')?.value ?? ''}</div>
      <div data-testid="stat-critical">{getStatValue?.('critical')?.value ?? ''}</div>
      <div data-testid="stat-namespaces">{getStatValue?.('namespaces')?.value ?? ''}</div>
      {children}
    </div>
  ),
}))

import { Deployments } from '../Deployments'

describe('Deployments badge count matches filteredDeploymentIssues.length', () => {
  beforeEach(() => {
    vi.clearAllMocks()

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
  })

  const renderDeployments = () => render(
    <MemoryRouter>
      <Deployments />
    </MemoryRouter>
  )

  it('badge shows 0 when no deployment issues exist and deployments are loaded', () => {
    mockUseCachedDeployments.mockReturnValue({
      deployments: [
        { name: 'app-1', cluster: 'alpha', replicas: 2, readyReplicas: 2 },
      ],
      isLoading: false,
      isRefreshing: false,
      lastRefresh: null,
      refetch: vi.fn(),
      error: null,
    })

    renderDeployments()

    expect(screen.getByTestId('stat-critical').textContent).toBe('0')
  })

  it('badge shows exact filteredDeploymentIssues.length when deployments are loaded', () => {
    mockUseCachedDeployments.mockReturnValue({
      deployments: [
        { name: 'app-1', cluster: 'alpha', replicas: 2, readyReplicas: 2 },
        { name: 'app-2', cluster: 'alpha', replicas: 3, readyReplicas: 0 },
        { name: 'app-3', cluster: 'beta', replicas: 1, readyReplicas: 1 },
      ],
      isLoading: false,
      isRefreshing: false,
      lastRefresh: null,
      refetch: vi.fn(),
      error: null,
    })
    mockUseCachedDeploymentIssues.mockReturnValue({
      issues: [
        { id: 'issue-1', cluster: 'alpha' },
        { id: 'issue-2', cluster: 'alpha' },
        { id: 'issue-3', cluster: 'beta' },
      ],
      refetch: vi.fn(),
      error: null,
    })

    renderDeployments()

    // Critical stat should equal filteredDeploymentIssues.length = 3
    expect(screen.getByTestId('stat-critical').textContent).toBe('3')
  })

  it('badge uses cached stats when currentTotalDeployments is 0 (during refresh)', () => {
    // First render with data to populate cache
    mockUseCachedDeployments.mockReturnValue({
      deployments: [
        { name: 'app-1', cluster: 'alpha', replicas: 1, readyReplicas: 1 },
      ],
      isLoading: false,
      isRefreshing: false,
      lastRefresh: null,
      refetch: vi.fn(),
      error: null,
    })
    mockUseCachedDeploymentIssues.mockReturnValue({
      issues: [{ id: 'issue-1', cluster: 'alpha' }],
      refetch: vi.fn(),
      error: null,
    })

    const { rerender } = render(
      <MemoryRouter>
        <Deployments />
      </MemoryRouter>
    )

    // Verify initial state
    expect(screen.getByTestId('stat-critical').textContent).toBe('1')

    // Re-render with empty deployments (simulating refresh)
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

    rerender(
      <MemoryRouter>
        <Deployments />
      </MemoryRouter>
    )

    // Should fall back to cached value (1) not show 0
    expect(screen.getByTestId('stat-critical').textContent).toBe('1')
  })

  it('badge filters deployment issues by selected cluster', () => {
    mockUseCachedDeployments.mockReturnValue({
      deployments: [
        { name: 'app-1', cluster: 'alpha', replicas: 2, readyReplicas: 2 },
        { name: 'app-2', cluster: 'beta', replicas: 1, readyReplicas: 0 },
      ],
      isLoading: false,
      isRefreshing: false,
      lastRefresh: null,
      refetch: vi.fn(),
      error: null,
    })
    mockUseCachedDeploymentIssues.mockReturnValue({
      issues: [
        { id: 'issue-1', cluster: 'alpha' },
        { id: 'issue-2', cluster: 'beta' },
      ],
      refetch: vi.fn(),
      error: null,
    })
    mockUseGlobalFilters.mockReturnValue({
      selectedClusters: ['alpha'],
      isAllClustersSelected: false,
    })

    renderDeployments()

    // Only alpha cluster issues should count
    expect(screen.getByTestId('stat-critical').textContent).toBe('1')
  })

  it('badge and healthy stat are consistent - total = healthy + degraded + critical', () => {
    mockUseCachedDeployments.mockReturnValue({
      deployments: [
        { name: 'healthy-app', cluster: 'alpha', replicas: 3, readyReplicas: 3 },
        { name: 'degraded-app', cluster: 'alpha', replicas: 3, readyReplicas: 2 },
        { name: 'failed-app', cluster: 'alpha', replicas: 3, readyReplicas: 0 },
      ],
      isLoading: false,
      isRefreshing: false,
      lastRefresh: null,
      refetch: vi.fn(),
      error: null,
    })
    mockUseCachedDeploymentIssues.mockReturnValue({
      issues: [
        { id: 'issue-1', cluster: 'alpha' },
      ],
      refetch: vi.fn(),
      error: null,
    })

    renderDeployments()

    const healthy = Number(screen.getByTestId('stat-healthy').textContent)
    const critical = Number(screen.getByTestId('stat-critical').textContent)
    const total = Number(screen.getByTestId('stat-namespaces').textContent)

    // healthy = deployments with readyReplicas === replicas && replicas > 0
    expect(healthy).toBe(1)
    // critical = filteredDeploymentIssues.length
    expect(critical).toBe(1)
    // total deployments
    expect(total).toBe(3)
  })
})
