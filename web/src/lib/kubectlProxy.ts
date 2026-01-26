/**
 * Kubectl Proxy - Execute kubectl commands through the KKC agent's WebSocket
 *
 * This provides direct access to Kubernetes clusters via the local KKC agent,
 * which has access to the user's kubeconfig.
 */

const KKC_AGENT_WS_URL = 'ws://127.0.0.1:8585/ws'

type MessageType = 'kubectl' | 'health' | 'clusters' | 'result' | 'error'

interface Message {
  id: string
  type: MessageType
  payload?: unknown
}

interface KubectlRequest {
  context?: string
  namespace?: string
  args: string[]
}

interface KubectlResponse {
  output: string
  exitCode: number
  error?: string
}

interface PendingRequest {
  resolve: (response: KubectlResponse) => void
  reject: (error: Error) => void
  timeout: ReturnType<typeof setTimeout>
}

// Request queue item for serializing requests
interface QueuedRequest {
  args: string[]
  options: { context?: string; namespace?: string; timeout?: number }
  resolve: (response: KubectlResponse) => void
  reject: (error: Error) => void
}

class KubectlProxy {
  private ws: WebSocket | null = null
  private pendingRequests: Map<string, PendingRequest> = new Map()
  private connectPromise: Promise<void> | null = null
  private messageId = 0
  private isConnecting = false

  // Request queue to prevent overwhelming the WebSocket
  private requestQueue: QueuedRequest[] = []
  private activeRequests = 0
  private readonly maxConcurrentRequests = 2 // Limit concurrent requests to KKC agent

  /**
   * Ensure WebSocket is connected
   */
  private async ensureConnected(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return
    }

    if (this.connectPromise) {
      return this.connectPromise
    }

    if (this.isConnecting) {
      // Wait for existing connection attempt
      await new Promise(resolve => setTimeout(resolve, 100))
      return this.ensureConnected()
    }

    this.isConnecting = true
    this.connectPromise = new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(KKC_AGENT_WS_URL)

        this.ws.onopen = () => {
          console.log('[KubectlProxy] Connected to KKC agent')
          this.isConnecting = false
          resolve()
        }

        this.ws.onmessage = (event) => {
          try {
            const message: Message = JSON.parse(event.data)
            const pending = this.pendingRequests.get(message.id)
            if (pending) {
              clearTimeout(pending.timeout)
              this.pendingRequests.delete(message.id)

              if (message.type === 'error') {
                const errorPayload = message.payload as { code: string; message: string }
                pending.reject(new Error(errorPayload.message || 'Unknown error'))
              } else {
                pending.resolve(message.payload as KubectlResponse)
              }
            }
          } catch (e) {
            console.error('[KubectlProxy] Failed to parse message:', e)
          }
        }

        this.ws.onclose = () => {
          console.log('[KubectlProxy] Connection closed')
          this.ws = null
          this.connectPromise = null
          this.isConnecting = false

          // Reject all pending requests
          this.pendingRequests.forEach((pending, id) => {
            clearTimeout(pending.timeout)
            pending.reject(new Error('Connection closed'))
            this.pendingRequests.delete(id)
          })
        }

