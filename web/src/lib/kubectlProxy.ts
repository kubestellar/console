/**
 * Kubectl Proxy - Execute kubectl commands through the local agent's WebSocket
 *
 * This provides direct access to Kubernetes clusters via the local agent,
 * which has access to the user's kubeconfig.
 */

import { getDemoMode } from '../hooks/useDemoMode'
import {
  LOCAL_AGENT_WS_URL,
  WS_CONNECT_TIMEOUT_MS,
  WS_CONNECTION_COOLDOWN_MS,
  KUBECTL_DEFAULT_TIMEOUT_MS,
  KUBECTL_EXTENDED_TIMEOUT_MS,
  KUBECTL_MAX_TIMEOUT_MS,
  METRICS_SERVER_TIMEOUT_MS,
  MAX_CONCURRENT_KUBECTL_REQUESTS,
  POD_RESTART_ISSUE_THRESHOLD,
} from './constants'

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
  private readonly maxConcurrentRequests = MAX_CONCURRENT_KUBECTL_REQUESTS // Limit concurrent requests to local agent
  private lastConnectionFailureAt = 0

  /**
   * Ensure WebSocket is connected
   */
  private async ensureConnected(): Promise<void> {
    // In demo mode, skip WebSocket connection to avoid console errors
    if (getDemoMode()) {
      throw new Error('Agent unavailable in demo mode')
    }

    if (this.ws?.readyState === WebSocket.OPEN) {
      return
    }

    // Fail fast during cooldown windows to avoid repeated expensive retries
    if (Date.now() - this.lastConnectionFailureAt < WS_CONNECTION_COOLDOWN_MS) {
      throw new Error('Local agent unavailable (cooldown)')
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
      let settled = false
      let connectTimeout: ReturnType<typeof setTimeout> | null = null
      const finalize = (cb: () => void) => {
        if (settled) return
        settled = true
        if (connectTimeout) clearTimeout(connectTimeout)
        cb()
      }
      try {
        this.ws = new WebSocket(LOCAL_AGENT_WS_URL)
        connectTimeout = setTimeout(() => {
          try { this.ws?.close() } catch { /* ignore */ }
          this.lastConnectionFailureAt = Date.now()
          this.isConnecting = false
          this.connectPromise = null
          finalize(() => reject(new Error(`Connection timeout after ${WS_CONNECT_TIMEOUT_MS}ms`)))
        }, WS_CONNECT_TIMEOUT_MS)

        this.ws.onopen = () => {
          this.isConnecting = false
          this.lastConnectionFailureAt = 0
          finalize(() => resolve())
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
          this.ws = null
          this.connectPromise = null
          this.isConnecting = false
          this.lastConnectionFailureAt = Date.now()

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
          this.lastConnectionFailureAt = Date.now()
          finalize(() => reject(new Error('Failed to connect to local agent')))
        }
      } catch (err) {
        this.isConnecting = false
        this.connectPromise = null
        this.lastConnectionFailureAt = Date.now()
        finalize(() => reject(err))
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
   * Use priority: true for interactive requests that should bypass the queue
   */
  async exec(
    args: string[],
    options: { context?: string; namespace?: string; timeout?: number; priority?: boolean } = {}
  ): Promise<KubectlResponse> {
    // Priority requests bypass the queue for immediate execution (interactive user actions)
    if (options.priority) {
      return this.execImmediate(args, options)
    }

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
      throw new Error('Not connected to local agent')
    }

    const id = this.generateId()
    const timeout = options.timeout || KUBECTL_DEFAULT_TIMEOUT_MS

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
    const response = await this.exec(['get', 'nodes', '-o', 'json'], { context, timeout: KUBECTL_MAX_TIMEOUT_MS })
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
   * Get pod count and resource requests for a cluster
   */
  async getPodMetrics(context: string): Promise<{ count: number; cpuRequestsMillicores: number; memoryRequestsBytes: number }> {
    const response = await this.exec(['get', 'pods', '-A', '-o', 'json'], { context, timeout: KUBECTL_MAX_TIMEOUT_MS })
    if (response.exitCode !== 0) {
      throw new Error(response.error || 'Failed to get pods')
    }
    const data = JSON.parse(response.output)
    const pods = data.items || []

    // Sum resource requests from all containers in all pods
    let cpuRequestsMillicores = 0
    let memoryRequestsBytes = 0
    let podsWithRequests = 0

    for (const pod of pods) {
      const containers = pod.spec?.containers || []
      for (const container of containers) {
        const requests = container.resources?.requests || {}
        // Parse CPU requests (can be "100m", "0.1", "1", etc.)
        if (requests.cpu) {
          const parsed = parseResourceQuantityMillicores(requests.cpu)
          cpuRequestsMillicores += parsed
          if (parsed > 0) podsWithRequests++
        }
        // Parse memory requests (can be "128Mi", "1Gi", etc.)
        if (requests.memory) {
          memoryRequestsBytes += parseResourceQuantity(requests.memory)
        }
      }
    }

    return { count: pods.length, cpuRequestsMillicores, memoryRequestsBytes }
  }

  /**
   * Get pod count for a cluster (legacy method for backward compatibility)
   */
  async getPodCount(context: string): Promise<number> {
    const metrics = await this.getPodMetrics(context)
    return metrics.count
  }

  /**
   * Get all namespaces in a cluster
   */
  async getNamespaces(context: string): Promise<string[]> {
    const response = await this.exec(
      ['get', 'namespaces', '-o', 'jsonpath={.items[*].metadata.name}'],
      { context, timeout: KUBECTL_MAX_TIMEOUT_MS }
    )
    if (response.exitCode !== 0) {
      throw new Error(response.error || 'Failed to get namespaces')
    }
    return response.output.split(/\s+/).filter(Boolean).sort()
  }

  /**
   * Get services from a cluster
   */
  async getServices(context: string, namespace?: string): Promise<{ name: string; namespace: string; type: string; clusterIP: string; ports: string }[]> {
    const nsArg = namespace ? ['-n', namespace] : ['-A']
    const response = await this.exec(['get', 'services', ...nsArg, '-o', 'json'], { context, timeout: KUBECTL_EXTENDED_TIMEOUT_MS })
    if (response.exitCode !== 0) {
      throw new Error(response.error || 'Failed to get services')
    }
    const data = JSON.parse(response.output)
    return (data.items || []).map((svc: { metadata: { name: string; namespace: string }; spec: { type: string; clusterIP: string; ports?: { port: number; protocol: string }[] } }) => ({
      name: svc.metadata.name,
      namespace: svc.metadata.namespace,
      type: svc.spec.type,
      clusterIP: svc.spec.clusterIP || '',
      ports: (svc.spec.ports || []).map(p => `${p.port}/${p.protocol}`).join(', '),
    }))
  }

  /**
   * Get PVCs from a cluster
   */
  async getPVCs(context: string, namespace?: string): Promise<{ name: string; namespace: string; status: string; capacity: string; storageClass: string }[]> {
    const nsArg = namespace ? ['-n', namespace] : ['-A']
    const response = await this.exec(['get', 'pvc', ...nsArg, '-o', 'json'], { context, timeout: KUBECTL_EXTENDED_TIMEOUT_MS })
    if (response.exitCode !== 0) {
      throw new Error(response.error || 'Failed to get PVCs')
    }
    const data = JSON.parse(response.output)
    return (data.items || []).map((pvc: { metadata: { name: string; namespace: string }; status: { phase: string; capacity?: { storage: string } }; spec: { storageClassName?: string } }) => ({
      name: pvc.metadata.name,
      namespace: pvc.metadata.namespace,
      status: pvc.status.phase,
      capacity: pvc.status.capacity?.storage || '',
      storageClass: pvc.spec.storageClassName || '',
    }))
  }

  /**
   * Get actual resource usage from metrics-server via kubectl top nodes
   * Returns actual CPU and memory consumption (not requests/allocations)
   */
  async getClusterUsage(context: string): Promise<{ cpuUsageMillicores: number; memoryUsageBytes: number; metricsAvailable: boolean }> {
    try {
      const response = await this.exec(['top', 'nodes', '--no-headers'], { context, timeout: METRICS_SERVER_TIMEOUT_MS })
      if (response.exitCode !== 0) {
        // Metrics server not available
        return { cpuUsageMillicores: 0, memoryUsageBytes: 0, metricsAvailable: false }
      }

      // Parse kubectl top nodes output
      // Format: NAME   CPU(cores)   CPU%   MEMORY(bytes)   MEMORY%
      const lines = response.output.trim().split('\n').filter(l => l.trim())
      let totalCpuMillicores = 0
      let totalMemoryBytes = 0

      for (const line of lines) {
        const parts = line.trim().split(/\s+/)
        if (parts.length >= 4) {
          // Parse CPU (e.g., "2500m" or "2")
          const cpuStr = parts[1]
          if (cpuStr.endsWith('m')) {
            totalCpuMillicores += parseInt(cpuStr.slice(0, -1), 10)
          } else {
            totalCpuMillicores += parseFloat(cpuStr) * 1000
          }

          // Parse Memory (e.g., "4096Mi", "4Gi")
          const memStr = parts[3]
          totalMemoryBytes += parseResourceQuantity(memStr)
        }
      }

      return { cpuUsageMillicores: totalCpuMillicores, memoryUsageBytes: totalMemoryBytes, metricsAvailable: true }
    } catch (err) {
      console.error(`[ClusterUsage] ${context}: error getting usage -`, err)
      return { cpuUsageMillicores: 0, memoryUsageBytes: 0, metricsAvailable: false }
    }
  }

  /**
   * Get cluster health summary
   */
  async getClusterHealth(context: string): Promise<ClusterHealth> {
    try {
      // Get nodes and pod metrics first (required)
      // Usage metrics are optional - don't block if metrics-server is slow/unavailable
      const [nodes, podMetrics] = await Promise.all([
        this.getNodes(context),
        this.getPodMetrics(context),
      ])

      // Try to get usage metrics with a short timeout, but don't block health check
      let usageMetrics = { cpuUsageMillicores: 0, memoryUsageBytes: 0, metricsAvailable: false }
      try {
        const usagePromise = this.getClusterUsage(context)
        const timeoutPromise = new Promise<typeof usageMetrics>((_, reject) =>
          setTimeout(() => reject(new Error('Usage metrics timeout')), METRICS_SERVER_TIMEOUT_MS)
        )
        usageMetrics = await Promise.race([usagePromise, timeoutPromise])
      } catch (err) {
        // Usage metrics failed or timed out - continue without them
        console.error(`[ClusterHealth] ${context}: Usage metrics unavailable, using requests only`, err)
      }

      const readyNodes = nodes.filter(n => n.ready).length

      // Aggregate resource metrics from all nodes (capacity)
      const totalCpuCores = nodes.reduce((sum, n) => sum + (n.cpuCores || 0), 0)
      const totalMemoryBytes = nodes.reduce((sum, n) => sum + (n.memoryBytes || 0), 0)
      const totalStorageBytes = nodes.reduce((sum, n) => sum + (n.storageBytes || 0), 0)

      // Consider healthy if at least 50% of nodes are ready (lenient threshold)
      // A cluster with working nodes should show as healthy, not warning
      const healthyThreshold = Math.max(1, Math.ceil(nodes.length * 0.5))
      const isHealthy = readyNodes >= healthyThreshold && nodes.length > 0

      const result = {
        cluster: context,
        healthy: isHealthy,
        reachable: true,
        nodeCount: nodes.length,
        readyNodes,
        podCount: podMetrics.count,
        cpuCores: Math.round(totalCpuCores),
        cpuRequestsMillicores: podMetrics.cpuRequestsMillicores,
        cpuRequestsCores: podMetrics.cpuRequestsMillicores / 1000,
        // Actual usage from metrics-server
        cpuUsageMillicores: usageMetrics.cpuUsageMillicores,
        cpuUsageCores: usageMetrics.cpuUsageMillicores / 1000,
        memoryBytes: totalMemoryBytes,
        memoryGB: Math.round(totalMemoryBytes / (1024 * 1024 * 1024)),
        memoryRequestsBytes: podMetrics.memoryRequestsBytes,
        memoryRequestsGB: podMetrics.memoryRequestsBytes / (1024 * 1024 * 1024),
        // Actual usage from metrics-server
        memoryUsageBytes: usageMetrics.memoryUsageBytes,
        memoryUsageGB: usageMetrics.memoryUsageBytes / (1024 * 1024 * 1024),
        metricsAvailable: usageMetrics.metricsAvailable,
        storageBytes: totalStorageBytes,
        storageGB: Math.round(totalStorageBytes / (1024 * 1024 * 1024)),
        lastSeen: new Date().toISOString(),
      }

      return result
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
    const response = await this.exec(['get', 'pods', ...nsArg, '-o', 'json'], { context, timeout: KUBECTL_EXTENDED_TIMEOUT_MS })

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

      if (problems.length > 0 || restarts > POD_RESTART_ISSUE_THRESHOLD) {
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
      { context, timeout: KUBECTL_EXTENDED_TIMEOUT_MS }
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
    const response = await this.exec(['get', 'deployments', ...nsArg, '-o', 'json'], { context, timeout: KUBECTL_EXTENDED_TIMEOUT_MS })

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
   * Uses a concurrency limit to avoid overwhelming the local agent
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

// Helper to parse CPU resource quantities and return millicores
// CPU can be "100m", "0.1", "1", "2.5" etc.
function parseResourceQuantityMillicores(value: string | undefined): number {
  if (!value) return 0
  const trimmed = value.trim()

  // Check for millicores suffix
  if (trimmed.endsWith('m')) {
    const num = parseFloat(trimmed.slice(0, -1))
    return isNaN(num) ? 0 : num
  }

  // Otherwise it's in cores, convert to millicores
  const num = parseFloat(trimmed)
  return isNaN(num) ? 0 : num * 1000
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
  // CPU capacity and requests
  cpuCores?: number
  cpuRequestsMillicores?: number
  cpuRequestsCores?: number
  // Memory metrics
  memoryBytes?: number
  memoryGB?: number
  memoryRequestsBytes?: number
  memoryRequestsGB?: number
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
