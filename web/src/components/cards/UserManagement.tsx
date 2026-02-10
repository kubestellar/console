import { useState, useMemo } from 'react'
import {
  Users,
  Key,
  Trash2,
  ChevronDown,
  ChevronUp,
  ChevronRight,
} from 'lucide-react'
import { useConsoleUsers, useAllK8sServiceAccounts, useAllOpenShiftUsers } from '../../hooks/useUsers'
import { useClusters } from '../../hooks/useMCP'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { useAuth } from '../../lib/auth'
import { cn } from '../../lib/cn'
import {
  useCardData,
  commonComparators,
  CardSearchInput,
  CardControlsRow,
  CardPaginationFooter,
} from '../../lib/cards'
import type { ConsoleUser, UserRole, OpenShiftUser } from '../../types/users'
import { Skeleton } from '../ui/Skeleton'
import { useCardLoadingState } from './CardDataContext'

interface UserManagementProps {
  config?: Record<string, unknown>
}

type TabType = 'clusterUsers' | 'serviceAccounts' | 'console'
type ConsoleUserSortBy = 'name' | 'role' | 'email'
type OpenShiftUserSortBy = 'name' | 'kind'
type SASortBy = 'name' | 'namespace'

const CONSOLE_USER_SORT_OPTIONS = [
  { value: 'name' as const, label: 'Name' },
  { value: 'role' as const, label: 'Role' },
  { value: 'email' as const, label: 'Email' },
]

const OPENSHIFT_USER_SORT_OPTIONS = [
  { value: 'name' as const, label: 'Username' },
  { value: 'kind' as const, label: 'Full Name' },
]

const SA_SORT_OPTIONS = [
  { value: 'name' as const, label: 'Name' },
  { value: 'namespace' as const, label: 'Namespace' },
]

// Sort comparators for each tab
const OPENSHIFT_USER_COMPARATORS: Record<OpenShiftUserSortBy, (a: OpenShiftUser, b: OpenShiftUser) => number> = {
  name: commonComparators.string<OpenShiftUser>('name'),
  kind: (a, b) => (a.fullName || '').localeCompare(b.fullName || ''),
}

const SA_COMPARATORS: Record<SASortBy, (a: { name: string; namespace: string; cluster: string; roles?: string[] }, b: { name: string; namespace: string; cluster: string; roles?: string[] }) => number> = {
  name: (a, b) => a.name.localeCompare(b.name),
  namespace: (a, b) => a.namespace.localeCompare(b.namespace),
}

