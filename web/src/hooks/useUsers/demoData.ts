import { MS_PER_DAY, MS_PER_HOUR } from '../../lib/constants/time'
import type { ConsoleUser, K8sServiceAccount, OpenShiftUser, UserManagementSummary } from '../../types/users'

const DEMO_USER_MAX_AGE_MS = 90 * MS_PER_DAY

export function getDemoConsoleUsers(): ConsoleUser[] {
  return [
    { id: '1', github_id: '12345', github_login: 'admin-user', email: 'admin@example.com', avatar_url: 'https://avatars.githubusercontent.com/u/12345?v=4', role: 'admin', onboarded: true, created_at: new Date(Date.now() - DEMO_USER_MAX_AGE_MS).toISOString(), last_login: new Date(Date.now() - 2 * MS_PER_HOUR).toISOString() },
    { id: '2', github_id: '23456', github_login: 'developer-jane', email: 'jane@example.com', avatar_url: 'https://avatars.githubusercontent.com/u/23456?v=4', role: 'editor', onboarded: true, created_at: new Date(Date.now() - 60 * MS_PER_DAY).toISOString(), last_login: new Date(Date.now() - 5 * MS_PER_HOUR).toISOString() },
    { id: '3', github_id: '34567', github_login: 'viewer-bob', email: 'bob@example.com', role: 'viewer', onboarded: true, created_at: new Date(Date.now() - 30 * MS_PER_DAY).toISOString(), last_login: new Date(Date.now() - MS_PER_DAY).toISOString() },
    { id: '4', github_id: '45678', github_login: 'ops-engineer', email: 'ops@example.com', avatar_url: 'https://avatars.githubusercontent.com/u/45678?v=4', role: 'editor', onboarded: true, created_at: new Date(Date.now() - 45 * MS_PER_DAY).toISOString(), last_login: new Date(Date.now() - 1 * MS_PER_HOUR).toISOString() },
  ]
}

export function getDemoUserManagementSummary(): UserManagementSummary {
  return {
    consoleUsers: { total: 4, admins: 1, editors: 2, viewers: 1 },
    k8sServiceAccounts: { total: 11, clusters: ['prod-east', 'staging', 'dev-cluster'] },
    currentUserPermissions: [
      { cluster: 'prod-east', isClusterAdmin: true, canCreateServiceAccounts: true, canManageRBAC: true, canViewSecrets: true },
      { cluster: 'staging', isClusterAdmin: false, canCreateServiceAccounts: true, canManageRBAC: false, canViewSecrets: false },
      { cluster: 'dev-cluster', isClusterAdmin: true, canCreateServiceAccounts: true, canManageRBAC: true, canViewSecrets: true },
    ],
  }
}

export function getDemoOpenShiftUsers(cluster?: string): OpenShiftUser[] {
  if (!cluster) return []

  return [
    { name: 'admin', fullName: 'Cluster Admin', identities: ['htpasswd:admin'], groups: ['system:cluster-admins', 'system:authenticated'], cluster, createdAt: new Date(Date.now() - 90 * MS_PER_DAY).toISOString() },
    { name: 'developer', fullName: 'Dev User', identities: ['htpasswd:developer'], groups: ['developers', 'system:authenticated'], cluster, createdAt: new Date(Date.now() - 60 * MS_PER_DAY).toISOString() },
    { name: 'ops-user', fullName: 'Operations Engineer', identities: ['ldap:ops-user'], groups: ['operations', 'system:authenticated'], cluster, createdAt: new Date(Date.now() - 45 * MS_PER_DAY).toISOString() },
    { name: 'viewer', fullName: 'Read Only User', identities: ['htpasswd:viewer'], groups: ['viewers', 'system:authenticated'], cluster, createdAt: new Date(Date.now() - 30 * MS_PER_DAY).toISOString() },
  ]
}

export function getDemoK8sServiceAccounts(cluster?: string, namespace?: string): K8sServiceAccount[] {
  if (!cluster) return []

  const accounts: K8sServiceAccount[] = [
    { name: 'default', namespace: 'default', cluster, roles: ['view'] },
    { name: 'admin-sa', namespace: 'default', cluster, roles: ['admin', 'cluster-admin'] },
    { name: 'prometheus', namespace: 'monitoring', cluster, roles: ['cluster-view'] },
    { name: 'grafana', namespace: 'monitoring', cluster, roles: ['view'] },
    { name: 'argocd', namespace: 'argocd', cluster, roles: ['cluster-admin'] },
    { name: 'builder', namespace: 'kube-system', cluster, roles: ['edit'] },
  ]

  return namespace ? accounts.filter(account => account.namespace === namespace) : accounts
}