        this.ws.onerror = (err) => {
          console.error('[KubectlProxy] WebSocket error:', err)
          this.isConnecting = false
          this.connectPromise = null
          reject(new Error('Failed to connect to KKC agent'))
        }
      } catch (err) {
        this.isConnecting = false
        this.connectPromise = null
        reject(err)
      }
    })

    return this.connectPromise
  }

  /**
   * Generate a unique message ID
   */
  private generateId(): string {
    return `kubectl-${++this.messageId}-${Date.now()}`
  }

  /**
   * Execute a kubectl command (queued to prevent overwhelming the agent)
   */
  async exec(
    args: string[],
    options: { context?: string; namespace?: string; timeout?: number } = {}
  ): Promise<KubectlResponse> {
    // Queue the request and process it when a slot is available
    return new Promise((resolve, reject) => {
      this.requestQueue.push({ args, options, resolve, reject })
      this.processQueue()
    })
  }

  /**
   * Process the request queue, respecting concurrency limits
   */
  private async processQueue(): Promise<void> {
    // Don't start new requests if we're at the limit
    if (this.activeRequests >= this.maxConcurrentRequests) {
      return
    }

    const request = this.requestQueue.shift()
    if (!request) {
      return
    }

    this.activeRequests++

    try {
      const response = await this.execImmediate(request.args, request.options)
      request.resolve(response)
    } catch (err) {
      request.reject(err instanceof Error ? err : new Error(String(err)))
    } finally {
      this.activeRequests--
      // Process next request in queue
      if (this.requestQueue.length > 0) {
        this.processQueue()
      }
    }
  }

  /**
   * Execute a kubectl command immediately (internal, bypasses queue)
   */
  private async execImmediate(
    args: string[],
    options: { context?: string; namespace?: string; timeout?: number } = {}
  ): Promise<KubectlResponse> {
    await this.ensureConnected()

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Not connected to KKC agent')
    }

    const id = this.generateId()
    const timeout = options.timeout || 30000

    return new Promise((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        this.pendingRequests.delete(id)
        reject(new Error(`Kubectl command timed out after ${timeout}ms`))
      }, timeout)

      this.pendingRequests.set(id, { resolve, reject, timeout: timeoutHandle })

      const message: Message = {
        id,
        type: 'kubectl',
        payload: {
          context: options.context,
          namespace: options.namespace,
          args,
        } as KubectlRequest,
      }

      this.ws!.send(JSON.stringify(message))
    })
  }

  /**
   * Get nodes for a cluster (used for health checks)
   */
  async getNodes(context: string): Promise<NodeInfo[]> {
    const response = await this.exec(['get', 'nodes', '-o', 'json'], { context, timeout: 20000 })
    if (response.exitCode !== 0) {
      throw new Error(response.error || 'Failed to get nodes')
    }
    const data = JSON.parse(response.output)
    const nodes = (data.items || []).map((node: KubeNode) => {
      // Parse allocatable resources (prefer allocatable over capacity)
      const alloc = node.status?.allocatable || node.status?.capacity || {}
      const cpuStr = alloc.cpu || '0'
      // CPU can be in millicores (e.g., "2000m") or cores (e.g., "2")
      // Note: parseResourceQuantity already handles 'm' suffix, no need to divide again
      const cpuCores = parseResourceQuantity(cpuStr)

      // Check Ready condition - Kubernetes uses 'True' (capitalized string)
      const readyCondition = node.status?.conditions?.find((c: NodeCondition) => c.type === 'Ready')
      const isReady = readyCondition?.status === 'True'

      // Debug: log node ready status
      console.log(`[NodeReady] ${context}/${node.metadata.name}: status=${readyCondition?.status}, ready=${isReady}`)

      return {
        name: node.metadata.name,
        ready: isReady,
        roles: Object.keys(node.metadata.labels || {})
          .filter(k => k.startsWith('node-role.kubernetes.io/'))
          .map(k => k.replace('node-role.kubernetes.io/', '')),
        cpuCores: cpuCores,
        memoryBytes: parseResourceQuantity(alloc.memory),
        storageBytes: parseResourceQuantity(alloc['ephemeral-storage']),
      }
    })
    return nodes
  }

  /**
   * Get pod count for a cluster
   */
  async getPodCount(context: string): Promise<number> {
    const response = await this.exec(['get', 'pods', '-A', '-o', 'json'], { context, timeout: 20000 })
    if (response.exitCode !== 0) {
      throw new Error(response.error || 'Failed to get pods')
    }
    const data = JSON.parse(response.output)
    return data.items?.length || 0
  }

  /**
   * Get cluster health summary
   */
  async getClusterHealth(context: string): Promise<ClusterHealth> {
    try {
      const [nodes, podCount] = await Promise.all([
        this.getNodes(context),
        this.getPodCount(context),
      ])

      const readyNodes = nodes.filter(n => n.ready).length

      // Aggregate resource metrics from all nodes
      const totalCpuCores = nodes.reduce((sum, n) => sum + (n.cpuCores || 0), 0)
      const totalMemoryBytes = nodes.reduce((sum, n) => sum + (n.memoryBytes || 0), 0)
      const totalStorageBytes = nodes.reduce((sum, n) => sum + (n.storageBytes || 0), 0)

      // Consider healthy if at least 80% of nodes are ready (or all nodes if < 5 nodes)
      // This allows for some nodes being in maintenance/update without marking cluster unhealthy
      const healthyThreshold = nodes.length < 5 ? nodes.length : Math.ceil(nodes.length * 0.8)
      const isHealthy = readyNodes >= healthyThreshold && nodes.length > 0

      // Debug log to understand health status
      console.log(`[ClusterHealth] ${context}: ${readyNodes}/${nodes.length} ready, threshold=${healthyThreshold}, healthy=${isHealthy}`)

      return {
        cluster: context,
        healthy: isHealthy,
        reachable: true,
        nodeCount: nodes.length,
        readyNodes,
        podCount,
        cpuCores: Math.round(totalCpuCores),
        memoryBytes: totalMemoryBytes,
        memoryGB: Math.round(totalMemoryBytes / (1024 * 1024 * 1024)),
        storageBytes: totalStorageBytes,
        storageGB: Math.round(totalStorageBytes / (1024 * 1024 * 1024)),
        lastSeen: new Date().toISOString(),
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error'
      console.error(`[ClusterHealth] ERROR for ${context}: ${errorMsg}`)
      return {
        cluster: context,
        healthy: false,
        reachable: false,
        nodeCount: 0,
        readyNodes: 0,
        podCount: 0,
        errorMessage: errorMsg,
      }
    }
  }

  /**
   * Get pods with issues (CrashLoopBackOff, ImagePullBackOff, etc.)
   */
  async getPodIssues(context: string, namespace?: string): Promise<PodIssue[]> {
    const nsArg = namespace ? ['-n', namespace] : ['-A']
    const response = await this.exec(['get', 'pods', ...nsArg, '-o', 'json'], { context, timeout: 15000 })

    if (response.exitCode !== 0) {
      throw new Error(response.error || 'Failed to get pods')
    }

    const data = JSON.parse(response.output)
    const issues: PodIssue[] = []

    for (const pod of data.items || []) {
      const status = pod.status
      const phase = status.phase
      const containerStatuses = status.containerStatuses || []

      // Check for problematic states
      const problems: string[] = []
      let restarts = 0
      let reason = ''

      for (const cs of containerStatuses) {
        restarts += cs.restartCount || 0

        if (cs.state?.waiting) {
          const waitReason = cs.state.waiting.reason
          if (['CrashLoopBackOff', 'ImagePullBackOff', 'ErrImagePull', 'CreateContainerError'].includes(waitReason)) {
            problems.push(waitReason)
            reason = waitReason
          }
        }

        if (cs.lastState?.terminated?.reason === 'OOMKilled') {
          problems.push('OOMKilled')
        }
      }

      if (phase === 'Pending' && status.conditions) {
        const unschedulable = status.conditions.find((c: { type: string; status: string; reason?: string }) =>
          c.type === 'PodScheduled' && c.status === 'False'
        )
        if (unschedulable) {
          problems.push('Unschedulable')
          reason = unschedulable.reason || 'Pending'
        }
      }

      if (phase === 'Failed') {
        problems.push('Failed')
        reason = status.reason || 'Failed'
      }

      if (problems.length > 0 || restarts > 5) {
        issues.push({
          name: pod.metadata.name,
          namespace: pod.metadata.namespace,
          cluster: context,
          status: reason || phase,
          reason,
          issues: problems,
          restarts,
        })
      }
    }

    return issues
  }

  /**
   * Get events from a cluster
   */
  async getEvents(context: string, namespace?: string, limit = 50): Promise<ClusterEvent[]> {
    const nsArg = namespace ? ['-n', namespace] : ['-A']
    const response = await this.exec(
      ['get', 'events', ...nsArg, '--sort-by=.lastTimestamp', '-o', 'json'],
      { context, timeout: 15000 }
    )

    if (response.exitCode !== 0) {
      throw new Error(response.error || 'Failed to get events')
    }

    const data = JSON.parse(response.output)
    const events: ClusterEvent[] = (data.items || []).slice(-limit).reverse().map((e: KubeEvent) => ({
      type: e.type,
      reason: e.reason,
      message: e.message,
      object: `${e.involvedObject.kind}/${e.involvedObject.name}`,
      namespace: e.metadata.namespace,
      cluster: context,
      count: e.count || 1,
      firstSeen: e.firstTimestamp,
      lastSeen: e.lastTimestamp,
    }))

    return events
  }

  /**
   * Get deployments from a cluster
   */
  async getDeployments(context: string, namespace?: string): Promise<Deployment[]> {
    const nsArg = namespace ? ['-n', namespace] : ['-A']
    const response = await this.exec(['get', 'deployments', ...nsArg, '-o', 'json'], { context, timeout: 15000 })

    if (response.exitCode !== 0) {
      throw new Error(response.error || 'Failed to get deployments')
    }

    const data = JSON.parse(response.output)
    return (data.items || []).map((d: KubeDeployment) => {
      const status = d.status
      const spec = d.spec
      const replicas = spec.replicas || 1
      const ready = status.readyReplicas || 0
      const updated = status.updatedReplicas || 0
      const available = status.availableReplicas || 0

      let deployStatus: 'running' | 'deploying' | 'failed' = 'running'
      if (ready < replicas) {
        deployStatus = updated > 0 ? 'deploying' : 'failed'
      }

      return {
        name: d.metadata.name,
        namespace: d.metadata.namespace,
        cluster: context,
        status: deployStatus,
        replicas,
        readyReplicas: ready,
        updatedReplicas: updated,
        availableReplicas: available,
        progress: Math.round((ready / replicas) * 100),
        image: spec.template?.spec?.containers?.[0]?.image,
        labels: d.metadata.labels,
        annotations: d.metadata.annotations,
      }
    })
  }

  /**
   * Get health for multiple clusters in parallel with progressive updates
   * Uses a concurrency limit to avoid overwhelming the KKC agent
   * @param contexts - Array of cluster contexts to check
   * @param onProgress - Callback called as each cluster's health is determined
   * @param concurrency - Max number of parallel health checks (default 5)
   * @returns Array of all health results
   */
  async getBulkClusterHealth(
    contexts: string[],
    onProgress?: (health: ClusterHealth) => void,
    concurrency = 5
  ): Promise<ClusterHealth[]> {
    const results: ClusterHealth[] = []
    const queue = [...contexts]
    const inProgress = new Set<string>()

    const processNext = async (): Promise<void> => {
      while (queue.length > 0 && inProgress.size < concurrency) {
        const context = queue.shift()!
        inProgress.add(context)

        // Don't await here - let multiple run in parallel
        this.getClusterHealth(context)
          .then(health => {
            results.push(health)
            onProgress?.(health)
          })
          .catch(err => {
            const errorHealth: ClusterHealth = {
              cluster: context,
              healthy: false,
              reachable: false,
              nodeCount: 0,
              readyNodes: 0,
              podCount: 0,
              errorMessage: err instanceof Error ? err.message : 'Unknown error',
            }
            results.push(errorHealth)
            onProgress?.(errorHealth)
          })
          .finally(() => {
            inProgress.delete(context)
            // Process next item when one completes
            if (queue.length > 0) {
              processNext()
            }
          })
      }
    }

    // Start initial batch up to concurrency limit
    const initialBatch = Math.min(concurrency, contexts.length)
    for (let i = 0; i < initialBatch; i++) {
      processNext()
    }

    // Wait for all to complete
    while (results.length < contexts.length) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    return results
  }

  /**
   * Close the WebSocket connection
   */
  close(): void {
    // Reject all queued requests
    while (this.requestQueue.length > 0) {
      const request = this.requestQueue.shift()!
      request.reject(new Error('Connection closed'))
    }
    this.activeRequests = 0

    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.connectPromise = null
  }

  /**
   * Check if connected to the agent
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }

  /**
   * Get queue statistics for debugging
   */
  getQueueStats(): { queued: number; active: number; maxConcurrent: number } {
    return {
      queued: this.requestQueue.length,
      active: this.activeRequests,
      maxConcurrent: this.maxConcurrentRequests,
    }
  }
}

