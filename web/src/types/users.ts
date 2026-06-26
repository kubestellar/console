// User roles for console users
export type UserRole = 'admin' | 'editor' | 'viewer'

// Console user
export interface ConsoleUser {
  id: string
  github_id: string
  github_login: string
  email?: string
  avatar_url?: string
  role: UserRole
  onboarded: boolean
  created_at: string
  last_login?: string
}

// Kubernetes subject kinds
export type K8sSubjectKind = 'User' | 'Group' | 'ServiceAccount'

// Kubernetes user/subject (RBAC)
export interface K8sUser {
  kind: K8sSubjectKind
  name: string
  namespace?: string
  cluster: string
}

// OpenShift User (users.user.openshift.io)
export interface OpenShiftUser {
  name: string
  fullName?: string
  identities?: string[]
  groups?: string[]
  cluster: string
  createdAt?: string
}

// Kubernetes role
export interface K8sRole {
  name: string
  namespace?: string
  cluster: string
  isCluster: boolean
  ruleCount: number
  description?: string
}

// Kubernetes role binding
export interface K8sRoleBinding {
  name: string
  namespace?: string
  cluster: string
  isCluster: boolean
  roleName: string
  roleKind: string
  subjects: Array<{
    kind: K8sSubjectKind
    name: string
    namespace?: string
  }>
}

// Kubernetes service account
export interface K8sServiceAccount {
  name: string
  namespace: string
  cluster: string
  secrets?: string[]
  roles?: string[]
  createdAt?: string
}

// Cluster permissions for current user
export interface ClusterPermissions {
  cluster: string
  isClusterAdmin: boolean
  canCreateServiceAccounts: boolean
  canManageRBAC: boolean
  canViewSecrets: boolean
}

// User management summary
export interface UserManagementSummary {
  consoleUsers: {
    total: number
    admins: number
    editors: number
    viewers: number
  }
  k8sServiceAccounts: {
    total: number
    clusters: string[]
  }
  currentUserPermissions: ClusterPermissions[]
}

// API request types
export interface UpdateUserRoleRequest {
  role: UserRole
}

export interface CreateServiceAccountRequest {
  name: string
  namespace: string
  cluster: string
}

export interface CreateRoleBindingRequest {
  name: string
  namespace?: string
  cluster: string
  isCluster: boolean
  roleName: string
  roleKind: string
  subjectKind: K8sSubjectKind
  subjectName: string
  subjectNamespace?: string
}
