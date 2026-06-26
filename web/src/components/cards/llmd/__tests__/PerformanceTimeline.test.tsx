import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'

vi.mock('../../../../lib/demoMode', () => ({
  isDemoMode: () => true, getDemoMode: () => true, isNetlifyDeployment: false,
  isDemoModeForced: false, canToggleDemoMode: () => true, setDemoMode: vi.fn(),
  toggleDemoMode: vi.fn(), subscribeDemoMode: () => () => {},
  isDemoToken: () => true, hasRealToken: () => false, setDemoToken: vi.fn(),
  isFeatureEnabled: () => true,
}))

vi.mock('../../../../hooks/useDemoMode', () => ({
  getDemoMode: () => true, default: () => true,
  useDemoMode: () => ({ isDemoMode: true, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() }),
  hasRealToken: () => false, isDemoModeForced: false, isNetlifyDeployment: false,
  canToggleDemoMode: () => true, isDemoToken: () => true, setDemoToken: vi.fn(),
  setGlobalDemoMode: vi.fn(),
}))

vi.mock('../../../../lib/analytics', () => ({
  emitNavigate: vi.fn(), emitLogin: vi.fn(), emitEvent: vi.fn(), analyticsReady: Promise.resolve(),
  emitAddCardModalOpened: vi.fn(), emitCardExpanded: vi.fn(), emitCardRefreshed: vi.fn(),
}))

vi.mock('../../../../hooks/useTokenUsage', () => ({
  useTokenUsage: () => ({ usage: { total: 0, remaining: 0, used: 0 }, isLoading: false }),
  tokenUsageTracker: { getUsage: () => ({ total: 0, remaining: 0, used: 0 }), trackRequest: vi.fn(), getSettings: () => ({ enabled: false }) },
}))

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en', changeLanguage: vi.fn() } }),
  Trans: ({ children }: { children: React.ReactNode }) => children,
}))

vi.mock('../../CardDataContext', () => ({
  useReportCardDataState: vi.fn(),
  useCardLoadingState: vi.fn(),
}))

vi.mock('../../../../hooks/useBenchmarkData', () => ({
  useCachedBenchmarkReports: () => ({ data: [], isDemoFallback: null, isFailed: false, consecutiveFailures: 0, isLoading: false, isRefreshing: false, currentSince: null, lastRefresh: null }),
  resetBenchmarkStream: vi.fn(),
}))

vi.mock('../../../../lib/llmd/benchmarkMockData', () => ({
  generateBenchmarkReports: () => [],
  getHardwareShort: vi.fn(),
  getModelShort: vi.fn(),
}))

vi.mock('../../../../lib/llmd/benchmarkDataUtils', () => ({
  extractExperimentMeta: () => ({ isl: 0, osl: 0, qps: 0, category: '' }),
  getFilterOptions: () => ({ categories: [], islValues: [], oslValues: [] }),
}))

import PerformanceTimeline from '../PerformanceTimeline'

describe('PerformanceTimeline', () => {
  it('renders without crashing', () => {
    const { container } = render(<PerformanceTimeline />)
    expect(container).toBeTruthy()
  })

  it('displays the component title', () => {
    const { container } = render(<PerformanceTimeline />)
    expect(container.textContent).toContain('Sequence Length Impact')
  })

  it('renders metric mode tabs', () => {
    const { container } = render(<PerformanceTimeline />)
    expect(container.textContent).toContain('Throughput')
    expect(container.textContent).toContain('TTFT p50')
    expect(container.textContent).toContain('TPOT p50')
    expect(container.textContent).toContain('p99 Latency')
  })

  it('shows empty state when no data', () => {
    const { container } = render(<PerformanceTimeline />)
    expect(container.textContent).toContain('No data for selected filters')
  })
})