// Type definitions for kubectl JSON output
interface KubeNode {
  metadata: { name: string; labels?: Record<string, string> }
  status: {
    conditions?: NodeCondition[]
    allocatable?: {
      cpu?: string
      memory?: string
      'ephemeral-storage'?: string
      pods?: string
    }
    capacity?: {
      cpu?: string
      memory?: string
      'ephemeral-storage'?: string
      pods?: string
    }
  }
}

interface NodeCondition {
  type: string
  status: string
  reason?: string
}

interface KubeEvent {
  type: string
  reason: string
  message: string
  involvedObject: { kind: string; name: string }
  metadata: { namespace: string }
  count?: number
  firstTimestamp?: string
  lastTimestamp?: string
}

interface KubeDeployment {
  metadata: { name: string; namespace: string; labels?: Record<string, string>; annotations?: Record<string, string> }
  spec: {
    replicas?: number
    template?: { spec?: { containers?: Array<{ image?: string }> } }
  }
  status: {
    readyReplicas?: number
    updatedReplicas?: number
    availableReplicas?: number
  }
}

// Helper to parse Kubernetes resource quantities
function parseResourceQuantity(value: string | undefined): number {
  if (!value) return 0
  // Handle Ki, Mi, Gi, Ti suffixes for bytes
  const match = value.match(/^(\d+(?:\.\d+)?)(Ki|Mi|Gi|Ti|K|M|G|T|m)?$/)
  if (!match) {
    // Try to parse as plain number
    const num = parseFloat(value)
    return isNaN(num) ? 0 : num
  }
  const num = parseFloat(match[1])
  const suffix = match[2]
  switch (suffix) {
    case 'Ki': return num * 1024
    case 'Mi': return num * 1024 * 1024
    case 'Gi': return num * 1024 * 1024 * 1024
    case 'Ti': return num * 1024 * 1024 * 1024 * 1024
    case 'K': return num * 1000
    case 'M': return num * 1000 * 1000
    case 'G': return num * 1000 * 1000 * 1000
    case 'T': return num * 1000 * 1000 * 1000 * 1000
    case 'm': return num / 1000 // millicores
    default: return num
  }
}

