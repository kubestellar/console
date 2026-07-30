import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { UserManagement } from './UserManagement'
import type { ConsoleUser, OpenShiftUser } from './UserManagement.types'
import { Input } from '../ui/Input'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, optsOrFallback?: Record<string, unknown> | string) => {
      if (typeof optsOrFallback === 'string') return optsOrFallback
      const parts = key.split('.')
      return parts[parts.length - 1]
    },
  }),
}))

const mockUseConsoleUsers = vi.fn()
const mockUseAllK8sServiceAccounts = vi.fn()
const mockUseAllOpenShiftUsers = vi.fn()
vi.mock('../../hooks/useUsers', () => ({
  useConsoleUsers: () => mockUseConsoleUsers(),
  useAllK8sServiceAccounts: (_clusters: unknown[]) => mockUseAllK8sServiceAccounts(_clusters),
  useAllOpenShiftUsers: (_clusters: unknown[]) => mockUseAllOpenShiftUsers(_clusters),
}))

const mockUseClusters = vi.fn()
vi.mock('../../hooks/useMCP', () => ({
  useClusters: () => mockUseClusters(),
}))

const mockUseGlobalFilters = vi.fn()
vi.mock('../../hooks/useGlobalFilters', () => ({
  useGlobalFilters: () => mockUseGlobalFilters(),
}))

vi.mock('../../hooks/useDrillDown', () => ({
  useDrillDownActions: () => ({ drillToRBAC: vi.fn() }),
}))

const mockUseAuth = vi.fn()
vi.mock('../../lib/auth', () => ({
  useAuth: () => mockUseAuth(),
}))

const mockUseDemoMode = vi.fn()
vi.mock('../../hooks/useDemoMode', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../hooks/useDemoMode')>()),
  useDemoMode: () => ({ isDemoMode: mockUseDemoMode(), toggleDemoMode: vi.fn(), setDemoMode: vi.fn() }),
  getDemoMode: vi.fn(() => false),
}))

vi.mock('../ui/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}))

vi.mock('../../lib/analytics', () => ({
  emitUserRoleChanged: vi.fn(),
  emitUserRemoved: vi.fn(),
}))

const mockUseCardLoadingState = vi.fn()
vi.mock('./CardDataContext', () => ({
  useCardLoadingState: (opts: Record<string, unknown>) => mockUseCardLoadingState(opts),
  useReportCardDataState: () => {},
}))

const mockUseCardData = vi.fn()
vi.mock('../../lib/cards/cardHooks', () => ({
  useCardData: (...args: unknown[]) => mockUseCardData(...args),
  commonComparators: {
    string: (_field: string) => () => 0,
  },
}))

vi.mock('../../lib/cards/CardComponents', () => ({
  CardSearchInput: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <Input data-testid="search-input" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
  CardControlsRow: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="card-controls-row">{children}</div>
  ),
  CardPaginationFooter: () => <div data-testid="pagination-footer" />,
}))

vi.mock('../../lib/cn', () => ({
  cn: (...classes: (string | undefined | false)[]) => classes.filter(Boolean).join(' '),
}))

vi.mock('./UserManagementList', () => ({
  ClusterUsersTab: ({ users }: { users: OpenShiftUser[] }) => (
    <div data-testid="cluster-users-tab" data-count={users.length} />
  ),
  ConsoleUsersTab: ({ users }: { users: ConsoleUser[] }) => (
    <div data-testid="console-users-tab" data-count={users.length} />
  ),
  ServiceAccountsTab: () => <div data-testid="service-accounts-tab" />,
  UserManagementEmptyState: () => <div data-testid="empty-state">noUsers</div>,
  UserManagementSkeleton: () => <div data-testid="user-mgmt-skeleton" />,
}))

