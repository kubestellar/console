import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const mockUseDeployments = vi.fn()
const mockUseDeploymentIssues = vi.fn()
const mockUsePodIssues = vi.fn()
const mockUseDemoMode = vi.fn()
const mockUseGlobalFilters = vi.fn()
const mockUseDrillDownActions = vi.fn()

vi.mock('../../hooks/useMCP', () => ({
  useDeployments: () => mockUseDeployments(),
  useDeploymentIssues: () => mockUseDeploymentIssues(),
  usePodIssues: () => mockUsePodIssues(),
}))

vi.mock('../../hooks/useDemoMode', () => ({
  useDemoMode: () => mockUseDemoMode(),
}))

vi.mock('../../hooks/useGlobalFilters', () => ({
  useGlobalFilters: () => mockUseGlobalFilters(),
}))

vi.mock('../../hooks/useDrillDown', () => ({
  useDrillDownActions: () => mockUseDrillDownActions(),
}))

vi.mock('../../lib/dashboards/DashboardPage', () => ({
  DashboardPage: ({ getStatValue }: { getStatValue: (id: string) => { value: number; sublabel: string } }) => {
    // Render stats to test badge count
    const criticalStat = getStatValue('critical')
    return (
      <div>
        <div data-testid="critical-badge">{criticalStat.value}</div>
        <div data-testid="critical-sublabel">{criticalStat.sublabel}</div>
      </div>
    )
  },
}))

vi.mock('../../config/dashboards', () => ({
  getDefaultCards: () => [],
}))

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback || key,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}))

vi.mock('../ui/RotatingTip', () => ({
  RotatingTip: () => null,
}))

import { Deployments } from '../Deployments'

