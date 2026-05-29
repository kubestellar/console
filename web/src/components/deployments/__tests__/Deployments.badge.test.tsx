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
  DashboardPage: ({ children, afterTitle, getStatValue }: { children?: React.ReactNode; afterTitle?: React.ReactNode; getStatValue?: (id: string) => { value: number; sublabel?: string } }) => (
    <div data-testid="dashboard-page">
      <div data-testid="deployment-health-badge">{afterTitle}</div>
      <div data-testid="stat-healthy">{getStatValue?.('healthy')?.value ?? ''}</div>
      <div data-testid="stat-critical">{getStatValue?.('critical')?.value ?? ''}</div>
      <div data-testid="stat-namespaces">{getStatValue?.('namespaces')?.value ?? ''}</div>
      <div data-testid="stat-deployment-issues">{getStatValue?.('deployment_issues')?.value ?? ''}</div>
      {children}
    </div>
  ),
}))

import { Deployments } from '../Deployments'

describe('Deployments - badge count matches filteredDeploymentIssues.length', () => {
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

  it('shows badge value equal to filteredDeploymentIssues.length when deployments are loaded', () => {
    mockUseCachedDeployments.mockReturnValue({
      deployments: [
        { name: 'api', cluster: 'prod', replicas: 2, readyReplicas: 2 },
        { name: 'worker', cluster: 'prod', replicas: 3, readyReplicas: 1 },
        { name: 'scheduler', cluster: 'prod', replicas: 1, readyReplicas: 0 },
      ],
      isLoading: false,
      isRefreshing: false,
      lastRefresh: Date.now(),
      refetch: vi.fn(),
      error: null,
    })
    mockUseCachedDeploymentIssues.mockReturnValue({
      issues: [
        { id: 'issue-1', cluster: 'prod', deployment: 'worker' },
        { id: 'issue-2', cluster: 'prod', deployment: 'scheduler' },
        { id: 'issue-3', cluster: 'prod', deployment: 'scheduler' },
      ],
      refetch: vi.fn(),
      error: null,
    })

    renderDeployments()

    // Critical stat should equal the number of deployment issues (3)
    expect(screen.getByTestId('stat-critical').textContent).toBe('3')
    // deployment_issues stat should also be 3
    expect(screen.getByTestId('stat-deployment-issues').textContent).toBe('3')
  })

  it('shows badge value 0 when no deployment issues exist but deployments are loaded', () => {
    mockUseCachedDeployments.mockReturnValue({
      deployments: [
        { name: 'api', cluster: 'prod', replicas: 2, readyReplicas: 2 },
        { name: 'worker', cluster: 'prod', replicas: 1, readyReplicas: 1 },
      ],
      isLoading: false,
      isRefreshing: false,
      lastRefresh: Date.now(),
      refetch: vi.fn(),
      error: null,
    })

    renderDeployments()

    expect(screen.getByTestId('stat-critical').textContent).toBe('0')
    expect(screen.getByTestId('stat-healthy').textContent).toBe('2')
  })

  it('falls back to 0 (initial cached value) when currentTotalDeployments is 0', () => {
    // No deployments loaded — cachedStats starts at { total: 0, healthy: 0, issues: 0 }
    renderDeployments()

    expect(screen.getByTestId('stat-critical').textContent).toBe('0')
    expect(screen.getByTestId('stat-healthy').textContent).toBe('0')
  })

  it('filters deployment issues by selected clusters', () => {
    mockUseCachedDeployments.mockReturnValue({
      deployments: [
        { name: 'api', cluster: 'prod', replicas: 2, readyReplicas: 2 },
        { name: 'worker', cluster: 'staging', replicas: 1, readyReplicas: 0 },
      ],
      isLoading: false,
      isRefreshing: false,
      lastRefresh: Date.now(),
      refetch: vi.fn(),
      error: null,
    })
    mockUseCachedDeploymentIssues.mockReturnValue({
      issues: [
        { id: 'issue-1', cluster: 'prod', deployment: 'api' },
        { id: 'issue-2', cluster: 'staging', deployment: 'worker' },
      ],
      refetch: vi.fn(),
      error: null,
    })
    // Only show 'prod' cluster
    mockUseGlobalFilters.mockReturnValue({
      selectedClusters: ['prod'],
      isAllClustersSelected: false,
    })

    renderDeployments()

    // Only 1 issue in 'prod' cluster after filtering
    expect(screen.getByTestId('stat-critical').textContent).toBe('1')
  })

  it('critical stat and deployment_issues stat are always consistent', () => {
    mockUseCachedDeployments.mockReturnValue({
      deployments: [
        { name: 'svc-a', cluster: 'dev', replicas: 1, readyReplicas: 0 },
        { name: 'svc-b', cluster: 'dev', replicas: 1, readyReplicas: 1 },
      ],
      isLoading: false,
      isRefreshing: false,
      lastRefresh: Date.now(),
      refetch: vi.fn(),
      error: null,
    })
    mockUseCachedDeploymentIssues.mockReturnValue({
      issues: [
        { id: 'd-1', cluster: 'dev', deployment: 'svc-a' },
      ],
      refetch: vi.fn(),
      error: null,
    })

    renderDeployments()

    const criticalValue = screen.getByTestId('stat-critical').textContent
    const deployIssuesValue = screen.getByTestId('stat-deployment-issues').textContent
    expect(criticalValue).toBe(deployIssuesValue)
    expect(criticalValue).toBe('1')
  })
})
