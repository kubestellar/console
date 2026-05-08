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

vi.mock('react-i18next', async () => {
  const actual = await vi.importActual<typeof import('react-i18next')>('react-i18next')
  return {
    ...actual,
    useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en', changeLanguage: vi.fn() } }),
    Trans: ({ children }: { children: React.ReactNode }) => children,
  }
})

const mockUseCardLoadingState = vi.fn()
vi.mock('../CardDataContext', () => ({
  useReportCardDataState: vi.fn(),
  useCardLoadingState: (opts: unknown) => mockUseCardLoadingState(opts),
}))

const mockUseClusters = vi.fn()
vi.mock('../../../hooks/useMCP', () => ({
  useClusters: () => mockUseClusters(),
}))

vi.mock('../../../lib/cards/cardHooks', () => ({
  useChartFilters: () => ({ localClusterFilter: [], toggleClusterFilter: vi.fn(), clearClusterFilter: vi.fn(), availableClusters: [], filteredClusters: [], showClusterFilter: false, setShowClusterFilter: vi.fn(), clusterFilterRef: { current: null } }),
  commonComparators: { string: () => () => 0, number: () => () => 0, statusOrder: () => () => 0, date: () => () => 0, boolean: () => () => 0 },
}))

vi.mock('../charts', () => ({ Gauge: () => null, TimeSeriesChart: () => null, MultiSeriesChart: () => null }))

import {
  ClusterMetrics,
  SUPPORTED_TIME_RANGE_KEYS,
  DEMO_MAX_VARIATION_PERCENT,
  applyDemoTelemetryJitter,
} from '../ClusterMetrics'
import { CLUSTER_POLL_INTERVAL_MS } from '../../../hooks/mcp/shared'

// Keep in sync with MAX_HISTORY_POINTS in ClusterMetrics.tsx
const EXPECTED_MAX_HISTORY_POINTS = 60
const EXPECTED_MAX_HISTORY_DURATION_MS =
  EXPECTED_MAX_HISTORY_POINTS * CLUSTER_POLL_INTERVAL_MS
const DEMO_CPU_TOTAL_BASE = 656
const DEMO_TIMESTAMP_BASE = 1_700_000_000_000
const DEMO_SAMPLE_POINTS = 20
const DEMO_CPU_KEY = 'total:cpu'

describe('ClusterMetrics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseDemoMode.mockReturnValue({ isDemoMode: true, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })
    mockUseCardLoadingState.mockReturnValue({ showSkeleton: false, showEmptyState: false, hasData: true, isRefreshing: false })
    mockUseClusters.mockReturnValue({ clusters: [], deduplicatedClusters: [], isLoading: false, isRefreshing: false, error: null, lastRefresh: Date.now() })
  })

  it('renders without crashing', () => {
    const { container } = render(<ClusterMetrics />)
    expect(container).toBeTruthy()
  })

  it('calls useCardLoadingState during render', () => {
    render(<ClusterMetrics />)
    expect(mockUseCardLoadingState).toHaveBeenCalled()
  })

  it('renders correctly in demo mode', () => {
    mockUseDemoMode.mockReturnValue({ isDemoMode: true, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })
    const { container } = render(<ClusterMetrics />)
    expect(container).toBeTruthy()
  })

  it('renders correctly in non-demo mode', () => {
    mockUseDemoMode.mockReturnValue({ isDemoMode: false, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })
    const { container } = render(<ClusterMetrics />)
    expect(container).toBeTruthy()
  })

  it('only exposes time ranges the history buffer can cover (issue #6048)', () => {
    // Every supported range must be achievable by the client-side buffer
    for (const opt of SUPPORTED_TIME_RANGE_KEYS) {
      expect(opt.rangeMs).toBeLessThanOrEqual(EXPECTED_MAX_HISTORY_DURATION_MS)
    }
    // At the current poll interval (60s) and 60-point cap, only 15m and 1h
    // should be exposed; 6h and 24h would always render as empty.
    const values = SUPPORTED_TIME_RANGE_KEYS.map((opt) => opt.value)
    expect(values).toContain('15m')
    expect(values).toContain('1h')
    expect(values).not.toContain('6h')
    expect(values).not.toContain('24h')
  })

  it('renders with cluster data available', () => {
    mockUseClusters.mockReturnValue({
      clusters: [{ name: 'prod-cluster', healthy: true, reachable: true, nodeCount: 3, podCount: 10, cpuCores: 8, memoryGB: 16, cpuRequestsCores: 4, memoryRequestsGB: 8 }], deduplicatedClusters: [{ name: 'prod-cluster', healthy: true, reachable: true, nodeCount: 3, podCount: 10, cpuCores: 8, memoryGB: 16, cpuRequestsCores: 4, memoryRequestsGB: 8 }],
      isLoading: false, isRefreshing: false, error: null, lastRefresh: Date.now(),
    })
    const { container } = render(<ClusterMetrics />)
    expect(container).toBeTruthy()
  })

  it('adds bounded deterministic variation to demo CPU telemetry', () => {
    const samples = Array.from({ length: DEMO_SAMPLE_POINTS }, (_unused, index) => (
      applyDemoTelemetryJitter(
        DEMO_CPU_TOTAL_BASE,
        DEMO_TIMESTAMP_BASE + (index * CLUSTER_POLL_INTERVAL_MS),
        DEMO_CPU_KEY,
      )
    ))
    const minSample = Math.min(...samples)
    const maxSample = Math.max(...samples)
    const minExpected = Math.round(DEMO_CPU_TOTAL_BASE * (1 - DEMO_MAX_VARIATION_PERCENT))
    const maxExpected = Math.round(DEMO_CPU_TOTAL_BASE * (1 + DEMO_MAX_VARIATION_PERCENT))

    expect(new Set(samples).size).toBeGreaterThan(1)
    expect(minSample).toBeLessThan(DEMO_CPU_TOTAL_BASE)
    expect(maxSample).toBeGreaterThan(DEMO_CPU_TOTAL_BASE)
    expect(minSample).toBeGreaterThanOrEqual(minExpected)
    expect(maxSample).toBeLessThanOrEqual(maxExpected)
  })

  it('keeps demo jitter stable for the same timestamp and series key', () => {
    const first = applyDemoTelemetryJitter(DEMO_CPU_TOTAL_BASE, DEMO_TIMESTAMP_BASE, DEMO_CPU_KEY)
    const second = applyDemoTelemetryJitter(DEMO_CPU_TOTAL_BASE, DEMO_TIMESTAMP_BASE, DEMO_CPU_KEY)

    expect(first).toBe(second)
  })

})
