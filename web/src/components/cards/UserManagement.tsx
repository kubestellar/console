import { useState, useMemo } from 'react'
import {
  Users,
  Shield,
  Key,
  Trash2,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  CheckCircle,
  Search,
  ChevronRight,
} from 'lucide-react'
import { useConsoleUsers, useUserManagementSummary, useK8sServiceAccounts } from '../../hooks/useUsers'
import { useClusters } from '../../hooks/useMCP'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { useAuth } from '../../lib/auth'
import { cn } from '../../lib/cn'
import type { ConsoleUser, UserRole } from '../../types/users'
import { RefreshButton } from '../ui/RefreshIndicator'
import { Skeleton } from '../ui/Skeleton'

interface UserManagementProps {
  config?: Record<string, unknown>
}

type TabType = 'console' | 'k8s'

export function UserManagement({ config: _config }: UserManagementProps) {
  const [activeTab, setActiveTab] = useState<TabType>('console')
  const [selectedCluster, setSelectedCluster] = useState<string>('')
  const [expandedUser, setExpandedUser] = useState<string | null>(null)
  const [localSearch, setLocalSearch] = useState('')

  const { drillToRBAC } = useDrillDownActions()
  const { user: currentUser } = useAuth()
  const { summary, isLoading: summaryLoading, isRefreshing: summaryRefreshing, refetch: refetchSummary } = useUserManagementSummary()
  const { users: allUsers, isLoading: usersLoading, isRefreshing: usersRefreshing, refetch: refetchUsers, updateUserRole, deleteUser } = useConsoleUsers()

  const isRefreshing = summaryRefreshing || usersRefreshing
  const refetch = () => {
    refetchSummary()
    refetchUsers()
  }
  const { clusters: allClusters } = useClusters()
  const { serviceAccounts: allServiceAccounts, isLoading: sasLoading } = useK8sServiceAccounts(selectedCluster)
  const { selectedClusters, isAllClustersSelected, customFilter } = useGlobalFilters()

  // Filter clusters by global filter
  const clusters = useMemo(() => {
    let result = allClusters
    if (!isAllClustersSelected) {
      result = result.filter(c => selectedClusters.includes(c.name))
    }
    return result
  }, [allClusters, selectedClusters, isAllClustersSelected])

  // Filter users by global customFilter and local search
  const users = useMemo(() => {
    let result = allUsers
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
  }, [allUsers, customFilter, localSearch])

  // Filter service accounts by global filter and local search
  const serviceAccounts = useMemo(() => {
    let result = allServiceAccounts
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
  }, [allServiceAccounts, selectedClusters, isAllClustersSelected, customFilter, localSearch])

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

  // Only show skeleton if no cached data exists
  const hasData = summary !== null || allUsers.length > 0
  const showSkeleton = (summaryLoading || usersLoading) && !hasData

  if (showSkeleton) {
    return (
      <div className="h-full flex flex-col min-h-card">
        {/* Header skeleton */}
        <div className="flex items-center justify-between mb-4">
          <Skeleton variant="text" width={130} height={20} />
          <Skeleton variant="rounded" width={32} height={32} />
        </div>
        {/* Summary stats skeleton */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <Skeleton variant="rounded" height={80} />
          <Skeleton variant="rounded" height={80} />
          <Skeleton variant="rounded" height={80} />
        </div>
        {/* Search skeleton */}
        <Skeleton variant="rounded" height={32} className="mb-4" />
        {/* Tabs skeleton */}
        <div className="flex gap-2 mb-4">
          <Skeleton variant="rounded" width={100} height={32} />
          <Skeleton variant="rounded" width={120} height={32} />
        </div>
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
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-purple-400" />
          <span className="text-sm font-medium text-muted-foreground">User Management</span>
        </div>
        <RefreshButton
          isRefreshing={isRefreshing}
          onRefresh={refetch}
          size="sm"
        />
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="p-3 rounded-lg bg-secondary/30">
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-4 h-4 text-purple-400" />
            <span className="text-xs text-muted-foreground">Console Users</span>
          </div>
          <p className="text-lg font-semibold text-foreground">
            {summary?.consoleUsers.total || 0}
          </p>
          <div className="flex gap-2 text-xs text-muted-foreground mt-1">
            <span>{summary?.consoleUsers.admins || 0} admin</span>
            <span>{summary?.consoleUsers.editors || 0} editor</span>
          </div>
        </div>

        <div className="p-3 rounded-lg bg-secondary/30">
          <div className="flex items-center gap-2 mb-1">
            <Key className="w-4 h-4 text-blue-400" />
            <span className="text-xs text-muted-foreground">Service Accounts</span>
          </div>
          <p className="text-lg font-semibold text-foreground">
            {summary?.k8sServiceAccounts.total || 0}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {summary?.k8sServiceAccounts.clusters?.length || 0} clusters
          </p>
        </div>

        <div className="p-3 rounded-lg bg-secondary/30">
          <div className="flex items-center gap-2 mb-1">
            <Shield className="w-4 h-4 text-green-400" />
            <span className="text-xs text-muted-foreground">Your Access</span>
          </div>
          <p className="text-lg font-semibold text-foreground">
            {summary?.currentUserPermissions?.filter((p) => p.isClusterAdmin).length || 0}
          </p>
          <p className="text-xs text-muted-foreground mt-1">cluster admin</p>
        </div>
      </div>

      {/* Local Search */}
      <div className="relative mb-4">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <input
          type="text"
          value={localSearch}
          onChange={(e) => setLocalSearch(e.target.value)}
          placeholder="Search users..."
          className="w-full pl-8 pr-3 py-1.5 text-xs bg-secondary rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-purple-500/50"
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setActiveTab('console')}
          className={cn(
            'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
            activeTab === 'console'
              ? 'bg-purple-500/20 text-purple-400'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          Console Users
        </button>
        <button
          onClick={() => setActiveTab('k8s')}
          className={cn(
            'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
            activeTab === 'k8s'
              ? 'bg-purple-500/20 text-purple-400'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          Kubernetes RBAC
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {activeTab === 'console' && (
          <ConsoleUsersTab
            users={users}
            isLoading={usersLoading}
            isAdmin={isAdmin}
            currentUserId={currentUser?.id}
            expandedUser={expandedUser}
            setExpandedUser={setExpandedUser}
            onRoleChange={handleRoleChange}
            onDeleteUser={handleDeleteUser}
            getRoleBadgeClass={getRoleBadgeClass}
          />
        )}

        {activeTab === 'k8s' && (
          <K8sRbacTab
            clusters={clusters}
            selectedCluster={selectedCluster}
            setSelectedCluster={setSelectedCluster}
            serviceAccounts={serviceAccounts}
            isLoading={sasLoading}
            permissions={summary?.currentUserPermissions || []}
            onDrillToServiceAccount={(cluster, namespace, name, roles) =>
              drillToRBAC(cluster, namespace, name, {
                type: 'ServiceAccount',
                roles,
              })
            }
          />
        )}
      </div>
    </div>
  )
}

interface ConsoleUsersTabProps {
  users: ConsoleUser[]
  isLoading: boolean
  isAdmin: boolean
  currentUserId?: string
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
  currentUserId,
  expandedUser,
  setExpandedUser,
  onRoleChange,
  onDeleteUser,
  getRoleBadgeClass,
}: ConsoleUsersTabProps) {
  if (isLoading) {
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
      {users.map((user) => (
        <div
          key={user.id}
          className="p-3 rounded-lg bg-secondary/30 border border-border/50"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {user.avatar_url ? (
                <img
                  src={user.avatar_url}
                  alt={user.github_login}
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
                <p className="text-sm font-medium text-foreground">{user.github_login}</p>
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

              {isAdmin && user.id !== currentUserId && (
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
          {isAdmin && expandedUser === user.id && user.id !== currentUserId && (
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
      ))}
    </div>
  )
}

interface K8sRbacTabProps {
  clusters: Array<{ name: string; healthy: boolean }>
  selectedCluster: string
  setSelectedCluster: (cluster: string) => void
  serviceAccounts: Array<{
    name: string
    namespace: string
    cluster: string
    roles?: string[]
  }>
  isLoading: boolean
  permissions: Array<{ cluster: string; isClusterAdmin: boolean }>
  onDrillToServiceAccount: (cluster: string, namespace: string, name: string, roles?: string[]) => void
}

function K8sRbacTab({
  clusters,
  selectedCluster,
  setSelectedCluster,
  serviceAccounts,
  isLoading,
  permissions,
  onDrillToServiceAccount,
}: K8sRbacTabProps) {
  return (
    <div className="space-y-4">
      {/* Cluster selector */}
      <div>
        <label className="block text-xs text-muted-foreground mb-1">Cluster</label>
        <select
          value={selectedCluster}
          onChange={(e) => setSelectedCluster(e.target.value)}
          className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground text-sm"
        >
          <option value="">All clusters</option>
          {clusters.map((c) => (
            <option key={c.name} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {/* Cluster permissions */}
      {permissions.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground mb-2">Your Cluster Access</p>
          <div className="flex flex-wrap gap-2">
            {permissions.map((p) => (
              <div
                key={p.cluster}
                className={cn(
                  'flex items-center gap-1.5 px-2 py-1 rounded text-xs',
                  p.isClusterAdmin
                    ? 'bg-green-500/20 text-green-400'
                    : 'bg-gray-500/20 text-gray-400'
                )}
              >
                {p.isClusterAdmin ? (
                  <CheckCircle className="w-3 h-3" />
                ) : (
                  <AlertCircle className="w-3 h-3" />
                )}
                <span>{p.cluster}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Service accounts */}
      <div>
        <p className="text-xs text-muted-foreground mb-2">
          Service Accounts {serviceAccounts.length > 0 && `(${serviceAccounts.length})`}
        </p>

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
          <div className="space-y-2 max-h-48 overflow-auto">
            {serviceAccounts.slice(0, 10).map((sa, idx) => (
              <div
                key={`${sa.cluster}-${sa.namespace}-${sa.name}-${idx}`}
                onClick={() => onDrillToServiceAccount(sa.cluster, sa.namespace, sa.name, sa.roles)}
                className="p-2 rounded bg-secondary/30 text-sm hover:bg-secondary/50 transition-colors cursor-pointer group"
              >
                <div className="flex items-center justify-between">
                  <span className="text-foreground font-medium group-hover:text-purple-400">{sa.name}</span>
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
            {serviceAccounts.length > 10 && (
              <p className="text-xs text-muted-foreground text-center">
                +{serviceAccounts.length - 10} more
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
