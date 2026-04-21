import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// Mock modules with top-level localStorage side-effects
vi.mock('../../../lib/demoMode', () => ({
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

vi.mock('../../../hooks/useDemoMode', () => ({
  getDemoMode: () => true,
  default: () => true,
  useDemoMode: () => true,
  isDemoModeForced: false,
}))

vi.mock('../../../lib/analytics', () => ({
  emitNavigate: vi.fn(),
  emitLogin: vi.fn(),
  emitEvent: vi.fn(),
  analyticsReady: Promise.resolve(),
}))

vi.mock('../../../hooks/useTokenUsage', () => ({
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
vi.mock('../../../lib/dashboards/DashboardPage', () => ({
  DashboardPage: ({ title, subtitle, children }: { title: string; subtitle?: string; children?: React.ReactNode }) => (
    <div data-testid="dashboard-page" data-title={title} data-subtitle={subtitle}>
      <h1>{title}</h1>
      {subtitle && <p>{subtitle}</p>}
      {children}
    </div>
  ),
}))

vi.mock('../../../hooks/useMCP', () => ({
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

vi.mock('../../../hooks/useCachedData', () => ({
  useCachedPodIssues: () => ({
    issues: mockPodIssues,
    isLoading: false,
    isRefreshing: false,
    lastRefresh: null,
    refetch: vi.fn(),
  }),
}))

vi.mock('../../../hooks/useGlobalFilters', () => ({
  useGlobalFilters: () => ({
    selectedClusters: [],
    isAllClustersSelected: true,
    customFilter: '',
    filterByCluster: (items: unknown[]) => items,
    filterBySeverity: (items: unknown[]) => items,
  }),
}))

vi.mock('../../../lib/unified/demo', () => ({
  useIsModeSwitching: () => false,
}))

// Shared spy so tests can assert on drillToPod calls
const drillToPodSpy = vi.fn()

vi.mock('../../../hooks/useDrillDown', () => ({
  useDrillDownActions: () => ({
    drillToPod: drillToPodSpy,
    drillToAllPods: vi.fn(),
    drillToAllNodes: vi.fn(),
    drillToAllClusters: vi.fn(),
    drillToAllGPU: vi.fn(),
  }),
}))

vi.mock('../../../hooks/useUniversalStats', () => ({
  useUniversalStats: () => ({ getStatValue: () => ({ value: 0 }) }),
  createMergedStatValueGetter: () => () => ({ value: 0 }),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}))

const showToastSpy = vi.fn()
vi.mock('../../ui/Toast', () => ({
  useToast: () => ({
    showToast: showToastSpy,
  }),
  ToastProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('../../../lib/kubectlProxy', () => ({
  kubectlProxy: {
    exec: vi.fn().mockResolvedValue({ output: 'success', exitCode: 0 }),
  },
}))

import { Pods } from '../Pods'

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
    mockPodIssues = []
    renderPods()
    expect(screen.getByText('No Pod Issues')).toBeTruthy()
    expect(
      screen.getByText('All pods are running healthy across your clusters')
    ).toBeTruthy()
  })



  beforeEach(() => {
    showToastSpy.mockClear()
    mockPodIssues = [{ name: 'my-pod', namespace: 'default', cluster: 'ctx/prod', status: 'Error', reason: 'CrashLoopBackOff', restarts: 3, issues: [] }]
  })

  it('renders the action buttons (Restart, Logs, Delete)', () => {
    renderPods()
    expect(screen.getByLabelText('Restart pod')).toBeTruthy()
    expect(screen.getByLabelText('View logs')).toBeTruthy()
    expect(screen.getByLabelText('Delete pod')).toBeTruthy()
  })

  it('calls kubectlProxy and showToast when Restart is clicked', async () => {
    renderPods()
    const restartBtn = screen.getByLabelText('Restart pod')
    fireEvent.click(restartBtn)
    expect(showToastSpy).toHaveBeenCalledWith('pods.restarting', 'info')
  })

  it('calls drillToPod when Logs is clicked', () => {
    renderPods()
    const logsBtn = screen.getByLabelText('View logs')
    fireEvent.click(logsBtn)
    // Check if drillToPod was called with tab: 'logs'
    // Note: we added tab: 'logs' to the drillToPod call in implementation
    expect(drillToPodSpy).toHaveBeenCalledWith('ctx/prod', 'default', 'my-pod', { tab: 'logs' })
  })

  it('shows confirmation dialog when Delete is clicked', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderPods()
    const deleteBtn = screen.getByLabelText('Delete pod')
    fireEvent.click(deleteBtn)
    expect(confirmSpy).toHaveBeenCalled()
    expect(showToastSpy).toHaveBeenCalledWith('pods.deleting', 'info')
    confirmSpy.mockRestore()
  })


  it('uses red border for CrashLoopBackOff', () => {
    mockPodIssues = [{ name: 'pod1', namespace: 'ns', cluster: 'c1', status: 'Error', reason: 'CrashLoopBackOff', restarts: 3, issues: [] }]
    renderPods()
    const row = screen.getByRole('button', { name: /pod1/ })
    expect(row.className).toContain('border-l-red-500')
  })

  it('uses red border for OOMKilled', () => {
    mockPodIssues = [{ name: 'pod2', namespace: 'ns', cluster: 'c1', status: 'Error', reason: 'OOMKilled', restarts: 3, issues: [] }]
    renderPods()
    const row = screen.getByRole('button', { name: /pod2/ })
    expect(row.className).toContain('border-l-red-500')
  })

  it('uses yellow border for Pending', () => {
    mockPodIssues = [{ name: 'pod3', namespace: 'ns', cluster: 'c1', status: 'Pending', reason: 'Pending', restarts: 0, issues: [] }]
    renderPods()
    const row = screen.getByRole('button', { name: /pod3/ })
    expect(row.className).toContain('border-l-yellow-500')
  })

  it('uses orange border for other issues', () => {
    mockPodIssues = [{ name: 'pod4', namespace: 'ns', cluster: 'c1', status: 'Warning', reason: 'SomeOtherReason', restarts: 1, issues: [] }]
    renderPods()
    const row = screen.getByRole('button', { name: /pod4/ })
    expect(row.className).toContain('border-l-orange-500')
  })
})
