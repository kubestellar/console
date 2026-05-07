import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'

vi.mock('../../../lib/demoMode', () => ({
  isDemoMode: () => true,
  getDemoMode: () => true,
  isNetlifyDeployment: false,
  isDemoModeForced: false,
  canToggleDemoMode: () => true,
  setDemoMode: vi.fn(),
  toggleDemoMode: vi.fn(),
  subscribeDemoMode: () => () => {},
  isDemoToken: () => true,
  hasRealToken: () => false,
  setDemoToken: vi.fn(),
  isFeatureEnabled: () => true,
}))

const mockUseDemoMode = vi.fn()
vi.mock('../../../hooks/useDemoMode', () => ({
  getDemoMode: () => true,
  default: () => true,
  useDemoMode: () => mockUseDemoMode(),
  hasRealToken: () => false,
  isDemoModeForced: false,
  isNetlifyDeployment: false,
  canToggleDemoMode: () => true,
  isDemoToken: () => true,
  setDemoToken: vi.fn(),
  setGlobalDemoMode: vi.fn(),
}))

vi.mock('../../../lib/analytics', () => ({
  emitNavigate: vi.fn(),
  emitLogin: vi.fn(),
  emitEvent: vi.fn(),
  analyticsReady: Promise.resolve(),
  emitAddCardModalOpened: vi.fn(),
  emitCardExpanded: vi.fn(),
  emitCardRefreshed: vi.fn(),
  markErrorReported: vi.fn(),
}))

vi.mock('../../../hooks/useTokenUsage', () => ({
  useTokenUsage: () => ({ usage: { total: 0, remaining: 0, used: 0 }, isLoading: false }),
  tokenUsageTracker: {
    getUsage: () => ({ total: 0, remaining: 0, used: 0 }),
    trackRequest: vi.fn(),
    getSettings: () => ({ enabled: false }),
  },
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

const mockUseClusters = vi.fn()
vi.mock('../../../hooks/useMCP', () => ({
  useClusters: () => mockUseClusters(),
}))

const mockUseClusterGroups = vi.fn()
vi.mock('../../../hooks/useClusterGroups', () => ({
  useClusterGroups: () => mockUseClusterGroups(),
}))

const mockUseFederationAwareness = vi.fn()
vi.mock('../../../hooks/useFederation', () => ({
  useFederationAwareness: () => mockUseFederationAwareness(),
  getProviderLabel: (provider: string) => provider,
}))

const mockUseToast = vi.fn()
vi.mock('../../ui/Toast', () => ({
  useToast: () => mockUseToast(),
}))

vi.mock('@dnd-kit/core', () => ({
  useDroppable: () => ({ setNodeRef: vi.fn(), isOver: false }),
  useDraggable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    isDragging: false,
  }),
}))

import { ClusterGroups } from '../ClusterGroups'

describe('ClusterGroups', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseDemoMode.mockReturnValue({ isDemoMode: true, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })
    mockUseToast.mockReturnValue({ showToast: vi.fn() })
    mockUseClusterGroups.mockReturnValue({
      groups: [],
      createGroup: vi.fn(),
      updateGroup: vi.fn(),
      deleteGroup: vi.fn(),
      isPersisted: false,
    })
    mockUseFederationAwareness.mockReturnValue({ groups: [] })
    mockUseCardLoadingState.mockReturnValue({ showSkeleton: false, showEmptyState: false, hasData: true, isRefreshing: false })
    mockUseClusters.mockReturnValue({
      clusters: [],
      deduplicatedClusters: [],
      isLoading: false,
      isRefreshing: false,
      isFailed: false,
      consecutiveFailures: 0,
      error: null,
      lastRefresh: Date.now(),
    })
  })

  it('renders without crashing', () => {
    const { container } = render(<ClusterGroups />)
    expect(container).toBeTruthy()
  })

  it('calls useCardLoadingState during render', () => {
    render(<ClusterGroups />)
    expect(mockUseCardLoadingState).toHaveBeenCalled()
  })

  it('renders correctly in demo mode', () => {
    mockUseDemoMode.mockReturnValue({ isDemoMode: true, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })
    const { container } = render(<ClusterGroups />)
    expect(container).toBeTruthy()
  })

  it('renders correctly in non-demo mode', () => {
    mockUseDemoMode.mockReturnValue({ isDemoMode: false, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })
    const { container } = render(<ClusterGroups />)
    expect(container).toBeTruthy()
  })

  it('renders with cluster data available', () => {
    mockUseClusters.mockReturnValue({
      clusters: [{ name: 'prod-cluster', healthy: true, reachable: true, nodeCount: 3, podCount: 10, cpuCores: 8, memoryGB: 16, cpuRequestsCores: 4, memoryRequestsGB: 8 }],
      deduplicatedClusters: [{ name: 'prod-cluster', healthy: true, reachable: true, nodeCount: 3, podCount: 10, cpuCores: 8, memoryGB: 16, cpuRequestsCores: 4, memoryRequestsGB: 8 }],
      isLoading: false,
      isRefreshing: false,
      isFailed: false,
      consecutiveFailures: 0,
      error: null,
      lastRefresh: Date.now(),
    })
    const { container } = render(<ClusterGroups />)
    expect(container).toBeTruthy()
  })
})
