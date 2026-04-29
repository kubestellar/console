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

vi.mock('../../../hooks/useCachedData', () => ({
  useCachedHardwareHealth: vi.fn(() => ({
    data: { alerts: [], inventory: [], nodeCount: 0, lastUpdate: null },
    isLoading: false,
    isRefreshing: false,
    isDemoFallback: false,
    isFailed: false,
    consecutiveFailures: 0,
    error: null,
    refetch: vi.fn(),
  })),
}))

vi.mock('../../../hooks/useMCP', () => ({
  useClusters: vi.fn(() => ({ clusters: [], deduplicatedClusters: [], isLoading: false })),
}))

vi.mock('../../../hooks/useSnoozedAlerts', () => ({
  useSnoozedAlerts: vi.fn(() => ({
    isSnoozed: vi.fn(() => false),
    snooze: vi.fn(),
    unsnooze: vi.fn(),
    snoozedCount: 0,
  })),
  SNOOZE_DURATIONS: [],
  formatSnoozeRemaining: vi.fn(() => ''),
}))

vi.mock('../../../hooks/useDrillDown', () => ({
  useDrillDownActions: vi.fn(() => ({})),
}))

vi.mock('../../ui/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}))

vi.mock('../../../hooks/useGlobalFilters', () => ({
  useGlobalFilters: () => ({ selectedClusters: [], isAllClustersSelected: true, filterByCluster: <T,>(items: T[]) => items }),
}))

vi.mock('../../../hooks/useMissions', () => ({
  useMissions: vi.fn(() => ({ startMission: vi.fn() })),
}))

import { HardwareHealthCard } from '../HardwareHealthCard'

describe('HardwareHealthCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseDemoMode.mockReturnValue({ isDemoMode: true, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })
    mockUseCardLoadingState.mockReturnValue({ showSkeleton: false, showEmptyState: false, hasData: true, isRefreshing: false })
  })

  it('exports a function component', () => {
    expect(typeof HardwareHealthCard).toBe('function')
  })

  it('renders without crashing', () => {
    const { container } = render(<HardwareHealthCard />)
    expect(container).toBeTruthy()
  })

  // TODO: Test hardware component status rendering (CPU, memory, disk, network)
  // TODO: Test alert/warning indicators for degraded hardware
  // TODO: Test snooze functionality for hardware alerts
  // TODO: Test loading skeleton and empty state
  // TODO: Test search/filter and pagination controls
})
