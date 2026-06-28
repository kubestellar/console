import React from 'react'
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// Standard mocks
vi.mock('../../../lib/demoMode', () => ({
  isDemoMode: () => true, getDemoMode: () => true, isNetlifyDeployment: false,
  isDemoModeForced: false, canToggleDemoMode: () => true, setDemoMode: vi.fn(),
  toggleDemoMode: vi.fn(), subscribeDemoMode: () => () => {},
  isDemoToken: () => true, hasRealToken: () => false, setDemoToken: vi.fn(),
  isFeatureEnabled: () => true,
}))

const mockUseDemoMode = vi.fn()
vi.mock('../../../hooks/useDemoMode', () => ({
  getDemoMode: () => true, default: () => true,
  useDemoMode: () => mockUseDemoMode(),
  hasRealToken: () => false, isDemoModeForced: false, isNetlifyDeployment: false,
  canToggleDemoMode: () => true, isDemoToken: () => true, setDemoToken: vi.fn(),
  setGlobalDemoMode: vi.fn(),
}))

vi.mock('../../../lib/analytics', () => ({
  emitNavigate: vi.fn(), emitLogin: vi.fn(), emitEvent: vi.fn(), analyticsReady: Promise.resolve(),
  emitAddCardModalOpened: vi.fn(), emitCardExpanded: vi.fn(), emitCardRefreshed: vi.fn(), markErrorReported: vi.fn(),
}))

vi.mock('../../../hooks/useTokenUsage', () => ({
  useTokenUsage: () => ({ usage: { total: 0, remaining: 0, used: 0 }, isLoading: false }),
  tokenUsageTracker: { getUsage: () => ({ total: 0, remaining: 0, used: 0 }), trackRequest: vi.fn(), getSettings: () => ({ enabled: false }) },
}))

vi.mock('react-i18next', async () => {
  const actual = await vi.importActual<typeof import('react-i18next')>('react-i18next')
  return {
    initReactI18next: { type: '3rdParty', init: () => {} },
    ...actual,
    useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en', changeLanguage: vi.fn() } }),
    Trans: ({ children }: { children: React.ReactNode }) => children,
  }
})

const mockUseCardLoadingState = vi.fn()
const mockUseClusters = vi.fn()
const mockUseKyverno = vi.fn()
const mockUseTrivy = vi.fn()
const mockUseKubescape = vi.fn()

vi.mock('../CardDataContext', () => ({
  useReportCardDataState: vi.fn(),
  useCardLoadingState: (opts: unknown) => mockUseCardLoadingState(opts),
}))

vi.mock('../../../hooks/useMCP', () => ({
  useClusters: () => mockUseClusters(),
}))

vi.mock('../../../hooks/useGlobalFilters', () => ({
  useGlobalFilters: () => ({ selectedClusters: [], isAllClustersSelected: true, selectedSeverities: [], isAllSeveritiesSelected: true, customFilter: '' }),
}))

vi.mock('../../../hooks/useMissions', () => ({
  useMissions: () => ({ missions: [], setActiveMission: vi.fn(), openSidebar: vi.fn() }),
}))

vi.mock('../../../hooks/useKyverno', () => ({ useKyverno: () => mockUseKyverno() }))

vi.mock('../../../hooks/useTrivy', () => ({ useTrivy: () => mockUseTrivy() }))

vi.mock('../../../hooks/useKubescape', () => ({ useKubescape: () => mockUseKubescape() }))

import { FleetComplianceHeatmap } from '../FleetComplianceHeatmap'

