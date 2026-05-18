import {
  KUBECTL_EXTENDED_TIMEOUT_MS,
  KUBECTL_MAX_TIMEOUT_MS,
  METRICS_SERVER_TIMEOUT_MS,
  POD_RESTART_ISSUE_THRESHOLD,
  FOCUS_DELAY_MS,
} from './constants'
import { KubectlProxyConnection } from './kubectlProxy.connection'
import type {
  ClusterEvent,
  ClusterHealth,
  Deployment,
  KubeDeployment,
  KubeEvent,
  KubeNode,
  KubeService,
  KubectlServiceResult,
  NodeCondition,
  NodeInfo,
  PodIssue,
} from './kubectlProxy.types'
import {
  appendUniqueProblem,
  getPrimaryPodProblem,
  normalizePodProblems,
  parseResourceQuantity,
  parseResourceQuantityMillicores,
} from './kubectlProxy.utils'

export class KubectlProxy extends KubectlProxyConnection {
  async getNodes(context: string): Promise<NodeInfo[]> {
    const response = await this.exec(['get', 'nodes', '-o', 'json'], {
      context,
      timeout: KUBECTL_MAX_TIMEOUT_MS,
    })
    if (response.exitCode !== 0) {
      throw new Error(response.error || 'Failed to get nodes')
    }
    let data: { items?: KubeNode[] }
    try {
      data = JSON.parse(response.output)
    } catch {
      throw new Error('Failed to parse kubectl output as JSON')
    }
    const nodes = (data.items || []).map((node: KubeNode) => {
      const alloc = node.status?.allocatable || node.status?.capacity || {}
      const cpuStr = alloc.cpu || '0'
      const cpuCores = parseResourceQuantity(cpuStr)

      const readyCondition = node.status?.conditions?.find(
        (c: NodeCondition) => c.type === 'Ready',
      )
      const isReady = readyCondition?.status === 'True'

      return {
        name: node.metadata.name,
        ready: isReady,
        roles: Object.keys(node.metadata.labels || {})
          .filter((k) => k.startsWith('node-role.kubernetes.io/'))
          .map((k) => k.replace('node-role.kubernetes.io/', '')),
        cpuCores,
        memoryBytes: parseResourceQuantity(alloc.memory),
        storageBytes: parseResourceQuantity(alloc['ephemeral-storage']),
      }
    })
    return nodes
  }

  async getPodMetrics(
    context: string,
  ): Promise<{
    count: number
    cpuRequestsMillicores: number
    memoryRequestsBytes: number
  }> {
    const response = await this.exec(['get', 'pods', '-A', '-o', 'json'], {
      context,
      timeout: KUBECTL_MAX_TIMEOUT_MS,
    })
    if (response.exitCode !== 0) {
      throw new Error(response.error || 'Failed to get pods')
    }
    let data: {
      items?: Array<{
        spec?: {
          containers?: Array<{
            resources?: { requests?: { cpu?: string; memory?: string } }
          }>
        }
      }>
    }
    try {
      data = JSON.parse(response.output)
    } catch {
      throw new Error('Failed to parse kubectl output as JSON')
    }
    const pods = data.items || []

    let cpuRequestsMillicores = 0
    let memoryRequestsBytes = 0

    for (const pod of pods) {
      const containers = pod.spec?.containers || []
      for (const container of containers) {
        const requests = container.resources?.requests || {}
        if (requests.cpu) {
          const parsed = parseResourceQuantityMillicores(requests.cpu)
          cpuRequestsMillicores += parsed
        }
        if (requests.memory) {
          memoryRequestsBytes += parseResourceQuantity(requests.memory)
        }
      }
    }

    return { count: pods.length, cpuRequestsMillicores, memoryRequestsBytes }
  }

  async getPodCount(context: string): Promise<number> {
    const metrics = await this.getPodMetrics(context)
    return metrics.count
  }

  async getNamespaces(context: string): Promise<string[]> {
    const response = await this.exec(
      ['get', 'namespaces', '-o', 'jsonpath={.items[*].metadata.name}'],
      { context, timeout: KUBECTL_MAX_TIMEOUT_MS },
    )
    if (response.exitCode !== 0) {
      throw new Error(response.error || 'Failed to get namespaces')
    }
    return response.output.split(/\s+/).filter(Boolean).sort()
  }

