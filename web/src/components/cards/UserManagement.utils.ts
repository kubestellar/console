import { commonComparators } from '../../lib/cards/cardHooks'
import type { OpenShiftUser, UserRole } from '../../types/users'
import type {
  ConsoleUser,
  TabType,
  TranslateFn,
  OpenShiftUserSortBy,
  SASortBy,
  ConsoleUserSortBy,
  ServiceAccount,
} from './UserManagement.types'

export const MAX_VISIBLE_GROUPS = 3

export const USER_MANAGEMENT_TABS: TabType[] = ['clusterUsers', 'serviceAccounts', 'console']

export function getConsoleUserSortOptions(t: TranslateFn) {
  return [
    { value: 'name' as ConsoleUserSortBy, label: t('common:common.name') },
    { value: 'role' as ConsoleUserSortBy, label: t('common:common.role') },
    { value: 'email' as ConsoleUserSortBy, label: t('userManagement.email') },
  ]
}

export function getOpenShiftUserSortOptions(t: TranslateFn) {
  return [
    { value: 'name' as OpenShiftUserSortBy, label: t('userManagement.username') },
    { value: 'kind' as OpenShiftUserSortBy, label: t('userManagement.fullName') },
  ]
}

export function getSASortOptions(t: TranslateFn) {
  return [
    { value: 'name' as SASortBy, label: t('common:common.name') },
    { value: 'namespace' as SASortBy, label: t('common:common.namespace') },
  ]
}

export const OPENSHIFT_USER_COMPARATORS: Record<OpenShiftUserSortBy, (a: OpenShiftUser, b: OpenShiftUser) => number> = {
  name: commonComparators.string<OpenShiftUser>('name'),
  kind: (a, b) => (a.fullName || '').localeCompare(b.fullName || ''),
}

export const SA_COMPARATORS: Record<SASortBy, (a: ServiceAccount, b: ServiceAccount) => number> = {
  name: (a, b) => a.name.localeCompare(b.name),
  namespace: (a, b) => a.namespace.localeCompare(b.namespace),
}

export function getRoleBadgeClass(role: UserRole): string {
  switch (role) {
    case 'admin':
      return 'bg-purple-500/20 text-purple-400 border-purple-500/30'
    case 'editor':
      return 'bg-blue-500/20 text-blue-400 border-blue-500/30'
    default:
      return 'bg-gray-500/20 dark:bg-gray-400/20 text-muted-foreground border-gray-500/30 dark:border-gray-400/30'
  }
}

/** Preserve current-user pinning for every console-user sort field. */
export function getConsoleUserComparators(currentUserId: ConsoleUser['github_id'] | undefined): Record<ConsoleUserSortBy, (a: ConsoleUser, b: ConsoleUser) => number> {
  return {
    name: (a, b) => {
      if (a.github_id === currentUserId) return -1
      if (b.github_id === currentUserId) return 1
      return a.github_login.localeCompare(b.github_login)
    },
    role: (a, b) => {
      if (a.github_id === currentUserId) return -1
      if (b.github_id === currentUserId) return 1
      return a.role.localeCompare(b.role)
    },
    email: (a, b) => {
      if (a.github_id === currentUserId) return -1
      if (b.github_id === currentUserId) return 1
      return (a.email || '').localeCompare(b.email || '')
    },
  }
}