export function UserManagement({ config: _config }: UserManagementProps) {
  const [activeTab, setActiveTab] = useState<TabType>('clusterUsers')
  const [selectedCluster, setSelectedCluster] = useState<string>('')
  const [selectedNamespace, setSelectedNamespace] = useState<string>('')
  const [expandedUser, setExpandedUser] = useState<string | null>(null)

  const { drillToRBAC } = useDrillDownActions()
  const { user: currentUser } = useAuth()
  const { users: allUsers, isLoading: usersLoading, error: usersError, updateUserRole, deleteUser } = useConsoleUsers()
  const { deduplicatedClusters: allClusters, isLoading: clustersLoading } = useClusters()
  // Fetch ALL SAs from ALL clusters upfront, filter locally
  const { serviceAccounts: allServiceAccounts, isLoading: sasInitialLoading, failedClusters: _saFailedClusters } = useAllK8sServiceAccounts(allClusters)
  // Fetch ALL OpenShift users from ALL clusters upfront, filter locally
  const { users: allOpenshiftUsers, isLoading: openshiftInitialLoading, failedClusters: _userFailedClusters } = useAllOpenShiftUsers(allClusters)

  // Only show loading state on initial load when there's no data
  const sasLoading = sasInitialLoading && allServiceAccounts.length === 0
  const openshiftUsersLoading = openshiftInitialLoading && allOpenshiftUsers.length === 0

  // Report loading state to CardWrapper for skeleton/refresh behavior
  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: clustersLoading || usersLoading || sasInitialLoading || openshiftInitialLoading,
    hasAnyData: allClusters.length > 0 || allUsers.length > 0 || allServiceAccounts.length > 0,
    isFailed: Boolean(usersError),
    consecutiveFailures: usersError ? 1 : 0,
  })

  const { selectedClusters, isAllClustersSelected } = useGlobalFilters()

  // Filter clusters by global filter (already deduplicated from hook)
  const clusters = useMemo(() => {
    if (isAllClustersSelected) return allClusters
    return allClusters.filter(c => selectedClusters.includes(c.name))
  }, [allClusters, selectedClusters, isAllClustersSelected])

  // Ensure current user is always included from auth context
  const usersWithCurrent = useMemo(() => {
    let result = [...allUsers]
    if (currentUser && !result.some(u => u.github_id === currentUser.github_id)) {
      const authUser: ConsoleUser = {
        id: currentUser.id,
        github_id: currentUser.github_id,
        github_login: currentUser.github_login,
        email: currentUser.email,
        avatar_url: currentUser.avatar_url,
        role: currentUser.role || 'viewer',
        onboarded: currentUser.onboarded,
        created_at: new Date().toISOString(),
      }
      result = [authUser, ...result]
    }
    return result
  }, [allUsers, currentUser])

  // Extract unique namespaces from service accounts (filtered by cluster if selected)
  const namespaces = useMemo(() => {
    const filteredSAs = selectedCluster
      ? allServiceAccounts.filter(sa => sa.cluster === selectedCluster)
      : allServiceAccounts
    const nsSet = new Set(filteredSAs.map(sa => sa.namespace))
    return Array.from(nsSet).sort()
  }, [allServiceAccounts, selectedCluster])

  // Pre-filter OpenShift users by in-tab cluster dropdown (before passing to useCardData)
  const openshiftUsersPreFiltered = useMemo(() => {
    if (!selectedCluster) return allOpenshiftUsers
    return allOpenshiftUsers.filter(u => u.cluster === selectedCluster)
  }, [allOpenshiftUsers, selectedCluster])

  // Pre-filter service accounts by in-tab cluster and namespace dropdowns
  const serviceAccountsPreFiltered = useMemo(() => {
    let result = allServiceAccounts
    if (selectedCluster) {
      result = result.filter(sa => sa.cluster === selectedCluster)
    }
    if (selectedNamespace) {
      result = result.filter(sa => sa.namespace === selectedNamespace)
    }
    return result
  }, [allServiceAccounts, selectedCluster, selectedNamespace])

  // Console user comparators (pins current user to top)
  const consoleUserComparators = useMemo((): Record<ConsoleUserSortBy, (a: ConsoleUser, b: ConsoleUser) => number> => ({
    name: (a, b) => {
      if (a.github_id === currentUser?.github_id) return -1
      if (b.github_id === currentUser?.github_id) return 1
      return a.github_login.localeCompare(b.github_login)
    },
    role: (a, b) => {
      if (a.github_id === currentUser?.github_id) return -1
      if (b.github_id === currentUser?.github_id) return 1
      return a.role.localeCompare(b.role)
    },
    email: (a, b) => {
      if (a.github_id === currentUser?.github_id) return -1
      if (b.github_id === currentUser?.github_id) return 1
      return (a.email || '').localeCompare(b.email || '')
    },
  }), [currentUser?.github_id])

  // ---------- useCardData for OpenShift users tab ----------
  const {
    items: openshiftUserItems,
    totalItems: openshiftUserTotalItems,
    currentPage: openshiftUserCurrentPage,
    totalPages: openshiftUserTotalPages,
    itemsPerPage: openshiftUserItemsPerPage,
    goToPage: openshiftUserGoToPage,
    needsPagination: openshiftUserNeedsPagination,
    setItemsPerPage: setOpenShiftUserItemsPerPage,
    filters: openshiftUserFilters,
    sorting: openshiftUserSorting,
  } = useCardData<OpenShiftUser, OpenShiftUserSortBy>(openshiftUsersPreFiltered, {
    filter: {
      searchFields: ['name', 'cluster'] as (keyof OpenShiftUser)[],
      clusterField: 'cluster' as keyof OpenShiftUser,
      customPredicate: (u, query) =>
        (u.fullName?.toLowerCase() || '').includes(query) ||
        (u.groups?.some(g => g.toLowerCase().includes(query)) || false),
      storageKey: 'user-management-cluster-users',
    },
    sort: {
      defaultField: 'name',
      defaultDirection: 'asc',
      comparators: OPENSHIFT_USER_COMPARATORS,
    },
    defaultLimit: 5,
  })

  // ---------- useCardData for Service Accounts tab ----------
  const {
    items: saItems,
    totalItems: saTotalItems,
    currentPage: saCurrentPage,
    totalPages: saTotalPages,
    itemsPerPage: saItemsPerPage,
    goToPage: saGoToPage,
    needsPagination: saNeedsPagination,
    setItemsPerPage: setSaItemsPerPage,
    filters: saFilters,
    sorting: saSorting,
  } = useCardData<typeof allServiceAccounts[number], SASortBy>(serviceAccountsPreFiltered, {
    filter: {
      searchFields: ['name', 'namespace', 'cluster'] as (keyof typeof allServiceAccounts[number])[],
      clusterField: 'cluster' as keyof typeof allServiceAccounts[number],
      storageKey: 'user-management-service-accounts',
    },
    sort: {
      defaultField: 'name',
      defaultDirection: 'asc',
      comparators: SA_COMPARATORS,
    },
    defaultLimit: 5,
  })

  // ---------- useCardData for Console Users tab ----------
  const {
    items: consoleUserItems,
    totalItems: consoleUserTotalItems,
    currentPage: consoleUserCurrentPage,
    totalPages: consoleUserTotalPages,
    itemsPerPage: consoleUserItemsPerPage,
    goToPage: consoleUserGoToPage,
    needsPagination: consoleUserNeedsPagination,
    setItemsPerPage: setConsoleUserItemsPerPage,
    filters: consoleUserFilters,
    sorting: consoleUserSorting,
  } = useCardData<ConsoleUser, ConsoleUserSortBy>(usersWithCurrent, {
    filter: {
      searchFields: ['github_login', 'email', 'role'] as (keyof ConsoleUser)[],
      storageKey: 'user-management-console-users',
    },
    sort: {
      defaultField: 'name',
      defaultDirection: 'asc',
      comparators: consoleUserComparators,
    },
    defaultLimit: 5,
  })

  // Active tab's filter/sorting references for the controls row
  const activeFilters = activeTab === 'clusterUsers' ? openshiftUserFilters
    : activeTab === 'serviceAccounts' ? saFilters
    : consoleUserFilters

  const activeSorting = activeTab === 'clusterUsers' ? openshiftUserSorting
    : activeTab === 'serviceAccounts' ? saSorting
    : consoleUserSorting

  const activeItemsPerPage = activeTab === 'clusterUsers' ? openshiftUserItemsPerPage
    : activeTab === 'serviceAccounts' ? saItemsPerPage
    : consoleUserItemsPerPage

  const activeSetItemsPerPage = activeTab === 'clusterUsers' ? setOpenShiftUserItemsPerPage
    : activeTab === 'serviceAccounts' ? setSaItemsPerPage
    : setConsoleUserItemsPerPage

  const activeSortOptions = activeTab === 'clusterUsers' ? OPENSHIFT_USER_SORT_OPTIONS
    : activeTab === 'serviceAccounts' ? SA_SORT_OPTIONS
    : CONSOLE_USER_SORT_OPTIONS

  const isAdmin = currentUser?.role === 'admin'

  // Count for current tab (shown in Row 1 LEFT)
  const currentTabCount = useMemo(() => {
    if (activeTab === 'clusterUsers') return openshiftUserTotalItems
    if (activeTab === 'serviceAccounts') return saTotalItems
    return consoleUserTotalItems
  }, [activeTab, openshiftUserTotalItems, saTotalItems, consoleUserTotalItems])

  const currentTabLabel = useMemo(() => {
    if (activeTab === 'clusterUsers') return 'cluster users'
    if (activeTab === 'serviceAccounts') return 'service accounts'
    return 'console users'
  }, [activeTab])

  const handleRoleChange = async (userId: string, newRole: UserRole) => {
    try {
      await updateUserRole(userId, newRole)
    } catch (error) {
      console.error('Failed to update role:', error)
    }
  }

  const handleDeleteUser = async (userId: string) => {
    if (!confirm('Are you sure you want to delete this user?')) return
    try {
      await deleteUser(userId)
    } catch (error) {
      console.error('Failed to delete user:', error)
    }
  }

  const getRoleBadgeClass = (role: UserRole) => {
    switch (role) {
      case 'admin':
        return 'bg-purple-500/20 text-purple-400 border-purple-500/30'
      case 'editor':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/30'
      default:
        return 'bg-gray-500/20 text-gray-400 border-gray-500/30'
    }
  }

  if (showSkeleton) {
    return (
      <div className="h-full flex flex-col min-h-card">
        {/* Header skeleton */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex gap-2">
            <Skeleton variant="rounded" width={100} height={28} />
            <Skeleton variant="rounded" width={120} height={28} />
          </div>
          <Skeleton variant="rounded" width={120} height={28} />
        </div>
        {/* Search skeleton */}
        <Skeleton variant="rounded" height={32} className="mb-3" />
        {/* User list skeleton */}
        <div className="space-y-2">
          <Skeleton variant="rounded" height={56} />
          <Skeleton variant="rounded" height={56} />
          <Skeleton variant="rounded" height={56} />
        </div>
      </div>
    )
  }

  if (showEmptyState) {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground">
        <p className="text-sm">No users</p>
        <p className="text-xs mt-1">Users and service accounts will appear here</p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-card content-loaded">
      {/* Row 1: Header with count badge and controls */}
      <div className="flex items-center justify-between mb-2 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">
            {currentTabCount} {currentTabLabel}
          </span>
        </div>
        <CardControlsRow
          clusterIndicator={
            activeFilters.localClusterFilter.length > 0
              ? {
                  selectedCount: activeFilters.localClusterFilter.length,
                  totalCount: activeFilters.availableClusters.length,
                }
              : undefined
          }
          clusterFilter={
            activeFilters.availableClusters.length >= 1
              ? {
                  availableClusters: activeFilters.availableClusters,
                  selectedClusters: activeFilters.localClusterFilter,
                  onToggle: activeFilters.toggleClusterFilter,
                  onClear: activeFilters.clearClusterFilter,
                  isOpen: activeFilters.showClusterFilter,
                  setIsOpen: activeFilters.setShowClusterFilter,
                  containerRef: activeFilters.clusterFilterRef,
                  minClusters: 1,
                }
              : undefined
          }
          cardControls={{
            limit: activeItemsPerPage,
            onLimitChange: activeSetItemsPerPage,
            sortBy: activeSorting.sortBy,
            sortOptions: activeSortOptions,
            onSortChange: (v) => {
              if (activeTab === 'clusterUsers') openshiftUserSorting.setSortBy(v as OpenShiftUserSortBy)
              else if (activeTab === 'serviceAccounts') saSorting.setSortBy(v as SASortBy)
              else consoleUserSorting.setSortBy(v as ConsoleUserSortBy)
            },
            sortDirection: activeSorting.sortDirection,
            onSortDirectionChange: activeSorting.setSortDirection,
          }}
          className="mb-0"
        />
      </div>

      {/* Row 2: Search input */}
      <CardSearchInput
        value={activeFilters.search}
        onChange={activeFilters.setSearch}
        placeholder={
          activeTab === 'clusterUsers' ? 'Search cluster users...' :
          activeTab === 'serviceAccounts' ? 'Search service accounts...' :
          'Search console users...'
        }
        className="mb-2 flex-shrink-0"
      />

      {/* Row 3: Tab filter pills */}
      <div className="flex items-center gap-1 mb-3 flex-shrink-0">
        <button
          onClick={() => setActiveTab('clusterUsers')}
          className={cn(
            'px-2 py-1 rounded text-xs font-medium transition-colors',
            activeTab === 'clusterUsers'
              ? 'bg-purple-500/20 text-purple-400'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          Cluster Users
        </button>
        <button
          onClick={() => setActiveTab('serviceAccounts')}
          className={cn(
            'px-2 py-1 rounded text-xs font-medium transition-colors',
            activeTab === 'serviceAccounts'
              ? 'bg-purple-500/20 text-purple-400'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          Service Accounts
        </button>
        <button
          onClick={() => setActiveTab('console')}
          className={cn(
            'px-2 py-1 rounded text-xs font-medium transition-colors',
            activeTab === 'console'
              ? 'bg-purple-500/20 text-purple-400'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          Console Users
        </button>
      </div>

      {/* Content - fixed height to prevent jumping, p-px prevents border clipping */}
      <div className="flex-1 overflow-y-auto min-h-0 p-px">
        {activeTab === 'clusterUsers' && (
          <ClusterUsersTab
            clusters={clusters}
            selectedCluster={selectedCluster}
            setSelectedCluster={setSelectedCluster}
            users={openshiftUserItems}
            isLoading={openshiftUsersLoading}
            showClusterBadge={true}
            onDrillToUser={(cluster, name) =>
              drillToRBAC(cluster, undefined, name, { type: 'User' })
            }
          />
        )}

        {activeTab === 'serviceAccounts' && (
          <ServiceAccountsTab
            clusters={clusters}
            selectedCluster={selectedCluster}
            setSelectedCluster={setSelectedCluster}
            selectedNamespace={selectedNamespace}
            setSelectedNamespace={setSelectedNamespace}
            namespaces={namespaces}
            serviceAccounts={saItems}
            isLoading={sasLoading}
            showClusterBadge={true}
            onDrillToServiceAccount={(cluster, namespace, name, roles) =>
              drillToRBAC(cluster, namespace, name, {
                type: 'ServiceAccount',
                roles,
              })
            }
          />
        )}

        {activeTab === 'console' && (
          <ConsoleUsersTab
            users={consoleUserItems}
            isLoading={usersLoading}
            isAdmin={isAdmin}
            currentUserGithubId={currentUser?.github_id}
            expandedUser={expandedUser}
            setExpandedUser={setExpandedUser}
            onRoleChange={handleRoleChange}
            onDeleteUser={handleDeleteUser}
            getRoleBadgeClass={getRoleBadgeClass}
          />
        )}
      </div>

      {/* Pagination */}
      {activeTab === 'clusterUsers' && (
        <CardPaginationFooter
          currentPage={openshiftUserCurrentPage}
          totalPages={openshiftUserTotalPages}
          totalItems={openshiftUserTotalItems}
          itemsPerPage={typeof openshiftUserItemsPerPage === 'number' ? openshiftUserItemsPerPage : openshiftUserTotalItems}
          onPageChange={openshiftUserGoToPage}
          needsPagination={openshiftUserNeedsPagination && openshiftUserItemsPerPage !== 'unlimited'}
        />
      )}
      {activeTab === 'serviceAccounts' && (
        <CardPaginationFooter
          currentPage={saCurrentPage}
          totalPages={saTotalPages}
          totalItems={saTotalItems}
          itemsPerPage={typeof saItemsPerPage === 'number' ? saItemsPerPage : saTotalItems}
          onPageChange={saGoToPage}
          needsPagination={saNeedsPagination && saItemsPerPage !== 'unlimited'}
        />
      )}
      {activeTab === 'console' && (
        <CardPaginationFooter
          currentPage={consoleUserCurrentPage}
          totalPages={consoleUserTotalPages}
          totalItems={consoleUserTotalItems}
          itemsPerPage={typeof consoleUserItemsPerPage === 'number' ? consoleUserItemsPerPage : consoleUserTotalItems}
          onPageChange={consoleUserGoToPage}
          needsPagination={consoleUserNeedsPagination && consoleUserItemsPerPage !== 'unlimited'}
        />
      )}
    </div>
  )
}

interface ConsoleUsersTabProps {
  users: ConsoleUser[]
  isLoading: boolean
  isAdmin: boolean
  currentUserGithubId?: string
  expandedUser: string | null
  setExpandedUser: (id: string | null) => void
  onRoleChange: (userId: string, role: UserRole) => void
  onDeleteUser: (userId: string) => void
  getRoleBadgeClass: (role: UserRole) => string
}

function ConsoleUsersTab({
  users,
  isLoading,
  isAdmin,
  currentUserGithubId,
  expandedUser,
  setExpandedUser,
  onRoleChange,
  onDeleteUser,
  getRoleBadgeClass,
}: ConsoleUsersTabProps) {
  // Only show spinner if loading AND no users to display
  if (isLoading && users.length === 0) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="spinner w-5 h-5" />
      </div>
    )
  }

  if (users.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        <Users className="w-8 h-8 mb-2 opacity-50" />
        <p className="text-sm">No users found</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {users.map((user) => {
        const isCurrentUser = user.github_id === currentUserGithubId
        // Non-admins see other users blurred
        const isBlurred = !isAdmin && !isCurrentUser

        return (
          <div
            key={user.id}
            className={cn(
              'p-3 rounded-lg bg-secondary/30 border border-border/50',
              isCurrentUser && 'ring-1 ring-purple-500/50'
            )}
          >
            <div className={cn(
              'flex items-center justify-between',
              isBlurred && 'blur-sm select-none pointer-events-none'
            )}>
              <div className="flex items-center gap-3">
                {user.avatar_url ? (
                  <img
                    src={user.avatar_url}
                    alt={isBlurred ? '' : user.github_login}
                    className="w-8 h-8 rounded-full"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center">
                    <span className="text-sm font-medium text-purple-400">
                      {user.github_login[0].toUpperCase()}
                    </span>
                  </div>
                )}
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {isCurrentUser ? `${user.github_login} (you)` : user.github_login}
                  </p>
                  {user.email && (
                    <p className="text-xs text-muted-foreground">{user.email}</p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'px-2 py-0.5 rounded-full text-xs font-medium border',
                    getRoleBadgeClass(user.role)
                  )}
                >
                  {user.role}
                </span>

                {isAdmin && !isCurrentUser && (
                  <button
                    onClick={() =>
                      setExpandedUser(expandedUser === user.id ? null : user.id)
                    }
                    className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground"
                  >
                    {expandedUser === user.id ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </button>
                )}
              </div>
            </div>

            {/* Expanded actions */}
            {isAdmin && expandedUser === user.id && !isCurrentUser && (
              <div className="mt-3 pt-3 border-t border-border/50">
                <div className="flex items-center justify-between">
                  <div className="flex gap-2">
                    {(['admin', 'editor', 'viewer'] as UserRole[]).map((role) => (
                      <button
                        key={role}
                        onClick={() => onRoleChange(user.id, role)}
                        className={cn(
                          'px-2 py-1 rounded text-xs font-medium transition-colors',
                          user.role === role
                            ? 'bg-purple-500 text-foreground'
                            : 'bg-secondary hover:bg-secondary/80 text-muted-foreground'
                        )}
                      >
                        {role}
                      </button>
                    ))}
                  </div>

                  <button
                    onClick={() => onDeleteUser(user.id)}
                    className="p-1.5 rounded text-red-400 hover:bg-red-500/10"
                    title="Delete user"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

interface ClusterUsersTabProps {
  clusters: Array<{ name: string; healthy?: boolean }>
  selectedCluster: string
  setSelectedCluster: (cluster: string) => void
  users: OpenShiftUser[]
  isLoading: boolean
  showClusterBadge: boolean
  onDrillToUser: (cluster: string, name: string) => void
}

function ClusterUsersTab({
  clusters,
  selectedCluster,
  setSelectedCluster,
  users,
  isLoading,
  showClusterBadge,
  onDrillToUser,
}: ClusterUsersTabProps) {
  return (
    <div className="space-y-3">
      {/* Cluster selector - now filters locally */}
      <div>
        <label className="block text-xs text-muted-foreground mb-1">Filter by Cluster</label>
        <select
          value={selectedCluster}
          onChange={(e) => setSelectedCluster(e.target.value)}
          className="w-full px-2 py-1.5 rounded-lg bg-secondary border border-border text-foreground text-xs"
        >
          <option value="">All clusters</option>
          {clusters.map((c) => (
            <option key={c.name} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {/* Users list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-4">
          <div className="spinner w-5 h-5" />
        </div>
      ) : users.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-4 text-muted-foreground">
          <Users className="w-6 h-6 mb-1 opacity-50" />
          <p className="text-xs">No users found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {users.map((user, idx) => (
            <div
              key={`${user.cluster}-${user.name}-${idx}`}
              onClick={() => onDrillToUser(user.cluster, user.name)}
              className="p-2 rounded bg-secondary/30 text-sm hover:bg-secondary/50 transition-colors cursor-pointer group"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-foreground font-medium group-hover:text-purple-400">{user.name}</span>
                  {user.fullName && (
                    <span className="text-muted-foreground text-xs">({user.fullName})</span>
                  )}
                  {showClusterBadge && (
                    <span className="px-1.5 py-0.5 rounded text-xs bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                      {user.cluster}
                    </span>
                  )}
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              {user.identities && user.identities.length > 0 && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Identity: {user.identities[0]}
                </p>
              )}
              {user.groups && user.groups.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {user.groups.slice(0, 3).map((group, i) => (
                    <span
                      key={i}
                      className="px-1.5 py-0.5 rounded text-xs bg-blue-500/20 text-blue-400"
                    >
                      {group}
                    </span>
                  ))}
                  {user.groups.length > 3 && (
                    <span className="text-xs text-muted-foreground">+{user.groups.length - 3} more</span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

interface ServiceAccountsTabProps {
  clusters: Array<{ name: string; healthy?: boolean }>
  selectedCluster: string
  setSelectedCluster: (cluster: string) => void
  selectedNamespace: string
  setSelectedNamespace: (namespace: string) => void
  namespaces: string[]
  serviceAccounts: Array<{
    name: string
    namespace: string
    cluster: string
    roles?: string[]
  }>
  isLoading: boolean
  showClusterBadge: boolean
  onDrillToServiceAccount: (cluster: string, namespace: string, name: string, roles?: string[]) => void
}

function ServiceAccountsTab({
  clusters,
  selectedCluster,
  setSelectedCluster,
  selectedNamespace,
  setSelectedNamespace,
  namespaces,
  serviceAccounts,
  isLoading,
  showClusterBadge,
  onDrillToServiceAccount,
}: ServiceAccountsTabProps) {
  return (
    <div className="space-y-3">
      {/* Cluster and Namespace selectors - now filter locally */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Filter by Cluster</label>
          <select
            value={selectedCluster}
            onChange={(e) => {
              setSelectedCluster(e.target.value)
              setSelectedNamespace('') // Reset namespace when cluster changes
            }}
            className="w-full px-2 py-1.5 rounded-lg bg-secondary border border-border text-foreground text-xs"
          >
            <option value="">All clusters</option>
            {clusters.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Filter by Namespace</label>
          <select
            value={selectedNamespace}
            onChange={(e) => setSelectedNamespace(e.target.value)}
            className="w-full px-2 py-1.5 rounded-lg bg-secondary border border-border text-foreground text-xs"
          >
            <option value="">All namespaces</option>
            {namespaces.map((ns) => (
              <option key={ns} value={ns}>
                {ns}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Service accounts */}
      {isLoading ? (
        <div className="flex items-center justify-center py-4">
          <div className="spinner w-5 h-5" />
        </div>
      ) : serviceAccounts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-4 text-muted-foreground">
          <Key className="w-6 h-6 mb-1 opacity-50" />
          <p className="text-xs">No service accounts found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {serviceAccounts.map((sa, idx) => (
            <div
              key={`${sa.cluster}-${sa.namespace}-${sa.name}-${idx}`}
              onClick={() => onDrillToServiceAccount(sa.cluster, sa.namespace, sa.name, sa.roles)}
              className="p-2 rounded bg-secondary/30 text-sm hover:bg-secondary/50 transition-colors cursor-pointer group"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-foreground font-medium group-hover:text-purple-400">{sa.name}</span>
                  {showClusterBadge && (
                    <span className="px-1.5 py-0.5 rounded text-xs bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                      {sa.cluster}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{sa.namespace}</span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
              {sa.roles && sa.roles.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {sa.roles.map((role, i) => (
                    <span
                      key={i}
                      className="px-1.5 py-0.5 rounded text-xs bg-purple-500/20 text-purple-400"
                    >
                      {role}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