// Export types used by hooks
export interface NodeInfo {
  name: string
  ready: boolean
  roles: string[]
  cpuCores?: number
  memoryBytes?: number
  storageBytes?: number
}

export interface ClusterHealth {
  cluster: string
  healthy: boolean
  reachable: boolean
  nodeCount: number
  readyNodes: number
  podCount: number
  cpuCores?: number
  // Memory metrics
  memoryBytes?: number
  memoryGB?: number
  // Storage metrics
  storageBytes?: number
  storageGB?: number
  // PVC metrics
  pvcCount?: number
  pvcBoundCount?: number
  lastSeen?: string
  errorMessage?: string
}

export interface PodIssue {
  name: string
  namespace: string
  cluster: string
  status: string
  reason?: string
  issues: string[]
  restarts: number
}

export interface ClusterEvent {
  type: string
  reason: string
  message: string
  object: string
  namespace: string
  cluster: string
  count: number
  firstSeen?: string
  lastSeen?: string
}

export interface Deployment {
  name: string
  namespace: string
  cluster: string
  status: 'running' | 'deploying' | 'failed'
  replicas: number
  readyReplicas: number
  updatedReplicas: number
  availableReplicas: number
  progress: number
  image?: string
  labels?: Record<string, string>
  annotations?: Record<string, string>
}

// Singleton instance
export const kubectlProxy = new KubectlProxy()
