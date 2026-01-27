import { useState, useMemo } from 'react'
import {
  Users,
  Key,
  Trash2,
  ChevronDown,
  ChevronUp,
  Search,
  ChevronRight,
} from 'lucide-react'
import { useConsoleUsers, useAllK8sServiceAccounts, useAllOpenShiftUsers } from '../../hooks/useUsers'
import { useClusters } from '../../hooks/useMCP'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { useAuth } from '../../lib/auth'
import { cn } from '../../lib/cn'
import type { ConsoleUser, UserRole, OpenShiftUser } from '../../types/users'
import { RefreshButton } from '../ui/RefreshIndicator'
import { Skeleton } from '../ui/Skeleton'
import { CardControls, SortDirection } from '../ui/CardControls'
import { Pagination, usePagination } from '../ui/Pagination'

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

export function UserManagement({ config: _config }: UserManagementProps) {
  const [activeTab, setActiveTab] = useState<TabType>('clusterUsers')
  const [selectedCluster, setSelectedCluster] = useState<string>('')
  const [selectedNamespace, setSelectedNamespace] = useState<string>('')
  const [expandedUser, setExpandedUser] = useState<string | null>(null)
  const [localSearch, setLocalSearch] = useState('')

  // Sorting and pagination for Cluster Users (OpenShift)
  const [openshiftUserSortBy, setOpenShiftUserSortBy] = useState<OpenShiftUserSortBy>('name')
  const [openshiftUserSortDirection, setOpenShiftUserSortDirection] = useState<SortDirection>('asc')
  const [openshiftUserLimit, setOpenShiftUserLimit] = useState<number | 'unlimited'>(5)

  // Sorting and pagination for Service Accounts
  const [saSortBy, setSaSortBy] = useState<SASortBy>('name')
  const [saSortDirection, setSaSortDirection] = useState<SortDirection>('asc')
  const [saLimit, setSaLimit] = useState<number | 'unlimited'>(5)

  // Sorting and pagination for Console Users
  const [consoleUserSortBy, setConsoleUserSortBy] = useState<ConsoleUserSortBy>('name')
  const [consoleUserSortDirection, setConsoleUserSortDirection] = useState<SortDirection>('asc')
  const [consoleUserLimit, setConsoleUserLimit] = useState<number | 'unlimited'>(5)

  const { drillToRBAC } = useDrillDownActions()
  const { user: currentUser } = useAuth()
  const { users: allUsers, isLoading: usersLoading, isRefreshing: usersRefreshing, error: usersError, refetch: refetchUsers, updateUserRole, deleteUser } = useConsoleUsers()
  const { deduplicatedClusters: allClusters } = useClusters()
  // Fetch ALL SAs from ALL clusters upfront, filter locally
  const { serviceAccounts: allServiceAccounts, isLoading: sasInitialLoading, isRefreshing: sasRefreshing, failedClusters: _saFailedClusters, refetch: refetchSAs } = useAllK8sServiceAccounts(allClusters)
  // Fetch ALL OpenShift users from ALL clusters upfront, filter locally
  const { users: allOpenshiftUsers, isLoading: openshiftInitialLoading, isRefreshing: openshiftRefreshing, failedClusters: _userFailedClusters, refetch: refetchOpenShiftUsers } = useAllOpenShiftUsers(allClusters)

  // Only show loading state on initial load when there's no data
  const sasLoading = sasInitialLoading && allServiceAccounts.length === 0
  const openshiftUsersLoading = openshiftInitialLoading && allOpenshiftUsers.length === 0

  const isRefreshing = usersRefreshing || sasRefreshing || openshiftRefreshing
  const refetch = () => {
    refetchUsers()
    refetchSAs()
    refetchOpenShiftUsers()
  }
  const { selectedClusters, isAllClustersSelected, customFilter } = useGlobalFilters()

  // Filter clusters by global filter (already deduplicated from hook)
  const clusters = useMemo(() => {
    if (isAllClustersSelected) return allClusters
    return allClusters.filter(c => selectedClusters.includes(c.name))
  }, [allClusters, selectedClusters, isAllClustersSelected])

  // Filter users by global customFilter and local search
  // Also ensure current user is always included from auth context
  const users = useMemo(() => {
    let result = [...allUsers]

    // If API returned empty or current user not in list, add them from auth context
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

    if (customFilter.trim()) {
      const query = customFilter.toLowerCase()
      result = result.filter(u =>
        u.github_login.toLowerCase().includes(query) ||
        (u.email?.toLowerCase() || '').includes(query)
      )
    }
    // Apply local search
    if (localSearch.trim()) {
      const query = localSearch.toLowerCase()
      result = result.filter(u =>
        u.github_login.toLowerCase().includes(query) ||
        (u.email?.toLowerCase() || '').includes(query) ||
        u.role.toLowerCase().includes(query)
      )
    }
    return result
  }, [allUsers, currentUser, customFilter, localSearch])

  // Extract unique namespaces from service accounts (filtered by cluster if selected)
  const namespaces = useMemo(() => {
    const filteredSAs = selectedCluster
      ? allServiceAccounts.filter(sa => sa.cluster === selectedCluster)
      : allServiceAccounts
    const nsSet = new Set(filteredSAs.map(sa => sa.namespace))
    return Array.from(nsSet).sort()
  }, [allServiceAccounts, selectedCluster])

  // Filter service accounts by cluster, namespace, global filter and local search (all local filtering)
  const serviceAccounts = useMemo(() => {
    let result = allServiceAccounts

    // Filter by selected cluster (local filter from dropdown)
    if (selectedCluster) {
      result = result.filter(sa => sa.cluster === selectedCluster)
    }

    // Filter by selected namespace (local filter from dropdown)
    if (selectedNamespace) {
      result = result.filter(sa => sa.namespace === selectedNamespace)
    }

    // Filter by global cluster selection
    if (!isAllClustersSelected) {
      result = result.filter(sa => selectedClusters.includes(sa.cluster))
    }
    if (customFilter.trim()) {
      const query = customFilter.toLowerCase()
      result = result.filter(sa =>
        sa.name.toLowerCase().includes(query) ||
        sa.namespace.toLowerCase().includes(query)
      )
    }
    // Apply local search
    if (localSearch.trim()) {
      const query = localSearch.toLowerCase()
      result = result.filter(sa =>
        sa.name.toLowerCase().includes(query) ||
        sa.namespace.toLowerCase().includes(query) ||
        sa.cluster.toLowerCase().includes(query)
      )
    }
    return result
  }, [allServiceAccounts, selectedCluster, selectedNamespace, selectedClusters, isAllClustersSelected, customFilter, localSearch])

  const isAdmin = currentUser?.role === 'admin'

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

  // Filter and sort OpenShift users (all local filtering)
  const filteredOpenShiftUsers = useMemo(() => {
    let result = [...allOpenshiftUsers]

    // Filter by selected cluster (local filter from dropdown)
    if (selectedCluster) {
      result = result.filter(u => u.cluster === selectedCluster)
    }

    // Filter by global cluster selection
    if (!isAllClustersSelected) {
      result = result.filter(u => selectedClusters.includes(u.cluster))
    }

    if (localSearch.trim()) {
      const query = localSearch.toLowerCase()
      result = result.filter(u =>
        u.name.toLowerCase().includes(query) ||
        (u.fullName?.toLowerCase() || '').includes(query) ||
        (u.groups?.some(g => g.toLowerCase().includes(query)) || false) ||
        u.cluster.toLowerCase().includes(query)
      )
    }
    return result
  }, [allOpenshiftUsers, selectedCluster, selectedClusters, isAllClustersSelected, localSearch])

  const sortedOpenShiftUsers = useMemo(() => {
    const sorted = [...filteredOpenShiftUsers].sort((a, b) => {
      let compare = 0
      switch (openshiftUserSortBy) {
        case 'name':
          compare = a.name.localeCompare(b.name)
          break
        case 'kind':
          // Sort by fullName for OpenShift users
          compare = (a.fullName || '').localeCompare(b.fullName || '')
          break
      }
      return openshiftUserSortDirection === 'asc' ? compare : -compare
    })
    return sorted
  }, [filteredOpenShiftUsers, openshiftUserSortBy, openshiftUserSortDirection])

  // Sort console users
  const sortedConsoleUsers = useMemo(() => {
    const sorted = [...users].sort((a, b) => {
      // Current user always first
      if (a.github_id === currentUser?.github_id) return -1
      if (b.github_id === currentUser?.github_id) return 1

      let compare = 0
      switch (consoleUserSortBy) {
        case 'name':
          compare = a.github_login.localeCompare(b.github_login)
          break
        case 'role':
          compare = a.role.localeCompare(b.role)
          break
        case 'email':
          compare = (a.email || '').localeCompare(b.email || '')
          break
      }
      return consoleUserSortDirection === 'asc' ? compare : -compare
    })
    return sorted
  }, [users, consoleUserSortBy, consoleUserSortDirection, currentUser?.github_id])

  // Sort service accounts
  const sortedServiceAccounts = useMemo(() => {
    const sorted = [...serviceAccounts].sort((a, b) => {
      let compare = 0
      switch (saSortBy) {
        case 'name':
          compare = a.name.localeCompare(b.name)
          break
        case 'namespace':
          compare = a.namespace.localeCompare(b.namespace)
          break
      }
      return saSortDirection === 'asc' ? compare : -compare
    })
    return sorted
  }, [serviceAccounts, saSortBy, saSortDirection])

  // Pagination for OpenShift users
  const openshiftUserPerPage = openshiftUserLimit === 'unlimited' ? 1000 : openshiftUserLimit
  const openshiftUserPagination = usePagination(sortedOpenShiftUsers, openshiftUserPerPage)

  // Pagination for console users
  const consoleUserPerPage = consoleUserLimit === 'unlimited' ? 1000 : consoleUserLimit
  const consoleUserPagination = usePagination(sortedConsoleUsers, consoleUserPerPage)

  // Pagination for service accounts
  const saPerPage = saLimit === 'unlimited' ? 1000 : saLimit
  const saPagination = usePagination(sortedServiceAccounts, saPerPage)

  // Only show skeleton during initial loading
  const hasData = allUsers.length > 0 || currentUser !== null
  const hasError = Boolean(usersError)
  const showSkeleton = usersLoading && !hasData && !hasError

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

  return (
    <div className="h-full flex flex-col min-h-card content-loaded">
      {/* Header with tabs and controls */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex gap-1">
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
        <div className="flex items-center gap-2">
          {activeTab === 'clusterUsers' && (
            <CardControls
              limit={openshiftUserLimit}
              onLimitChange={setOpenShiftUserLimit}
              sortBy={openshiftUserSortBy}
              sortOptions={OPENSHIFT_USER_SORT_OPTIONS}
              onSortChange={setOpenShiftUserSortBy}
              sortDirection={openshiftUserSortDirection}
              onSortDirectionChange={setOpenShiftUserSortDirection}
            />
          )}
          {activeTab === 'serviceAccounts' && (
            <CardControls
              limit={saLimit}
              onLimitChange={setSaLimit}
              sortBy={saSortBy}
              sortOptions={SA_SORT_OPTIONS}
              onSortChange={setSaSortBy}
              sortDirection={saSortDirection}
              onSortDirectionChange={setSaSortDirection}
            />
          )}
          {activeTab === 'console' && (
            <CardControls
              limit={consoleUserLimit}
              onLimitChange={setConsoleUserLimit}
              sortBy={consoleUserSortBy}
              sortOptions={CONSOLE_USER_SORT_OPTIONS}
              onSortChange={setConsoleUserSortBy}
              sortDirection={consoleUserSortDirection}
              onSortDirectionChange={setConsoleUserSortDirection}
            />
          )}
          <RefreshButton
            isRefreshing={isRefreshing}
            onRefresh={refetch}
            size="sm"
          />
        </div>
      </div>

      {/* Local Search */}
      <div className="relative mb-3">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <input
          type="text"
          value={localSearch}
          onChange={(e) => setLocalSearch(e.target.value)}
          placeholder={
            activeTab === 'clusterUsers' ? 'Search cluster users...' :
            activeTab === 'serviceAccounts' ? 'Search service accounts...' :
            'Search console users...'
          }
          className="w-full pl-8 pr-3 py-1.5 text-xs bg-secondary rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-purple-500/50"
        />
      </div>

      {/* Content - fixed height to prevent jumping, p-px prevents border clipping */}
      <div className="flex-1 overflow-y-auto min-h-0 p-px">
        {activeTab === 'clusterUsers' && (
          <ClusterUsersTab
            clusters={clusters}
            selectedCluster={selectedCluster}
            setSelectedCluster={setSelectedCluster}
            users={openshiftUserPagination.paginatedItems}
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
            serviceAccounts={saPagination.paginatedItems}
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
            users={consoleUserPagination.paginatedItems}
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
      {activeTab === 'clusterUsers' && openshiftUserPagination.needsPagination && openshiftUserLimit !== 'unlimited' && (
        <div className="pt-2 border-t border-border/50 mt-2">
          <Pagination
            currentPage={openshiftUserPagination.currentPage}
            totalPages={openshiftUserPagination.totalPages}
            totalItems={openshiftUserPagination.totalItems}
            itemsPerPage={openshiftUserPagination.itemsPerPage}
            onPageChange={openshiftUserPagination.goToPage}
            showItemsPerPage={false}
          />
        </div>
      )}
      {activeTab === 'serviceAccounts' && saPagination.needsPagination && saLimit !== 'unlimited' && (
        <div className="pt-2 border-t border-border/50 mt-2">
          <Pagination
            currentPage={saPagination.currentPage}
            totalPages={saPagination.totalPages}
            totalItems={saPagination.totalItems}
            itemsPerPage={saPagination.itemsPerPage}
            onPageChange={saPagination.goToPage}
            showItemsPerPage={false}
          />
        </div>
      )}
      {activeTab === 'console' && consoleUserPagination.needsPagination && consoleUserLimit !== 'unlimited' && (
        <div className="pt-2 border-t border-border/50 mt-2">
          <Pagination
            currentPage={consoleUserPagination.currentPage}
            totalPages={consoleUserPagination.totalPages}
            totalItems={consoleUserPagination.totalItems}
            itemsPerPage={consoleUserPagination.itemsPerPage}
            onPageChange={consoleUserPagination.goToPage}
            showItemsPerPage={false}
          />
        </div>
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
  clusters: Array<{ name: string; healthy: boolean }>
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
  clusters: Array<{ name: string; healthy: boolean }>
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
