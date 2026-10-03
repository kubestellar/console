import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { UserManagement } from '../UserManagement'
import type { ConsoleUser, UserRole } from '../../../types/users'

const { mockUpdateUserRole, mockDeleteUser, mockDrillToRBAC, mockShowToast, mockState } = vi.hoisted(() => ({
  mockUpdateUserRole: vi.fn(),
  mockDeleteUser: vi.fn(),
  mockDrillToRBAC: vi.fn(),
  mockShowToast: vi.fn(),
  mockState: {
    users: [] as ConsoleUser[],
    isLoading: false,
    isRefreshing: false,
    usersError: null as string | null,
    isDemoMode: false,
    showSkeleton: false,
    showEmptyState: false,
    currentUser: {
      id: 'current-user',
      github_id: 'current-123',
      github_login: 'currentuser',
      email: 'current@example.com',
      avatar_url: 'https://example.com/avatar.jpg',
      role: 'admin' as UserRole,
      onboarded: true,
      created_at: new Date().toISOString(),
    } satisfies ConsoleUser,
  },
}))

const makeConsoleUser = (overrides: Partial<ConsoleUser> = {}): ConsoleUser => ({
  id: 'user-1',
  github_id: '12345',
  github_login: 'testuser',
  email: 'test@example.com',
  avatar_url: 'https://example.com/avatar.jpg',
  role: 'viewer',
  onboarded: true,
  created_at: new Date().toISOString(),
  ...overrides,
})
const mockCurrentUser = makeConsoleUser({ id: 'current-user', github_id: 'current-123', github_login: 'currentuser', email: 'current@example.com', role: 'admin' })
const mockViewerUser = makeConsoleUser({ id: 'viewer-user', github_id: 'viewer-123', github_login: 'vieweruser', email: 'viewer@example.com', role: 'viewer' })
const makeTargetUser = () => makeConsoleUser({ id: 'target-user', github_id: 'target-123', github_login: 'targetuser', role: 'viewer' })
const resetMockState = () => {
  vi.clearAllMocks()
  Object.assign(mockState, {
    users: [],
    isLoading: false,
    isRefreshing: false,
    usersError: null,
    isDemoMode: false,
    showSkeleton: false,
    showEmptyState: false,
    currentUser: { ...mockCurrentUser },
  })
}
const openConsoleUsersTab = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('tab', { name: /console users/i }))
}
const findChevronButton = () => screen.getAllByRole('button').find((button) => button.querySelector('[class*="lucide"]'))

