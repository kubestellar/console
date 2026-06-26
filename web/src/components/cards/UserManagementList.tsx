import { memo, useState } from 'react'

// Split helper component; parent card owns useCardLoadingState.
import { Users, Key, Trash2, ChevronDown, ChevronUp, ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn'
import { StatusBadge } from '../ui/StatusBadge'
import { DeleteUserConfirmModal } from './UserManagementModal'
import { MAX_VISIBLE_GROUPS } from './UserManagement.utils'
import type {
  ConsoleUsersTabProps,
  ClusterUsersTabProps,
  ServiceAccountsTabProps,
  UserRole,
  OpenShiftUser,
  ConsoleUser,
} from './UserManagement.types'

// Re-export tab props interfaces for use in the main component
export type { ConsoleUsersTabProps, ClusterUsersTabProps, ServiceAccountsTabProps }

export const ConsoleUsersTab = memo(function ConsoleUsersTab({
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
  const { t } = useTranslation(['cards', 'common'])
  const [deleteConfirmUserId, setDeleteConfirmUserId] = useState<string | null>(null)

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
        <p className="text-sm">{t('userManagement.noUsersFound')}</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {users.map((user: ConsoleUser) => {
        const isCurrentUser = user.github_id === currentUserGithubId
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
              'flex flex-wrap items-center justify-between gap-y-2',
              isBlurred && 'blur-xs select-none pointer-events-none'
            )}>
              <div className="flex items-center gap-3">
                {user.avatar_url ? (
                  <img
                    src={user.avatar_url}
                    alt={user.github_login || 'User avatar'}
                    className="w-8 h-8 rounded-full"
                    loading="lazy"
                    width={32}
                    height={32}
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
                    {isCurrentUser ? `${user.github_login} (${t('userManagement.you')})` : user.github_login}
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

            {isAdmin && expandedUser === user.id && !isCurrentUser && (
              <div className="mt-3 pt-3 border-t border-border/50">
                <div className="flex flex-wrap items-center justify-between gap-y-2">
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
                    onClick={() => setDeleteConfirmUserId(user.id)}
                    className="p-1.5 rounded text-red-400 hover:bg-red-500/10"
                    title={t('common:actions.delete')}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}

      <DeleteUserConfirmModal
        userId={deleteConfirmUserId}
        onClose={() => setDeleteConfirmUserId(null)}
        onConfirm={(userId) => {
          onDeleteUser(userId)
          setDeleteConfirmUserId(null)
        }}
      />
    </div>
  )
})


export function UserManagementSkeleton() {
  return (
    <div className="h-full flex flex-col min-h-card">
      <div className="flex flex-wrap items-center justify-between gap-y-2 mb-3">
        <div className="flex gap-2">
          <div className="animate-pulse rounded bg-secondary h-7 w-24" />
          <div className="animate-pulse rounded bg-secondary h-7 w-28" />
        </div>
        <div className="animate-pulse rounded bg-secondary h-7 w-28" />
      </div>
      <div className="animate-pulse rounded bg-secondary h-8 mb-3" />
      <div className="space-y-2">
        <div className="animate-pulse rounded bg-secondary h-14" />
        <div className="animate-pulse rounded bg-secondary h-14" />
        <div className="animate-pulse rounded bg-secondary h-14" />
      </div>
    </div>
  )
}

export function UserManagementEmptyState() {
  const { t } = useTranslation(['cards', 'common'])

  return (
    <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground">
      <p className="text-sm">{t('userManagement.noUsers')}</p>
      <p className="text-xs mt-1">{t('userManagement.usersWillAppear')}</p>
    </div>
  )
}

export const ClusterUsersTab = memo(function ClusterUsersTab({
  clusters,
  selectedCluster,
  setSelectedCluster,
  users,
  isLoading,
  showClusterBadge,
  onDrillToUser,
}: ClusterUsersTabProps) {
  const { t } = useTranslation(['cards', 'common'])

  return (
    <div className="space-y-3 w-full">
      <div>
        <label className="block text-xs text-muted-foreground mb-1">{t('userManagement.filterByCluster')}</label>
        <select
          value={selectedCluster}
          onChange={(e) => setSelectedCluster(e.target.value)}
          className="w-full px-2 py-1.5 rounded-lg bg-secondary border border-border text-foreground text-xs"
        >
          <option value="">{t('common:filters.allClusters')}</option>
          {clusters.map((c) => (
            <option key={c.name} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-4">
          <div className="spinner w-5 h-5" />
        </div>
      ) : users.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-4 text-muted-foreground">
          <Users className="w-6 h-6 mb-1 opacity-50" />
          <p className="text-xs">{t('userManagement.noUsersFound')}</p>
        </div>
      ) : (
        <div className="space-y-2 w-full">
          {users.map((user: OpenShiftUser, idx: number) => (
            <div
              key={`${user.cluster}-${user.name}-${idx}`}
              onClick={() => onDrillToUser(user.cluster, user.name)}
              className="p-2 rounded bg-secondary/30 text-sm hover:bg-secondary/50 transition-colors cursor-pointer group w-full overflow-hidden"
            >
              <div className="flex flex-wrap items-center justify-between gap-y-2 min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-foreground font-medium group-hover:text-purple-400 truncate">{user.name}</span>
                  {user.fullName && (
                    <span className="text-muted-foreground text-xs truncate">({user.fullName})</span>
                  )}
                  {showClusterBadge && (
                    <StatusBadge color="cyan" variant="outline" className="flex-shrink-0">
                      {user.cluster}
                    </StatusBadge>
                  )}
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
              </div>
              {user.identities && user.identities.length > 0 && (
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  {t('userManagement.identity')}: {user.identities[0]}
                </p>
              )}
              {user.groups && user.groups.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1 w-full min-w-0">
                  {user.groups.slice(0, MAX_VISIBLE_GROUPS).map((group, i) => (
                    <span
                      key={i}
                      className="px-1.5 py-0.5 rounded text-xs bg-blue-500/20 text-blue-400 truncate"
                    >
                      {group}
                    </span>
                  ))}
                  {user.groups.length > MAX_VISIBLE_GROUPS && (
                    <span className="text-xs text-muted-foreground">+{user.groups.length - MAX_VISIBLE_GROUPS} more</span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
})

export const ServiceAccountsTab = memo(function ServiceAccountsTab({
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
  const { t } = useTranslation(['cards', 'common'])

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">{t('userManagement.filterByCluster')}</label>
          <select
            value={selectedCluster}
            onChange={(e) => {
              setSelectedCluster(e.target.value)
              setSelectedNamespace('')
            }}
            className="w-full px-2 py-1.5 rounded-lg bg-secondary border border-border text-foreground text-xs"
          >
            <option value="">{t('common:filters.allClusters')}</option>
            {clusters.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">{t('userManagement.filterByNamespace')}</label>
          <select
            value={selectedNamespace}
            onChange={(e) => setSelectedNamespace(e.target.value)}
            className="w-full px-2 py-1.5 rounded-lg bg-secondary border border-border text-foreground text-xs"
          >
            <option value="">{t('userManagement.allNamespaces')}</option>
            {namespaces.map((ns) => (
              <option key={ns} value={ns}>
                {ns}
              </option>
            ))}
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-4">
          <div className="spinner w-5 h-5" />
        </div>
      ) : serviceAccounts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-4 text-muted-foreground">
          <Key className="w-6 h-6 mb-1 opacity-50" />
          <p className="text-xs">{t('userManagement.noServiceAccountsFound')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {serviceAccounts.map((sa, idx) => (
            <div
              key={`${sa.cluster}-${sa.namespace}-${sa.name}-${idx}`}
              onClick={() => onDrillToServiceAccount(sa.cluster, sa.namespace, sa.name, sa.roles)}
              className="p-2 rounded bg-secondary/30 text-sm hover:bg-secondary/50 transition-colors cursor-pointer group"
            >
              <div className="flex flex-wrap items-center justify-between gap-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-foreground font-medium group-hover:text-purple-400">{sa.name}</span>
                  {showClusterBadge && (
                    <StatusBadge color="cyan" variant="outline">
                      {sa.cluster}
                    </StatusBadge>
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
})