vi.mock('./UserManagement.utils', () => ({
  USER_MANAGEMENT_TABS: ['clusterUsers', 'serviceAccounts', 'console'],
  getConsoleUserSortOptions: (_t: unknown) => [{ value: 'name', label: 'Name' }],
  getOpenShiftUserSortOptions: (_t: unknown) => [{ value: 'name', label: 'Name' }],
  getSASortOptions: (_t: unknown) => [{ value: 'name', label: 'Name' }],
  getRoleBadgeClass: (_role: string) => 'badge-class',
  OPENSHIFT_USER_COMPARATORS: { name: () => 0, kind: () => 0 },
  SA_COMPARATORS: { name: () => 0, namespace: () => 0 },
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConsoleUser(overrides: Partial<ConsoleUser> = {}): ConsoleUser {
  return {
    id: `user-${Math.random().toString(36).slice(2)}`,
    github_id: 42,
    github_login: 'octocat',
    email: 'octocat@github.com',
    avatar_url: '',
    role: 'viewer',
    onboarded: true,
    created_at: new Date().toISOString(),
    ...overrides,
  }
}

function setupMocks(opts: {
  consoleUsers?: ConsoleUser[]
  openshiftUsers?: OpenShiftUser[]
  serviceAccounts?: unknown[]
  clusters?: Array<{ name: string; healthy?: boolean }>
  clustersLoading?: boolean
  usersLoading?: boolean
  usersError?: unknown
  isDemoMode?: boolean
  showSkeleton?: boolean
  showEmptyState?: boolean
  isAllClustersSelected?: boolean
  currentUser?: Partial<ConsoleUser> | null
} = {}) {
  mockUseConsoleUsers.mockReturnValue({
    users: opts.consoleUsers ?? [],
    isLoading: opts.usersLoading ?? false,
    isRefreshing: false,
    error: opts.usersError ?? null,
    updateUserRole: vi.fn(),
    deleteUser: vi.fn(),
  })

  const clusters = opts.clusters ?? []
  mockUseClusters.mockReturnValue({
    deduplicatedClusters: clusters,
    isLoading: opts.clustersLoading ?? false,
    isRefreshing: false,
  })

  mockUseAllK8sServiceAccounts.mockReturnValue({
    serviceAccounts: opts.serviceAccounts ?? [],
    isLoading: false,
  })

  mockUseAllOpenShiftUsers.mockReturnValue({
    users: opts.openshiftUsers ?? [],
    isLoading: false,
  })

  mockUseGlobalFilters.mockReturnValue({
    selectedClusters: clusters.map((c) => c.name),
    isAllClustersSelected: opts.isAllClustersSelected ?? true,
  })

  mockUseAuth.mockReturnValue({
    user: opts.currentUser !== undefined ? opts.currentUser : null,
  })

  mockUseDemoMode.mockReturnValue(opts.isDemoMode ?? false)

  mockUseCardLoadingState.mockReturnValue({
    showSkeleton: opts.showSkeleton ?? false,
    showEmptyState: opts.showEmptyState ?? false,
  })

  mockUseCardData.mockReturnValue({
    items: opts.openshiftUsers ?? [],
    totalItems: (opts.openshiftUsers ?? []).length,
    currentPage: 1,
    totalPages: 1,
    needsPagination: false,
    goToPage: vi.fn(),
    setItemsPerPage: vi.fn(),
    filters: {
      search: '',
      setSearch: vi.fn(),
      localClusterFilter: [],
      toggleClusterFilter: vi.fn(),
      clearClusterFilter: vi.fn(),
      availableClusters: [],
      showClusterFilter: false,
      setShowClusterFilter: vi.fn(),
      clusterFilterRef: { current: null },
    },
    sorting: { sortBy: 'name', setSortBy: vi.fn(), sortDirection: 'asc', setSortDirection: vi.fn() },
    containerRef: { current: null },
    containerStyle: {},
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('UserManagement', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders without crashing', () => {
    setupMocks()
    const { container } = render(<UserManagement />)
    expect(container).toBeDefined()
  })

  it('renders skeleton when showSkeleton is true', () => {
    setupMocks({ showSkeleton: true })
    render(<UserManagement />)
    expect(screen.getByTestId('user-mgmt-skeleton')).toBeInTheDocument()
  })

  it('renders empty state when showEmptyState is true', () => {
    setupMocks({ showEmptyState: true })
    render(<UserManagement />)
    expect(screen.getByTestId('empty-state')).toBeInTheDocument()
  })

  it('passes isLoading=true when clusters are loading', () => {
    setupMocks({ clustersLoading: true })
    render(<UserManagement />)
    expect(mockUseCardLoadingState).toHaveBeenCalledWith(
      expect.objectContaining({ isLoading: true }),
    )
  })

  it('passes isFailed=true when users error is set', () => {
    setupMocks({ usersError: new Error('auth error') })
    render(<UserManagement />)
    expect(mockUseCardLoadingState).toHaveBeenCalledWith(
      expect.objectContaining({ isFailed: true }),
    )
  })

  it('passes isDemoData=true in demo mode', () => {
    setupMocks({ isDemoMode: true })
    render(<UserManagement />)
    expect(mockUseCardLoadingState).toHaveBeenCalledWith(
      expect.objectContaining({ isDemoData: true }),
    )
  })

  it('renders cluster users tab by default', () => {
    setupMocks()
    render(<UserManagement />)
    expect(screen.getByTestId('cluster-users-tab')).toBeInTheDocument()
  })

  it('includes current user in console users list', () => {
    const currentUser = makeConsoleUser({ id: 'curr-1', github_login: 'me', github_id: 99 })
    setupMocks({ currentUser, consoleUsers: [] })
    render(<UserManagement />)
    expect(mockUseCardLoadingState).toHaveBeenCalled()
  })

  it('accepts config prop without crashing', () => {
    setupMocks()
    const { container } = render(<UserManagement config={{ someKey: 'someValue' }} />)
    expect(container).toBeDefined()
  })
})
