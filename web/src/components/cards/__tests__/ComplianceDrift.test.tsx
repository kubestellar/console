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
    initReactI18next: { type: '3rdParty', init: () => {} },
    ...actual,
    useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en', changeLanguage: vi.fn() } }),
    Trans: ({ children }: { children: React.ReactNode }) => children,
  }
})

const mockUseCardLoadingState = vi.fn()
const mockUseKyverno = vi.fn()
const mockUseTrivy = vi.fn()
const mockUseKubescape = vi.fn()

vi.mock('../CardDataContext', () => ({
  useReportCardDataState: vi.fn(),
  useCardLoadingState: (opts: unknown) => mockUseCardLoadingState(opts),
}))

vi.mock('../../../hooks/useGlobalFilters', () => ({
  useGlobalFilters: () => ({ selectedClusters: [], isAllClustersSelected: true, selectedSeverities: [], isAllSeveritiesSelected: true, customFilter: '' }),
}))

vi.mock('../../../hooks/useKyverno', () => ({ useKyverno: () => mockUseKyverno() }))

vi.mock('../../../hooks/useTrivy', () => ({ useTrivy: () => mockUseTrivy() }))

vi.mock('../../../hooks/useKubescape', () => ({ useKubescape: () => mockUseKubescape() }))

import { ComplianceDrift } from '../ComplianceDrift'

describe('ComplianceDrift', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseDemoMode.mockReturnValue({ isDemoMode: true, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })
    mockUseCardLoadingState.mockReturnValue({ showSkeleton: false, showEmptyState: false, hasData: true, isRefreshing: false })
    mockUseKyverno.mockReturnValue({ statuses: {}, isLoading: false, isRefreshing: false, lastRefresh: null, isDemoData: false, refetch: vi.fn(), clustersChecked: 0, totalClusters: 0 })
    mockUseTrivy.mockReturnValue({ statuses: {}, isLoading: false, isRefreshing: false, isDemoData: false, refetch: vi.fn(), clustersChecked: 0, totalClusters: 0 })
    mockUseKubescape.mockReturnValue({ statuses: {}, isLoading: false, isRefreshing: false, isDemoData: false, refetch: vi.fn(), clustersChecked: 0, totalClusters: 0 })
  })

  it('renders without crashing', () => {
    const { container } = render(<ComplianceDrift />)
    expect(container).toBeTruthy()
  })

  it('calls useCardLoadingState during render', () => {
    render(<ComplianceDrift />)
    expect(mockUseCardLoadingState).toHaveBeenCalled()
  })

  it('passes hasAnyData=false when all tool statuses are errors', () => {
    mockUseKyverno.mockReturnValue({ statuses: { a: { error: 'kyverno failed', installed: true, policies: [] } }, isLoading: false, isRefreshing: false, lastRefresh: null, isDemoData: false, refetch: vi.fn(), clustersChecked: 1, totalClusters: 1 })
    mockUseTrivy.mockReturnValue({ statuses: { a: { error: 'trivy failed', installed: true, vulnerabilities: { critical: 0, high: 0, medium: 0, low: 0, unknown: 0 } } }, isLoading: false, isRefreshing: false, isDemoData: false, refetch: vi.fn(), clustersChecked: 1, totalClusters: 1 })
    mockUseKubescape.mockReturnValue({ statuses: { a: { error: 'kubescape failed', installed: true, overallScore: 0 } }, isLoading: false, isRefreshing: false, isDemoData: false, refetch: vi.fn(), clustersChecked: 1, totalClusters: 1 })

    render(<ComplianceDrift />)

    expect(mockUseCardLoadingState).toHaveBeenCalledWith(expect.objectContaining({ hasAnyData: false }))
  })

  it('renders correctly in demo mode', () => {
    mockUseDemoMode.mockReturnValue({ isDemoMode: true, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })
    const { container } = render(<ComplianceDrift />)
    expect(container).toBeTruthy()
  })

  it('renders correctly in non-demo mode', () => {
    mockUseDemoMode.mockReturnValue({ isDemoMode: false, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })
    const { container } = render(<ComplianceDrift />)
    expect(container).toBeTruthy()
  })

})