  async getServices(
    context: string,
    namespace?: string,
  ): Promise<KubectlServiceResult[]> {
    const nsArg = namespace ? ['-n', namespace] : ['-A']
    const response = await this.exec(
      ['get', 'services', ...nsArg, '-o', 'json'],
      { context, timeout: KUBECTL_EXTENDED_TIMEOUT_MS },
    )
    if (response.exitCode !== 0) {
      throw new Error(response.error || 'Failed to get services')
    }
    let data: { items?: KubeService[] }
    try {
      data = JSON.parse(response.output)
    } catch {
      throw new Error('Failed to parse kubectl output as JSON')
    }
    return (data.items || []).map((svc: KubeService) => {
      const allExternalIPs: string[] = []
      if (svc.spec.externalIPs) {
        allExternalIPs.push(...svc.spec.externalIPs)
      }
      const ingress = svc.status?.loadBalancer?.ingress || []
      for (const entry of ingress) {
        if (entry.ip) allExternalIPs.push(entry.ip)
        else if (entry.hostname) allExternalIPs.push(entry.hostname)
      }

      let lbStatus = ''
      if (svc.spec.type === 'LoadBalancer') {
        lbStatus = ingress.length > 0 ? 'Ready' : 'Provisioning'
      }

      return {
        name: svc.metadata.name,
        namespace: svc.metadata.namespace,
        type: svc.spec.type,
        clusterIP: svc.spec.clusterIP || '',
        ports: (svc.spec.ports || [])
          .map((p) => `${p.port}/${p.protocol}`)
          .join(', '),
        externalIP: allExternalIPs.join(', '),
        externalIPs: allExternalIPs,
        lbStatus,
        selector: svc.spec.selector,
      }
    })
  }

  async getPVCs(
    context: string,
    namespace?: string,
  ): Promise<
    {
      name: string
      namespace: string
      status: string
      capacity: string
      storageClass: string
    }[]
  > {
    const nsArg = namespace ? ['-n', namespace] : ['-A']
    const response = await this.exec(['get', 'pvc', ...nsArg, '-o', 'json'], {
      context,
      timeout: KUBECTL_EXTENDED_TIMEOUT_MS,
    })
    if (response.exitCode !== 0) {
      throw new Error(response.error || 'Failed to get PVCs')
    }
    let data: {
      items?: Array<{
        metadata: { name: string; namespace: string }
        status: { phase: string; capacity?: { storage: string } }
        spec: { storageClassName?: string }
      }>
    }
    try {
      data = JSON.parse(response.output)
    } catch {
      throw new Error('Failed to parse kubectl output as JSON')
    }
    return (data.items || []).map(
      (pvc: {
        metadata: { name: string; namespace: string }
        status: { phase: string; capacity?: { storage: string } }
        spec: { storageClassName?: string }
      }) => ({
        name: pvc.metadata.name,
        namespace: pvc.metadata.namespace,
        status: pvc.status.phase,
        capacity: pvc.status.capacity?.storage || '',
        storageClass: pvc.spec.storageClassName || '',
      }),
    )
  }

  async getClusterUsage(
    context: string,
  ): Promise<{
    cpuUsageMillicores: number
    memoryUsageBytes: number
    metricsAvailable: boolean
  }> {
    try {
      const response = await this.exec(['top', 'nodes', '--no-headers'], {
        context,
        timeout: METRICS_SERVER_TIMEOUT_MS,
      })
      if (response.exitCode !== 0) {
        return {
          cpuUsageMillicores: 0,
          memoryUsageBytes: 0,
          metricsAvailable: false,
        }
      }

      const lines = response.output
        .trim()
        .split('\n')
        .filter((l) => l.trim())
      let totalCpuMillicores = 0
      let totalMemoryBytes = 0

      for (const line of lines) {
        const parts = line.trim().split(/\s+/)
        if (parts.length >= 4) {
          const cpuStr = parts[1]
          if (cpuStr.endsWith('m')) {
            totalCpuMillicores += parseInt(cpuStr.slice(0, -1), 10)
          } else {
            totalCpuMillicores += parseFloat(cpuStr) * 1000
          }

          const memStr = parts[3]
          totalMemoryBytes += parseResourceQuantity(memStr)
        }
      }

      return {
        cpuUsageMillicores: totalCpuMillicores,
        memoryUsageBytes: totalMemoryBytes,
        metricsAvailable: true,
      }
    } catch (err: unknown) {
      console.error(`[ClusterUsage] ${context}: error getting usage -`, err)
      return {
        cpuUsageMillicores: 0,
        memoryUsageBytes: 0,
        metricsAvailable: false,
      }
    }
  }