describe('FleetComplianceHeatmap', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseDemoMode.mockReturnValue({ isDemoMode: true, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })
    mockUseCardLoadingState.mockReturnValue({ showSkeleton: false, showEmptyState: false, hasData: true, isRefreshing: false })
    mockUseClusters.mockReturnValue({ clusters: [], deduplicatedClusters: [], isLoading: false, isRefreshing: false, error: null, lastRefresh: Date.now(), consecutiveFailures: 0 })
    mockUseKyverno.mockReturnValue({ statuses: {}, isLoading: false, isRefreshing: false, lastRefresh: null, isDemoData: false, installed: false, refetch: vi.fn(), clustersChecked: 0, totalClusters: 0 })
    mockUseTrivy.mockReturnValue({ statuses: {}, isLoading: false, isRefreshing: false, isDemoData: false, installed: false, refetch: vi.fn(), clustersChecked: 0, totalClusters: 0 })
    mockUseKubescape.mockReturnValue({ statuses: {}, isLoading: false, isRefreshing: false, isDemoData: false, installed: false, refetch: vi.fn(), clustersChecked: 0, totalClusters: 0 })
  })

  it('renders without crashing', () => {
    const { container } = render(<FleetComplianceHeatmap />)
    expect(container).toBeTruthy()
  })

  it('renders correct background for Kubescape score thresholds', () => {
    mockUseDemoMode.mockReturnValue(false)
    mockUseClusters.mockReturnValue({ deduplicatedClusters: [{ name: 'cluster-green' }, { name: 'cluster-amber' }, { name: 'cluster-red' }] })
    
    mockUseKubescape.mockReturnValue({
      statuses: {
        'cluster-green': { installed: true, overallScore: 85, totalControls: 10 },
        'cluster-amber': { installed: true, overallScore: 65, totalControls: 10 },
        'cluster-red': { installed: true, overallScore: 45, totalControls: 10 }
      },
      installed: true,
      isLoading: false
    })
    
    render(<FleetComplianceHeatmap />)
    
    const greenCell = screen.getByText('85%')
    const amberCell = screen.getByText('65%')
    const redCell = screen.getByText('45%')
    
    expect(greenCell).toHaveClass('bg-green-500/20')
    expect(amberCell).toHaveClass('bg-yellow-500/20')
    expect(redCell).toHaveClass('bg-red-500/20')
  })

  it('renders correct background for Kyverno violation boundaries', () => {
    mockUseDemoMode.mockReturnValue(false)
    mockUseClusters.mockReturnValue({ deduplicatedClusters: [{ name: 'cluster-green' }, { name: 'cluster-amber' }, { name: 'cluster-red' }] })
    
    mockUseKyverno.mockReturnValue({
      statuses: {
        'cluster-green': { installed: true, totalViolations: 2, totalPolicies: 5, policies: [{}, {}] },
        'cluster-amber': { installed: true, totalViolations: 5, totalPolicies: 5, policies: [{}, {}] },
        'cluster-red': { installed: true, totalViolations: 11, totalPolicies: 5, policies: [{}, {}] }
      },
      installed: true,
      isLoading: false
    })
    
    render(<FleetComplianceHeatmap />)
    
    const greenCell = screen.getByText('2 violations')
    const amberCell = screen.getByText('5 violations')
    const redCell = screen.getByText('11 violations')
    
    expect(greenCell).toHaveClass('bg-green-500/20')
    expect(amberCell).toHaveClass('bg-yellow-500/20')
    expect(redCell).toHaveClass('bg-red-500/20')
  })

  it('renders correct background for Trivy crit+high boundaries', () => {
    mockUseDemoMode.mockReturnValue(false)
    mockUseClusters.mockReturnValue({ deduplicatedClusters: [{ name: 'cluster-green' }, { name: 'cluster-amber' }, { name: 'cluster-red' }] })
    
    mockUseTrivy.mockReturnValue({
      statuses: {
        'cluster-green': { installed: true, totalReports: 5, vulnerabilities: { critical: 0, high: 0, medium: 0, low: 0 } },
        'cluster-amber': { installed: true, totalReports: 5, vulnerabilities: { critical: 1, high: 2, medium: 0, low: 0 } },
        'cluster-red': { installed: true, totalReports: 5, vulnerabilities: { critical: 3, high: 4, medium: 0, low: 0 } }
      },
      installed: true,
      isLoading: false
    })
    
    render(<FleetComplianceHeatmap />)
    
    const greenCell = screen.getByText('0 crit/high')
    const amberCell = screen.getByText('3 crit/high')
    const redCell = screen.getByText('7 crit/high')
    
    expect(greenCell).toHaveClass('bg-green-500/20')
    expect(amberCell).toHaveClass('bg-yellow-500/20')
    expect(redCell).toHaveClass('bg-red-500/20')
  })

  it('handles empty data by rendering clusters from fallback', () => {
    mockUseDemoMode.mockReturnValue(false)
    mockUseClusters.mockReturnValue({ deduplicatedClusters: [{ name: 'cluster-1' }] })
    // All tools not installed
    
    render(<FleetComplianceHeatmap />)
    
    expect(screen.getByText('cluster-1')).toBeInTheDocument()
    // No crash, and should show placeholder cells
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('calls useCardLoadingState during render', () => {
    render(<FleetComplianceHeatmap />)
    expect(mockUseCardLoadingState).toHaveBeenCalled()
  })

  it('passes hasAnyData=false when all tool statuses are errors', () => {
    mockUseKyverno.mockReturnValue({ statuses: { a: { error: 'kyverno failed', installed: true, policies: [], totalPolicies: 0, totalViolations: 0 } }, isLoading: false, isRefreshing: false, lastRefresh: null, isDemoData: false, installed: true, refetch: vi.fn(), clustersChecked: 1, totalClusters: 1 })
    mockUseTrivy.mockReturnValue({ statuses: { a: { error: 'trivy failed', installed: true, vulnerabilities: { critical: 0, high: 0, medium: 0, low: 0, unknown: 0 }, totalReports: 0 } }, isLoading: false, isRefreshing: false, isDemoData: false, installed: true, refetch: vi.fn(), clustersChecked: 1, totalClusters: 1 })
    mockUseKubescape.mockReturnValue({ statuses: { a: { error: 'kubescape failed', installed: true, overallScore: 0, totalControls: 0, passedControls: 0 } }, isLoading: false, isRefreshing: false, isDemoData: false, installed: true, refetch: vi.fn(), clustersChecked: 1, totalClusters: 1 })

    render(<FleetComplianceHeatmap />)

    expect(mockUseCardLoadingState).toHaveBeenCalledWith(expect.objectContaining({ hasAnyData: false }))
  })

  it('renders correctly in demo mode', () => {
    mockUseDemoMode.mockReturnValue({ isDemoMode: true, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })
    const { container } = render(<FleetComplianceHeatmap />)
    expect(container).toBeTruthy()
  })

  it('renders correctly in non-demo mode', () => {
    mockUseDemoMode.mockReturnValue({ isDemoMode: false, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })
    const { container } = render(<FleetComplianceHeatmap />)
    expect(container).toBeTruthy()
  })

  it('renders with cluster data available', () => {
    mockUseClusters.mockReturnValue({
      clusters: [{ name: 'prod-cluster', healthy: true, reachable: true, nodeCount: 3, podCount: 10, cpuCores: 8, memoryGB: 16, cpuRequestsCores: 4, memoryRequestsGB: 8 }], deduplicatedClusters: [{ name: 'prod-cluster', healthy: true, reachable: true, nodeCount: 3, podCount: 10, cpuCores: 8, memoryGB: 16, cpuRequestsCores: 4, memoryRequestsGB: 8 }],
      isLoading: false, isRefreshing: false, error: null, lastRefresh: Date.now(),
    })
    const { container } = render(<FleetComplianceHeatmap />)
    expect(container).toBeTruthy()
  })

})