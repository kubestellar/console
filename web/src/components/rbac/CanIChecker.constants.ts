export const COMMON_VERBS = ['get', 'list', 'create', 'update', 'delete', 'watch', 'patch']

// Common API groups for Kubernetes resources
export const COMMON_API_GROUPS = [
  { value: '', label: 'Core API (pods, services, secrets)' },
  { value: 'apps', label: 'apps (deployments, statefulsets)' },
  { value: 'rbac.authorization.k8s.io', label: 'rbac.authorization.k8s.io (roles, bindings)' },
  { value: 'batch', label: 'batch (jobs, cronjobs)' },
  { value: 'networking.k8s.io', label: 'networking.k8s.io (ingresses)' },
  { value: 'autoscaling', label: 'autoscaling (hpa)' },
  { value: 'storage.k8s.io', label: 'storage.k8s.io (storageclasses)' },
  { value: 'policy', label: 'policy (poddisruptionbudgets)' },
  { value: 'admissionregistration.k8s.io', label: 'admissionregistration.k8s.io (webhooks)' },
  { value: 'apiextensions.k8s.io', label: 'apiextensions.k8s.io (crds)' },
]

// Common user groups, especially for OpenShift
export const COMMON_USER_GROUPS = [
  { value: 'system:authenticated', label: 'system:authenticated' },
  { value: 'system:authenticated:oauth', label: 'system:authenticated:oauth (OpenShift)' },
  { value: 'system:cluster-admins', label: 'system:cluster-admins' },
  { value: 'cluster-admins', label: 'cluster-admins (OpenShift)' },
  { value: 'dedicated-admins', label: 'dedicated-admins (OpenShift Dedicated)' },
  { value: 'system:serviceaccounts', label: 'system:serviceaccounts' },
  { value: 'system:masters', label: 'system:masters' },
]

// Resource to API group mapping - required for correct permission checks
export const RESOURCE_API_GROUPS: Record<string, string> = {
  // Core API (empty string)
  pods: '',
  services: '',
  secrets: '',
  configmaps: '',
  namespaces: '',
  nodes: '',
  persistentvolumeclaims: '',
  serviceaccounts: '',
  events: '',
  endpoints: '',
  // apps API group
  deployments: 'apps',
  replicasets: 'apps',
  statefulsets: 'apps',
  daemonsets: 'apps',
  // rbac.authorization.k8s.io
  roles: 'rbac.authorization.k8s.io',
  rolebindings: 'rbac.authorization.k8s.io',
  clusterroles: 'rbac.authorization.k8s.io',
  clusterrolebindings: 'rbac.authorization.k8s.io',
  // batch
  jobs: 'batch',
  cronjobs: 'batch',
  // networking.k8s.io
  ingresses: 'networking.k8s.io',
  networkpolicies: 'networking.k8s.io',
  // autoscaling
  horizontalpodautoscalers: 'autoscaling',
  // storage.k8s.io
  storageclasses: 'storage.k8s.io' }

export const COMMON_RESOURCES = [
  'pods',
  'deployments',
  'services',
  'secrets',
  'configmaps',
  'namespaces',
  'nodes',
  'persistentvolumeclaims',
  'serviceaccounts',
  'roles',
  'rolebindings',
  'clusterroles',
  'clusterrolebindings',
  'jobs',
  'cronjobs',
  'ingresses',
  'statefulsets',
  'daemonsets',
]
