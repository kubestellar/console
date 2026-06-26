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
  generateLeaderboardRows: () => [],
  CONFIG_COLORS: {},
  generateBenchmarkReports: vi.fn(),
  getHardwareShort: vi.fn(),
  getModelShort: vi.fn(),
}))

vi.mock('../../../ui/CardSearch', () => ({
  CardSearch: () => null,
  useCardSearch: () => ({ searchQuery: '', setSearchQuery: vi.fn() }),
}))

vi.mock('../../../ui/CardControls', () => ({
  CardControls: () => null,
}))

vi.mock('../../../ui/Pagination', () => ({
  usePagination: (items: unknown[]) => ({
    paginatedItems: items,
    currentPage: 1,
    totalPages: 1,
    totalItems: (items as unknown[]).length,
    itemsPerPage: 10,
    goToPage: vi.fn(),
    setPerPage: vi.fn(),
    needsPagination: false,
  }),
  Pagination: () => null,
}))

import HardwareLeaderboard from '../HardwareLeaderboard'

describe('HardwareLeaderboard', () => {
  it('renders without crashing', () => {
    const { container } = render(<HardwareLeaderboard />)
    expect(container).toBeTruthy()
  })

  it('displays the component title', () => {
    const { container } = render(<HardwareLeaderboard />)
    expect(container.textContent).toContain('Hardware Leaderboard')
  })
})
