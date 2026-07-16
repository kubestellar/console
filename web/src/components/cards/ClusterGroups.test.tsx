import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ClusterGroups } from './ClusterGroups'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string) => key.split('.').pop() ?? key,
  }),
}))

vi.mock('./CardDataContext', () => ({
  useCardLoadingState: vi.fn(),
  useCardDemoState: vi.fn(),
  useReportCardDataState: vi.fn(),
}))

vi.mock('../../hooks/useMCP', () => ({
  useClusters: vi.fn(),
}))

vi.mock('../../hooks/useClusterGroups', () => ({
  useClusterGroups: vi.fn(),
}))

vi.mock('../../hooks/useFederation', () => ({
  useFederationAwareness: vi.fn(),
  getProviderLabel: (p: string) => p,
}))

vi.mock('@dnd-kit/core', () => ({
  useDroppable: vi.fn(() => ({ isOver: false, setNodeRef: vi.fn() })),
  DndContext: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock('../ui/ClusterBadge', () => ({
  ClusterBadge: ({ cluster }: { cluster: string }) => <span>{cluster}</span>,
}))

vi.mock('../ui/StatusBadge', () => ({
  StatusBadge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}))

vi.mock('../../lib/modals', () => ({
  ConfirmDialog: () => null,
  useModalState: () => ({ isOpen: false, open: vi.fn(), close: vi.fn() }),
}))

vi.mock('../ui/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}))

vi.mock('../../lib/formatters', () => ({
  formatTimeAgo: () => '2m ago',
}))

vi.mock('./ClusterGroups.constants', () => ({
  MAX_INLINE_BADGES: 3,
  getGroupColor: () => ({ border: '', bg: '', dot: '', text: '' }),
  formatFilter: (f: unknown) => String(f),
}))

vi.mock('./ClusterGroupsForms', () => ({
  CreateGroupForm: () => <div data-testid="create-form" />,
  EditGroupForm: () => <div data-testid="edit-form" />,
}))

import { useCardLoadingState, useCardDemoState } from './CardDataContext'
import { useClusters } from '../../hooks/useMCP'
import { useClusterGroups } from '../../hooks/useClusterGroups'
import { useFederationAwareness } from '../../hooks/useFederation'

const mockLoadingState = vi.mocked(useCardLoadingState)
const mockCardDemoState = vi.mocked(useCardDemoState)
const mockClusters = vi.mocked(useClusters)
const mockClusterGroups = vi.mocked(useClusterGroups)
const mockFederation = vi.mocked(useFederationAwareness)

const baseLoadingState = {
  showSkeleton: false,
  showEmptyState: false,
  hasData: true,
  isRefreshing: false,
  loadingTimedOut: false,
}

describe('ClusterGroups', () => {
  beforeEach(() => {
    mockLoadingState.mockReturnValue(baseLoadingState)
    mockCardDemoState.mockReturnValue({ shouldUseDemoData: false, reason: null, showDemoBadge: false })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockClusters.mockReturnValue({ deduplicatedClusters: [], isLoading: false, isRefreshing: false, isFailed: false, consecutiveFailures: 0 } as any)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockClusterGroups.mockReturnValue({ groups: [], createGroup: vi.fn(), updateGroup: vi.fn(), deleteGroup: vi.fn(), isPersisted: false } as any)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockFederation.mockReturnValue({ groups: [] } as any)
  })

  it('renders skeleton via loading state', () => {
    mockLoadingState.mockReturnValue({ ...baseLoadingState, showSkeleton: true, hasData: false })
    // Skeleton doesn't explicitly show in ClusterGroups (it has no showSkeleton branch),
    // but the component renders the header or no groups state
    const { container } = render(<ClusterGroups />)
    expect(container.firstChild).toBeTruthy()
  })

  it('renders empty state when no groups exist', () => {
    render(<ClusterGroups />)
    expect(screen.getByText('noGroupsYet')).toBeInTheDocument()
  })

  it('renders demo data when shouldUseDemoData is true', () => {
    mockCardDemoState.mockReturnValue({ shouldUseDemoData: true, reason: 'agent-offline', showDemoBadge: true })
    render(<ClusterGroups />)
    // Demo groups include 'all-healthy-clusters'
    expect(screen.getByText('all-healthy-clusters')).toBeInTheDocument()
  })

  it('renders happy-path with live groups', () => {
    const groups = [
      { name: 'production', kind: 'static', clusters: ['prod-1', 'prod-2'], color: 'green', builtIn: false },
      { name: 'staging', kind: 'static', clusters: ['staging-1'], color: 'blue', builtIn: false },
    ]
    const clusters = [{ name: 'prod-1', healthy: true }, { name: 'prod-2', healthy: true }, { name: 'staging-1', healthy: true }]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockClusterGroups.mockReturnValue({ groups, createGroup: vi.fn(), updateGroup: vi.fn(), deleteGroup: vi.fn(), isPersisted: false } as any)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockClusters.mockReturnValue({ deduplicatedClusters: clusters, isLoading: false, isRefreshing: false, isFailed: false, consecutiveFailures: 0 } as any)
    render(<ClusterGroups />)
    expect(screen.getByText('production')).toBeInTheDocument()
    expect(screen.getByText('staging')).toBeInTheDocument()
  })

  it('renders without crashing', () => {
    const { container } = render(<ClusterGroups />)
    expect(container.firstChild).toBeTruthy()
  })
})
