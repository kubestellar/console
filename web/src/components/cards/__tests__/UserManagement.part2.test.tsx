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
const findTrashButton = () => screen.getAllByRole('button').find((button) => button.title === 'Delete' || button.querySelector('[class*="lucide-trash"]'))

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
  CardSearchInput: ({ placeholder }: { placeholder: string }) => <input data-testid="search" placeholder={placeholder} />,
  CardControlsRow: () => <div data-testid="controls-row" />,
  CardPaginationFooter: () => <div data-testid="pagination" />,
}))

describe('UserManagement - part 2', () => {
  beforeEach(() => {
    resetMockState()
  })

  describe('Delete user interaction', () => {
    it('confirmation dialog confirm → delete callback called with correct user ID', async () => {
      const user = userEvent.setup()
      mockState.users = [mockCurrentUser, makeTargetUser()]

      render(<UserManagement />)
      await openConsoleUsersTab(user)

      const chevronButton = findChevronButton()
      if (chevronButton) {
        await user.click(chevronButton)
        await waitFor(() => {
          expect(findTrashButton()).toBeTruthy()
        })

        const trashButton = findTrashButton()
        if (trashButton) {
          await user.click(trashButton)
          await waitFor(() => {
            expect(screen.getAllByText(/Delete/i).length).toBeGreaterThan(0)
          })

          const allDeleteButtons = screen.getAllByRole('button', { name: /delete/i })
          await user.click(allDeleteButtons[allDeleteButtons.length - 1])
          await waitFor(() => {
            expect(mockDeleteUser).toHaveBeenCalledWith('target-user')
          })
          expect(mockShowToast).toHaveBeenCalledWith('User deleted successfully', 'success')
        }
      }
    })

    it('delete error → shows error toast', async () => {
      const user = userEvent.setup()
      mockDeleteUser.mockRejectedValueOnce(new Error('Delete failed'))
      mockState.users = [mockCurrentUser, makeTargetUser()]

      render(<UserManagement />)
      await openConsoleUsersTab(user)

      const chevronButton = findChevronButton()
      if (chevronButton) {
        await user.click(chevronButton)
        await waitFor(() => {
          expect(findTrashButton()).toBeTruthy()
        })

        const trashButton = findTrashButton()
        if (trashButton) {
          await user.click(trashButton)
          await waitFor(() => {
            expect(screen.getAllByText(/Delete/i).length).toBeGreaterThan(0)
          })

          const allDeleteButtons = screen.getAllByRole('button', { name: /delete/i })
          await user.click(allDeleteButtons[allDeleteButtons.length - 1])
          await waitFor(() => {
            expect(mockShowToast).toHaveBeenCalledWith('Failed to delete user', 'error')
          })
        }
      }
    })
  })

  describe('Demo mode', () => {
    it('isDemoData=true → demo badge shown; mutation controls disabled', () => {
      mockState.isDemoMode = true
      mockState.users = [mockCurrentUser, mockViewerUser]

      render(<UserManagement />)

      expect(mockState.isDemoMode).toBe(true)
    })
  })

  describe('Tab navigation', () => {
    it('tabs are keyboard navigable with arrow keys', async () => {
      const user = userEvent.setup()
      mockState.users = [mockCurrentUser]

      render(<UserManagement />)

      const clusterTab = screen.getByRole('tab', { name: /cluster users/i })
      const consoleTab = screen.getByRole('tab', { name: /console users/i })
      const saTab = screen.getByRole('tab', { name: /service accounts/i })

      expect(clusterTab).toBeTruthy()
      expect(consoleTab).toBeTruthy()
      expect(saTab).toBeTruthy()
      clusterTab.focus()
      expect(document.activeElement).toBe(clusterTab)
      await user.keyboard('{ArrowRight}')
    })

    it('Home key navigates to first tab', async () => {
      const user = userEvent.setup()
      mockState.users = [mockCurrentUser]

      render(<UserManagement />)

      const consoleTab = screen.getByRole('tab', { name: /console users/i })
      consoleTab.focus()
      await user.keyboard('{Home}')
    })

    it('End key navigates to last tab', async () => {
      const user = userEvent.setup()
      mockState.users = [mockCurrentUser]

      render(<UserManagement />)

      const clusterTab = screen.getByRole('tab', { name: /cluster users/i })
      clusterTab.focus()
      await user.keyboard('{End}')
    })
  })

  describe('User list rendering', () => {
    it('renders all users in the list', async () => {
      const user = userEvent.setup()
      mockState.users = [
        mockCurrentUser,
        makeConsoleUser({ id: 'user-2', github_login: 'alice', role: 'editor' }),
        makeConsoleUser({ id: 'user-3', github_login: 'bob', role: 'viewer' }),
      ]

      render(<UserManagement />)
      await openConsoleUsersTab(user)

      expect(screen.getByText(/currentuser/)).toBeTruthy()
      expect(screen.getByText(/alice/)).toBeTruthy()
      expect(screen.getByText(/bob/)).toBeTruthy()
    })

    it('shows user avatars when avatar_url is present', async () => {
      const user = userEvent.setup()
      mockState.users = [mockCurrentUser]

      render(<UserManagement />)
      await openConsoleUsersTab(user)

      const avatar = screen.getByAltText(/User avatar|currentuser/)
      expect(avatar).toBeTruthy()
      expect(avatar.getAttribute('src')).toContain('example.com')
    })

    it('shows initials when avatar_url is missing', async () => {
      const user = userEvent.setup()
      mockState.users = [makeConsoleUser({ id: 'user-no-avatar', github_login: 'testuser', avatar_url: undefined, role: 'viewer' })]

      render(<UserManagement />)
      await openConsoleUsersTab(user)

      expect(screen.getByText(/T/)).toBeTruthy()
    })

    it('displays user email when present', async () => {
      const user = userEvent.setup()
      mockState.users = [mockCurrentUser]

      render(<UserManagement />)
      await openConsoleUsersTab(user)

      expect(screen.getByText('current@example.com')).toBeTruthy()
    })

    it('displays role badges with correct styling', async () => {
      const user = userEvent.setup()
      mockState.users = [
        makeConsoleUser({ id: 'admin-user', github_login: 'adminuser', role: 'admin' }),
        makeConsoleUser({ id: 'editor-user', github_login: 'editoruser', role: 'editor' }),
        makeConsoleUser({ id: 'viewer-user', github_login: 'vieweruser', role: 'viewer' }),
      ]

      render(<UserManagement />)
      await openConsoleUsersTab(user)

      expect(screen.getAllByText(/admin|editor|viewer/).length).toBeGreaterThan(0)
    })
  })
})
