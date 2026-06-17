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
      {children}
    </div>
  ),
}))

import { Deployments } from '../Deployments'

describe('Deployments', () => {
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

  it('keeps the badge aligned with deployment stats when only pod issues exist', () => {
    mockUseCachedDeployments.mockReturnValue({
      deployments: [
        { name: 'frontend', cluster: 'alpha', replicas: 1, readyReplicas: 1 },
      ],
      isLoading: false,
      isRefreshing: false,
      lastRefresh: null,
      refetch: vi.fn(),
      error: null,
    })
    mockUseCachedPodIssues.mockReturnValue({
      issues: [
        { id: 'pod-1', cluster: 'alpha' },
        { id: 'pod-2', cluster: 'alpha' },
      ],
      error: null,
    })

    renderDeployments()

    // Component uses t('deployments.allHealthy') — mock returns the key
    expect(screen.getByText('deployments.allHealthy')).toBeTruthy()
    expect(screen.getByTestId('stat-healthy').textContent).toBe('1')
    expect(screen.getByTestId('stat-critical').textContent).toBe('0')
    expect(screen.queryByText('2 critical issues')).toBeNull()
  })

  it('uses deployment issue count for both the badge and critical stat', () => {
    mockUseCachedDeployments.mockReturnValue({
      deployments: [
        { name: 'frontend', cluster: 'alpha', replicas: 1, readyReplicas: 1 },
        { name: 'worker', cluster: 'alpha', replicas: 2, readyReplicas: 1 },
        { name: 'api', cluster: 'alpha', replicas: 1, readyReplicas: 0 },
      ],
      isLoading: false,
      isRefreshing: false,
      lastRefresh: null,
      refetch: vi.fn(),
      error: null,
    })
    mockUseCachedDeploymentIssues.mockReturnValue({
      issues: [
        { id: 'deploy-1', cluster: 'alpha' },
        { id: 'deploy-2', cluster: 'alpha' },
      ],
      refetch: vi.fn(),
      error: null,
    })
    mockUseCachedPodIssues.mockReturnValue({
      issues: [
        { id: 'pod-1', cluster: 'alpha' },
      ],
      error: null,
    })

    renderDeployments()

    expect(screen.getByText('2 critical issues')).toBeTruthy()
    expect(screen.getByTestId('stat-critical').textContent).toBe('2')
    expect(screen.getByTestId('stat-healthy').textContent).toBe('1')
  })
})
