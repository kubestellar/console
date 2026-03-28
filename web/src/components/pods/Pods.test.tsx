import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// Mock modules with top-level localStorage side-effects
vi.mock('../../lib/demoMode', () => ({
  isDemoMode: () => true,
  getDemoMode: () => true,
  isNetlifyDeployment: false,
  isDemoModeForced: false,
  canToggleDemoMode: () => true,
  setDemoMode: vi.fn(),
  toggleDemoMode: vi.fn(),
  subscribeDemoMode: () => () => { },
  isDemoToken: () => true,
  hasRealToken: () => false,
  setDemoToken: vi.fn(),
}))

vi.mock('../../hooks/useDemoMode', () => ({
  getDemoMode: () => true,
  default: () => true,
  useDemoMode: () => true,
  isDemoModeForced: false,
}))

vi.mock('../../lib/analytics', () => ({
  emitNavigate: vi.fn(),
  emitLogin: vi.fn(),
  emitEvent: vi.fn(),
  analyticsReady: Promise.resolve(),
}))

vi.mock('../../hooks/useTokenUsage', () => ({
  useTokenUsage: () => ({
    usage: { total: 0, remaining: 0, used: 0 },
    isLoading: false,
  }),
  tokenUsageTracker: {
    getUsage: () => ({ total: 0, remaining: 0, used: 0 }),
    trackRequest: vi.fn(),
    getSettings: () => ({ enabled: false }),
  },
}))

// Mock DashboardPage to isolate the component under test from the deeply nested dependency tree
vi.mock('../../lib/dashboards/DashboardPage', () => ({
  DashboardPage: ({ title, subtitle, children }: { title: string; subtitle?: string; children?: React.ReactNode }) => (
    <div data-testid="dashboard-page" data-title={title} data-subtitle={subtitle}>
      <h1>{title}</h1>
      {subtitle && <p>{subtitle}</p>}
      {children}
    </div>
  ),
}))

vi.mock('../../hooks/useMCP', () => ({
  useClusters: () => ({
    clusters: [],
    deduplicatedClusters: [],
    isLoading: false,
    isRefreshing: false,
    lastUpdated: null,
    refetch: vi.fn(),
    error: null,
  }),
}))

// Mutable pod issues list for per-test control
let mockPodIssues: unknown[] = []

vi.mock('../../hooks/useCachedData', () => ({
  useCachedPodIssues: () => ({
    issues: mockPodIssues,
    isLoading: false,
    isRefreshing: false,
    lastRefresh: null,
    refetch: vi.fn(),
  }),
}))

vi.mock('../../hooks/useGlobalFilters', () => ({
  useGlobalFilters: () => ({
    selectedClusters: [],
    isAllClustersSelected: true,
    customFilter: '',
    filterByCluster: (items: unknown[]) => items,
    filterBySeverity: (items: unknown[]) => items,
  }),
}))

vi.mock('../../lib/unified/demo', () => ({
  useIsModeSwitching: () => false,
}))

// Shared spy so tests can assert on drillToPod calls
const drillToPodSpy = vi.fn()

vi.mock('../../hooks/useDrillDown', () => ({
  useDrillDownActions: () => ({
    drillToPod: drillToPodSpy,
    drillToAllPods: vi.fn(),
    drillToAllNodes: vi.fn(),
    drillToAllClusters: vi.fn(),
    drillToAllGPU: vi.fn(),
  }),
}))

vi.mock('../../hooks/useUniversalStats', () => ({
  useUniversalStats: () => ({ getStatValue: () => ({ value: 0 }) }),
  createMergedStatValueGetter: () => () => ({ value: 0 }),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}))

import { Pods } from './Pods'

