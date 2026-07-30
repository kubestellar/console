// MCP hook types — resource, storage, config, and RBAC types
// (ConfigMap, Secret, ServiceAccount, PVC, PV, ResourceQuota,
//  LimitRange, K8sRole, K8sRoleBinding, K8sServiceAccountInfo).
// Split out from types.ts to keep each file under the max-lines limit.

export interface ConfigMap {
  name: string
  namespace: string
  cluster?: string
  dataCount: number
  age?: string
  labels?: Record<string, string>
  annotations?: Record<string, string>
}

export interface Secret {
  name: string
  namespace: string
  cluster?: string
  type: string
  dataCount: number
  age?: string
  labels?: Record<string, string>
  annotations?: Record<string, string>
}

export interface ServiceAccount {
  name: string
  namespace: string
  cluster?: string
  secrets?: string[]
  imagePullSecrets?: string[]
  age?: string
  labels?: Record<string, string>
  annotations?: Record<string, string>
}

export interface PVC {
  name: string
  namespace: string
  cluster?: string
  status: string
  storageClass?: string
  capacity?: string
  accessModes?: string[]
  volumeName?: string
  age?: string
  labels?: Record<string, string>
  annotations?: Record<string, string>
}

export interface PV {
  name: string
  cluster?: string
  status: string
  capacity?: string
  storageClass?: string
  reclaimPolicy?: string
  accessModes?: string[]
  claimRef?: string
  volumeMode?: string
  age?: string
  labels?: Record<string, string>
}

export interface ResourceQuota {
  name: string
  namespace: string
  cluster?: string
  hard: Record<string, string>  // Resource limits
  used: Record<string, string>  // Current usage
  age?: string
  labels?: Record<string, string>
  annotations?: Record<string, string>  // Reservation metadata
}

export interface LimitRangeItem {
  type: string  // Pod, Container, PersistentVolumeClaim
  default?: Record<string, string>
  defaultRequest?: Record<string, string>
  max?: Record<string, string>
  min?: Record<string, string>
}

export interface LimitRange {
  name: string
  namespace: string
  cluster?: string
  limits: LimitRangeItem[]
  age?: string
  labels?: Record<string, string>
}

export interface ResourceQuotaSpec {
  cluster: string
  name: string
  namespace: string
  hard: Record<string, string>
  labels?: Record<string, string>
  annotations?: Record<string, string>  // Reservation metadata
  ensure_namespace?: boolean  // Auto-create namespace if it doesn't exist (GPU reservation flow)
}

export interface K8sRole {
  name: string
  namespace?: string
  cluster: string
  isCluster: boolean
  ruleCount: number
}

// K8s role binding type
export interface K8sRoleBinding {
  name: string
  namespace?: string
  cluster: string
  isCluster: boolean
  roleName: string
  roleKind: string
  subjects: Array<{
    kind: 'User' | 'Group' | 'ServiceAccount'
    name: string
    namespace?: string
  }>
}

// K8s service account type (for RBAC)
export interface K8sServiceAccountInfo {
  name: string
  namespace: string
  cluster: string
  secrets?: string[]
  roles?: string[]
  createdAt?: string
}
