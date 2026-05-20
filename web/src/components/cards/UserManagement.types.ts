import type { ConsoleUser, UserRole, OpenShiftUser } from '../../types/users'

/** Loose translation function type for helper functions that use dynamic keys */
export type TranslateFn = (key: string, options?: Record<string, unknown>) => string

export interface UserManagementProps {
  config?: Record<string, unknown>
}

export type TabType = 'clusterUsers' | 'serviceAccounts' | 'console'
export type ConsoleUserSortBy = 'name' | 'role' | 'email'
export type OpenShiftUserSortBy = 'name' | 'kind'
export type SASortBy = 'name' | 'namespace'

export type ServiceAccount = {
  name: string
  namespace: string
  cluster: string
  roles?: string[]
}

export interface ConsoleUsersTabProps {
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

export interface ClusterUsersTabProps {
  clusters: Array<{ name: string; healthy?: boolean }>
  selectedCluster: string
  setSelectedCluster: (cluster: string) => void
  users: OpenShiftUser[]
  isLoading: boolean
  showClusterBadge: boolean
  onDrillToUser: (cluster: string, name: string) => void
}

export interface ServiceAccountsTabProps {
  clusters: Array<{ name: string; healthy?: boolean }>
  selectedCluster: string
  setSelectedCluster: (cluster: string) => void
  selectedNamespace: string
  setSelectedNamespace: (namespace: string) => void
  namespaces: string[]
  serviceAccounts: ServiceAccount[]
  isLoading: boolean
  showClusterBadge: boolean
  onDrillToServiceAccount: (cluster: string, namespace: string, name: string, roles?: string[]) => void
}

// Re-export domain types consumed by sibling modules so they only import from one place
export type { ConsoleUser, UserRole, OpenShiftUser }
