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
  useCachedNamespaceQuotas: vi.fn(() => ({
    quotas: [],
    isLoading: false,
    isRefreshing: false,
    isDemoFallback: false,
    isFailed: false,
    consecutiveFailures: 0,
  })),
  useCachedNamespaces: vi.fn(() => ({
    namespaces: [],
    isLoading: false,
    isRefreshing: false,
    isDemoFallback: false,
    isFailed: false,
    consecutiveFailures: 0,
  })),
}))

vi.mock('../../../hooks/useGlobalFilters', () => ({
  useGlobalFilters: () => ({ selectedClusters: [], isAllClustersSelected: true, filterByCluster: <T extends { cluster?: string }>(items: T[]) => items, filterByStatus: <T,>(items: T[]) => items, customFilter: '' }),
}))

vi.mock('../../../hooks/useMCP', () => ({
  useClusters: vi.fn(() => ({ deduplicatedClusters: [], clusters: [], isLoading: false, isRefreshing: false, isFailed: false, consecutiveFailures: 0 })),
  useResourceQuotas: vi.fn(() => ({ resourceQuotas: [], isLoading: false, refetch: vi.fn() })),
  useLimitRanges: vi.fn(() => ({ limitRanges: [], isLoading: false })),
  LimitRange: {},
  ResourceQuota: {},
  createOrUpdateResourceQuota: vi.fn(),
  deleteResourceQuota: vi.fn(),
  COMMON_RESOURCE_TYPES: [],
  GPU_RESOURCE_TYPES: [],
}))

import { NamespaceQuotas } from '../NamespaceQuotas'

describe('NamespaceQuotas', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseDemoMode.mockReturnValue({ isDemoMode: true, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })
    mockUseCardLoadingState.mockReturnValue({ showSkeleton: false, showEmptyState: false, hasData: true, isRefreshing: false })
  })

  it('exports a function component', () => {
    expect(typeof NamespaceQuotas).toBe('function')
  })

  it('renders without crashing', () => {
    const { container } = render(<NamespaceQuotas config={{}} />)
    expect(container).toBeTruthy()
  })

  // TODO: Test quota usage bars (CPU, memory, storage) with mock data
  // TODO: Test over-quota warning indicators
  // TODO: Test create/edit/delete quota modal interactions
  // TODO: Test loading skeleton and empty state
  // TODO: Test cluster filter integration
})
