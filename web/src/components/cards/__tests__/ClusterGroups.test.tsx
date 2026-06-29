import React from 'react'
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

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

const mockUseDemoMode = vi.fn(() => ({ isDemoMode: false, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() }))
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
const mockUseCardDemoState = vi.fn()
vi.mock('../CardDataContext', () => ({
  useReportCardDataState: vi.fn(),
  useCardLoadingState: (opts: unknown) => mockUseCardLoadingState(opts),
  useCardDemoState: (opts: unknown) => mockUseCardDemoState(opts),
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
    mockUseCardDemoState.mockReturnValue({
      shouldUseDemoData: true,
      reason: 'global-demo-mode',
      showDemoBadge: true,
    })
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

  it('opens CreateGroupForm when Clicking "New Group"', async () => {
    const user = userEvent.setup()
    mockUseDemoMode.mockReturnValue({ isDemoMode: false, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })
    mockUseCardDemoState.mockReturnValue({
      shouldUseDemoData: false,
      reason: null,
      showDemoBadge: false,
    })
    render(<ClusterGroups />)
    
    const newGroupButton = screen.getByRole('button', { name: 'cards:clusterGroups.newGroup' })
    await user.click(newGroupButton)
    
    expect(screen.getByText('cards:clusterGroups.newClusterGroup')).toBeInTheDocument()
  })

  it('renders a list of groups with names and cluster counts', () => {
    mockUseDemoMode.mockReturnValue({ isDemoMode: false, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })
    mockUseCardDemoState.mockReturnValue({
      shouldUseDemoData: false,
      reason: null,
      showDemoBadge: false,
    })
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
    // Verify that the computed cluster counts match the expected format (healthy/total)
    expect(screen.getByText(/2\/2/)).toBeInTheDocument()
    expect(screen.getByText(/1\/1/)).toBeInTheDocument()
  })

  it('opens EditGroupForm when clicking edit button', async () => {
    const user = userEvent.setup()
    mockUseClusterGroups.mockReturnValue({
      groups: [{ name: 'Group A', kind: 'static', clusters: ['c1'], color: 'blue' }],
      createGroup: vi.fn(),
      updateGroup: vi.fn(),
      deleteGroup: vi.fn(),
      isPersisted: false,
    })
    
    mockUseDemoMode.mockReturnValue({ isDemoMode: false, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })
    mockUseCardDemoState.mockReturnValue({
      shouldUseDemoData: false,
      reason: null,
      showDemoBadge: false,
    })
    render(<ClusterGroups />)
    
    const editButton = screen.getByRole('button', { name: 'cards:clusterGroups.editGroup' })
    await user.click(editButton)
    
    expect(screen.getByText(/common.edit.*Group A/)).toBeInTheDocument()
  })

  it('calls deleteGroup when confirmation is accepted', async () => {
    const user = userEvent.setup()
    const deleteGroup = vi.fn()
    mockUseClusterGroups.mockReturnValue({
      groups: [{ name: 'Group A', kind: 'static', clusters: ['c1'], color: 'blue' }],
      createGroup: vi.fn(),
      updateGroup: vi.fn(),
      deleteGroup,
      isPersisted: false,
    })
    
    mockUseDemoMode.mockReturnValue({ isDemoMode: false, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })
    mockUseCardDemoState.mockReturnValue({
      shouldUseDemoData: false,
      reason: null,
      showDemoBadge: false,
    })
    render(<ClusterGroups />)
    
    const deleteButton = screen.getByRole('button', { name: 'cards:clusterGroups.deleteGroup' })
    await user.click(deleteButton)
    
    const confirmButton = screen.getByRole('button', { name: 'common:actions.delete' })
    await user.click(confirmButton)
    
    expect(deleteGroup).toHaveBeenCalledWith('Group A')
  })
})
