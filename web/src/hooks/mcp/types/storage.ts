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