  async getClusterHealth(context: string): Promise<ClusterHealth> {
    try {
      const [nodes, podMetrics] = await Promise.all([
        this.getNodes(context),
        this.getPodMetrics(context),
      ])

      let usageMetrics = {
        cpuUsageMillicores: 0,
        memoryUsageBytes: 0,
        metricsAvailable: false,
      }
      try {
        const usagePromise = this.getClusterUsage(context)
        const timeoutPromise = new Promise<typeof usageMetrics>((_, reject) =>
          setTimeout(
            () => reject(new Error('Usage metrics timeout')),
            METRICS_SERVER_TIMEOUT_MS,
          ),
        )
        usageMetrics = await Promise.race([usagePromise, timeoutPromise])
      } catch (err: unknown) {
        console.error(
          `[ClusterHealth] ${context}: Usage metrics unavailable, using requests only`,
          err,
        )
      }

      const readyNodes = nodes.filter((n) => n.ready).length
      const totalCpuCores = nodes.reduce((sum, n) => sum + (n.cpuCores || 0), 0)
      const totalMemoryBytes = nodes.reduce(
        (sum, n) => sum + (n.memoryBytes || 0),
        0,
      )
      const totalStorageBytes = nodes.reduce(
        (sum, n) => sum + (n.storageBytes || 0),
        0,
      )

      const healthyThreshold = Math.max(1, Math.ceil(nodes.length * 0.5))
      const isHealthy = readyNodes >= healthyThreshold && nodes.length > 0

      return {
        cluster: context,
        healthy: isHealthy,
        reachable: true,
        nodeCount: nodes.length,
        readyNodes,
        podCount: podMetrics.count,
        cpuCores: Math.round(totalCpuCores),
        cpuRequestsMillicores: podMetrics.cpuRequestsMillicores,
        cpuRequestsCores: podMetrics.cpuRequestsMillicores / 1000,
        cpuUsageMillicores: usageMetrics.cpuUsageMillicores,
        cpuUsageCores: usageMetrics.cpuUsageMillicores / 1000,
        memoryBytes: totalMemoryBytes,
        memoryGB: Math.round(totalMemoryBytes / (1024 * 1024 * 1024)),
        memoryRequestsBytes: podMetrics.memoryRequestsBytes,
        memoryRequestsGB: podMetrics.memoryRequestsBytes / (1024 * 1024 * 1024),
        memoryUsageBytes: usageMetrics.memoryUsageBytes,
        memoryUsageGB: usageMetrics.memoryUsageBytes / (1024 * 1024 * 1024),
        metricsAvailable: usageMetrics.metricsAvailable,
        storageBytes: totalStorageBytes,
        storageGB: Math.round(totalStorageBytes / (1024 * 1024 * 1024)),
        lastSeen: new Date().toISOString(),
      }
    } catch (err: unknown) {
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

  async getPodIssues(context: string, namespace?: string): Promise<PodIssue[]> {
    const nsArg = namespace ? ['-n', namespace] : ['-A']
    const response = await this.exec(['get', 'pods', ...nsArg, '-o', 'json'], {
      context,
      timeout: KUBECTL_EXTENDED_TIMEOUT_MS,
    })

    if (response.exitCode !== 0) {
      throw new Error(response.error || 'Failed to get pods')
    }

    interface RawPodItem {
      metadata: { name: string; namespace: string }
      status: {
        phase?: string
        reason?: string
        containerStatuses?: Array<{
          restartCount?: number
          state?: { waiting?: { reason?: string } }
          lastState?: { terminated?: { reason?: string } }
        }>
        conditions?: Array<{ type: string; status: string; reason?: string }>
      }
    }
    let data: { items?: RawPodItem[] }
    try {
      data = JSON.parse(response.output)
    } catch {
      throw new Error('Failed to parse kubectl output as JSON')
    }
    const issues: PodIssue[] = []

    for (const pod of data.items || []) {
      const status = pod.status
      const phase = status.phase
      const containerStatuses = status.containerStatuses || []

      const problems: string[] = []
      let restarts = 0

      for (const cs of containerStatuses) {
        restarts += cs.restartCount || 0

        if (cs.lastState?.terminated?.reason === 'OOMKilled') {
          appendUniqueProblem(problems, 'OOMKilled')
        }

        if (cs.state?.waiting) {
          const waitReason = cs.state.waiting.reason ?? ''
          if (
            [
              'CrashLoopBackOff',
              'ImagePullBackOff',
              'ErrImagePull',
              'CreateContainerConfigError',
              'CreateContainerError',
              'RunContainerError',
              'PostStartHookError',
            ].includes(waitReason)
          ) {
            appendUniqueProblem(problems, waitReason)
          }
        }
      }

      if (phase === 'Pending' && status.conditions) {
        const unschedulable = status.conditions.find(
          (c: { type: string; status: string; reason?: string }) =>
            c.type === 'PodScheduled' && c.status === 'False',
        )
        if (unschedulable) {
          appendUniqueProblem(problems, 'Unschedulable')
        }
      }

      if (phase === 'Failed') {
        appendUniqueProblem(problems, status.reason || 'Failed')
      }

      const normalizedProblems = normalizePodProblems(problems)
      const fallbackReason = status.reason || phase || 'Unknown'
      const primaryReason = getPrimaryPodProblem(normalizedProblems, fallbackReason)

      if (normalizedProblems.length > 0 || restarts > POD_RESTART_ISSUE_THRESHOLD) {
        issues.push({
          name: pod.metadata.name,
          namespace: pod.metadata.namespace,
          cluster: context,
          status: primaryReason,
          reason: primaryReason,
          issues: normalizedProblems,
          restarts,
        })
      }
    }

    return issues
  }

  async getEvents(
    context: string,
    namespace?: string,
    limit = 50,
  ): Promise<ClusterEvent[]> {
    const nsArg = namespace ? ['-n', namespace] : ['-A']
    const response = await this.exec(
      ['get', 'events', ...nsArg, '--sort-by=.lastTimestamp', '-o', 'json'],
      { context, timeout: KUBECTL_EXTENDED_TIMEOUT_MS },
    )

    if (response.exitCode !== 0) {
      throw new Error(response.error || 'Failed to get events')
    }

    let data: { items?: KubeEvent[] }
    try {
      data = JSON.parse(response.output)
    } catch {
      throw new Error('Failed to parse kubectl output as JSON')
    }
    const events: ClusterEvent[] = (data.items || [])
      .slice(-limit)
      .reverse()
      .map((e: KubeEvent) => ({
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

  async getDeployments(
    context: string,
    namespace?: string,
  ): Promise<Deployment[]> {
    const nsArg = namespace ? ['-n', namespace] : ['-A']
    const response = await this.exec(
      ['get', 'deployments', ...nsArg, '-o', 'json'],
      { context, timeout: KUBECTL_EXTENDED_TIMEOUT_MS },
    )

    if (response.exitCode !== 0) {
      throw new Error(response.error || 'Failed to get deployments')
    }

    let data: { items?: KubeDeployment[] }
    try {
      data = JSON.parse(response.output)
    } catch {
      throw new Error('Failed to parse kubectl output as JSON')
    }
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

  async getBulkClusterHealth(
    contexts: string[],
    onProgress?: (health: ClusterHealth) => void,
    concurrency = 5,
  ): Promise<ClusterHealth[]> {
    const results: ClusterHealth[] = []
    const queue = [...contexts]
    const inProgress = new Set<string>()

    const processNext = async (): Promise<void> => {
      while (queue.length > 0 && inProgress.size < concurrency) {
        const context = queue.shift()!
        inProgress.add(context)

        this.getClusterHealth(context)
          .then((health) => {
            results.push(health)
            onProgress?.(health)
          })
          .catch((err) => {
            const errorHealth: ClusterHealth = {
              cluster: context,
              healthy: false,
              reachable: false,
              nodeCount: 0,
              readyNodes: 0,
              podCount: 0,
              errorMessage:
                err instanceof Error ? err.message : 'Unknown error',
            }
            results.push(errorHealth)
            onProgress?.(errorHealth)
          })
          .finally(() => {
            inProgress.delete(context)
            if (queue.length > 0) {
              processNext()
            }
          })
      }
    }

    const initialBatch = Math.min(concurrency, contexts.length)
    for (let i = 0; i < initialBatch; i++) {
      processNext()
    }

    while (results.length < contexts.length) {
      await new Promise((resolve) => setTimeout(resolve, FOCUS_DELAY_MS))
    }

    return results
  }
}

export const kubectlProxy = new KubectlProxy()