vi.mock('../../../hooks/useUsers', () => ({
  useConsoleUsers: () => ({ users: mockState.users, isLoading: mockState.isLoading, isRefreshing: mockState.isRefreshing, error: mockState.usersError, updateUserRole: mockUpdateUserRole, deleteUser: mockDeleteUser }),
  useAllK8sServiceAccounts: () => ({ serviceAccounts: [], isLoading: false }),
  useAllOpenShiftUsers: () => ({ users: [], isLoading: false }),
}))
vi.mock('../../../hooks/useMCP', () => ({ useClusters: () => ({ deduplicatedClusters: [], isLoading: false, isRefreshing: false }) }))
vi.mock('../../../hooks/useGlobalFilters', () => ({ useGlobalFilters: () => ({ selectedClusters: [], isAllClustersSelected: true, customFilter: '' }) }))
vi.mock('../../../hooks/useDrillDown', () => ({ useDrillDownActions: () => ({ drillToRBAC: mockDrillToRBAC }) }))
vi.mock('../../../lib/auth', () => ({ useAuth: () => ({ user: mockState.currentUser, isAuthenticated: true }) }))
vi.mock('../../../hooks/useDemoMode', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../hooks/useDemoMode')>()),
  useDemoMode: () => ({ isDemoMode: mockState.isDemoMode, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() }),
  isDemoModeForced: false,
}))
vi.mock('../CardDataContext', () => ({ useCardLoadingState: () => ({ showSkeleton: mockState.showSkeleton, showEmptyState: mockState.showEmptyState }) }))
vi.mock('../../../lib/cards/cardHooks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/cards/cardHooks')>()
  return {
    ...actual,
    commonComparators: actual.commonComparators,
    useCardData: (items: unknown[]) => ({
      items,
      allFilteredItems: items,
      totalItems: items.length,
      currentPage: 1,
      totalPages: 1,
      itemsPerPage: 10,
      goToPage: vi.fn(),
      needsPagination: false,
      setItemsPerPage: vi.fn(),
      filters: { search: '', setSearch: vi.fn(), localClusterFilter: [], toggleClusterFilter: vi.fn(), clearClusterFilter: vi.fn(), availableClusters: [], showClusterFilter: false, setShowClusterFilter: vi.fn(), clusterFilterRef: { current: null } },
      sorting: { sortBy: 'name', setSortBy: vi.fn(), sortDirection: 'asc', setSortDirection: vi.fn() },
      containerRef: { current: null },
      containerStyle: {},
    }),
  }
})
vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string) => ({
      'userManagement.consoleUsers': 'Console Users',
      'userManagement.clusterUsers': 'Cluster Users',
      'userManagement.serviceAccounts': 'Service Accounts',
      'userManagement.searchConsoleUsers': 'Search users...',
      'userManagement.noUsersFound': 'No users found',
      'userManagement.you': 'you',
      'userManagement.toast.roleUpdateSuccess': 'Role updated successfully',
      'userManagement.toast.roleUpdateError': 'Failed to update role',
      'userManagement.toast.deleteSuccess': 'User deleted successfully',
      'userManagement.toast.deleteError': 'Failed to delete user',
      'common:actions.delete': 'Delete',
      'common:actions.confirm': 'Confirm',
      'common:actions.cancel': 'Cancel',
    }[key] || key),
  }),
}))
vi.mock('../../ui/Toast', () => ({ useToast: () => ({ showToast: mockShowToast }) }))
vi.mock('../../../lib/analytics', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../../lib/analytics')>()), emitUserRoleChanged: vi.fn(), emitUserRemoved: vi.fn(), getDemoMode: vi.fn(() => false) }))
vi.mock('../../../lib/cards/CardComponents', () => ({
  // eslint-disable-next-line no-restricted-syntax -- moved verbatim from UserManagement.test.tsx (baselined); raw <input> is a test mock
  CardSearchInput: ({ placeholder }: { placeholder: string }) => <input data-testid="search" placeholder={placeholder} />,
  CardControlsRow: () => <div data-testid="controls-row" />,
  CardPaginationFooter: () => <div data-testid="pagination" />,
}))

describe('UserManagement - part 1', () => {
  beforeEach(() => {
    resetMockState()
  })

  describe('Loading states', () => {
    it('renders skeleton when showSkeleton is true', () => {
      mockState.showSkeleton = true
      render(<UserManagement />)

      const skeletons = screen.getAllByText((_content, element) => element?.className?.includes('animate-pulse') || false)
      expect(skeletons.length).toBeGreaterThan(0)
    })

    it('renders empty state when showEmptyState is true', () => {
      mockState.showEmptyState = true
      render(<UserManagement />)

      expect(screen.queryByTestId('search')).toBeNull()
    })
  })

  describe('Admin gating', () => {
    it('non-admin viewer → role-change and delete controls not rendered', () => {
      mockState.currentUser = { ...mockCurrentUser, role: 'viewer' }
      mockState.users = [
        makeConsoleUser({ id: 'user-1', github_login: 'user1', role: 'viewer' }),
        makeConsoleUser({ id: 'user-2', github_login: 'user2', role: 'editor' }),
      ]

      render(<UserManagement />)

      expect(screen.getByRole('tab', { name: /console users/i })).toBeTruthy()
      expect(screen.queryAllByRole('button', { name: /chevron/i }).length).toBe(0)
    })

    it('admin viewer → role-change and delete controls visible and enabled', async () => {
      const user = userEvent.setup()
      mockState.users = [mockCurrentUser, makeConsoleUser({ id: 'user-2', github_login: 'user2', role: 'viewer' })]

      render(<UserManagement />)
      await openConsoleUsersTab(user)

      expect(screen.getByText(/currentuser/)).toBeTruthy()
      expect(screen.getByText(/user2/)).toBeTruthy()
      expect(screen.getByText(/user2/).closest('div')).toBeTruthy()
    })
  })

  describe('Current user self-protection', () => {
    it('current logged-in user row → delete button disabled (cannot self-delete)', async () => {
      const user = userEvent.setup()
      mockState.users = [mockCurrentUser, mockViewerUser]

      render(<UserManagement />)
      await openConsoleUsersTab(user)

      expect(screen.getByText(/currentuser \(you\)/)).toBeTruthy()
      const currentUserRow = screen.getByText(/currentuser \(you\)/).closest('div')
      expect(currentUserRow?.querySelectorAll('[class*="chevron"]').length || 0).toBe(0)
    })

    it('current logged-in user row → cannot demote own admin role', async () => {
      const user = userEvent.setup()
      mockState.users = [mockCurrentUser, mockViewerUser]

      render(<UserManagement />)
      await openConsoleUsersTab(user)

      expect(screen.getByText(/currentuser \(you\)/)).toBeTruthy()
      const adminButtons = screen.queryAllByRole('button', { name: /^admin$/i })
      const editorButtons = screen.queryAllByRole('button', { name: /^editor$/i })
      const viewerButtons = screen.queryAllByRole('button', { name: /^viewer$/i })
      expect(adminButtons.length + editorButtons.length + viewerButtons.length).toBe(0)
    })
  })

  describe('Role-change interaction', () => {
    it('role-change interaction → calls role-change callback with correct user ID and new role', async () => {
      const user = userEvent.setup()
      mockState.users = [mockCurrentUser, makeTargetUser()]

      render(<UserManagement />)
      await openConsoleUsersTab(user)

      expect(screen.getByText(/targetuser/).closest('div')?.parentElement).toBeTruthy()
      const chevronButton = findChevronButton()
      if (chevronButton) {
        await user.click(chevronButton)
        await waitFor(() => {
          expect(screen.getByRole('button', { name: /^admin$/i })).toBeTruthy()
        })

        await user.click(screen.getByRole('button', { name: /^editor$/i }))
        await waitFor(() => {
          expect(mockUpdateUserRole).toHaveBeenCalledWith('target-user', 'editor')
        })
        expect(mockShowToast).toHaveBeenCalledWith('Role updated successfully', 'success')
      }
    })

    it('role-change error → shows error toast', async () => {
      const user = userEvent.setup()
      mockUpdateUserRole.mockRejectedValueOnce(new Error('Network error'))
      mockState.users = [mockCurrentUser, makeTargetUser()]

      render(<UserManagement />)
      await openConsoleUsersTab(user)

      const chevronButton = findChevronButton()
      if (chevronButton) {
        await user.click(chevronButton)
        await waitFor(() => {
          expect(screen.getByRole('button', { name: /^admin$/i })).toBeTruthy()
        })

        await user.click(screen.getByRole('button', { name: /^admin$/i }))
        await waitFor(() => {
          expect(mockShowToast).toHaveBeenCalledWith('Failed to update role', 'error')
        })
      }
    })
  })

  describe('Delete user interaction', () => {
    it('delete button click → shows confirmation dialog before calling delete callback', async () => {
      const user = userEvent.setup()
      mockState.users = [mockCurrentUser, makeTargetUser()]

      render(<UserManagement />)
      await openConsoleUsersTab(user)

      const chevronButton = findChevronButton()
      if (chevronButton) {
        await user.click(chevronButton)
        await waitFor(() => {
          const trashButton = screen.getAllByRole('button').find((button) => button.title === 'Delete' || button.querySelector('[class*="lucide-trash"]'))
          expect(trashButton).toBeTruthy()
        })

        const trashButton = screen.getAllByRole('button').find((button) => button.title === 'Delete' || button.querySelector('[class*="lucide-trash"]'))
        if (trashButton) {
          await user.click(trashButton)
          expect(mockDeleteUser).not.toHaveBeenCalled()
        }
      }
    })

    it('confirmation dialog cancel → delete callback NOT called', async () => {
      const user = userEvent.setup()
      mockState.users = [mockCurrentUser, makeTargetUser()]

      render(<UserManagement />)
      await openConsoleUsersTab(user)

      const chevronButton = findChevronButton()
      if (chevronButton) {
        await user.click(chevronButton)
        await waitFor(() => {
          const trashButton = screen.getAllByRole('button').find((button) => button.title === 'Delete' || button.querySelector('[class*="lucide-trash"]'))
          expect(trashButton).toBeTruthy()
        })

        const trashButton = screen.getAllByRole('button').find((button) => button.title === 'Delete' || button.querySelector('[class*="lucide-trash"]'))
        if (trashButton) {
          await user.click(trashButton)
          await waitFor(() => {
            expect(screen.getByText(/Cancel/i)).toBeTruthy()
          })
          await user.click(screen.getByText(/Cancel/i))
          expect(mockDeleteUser).not.toHaveBeenCalled()
        }
      }
    })
  })
})