describe('Pods Component', () => {
  const renderPods = () =>
    render(
      <MemoryRouter>
        <Pods />
      </MemoryRouter>
    )

  it('renders without crashing', () => {
    expect(() => renderPods()).not.toThrow()
  })

  it('renders the DashboardPage with correct title', () => {
    renderPods()
    expect(screen.getByTestId('dashboard-page')).toBeTruthy()
    expect(screen.getByText('Pods')).toBeTruthy()
  })

  it('passes the correct subtitle to DashboardPage', () => {
    renderPods()
    const dashboardPage = screen.getByTestId('dashboard-page')
    expect(dashboardPage.getAttribute('data-subtitle')).toBe(
      'Monitor pod health and issues across clusters'
    )
  })

  it('renders the empty state message when no pods', () => {
    renderPods()
    expect(screen.getByText('No Pod Issues')).toBeTruthy()
    expect(
      screen.getByText('All pods are running healthy across your clusters')
    ).toBeTruthy()
  })

  describe('pod issue row navigation guards', () => {
    beforeEach(() => {
      drillToPodSpy.mockClear()
    })

    it('calls drillToPod on click when cluster is present', () => {
      mockPodIssues = [{ name: 'my-pod', namespace: 'default', cluster: 'ctx/prod', status: 'Error', reason: 'CrashLoopBackOff', restarts: 3, issues: [] }]
      renderPods()
      const row = screen.getByRole('button', { name: /my-pod/ })
      fireEvent.click(row)
      expect(drillToPodSpy).toHaveBeenCalledWith('ctx/prod', 'default', 'my-pod')
    })

    it('calls drillToPod on Enter keydown when cluster is present', () => {
      mockPodIssues = [{ name: 'my-pod', namespace: 'default', cluster: 'ctx/prod', status: 'Error', reason: 'CrashLoopBackOff', restarts: 3, issues: [] }]
      renderPods()
      const row = screen.getByRole('button', { name: /my-pod/ })
      fireEvent.keyDown(row, { key: 'Enter' })
      expect(drillToPodSpy).toHaveBeenCalledWith('ctx/prod', 'default', 'my-pod')
    })

    it('calls drillToPod on Space keydown when cluster is present', () => {
      mockPodIssues = [{ name: 'my-pod', namespace: 'default', cluster: 'ctx/prod', status: 'Error', reason: 'CrashLoopBackOff', restarts: 3, issues: [] }]
      renderPods()
      const row = screen.getByRole('button', { name: /my-pod/ })
      fireEvent.keyDown(row, { key: ' ' })
      expect(drillToPodSpy).toHaveBeenCalledWith('ctx/prod', 'default', 'my-pod')
    })

    it('does not call drillToPod on click when cluster is undefined', () => {
      mockPodIssues = [{ name: 'no-cluster-pod', namespace: 'default', cluster: undefined, status: 'Pending', reason: 'Pending', restarts: 0, issues: [] }]
      renderPods()
      const row = screen.getByRole('button', { name: /no-cluster-pod/ })
      fireEvent.click(row)
      expect(drillToPodSpy).not.toHaveBeenCalled()
    })

    it('does not call drillToPod on Enter keydown when cluster is undefined', () => {
      mockPodIssues = [{ name: 'no-cluster-pod', namespace: 'default', cluster: undefined, status: 'Pending', reason: 'Pending', restarts: 0, issues: [] }]
      renderPods()
      const row = screen.getByRole('button', { name: /no-cluster-pod/ })
      fireEvent.keyDown(row, { key: 'Enter' })
      expect(drillToPodSpy).not.toHaveBeenCalled()
    })

    it('includes cluster display name in aria-label when cluster is present', () => {
      mockPodIssues = [{ name: 'my-pod', namespace: 'default', cluster: 'ctx/prod', status: 'Error', reason: 'CrashLoopBackOff', restarts: 3, issues: [] }]
      renderPods()
      const row = screen.getByRole('button', { name: /on prod/ })
      expect(row).toBeTruthy()
      expect(row.getAttribute('aria-label')).toBe('View pod issue: my-pod in default on prod')
    })

    it('omits cluster context from aria-label when cluster is undefined', () => {
      mockPodIssues = [{ name: 'no-cluster-pod', namespace: 'default', cluster: undefined, status: 'Pending', reason: 'Pending', restarts: 0, issues: [] }]
      renderPods()
      const row = screen.getByRole('button', { name: 'View pod issue: no-cluster-pod in default' })
      expect(row).toBeTruthy()
      expect(row.getAttribute('aria-label')).toBe('View pod issue: no-cluster-pod in default')
    })

    it('sets aria-disabled and tabIndex=-1 on rows without a cluster', () => {
      mockPodIssues = [{ name: 'no-cluster-pod', namespace: 'default', cluster: undefined, status: 'Pending', reason: 'Pending', restarts: 0, issues: [] }]
      renderPods()
      const row = screen.getByRole('button', { name: /no-cluster-pod/ })
      expect(row.getAttribute('aria-disabled')).toBe('true')
      expect(row.getAttribute('tabindex')).toBe('-1')
    })

    it('sets tabIndex=0 and no aria-disabled on rows with a cluster', () => {
      mockPodIssues = [{ name: 'my-pod', namespace: 'default', cluster: 'ctx/prod', status: 'Error', reason: 'CrashLoopBackOff', restarts: 3, issues: [] }]
      renderPods()
      const row = screen.getByRole('button', { name: /my-pod/ })
      expect(row.getAttribute('aria-disabled')).toBeNull()
      expect(row.getAttribute('tabindex')).toBe('0')
    })
  })
})
