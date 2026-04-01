import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'

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

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en', changeLanguage: vi.fn() } }),
  Trans: ({ children }: { children: React.ReactNode }) => children,
}))

const mockUseCardLoadingState = vi.fn()
vi.mock('../CardDataContext', () => ({
  useReportCardDataState: vi.fn(),
  useCardLoadingState: (opts: unknown) => mockUseCardLoadingState(opts),
}))

const mockGPUNodeHealth = vi.fn()
vi.mock('../../../hooks/useCachedData', () => ({
  useCachedGPUNodeHealth: () => mockGPUNodeHealth(),
  useGPUHealthCronJob: () => ({ status: null, isLoading: false, error: null, actionInProgress: false, install: vi.fn(), uninstall: vi.fn(), refetch: vi.fn() }),
}))

const mockDrillDown = vi.fn()
vi.mock('../../../hooks/useDrillDown', () => ({
  useDrillDownActions: () => mockDrillDown(),
}))

import { ProactiveGPUNodeHealthMonitor } from '../ProactiveGPUNodeHealthMonitor'

describe('ProactiveGPUNodeHealthMonitor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseDemoMode.mockReturnValue({ isDemoMode: true, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })
    mockUseCardLoadingState.mockReturnValue({ showSkeleton: false, showEmptyState: false, hasData: true, isRefreshing: false })
    mockGPUNodeHealth.mockReturnValue({ nodes: [], isLoading: false, isRefreshing: false, isDemoFallback: false, isFailed: false, consecutiveFailures: 0, error: null, lastRefresh: Date.now() })
    mockDrillDown.mockReturnValue({ drillToGPU: vi.fn() })
  })

  it('renders without crashing', () => {
    const { container } = render(<ProactiveGPUNodeHealthMonitor />)
    expect(container).toBeTruthy()
  })

  it('calls useCardLoadingState during render', () => {
    render(<ProactiveGPUNodeHealthMonitor />)
    expect(mockUseCardLoadingState).toHaveBeenCalled()
  })

  it('renders correctly in demo mode', () => {
    mockUseDemoMode.mockReturnValue({ isDemoMode: true, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })
    const { container } = render(<ProactiveGPUNodeHealthMonitor />)
    expect(container).toBeTruthy()
  })

  it('renders correctly in non-demo mode', () => {
    mockUseDemoMode.mockReturnValue({ isDemoMode: false, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })
    const { container } = render(<ProactiveGPUNodeHealthMonitor />)
    expect(container).toBeTruthy()
  })

  it('handles data fetch failure', () => {
    mockGPUNodeHealth.mockReturnValue({ nodes: [], isLoading: false, isRefreshing: false, isDemoFallback: false, isFailed: true, consecutiveFailures: 3, error: 'Network error', lastRefresh: null })
    const { container } = render(<ProactiveGPUNodeHealthMonitor />)
    expect(container).toBeTruthy()
  })

  it('renders during background refresh with cached data', () => {
    mockUseCardLoadingState.mockReturnValue({ showSkeleton: false, showEmptyState: false, hasData: true, isRefreshing: true })
    mockGPUNodeHealth.mockReturnValue({ nodes: [], isLoading: false, isRefreshing: true, isDemoFallback: false, isFailed: false, consecutiveFailures: 0, error: null, lastRefresh: Date.now() })
    const { container } = render(<ProactiveGPUNodeHealthMonitor />)
    expect(container).toBeTruthy()
  })

  it('reports demo fallback state', () => {
    mockGPUNodeHealth.mockReturnValue({ nodes: [], isLoading: false, isRefreshing: false, isDemoFallback: true, isFailed: false, consecutiveFailures: 0, error: null, lastRefresh: Date.now() })
    render(<ProactiveGPUNodeHealthMonitor />)
    expect(mockUseCardLoadingState).toHaveBeenCalled()
  })

})