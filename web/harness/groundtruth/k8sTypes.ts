export interface K8sListingFailure {
  context: string
  resource: string
  error: string
}

export interface K8sGroundTruth {
  runId: string
  skipped?: string
  /** kubectl listings that failed even after fallback — counts derived from a
   *  run with failures here are incomplete and must not be compared as exact
   *  ground truth. Absent on reports written before this field existed. */
  listingFailures?: K8sListingFailure[]
  contexts: {
    configured: number
    reachable: number
    names: string[]
  }
  nodes: {
    total: number
    ready: number
    notReady: number
  }
  pods: {
    total: number
    running: number
    pending: number
    failed: number
    crashLoopBackOff: number
  }
  namespaces: {
    total: number
    createdByHarness: string[]
  }
  deployments: {
    total: number
    available: number
    unavailable: number
  }
}

export interface KubectlJsonList<T> {
  items?: T[]
}

export interface K8sNode {
  status?: {
    conditions?: Array<{ type?: string; status?: string }>
  }
}

export interface K8sPod {
  status?: {
    phase?: string
    containerStatuses?: Array<{ state?: { waiting?: { reason?: string } } }>
  }
}

export interface K8sDeployment {
  status?: {
    replicas?: number
    availableReplicas?: number
  }
}
