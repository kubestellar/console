// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

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

  it('opens CreateGroupForm when Clicking "New Group"', () => {
    mockUseDemoMode.mockReturnValue({ isDemoMode: false, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })
    render(<ClusterGroups />)
    
    const newGroupButton = screen.getByText('cards:clusterGroups.newGroup')
    fireEvent.click(newGroupButton)
    
    expect(screen.getByText('cards:clusterGroups.newClusterGroup')).toBeInTheDocument()
  })

  it('renders a list of groups with names and cluster counts', () => {
    mockUseDemoMode.mockReturnValue({ isDemoMode: false, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })
    mockUseClusterGroups.mockReturnValue({
      groups: [
        { name: 'Group A', kind: 'static', clusters: ['c1', 'c2'], color: 'blue' },
        { name: 'Group B', kind: 'dynamic', clusters: ['c3'], color: 'green' }
      ],
      createGroup: vi.fn(),
      updateGroup: vi.fn(),
      deleteGroup: vi.fn(),
      isPersisted: false,
    })
    
    render(<ClusterGroups />)
    
    expect(screen.getByText('Group A')).toBeInTheDocument()
    expect(screen.getByText('Group B')).toBeInTheDocument()
    // Should show cluster counts (2/2 and 1/1 because mockUseClusters returns empty by default)
    // Wait, ClusterGroups.tsx calculates healthyCount using clusterHealthMap.
    // If clusters list is empty, healthyCount will be number of clusters since they aren't in map as false.
    expect(screen.getByText(/2\/2/)).toBeInTheDocument()
    expect(screen.getByText(/1\/1/)).toBeInTheDocument()
  })

  it('opens EditGroupForm when clicking edit button', () => {
    mockUseClusterGroups.mockReturnValue({
      groups: [{ name: 'Group A', kind: 'static', clusters: ['c1'], color: 'blue' }],
      createGroup: vi.fn(),
      updateGroup: vi.fn(),
      deleteGroup: vi.fn(),
      isPersisted: false,
    })
    
    mockUseDemoMode.mockReturnValue({ isDemoMode: false, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })
    render(<ClusterGroups />)
    
    const editButton = screen.getByLabelText('cards:clusterGroups.editGroup')
    fireEvent.click(editButton)
    
    // EditGroupForm should render. It likely has a "Save Changes" button or similar.
    // In ClusterGroupsForms.tsx, EditGroupForm is similar to CreateGroupForm.
    // Let's check for "Group Name" input or a specific title.
    // Actually, EditGroupForm in ClusterGroups.tsx is rendered within the same loop.
    expect(screen.getByText(/common.edit.*Group A/)).toBeInTheDocument()
  })

  it('calls deleteGroup when confirmation is accepted', () => {
    const deleteGroup = vi.fn()
    mockUseClusterGroups.mockReturnValue({
      groups: [{ name: 'Group A', kind: 'static', clusters: ['c1'], color: 'blue' }],
      createGroup: vi.fn(),
      updateGroup: vi.fn(),
      deleteGroup,
      isPersisted: false,
    })
    
    mockUseDemoMode.mockReturnValue({ isDemoMode: false, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })
    render(<ClusterGroups />)
    
    const deleteButton = screen.getByLabelText('cards:clusterGroups.deleteGroup')
    fireEvent.click(deleteButton)
    
    // ConfirmDialog should be open.
    // It has a title 'cards:clusterGroups.deleteGroup' (same as button labal but in a dialog).
    // And a confirm button with text 'common:actions.delete'.
    const confirmButton = screen.getByText('common:actions.delete')
    fireEvent.click(confirmButton)
    
    expect(deleteGroup).toHaveBeenCalledWith('Group A')
  })
})