describe('Deployments Badge Count', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseDemoMode.mockReturnValue({ isDemoMode: false })
    mockUseDrillDownActions.mockReturnValue({
      drillToAllDeployments: vi.fn(),
      drillToAllPods: vi.fn(),
    })
    mockUsePodIssues.mockReturnValue({
      issues: [],
      isLoading: false,
      isRefreshing: false,
    })
  })

  it('badge value equals filteredDeploymentIssues.length when deployments are loaded', () => {
    mockUseGlobalFilters.mockReturnValue({
      globalSelectedClusters: ['cluster-1'],
      isAllClustersSelected: false,
    })

    mockUseDeployments.mockReturnValue({
      deployments: [
        { name: 'dep1', namespace: 'default', cluster: 'cluster-1', replicas: 3, readyReplicas: 3 },
        { name: 'dep2', namespace: 'default', cluster: 'cluster-1', replicas: 2, readyReplicas: 1 },
      ],
      isLoading: false,
      isRefreshing: false,
    })

    mockUseDeploymentIssues.mockReturnValue({
      issues: [
        { deployment: 'dep1', cluster: 'cluster-1', severity: 'critical', message: 'Issue 1' },
        { deployment: 'dep2', cluster: 'cluster-1', severity: 'critical', message: 'Issue 2' },
        { deployment: 'dep3', cluster: 'cluster-2', severity: 'critical', message: 'Issue 3' }, // filtered out
      ],
      isLoading: false,
      isRefreshing: false,
    })

    render(<Deployments />)

    const badge = screen.getByTestId('critical-badge')
    // filteredDeploymentIssues should contain 2 issues (cluster-1 only)
    expect(badge.textContent).toBe('2')
  })

  it('badge value falls back to cachedStats.current.issues when currentTotalDeployments === 0', () => {
    mockUseGlobalFilters.mockReturnValue({
      globalSelectedClusters: [],
      isAllClustersSelected: true,
    })

    // First render with deployments
    mockUseDeployments.mockReturnValue({
      deployments: [
        { name: 'dep1', namespace: 'default', cluster: 'cluster-1', replicas: 3, readyReplicas: 3 },
      ],
      isLoading: false,
      isRefreshing: false,
    })

    mockUseDeploymentIssues.mockReturnValue({
      issues: [
        { deployment: 'dep1', cluster: 'cluster-1', severity: 'critical', message: 'Issue 1' },
        { deployment: 'dep2', cluster: 'cluster-1', severity: 'critical', message: 'Issue 2' },
      ],
      isLoading: false,
      isRefreshing: false,
    })

    const { rerender } = render(<Deployments />)

    // Verify initial badge value
    let badge = screen.getByTestId('critical-badge')
    expect(badge.textContent).toBe('2')

    // Now simulate refresh with empty deployments
    mockUseDeployments.mockReturnValue({
      deployments: [],
      isLoading: false,
      isRefreshing: true,
    })

    mockUseDeploymentIssues.mockReturnValue({
      issues: [],
      isLoading: false,
      isRefreshing: true,
    })

    rerender(<Deployments />)

    // Badge should still show cached value (2) instead of 0
    badge = screen.getByTestId('critical-badge')
    expect(badge.textContent).toBe('2')
  })

  it('badge shows 0 when both live count and cached count are 0', () => {
    mockUseGlobalFilters.mockReturnValue({
      globalSelectedClusters: [],
      isAllClustersSelected: true,
    })

    mockUseDeployments.mockReturnValue({
      deployments: [],
      isLoading: false,
      isRefreshing: false,
    })

    mockUseDeploymentIssues.mockReturnValue({
      issues: [],
      isLoading: false,
      isRefreshing: false,
    })

    render(<Deployments />)

    const badge = screen.getByTestId('critical-badge')
    expect(badge.textContent).toBe('0')
  })

  it('currentIssueCount updates when cluster filter changes', () => {
    // Initial state: cluster-1 selected
    mockUseGlobalFilters.mockReturnValue({
      globalSelectedClusters: ['cluster-1'],
      isAllClustersSelected: false,
    })

    mockUseDeployments.mockReturnValue({
      deployments: [
        { name: 'dep1', namespace: 'default', cluster: 'cluster-1', replicas: 3, readyReplicas: 3 },
        { name: 'dep2', namespace: 'default', cluster: 'cluster-2', replicas: 2, readyReplicas: 2 },
      ],
      isLoading: false,
      isRefreshing: false,
    })

    mockUseDeploymentIssues.mockReturnValue({
      issues: [
        { deployment: 'dep1', cluster: 'cluster-1', severity: 'critical', message: 'Issue 1' },
        { deployment: 'dep2', cluster: 'cluster-2', severity: 'critical', message: 'Issue 2' },
        { deployment: 'dep3', cluster: 'cluster-2', severity: 'critical', message: 'Issue 3' },
      ],
      isLoading: false,
      isRefreshing: false,
    })

    const { rerender } = render(<Deployments />)

    let badge = screen.getByTestId('critical-badge')
    expect(badge.textContent).toBe('1') // Only cluster-1 issue

    // Change filter to cluster-2
    mockUseGlobalFilters.mockReturnValue({
      globalSelectedClusters: ['cluster-2'],
      isAllClustersSelected: false,
    })

    rerender(<Deployments />)

    badge = screen.getByTestId('critical-badge')
    expect(badge.textContent).toBe('2') // cluster-2 has 2 issues
  })

  it('badge value and stats panel are consistent (both use issueCount variable)', () => {
    mockUseGlobalFilters.mockReturnValue({
      globalSelectedClusters: [],
      isAllClustersSelected: true,
    })

    mockUseDeployments.mockReturnValue({
      deployments: [
        { name: 'dep1', namespace: 'default', cluster: 'cluster-1', replicas: 3, readyReplicas: 3 },
      ],
      isLoading: false,
      isRefreshing: false,
    })

    mockUseDeploymentIssues.mockReturnValue({
      issues: [
        { deployment: 'dep1', cluster: 'cluster-1', severity: 'critical', message: 'Issue 1' },
        { deployment: 'dep2', cluster: 'cluster-1', severity: 'critical', message: 'Issue 2' },
        { deployment: 'dep3', cluster: 'cluster-1', severity: 'critical', message: 'Issue 3' },
      ],
      isLoading: false,
      isRefreshing: false,
    })

    render(<Deployments />)

    const badge = screen.getByTestId('critical-badge')
    const sublabel = screen.getByTestId('critical-sublabel')

    // Both should use the same issueCount variable (line 79 in Deployments.tsx)
    expect(badge.textContent).toBe('3')
    expect(sublabel.textContent).toContain('with issues')
  })
})
