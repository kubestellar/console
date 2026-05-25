export interface IntotoStep {
  name: string
  status: 'verified' | 'failed' | 'missing' | 'unknown'
  functionary: string
  linksFound: number
}

export interface IntotoLayout {
  name: string
  cluster: string
  namespace?: string
  steps: IntotoStep[]
  expectedProducts: number
  verifiedSteps: number
  failedSteps: number
  createdAt: string
}

export interface IntotoClusterStatus {
  cluster: string
  installed: boolean
  loading: boolean
  error?: string
  layouts: IntotoLayout[]
  totalLayouts: number
  totalSteps: number
  verifiedSteps: number
  failedSteps: number
  missingSteps: number
}

export interface IntotoStats {
  totalLayouts: number
  totalSteps: number
  verifiedSteps: number
  failedSteps: number
  missingSteps: number
}

export interface CacheData {
  statuses: Record<string, IntotoClusterStatus>
  timestamp: number
}

export interface IntotoLayoutResource {
  metadata: {
    name: string
    namespace?: string
    creationTimestamp?: string
  }
  spec: {
    steps?: Array<{
      name: string
      pubkeys?: string[]
      expectedMaterials?: unknown[]
      expectedProducts?: unknown[]
    }>
    inspect?: unknown[]
    keys?: Record<string, unknown>
  }
}

export interface IntotoLinkResource {
  metadata: {
    name: string
    namespace?: string
    labels?: Record<string, string>
  }
  spec: {
    name?: string
    command?: string[]
    materials?: Record<string, unknown>
    products?: Record<string, unknown>
  }
  status?: {
    verified?: boolean
  }
}
