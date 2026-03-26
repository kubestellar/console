/**
 * LLM-d Cached Data Hooks
 *
 * Provides cached hooks for fetching LLM inference server data via kubectl proxy.
 * Extracted from useCachedData.ts for maintainability.
 */

import { useCache, type RefreshCategory } from '../lib/cache'
import { kubectlProxy } from '../lib/kubectlProxy'
import { KUBECTL_EXTENDED_TIMEOUT_MS } from '../lib/constants/network'
import { settledWithConcurrency } from '../lib/utils/concurrency'
import type { LLMdServer, LLMdStatus, LLMdModel } from './useLLMd'

// ============================================================================
// Shared Types
// ============================================================================

interface CachedHookResult<T> {
  data: T
  isLoading: boolean
  isRefreshing: boolean
  isDemoFallback: boolean
  error: string | null
  isFailed: boolean
  consecutiveFailures: number
  lastRefresh: number | null
  refetch: () => Promise<void>
}

// ============================================================================
// Demo Data
// ============================================================================

const getDemoLLMdServers = (): LLMdServer[] => [
  { id: '1', name: 'vllm-llama-3', namespace: 'llm-d', cluster: 'vllm-d', model: 'llama-3-70b', type: 'vllm', componentType: 'model', status: 'running', replicas: 2, readyReplicas: 2, gpu: 'NVIDIA', gpuCount: 4 },
  { id: '2', name: 'tgi-granite', namespace: 'llm-d', cluster: 'vllm-d', model: 'granite-13b', type: 'tgi', componentType: 'model', status: 'running', replicas: 1, readyReplicas: 1, gpu: 'NVIDIA', gpuCount: 2 },
]

const getDemoLLMdModels = (): LLMdModel[] => [
  { id: '1', name: 'llama-3-70b', namespace: 'llm-d', cluster: 'vllm-d', instances: 2, status: 'loaded' },
  { id: '2', name: 'granite-13b', namespace: 'llm-d', cluster: 'vllm-d', instances: 1, status: 'loaded' },
]

// ============================================================================
// LLM-d Cached Hooks (uses kubectlProxy)
// ============================================================================

interface DeploymentResource {
  metadata: {
    name: string
    namespace: string
    labels?: Record<string, string>
  }
  spec: {
    replicas?: number
    template?: {
      metadata?: {
        labels?: Record<string, string>
      }
      spec?: {
        containers?: Array<{
          resources?: {
            limits?: Record<string, string>
          }
        }>
      }
    }
  }
  status: {
    replicas?: number
    readyReplicas?: number
  }
}

interface HPAResource {
  metadata: { name: string; namespace: string }
  spec: { scaleTargetRef: { kind: string; name: string } }
}

interface VariantAutoscalingResource {
  metadata: { name: string; namespace: string }
  spec: { targetRef?: { kind?: string; name?: string } }
}

interface InferencePoolResource {
  metadata: { name: string; namespace: string }
  spec: { selector?: { matchLabels?: Record<string, string> } }
  status?: { parents?: Array<{ conditions?: Array<{ type: string; status: string }> }> }
}

function detectServerType(name: string, labels?: Record<string, string>): LLMdServer['type'] {
  const nameLower = name.toLowerCase()
  if (labels?.['app.kubernetes.io/name'] === 'tgi' || nameLower.includes('tgi')) return 'tgi'
  if (labels?.['app.kubernetes.io/name'] === 'triton' || nameLower.includes('triton')) return 'triton'
  if (labels?.['llmd.org/inferenceServing'] === 'true' || nameLower.includes('llm-d')) return 'llm-d'
  if (nameLower.includes('vllm')) return 'vllm'
  return 'unknown'
}

function detectComponentType(name: string, labels?: Record<string, string>): LLMdServer['componentType'] {
  const nameLower = name.toLowerCase()
  if (nameLower.includes('-epp') || nameLower.endsWith('epp')) return 'epp'
  if (nameLower.includes('gateway') || nameLower.includes('ingress')) return 'gateway'
  if (nameLower === 'prometheus' || nameLower.includes('prometheus-')) return 'prometheus'
  if (labels?.['llmd.org/inferenceServing'] === 'true' ||
      labels?.['llmd.org/model'] ||
      nameLower.includes('vllm') || nameLower.includes('tgi') || nameLower.includes('triton') ||
      nameLower.includes('llama') || nameLower.includes('granite') || nameLower.includes('qwen') ||
      nameLower.includes('mistral') || nameLower.includes('mixtral')) {
      return 'model'
  }
  return 'other'
}

function detectGatewayType(name: string): LLMdServer['gatewayType'] {
  const nameLower = name.toLowerCase()
  if (nameLower.includes('istio')) return 'istio'
  if (nameLower.includes('kgateway') || nameLower.includes('envoy')) return 'kgateway'
  return 'envoy'
}

function getLLMdServerStatus(replicas: number, readyReplicas: number): LLMdServer['status'] {
  if (replicas === 0) return 'stopped'
  if (readyReplicas === replicas) return 'running'
  if (readyReplicas > 0) return 'scaling'
  return 'error'
}

function extractGPUInfo(deployment: DeploymentResource): { gpu?: string; gpuCount?: number } {
  const limits = deployment.spec.template?.spec?.containers?.[0]?.resources?.limits || {}
  const gpuKeys = Object.keys(limits).filter(k => k.includes('nvidia.com/gpu') || k.includes('amd.com/gpu') || k.includes('gpu'))
  if (gpuKeys.length > 0) {
    const gpuKey = gpuKeys[0]
    const gpuCount = parseInt(limits[gpuKey] || '0', 10)
    const gpuType = gpuKey.includes('nvidia') ? 'NVIDIA' : gpuKey.includes('amd') ? 'AMD' : 'GPU'
    return { gpu: gpuType, gpuCount }
  }
  return {}
}

/** Fetch LLMd servers from a single cluster (deployments + autoscalers in parallel) */
async function fetchLLMdServersForCluster(cluster: string): Promise<LLMdServer[]> {
  const servers: LLMdServer[] = []

  // Query all namespaces to discover llm-d workloads regardless of namespace naming
  const allDeployments: DeploymentResource[] = []
  try {
    const resp = await kubectlProxy.exec(['get', 'deployments', '-A', '-o', 'json'], { context: cluster, timeout: 15000 })
    if (resp.exitCode === 0 && resp.output) {
      allDeployments.push(...(JSON.parse(resp.output).items || []))
    }
  } catch { /* cluster not reachable */ }
  if (allDeployments.length === 0) return servers

  // Fetch all 3 autoscaler types in parallel (instead of sequentially)
  const autoscalerMap = new Map<string, 'hpa' | 'va' | 'both'>()
  const autoscalerItems: LLMdServer[] = []

  const [hpaResult, vaResult, vpaResult] = await Promise.allSettled([
    kubectlProxy.exec(['get', 'hpa', '-A', '-o', 'json'], { context: cluster, timeout: 10000 }),
    kubectlProxy.exec(['get', 'variantautoscalings', '-A', '-o', 'json'], { context: cluster, timeout: 10000 }),
    kubectlProxy.exec(['get', 'vpa', '-A', '-o', 'json'], { context: cluster, timeout: 10000 }),
  ])

  // Process HPA results
  if (hpaResult.status === 'fulfilled' && hpaResult.value.exitCode === 0) {
    let hpaItems: HPAResource[] = []
    try {
      hpaItems = JSON.parse(hpaResult.value.output).items || []
    } catch { /* invalid JSON — skip HPA data */ }
    for (const hpa of hpaItems) {
      if (hpa.spec.scaleTargetRef.kind === 'Deployment') {
        autoscalerMap.set(`${hpa.metadata.namespace}/${hpa.spec.scaleTargetRef.name}`, 'hpa')
        autoscalerItems.push({
          id: `${cluster}-${hpa.metadata.namespace}-${hpa.metadata.name}-hpa`,
          name: hpa.metadata.name,
          namespace: hpa.metadata.namespace,
          cluster,
          model: `→ ${hpa.spec.scaleTargetRef.name}`,
          type: 'unknown',
          componentType: 'autoscaler',
          autoscalerType: 'hpa',
          status: 'running',
          replicas: 1,
          readyReplicas: 1,
        })
      }
    }
  }

  // Process VA results
  if (vaResult.status === 'fulfilled' && vaResult.value.exitCode === 0) {
    let vaItems: VariantAutoscalingResource[] = []
    try {
      vaItems = JSON.parse(vaResult.value.output).items || []
    } catch { /* invalid JSON — skip VA data */ }
    for (const va of vaItems) {
      if (va.spec.targetRef?.name) {
        const key = `${va.metadata.namespace}/${va.spec.targetRef.name}`
        autoscalerMap.set(key, autoscalerMap.has(key) ? 'both' : 'va')
        autoscalerItems.push({
          id: `${cluster}-${va.metadata.namespace}-${va.metadata.name}-wva`,
          name: va.metadata.name,
          namespace: va.metadata.namespace,
          cluster,
          model: `→ ${va.spec.targetRef.name}`,
          type: 'unknown',
          componentType: 'autoscaler',
          autoscalerType: 'va',
          status: 'running',
          replicas: 1,
          readyReplicas: 1,
        })
      }
    }
  }

  // Process VPA results
  if (vpaResult.status === 'fulfilled' && vpaResult.value.exitCode === 0) {
    let vpaData: { items?: Array<{ metadata: { name: string; namespace: string }; spec?: { targetRef?: { name?: string } } }> } = {}
    try {
      vpaData = JSON.parse(vpaResult.value.output)
    } catch { /* invalid JSON — skip VPA data */ }
    for (const vpa of (vpaData.items || []) as Array<{ metadata: { name: string; namespace: string }; spec?: { targetRef?: { name?: string } } }>) {
      const targetName = vpa.spec?.targetRef?.name || 'unknown'
      autoscalerItems.push({
        id: `${cluster}-${vpa.metadata.namespace}-${vpa.metadata.name}-vpa`,
        name: vpa.metadata.name,
        namespace: vpa.metadata.namespace,
        cluster,
        model: `→ ${targetName}`,
        type: 'unknown',
        componentType: 'autoscaler',
        autoscalerType: 'vpa',
        status: 'running',
        replicas: 1,
        readyReplicas: 1,
      })
    }
  }

  const llmdDeployments = allDeployments.filter(d => {
    const name = d.metadata.name.toLowerCase()
    const labels = d.spec.template?.metadata?.labels || {}
    const ns = d.metadata.namespace.toLowerCase()
    // Expanded namespace patterns to catch more llm-d related namespaces
    const isLlmdNs = ns.includes('llm-d') || ns.includes('llmd') || ns.includes('e2e') || ns.includes('vllm') ||
      ns.includes('inference') || ns.includes('ai-') || ns.includes('-ai') || ns.includes('ml-') ||
      ns === 'b2' || ns.includes('effi') || ns.includes('guygir') || ns.includes('aibrix') ||
      ns.includes('hc4ai') || ns.includes('serving') || ns.includes('model')
    return name.includes('vllm') || name.includes('llm-d') || name.includes('llmd') || name.includes('tgi') || name.includes('triton') ||
      name.includes('llama') || name.includes('granite') || name.includes('qwen') || name.includes('mistral') || name.includes('mixtral') ||
      labels['llmd.org/inferenceServing'] === 'true' || labels['llmd.org/model'] ||
      labels['app.kubernetes.io/name'] === 'vllm' || labels['app.kubernetes.io/name'] === 'tgi' ||
      labels['llm-d.ai/role'] || labels['app'] === 'llm-inference' ||
      name.includes('-epp') || name.endsWith('epp') || name.includes('inference-pool') ||
      (isLlmdNs && (name.includes('gateway') || name.includes('ingress') || name === 'prometheus'))
  })

  const nsGateway = new Map<string, { status: 'running' | 'stopped'; type: LLMdServer['gatewayType'] }>()
  const nsPrometheus = new Map<string, 'running' | 'stopped'>()

  for (const dep of (llmdDeployments || [])) {
    const name = dep.metadata.name.toLowerCase()
    const status = getLLMdServerStatus(dep.spec.replicas || 0, dep.status.readyReplicas || 0)
    if (name.includes('gateway') || name.includes('ingress')) {
      nsGateway.set(dep.metadata.namespace, { status: status === 'running' ? 'running' : 'stopped', type: detectGatewayType(dep.metadata.name) })
    }
    if (name === 'prometheus') {
      nsPrometheus.set(dep.metadata.namespace, status === 'running' ? 'running' : 'stopped')
    }
  }

  for (const dep of (llmdDeployments || [])) {
    const labels = dep.spec.template?.metadata?.labels || {}
    const model = labels['llmd.org/model'] || labels['app.kubernetes.io/model'] || dep.metadata.name
    const gpuInfo = extractGPUInfo(dep)
    const autoscalerType = autoscalerMap.get(`${dep.metadata.namespace}/${dep.metadata.name}`)
    const gw = nsGateway.get(dep.metadata.namespace)
    const prom = nsPrometheus.get(dep.metadata.namespace)

    servers.push({
      id: `${cluster}-${dep.metadata.namespace}-${dep.metadata.name}`,
      name: dep.metadata.name,
      namespace: dep.metadata.namespace,
      cluster,
      model,
      type: detectServerType(dep.metadata.name, labels),
      componentType: detectComponentType(dep.metadata.name, labels),
      status: getLLMdServerStatus(dep.spec.replicas || 0, dep.status.readyReplicas || 0),
      replicas: dep.spec.replicas || 0,
      readyReplicas: dep.status.readyReplicas || 0,
      hasAutoscaler: !!autoscalerType,
      autoscalerType,
      gatewayStatus: gw?.status,
      gatewayType: gw?.type,
      prometheusStatus: prom,
      ...gpuInfo,
    })
  }

  // Add autoscaler items as separate section entries
  servers.push(...autoscalerItems)
  return servers
}

/**
 * Fetch LLMd servers from all clusters in parallel with progressive updates.
 * Each cluster's results are reported as they arrive via onProgress.
 */
/** @internal Exported for use in `lib/prefetchCardData.ts` specialtyFetchers */
export async function fetchLLMdServers(
  clusters: string[],
  onProgress?: (partial: LLMdServer[]) => void
): Promise<LLMdServer[]> {
  // useCache prevents calling fetchers in demo mode via effectiveEnabled
  const accumulated: LLMdServer[] = []

  const tasks = clusters.map((cluster) => async () => {
    try {
      const clusterServers = await fetchLLMdServersForCluster(cluster)
      accumulated.push(...clusterServers)
      onProgress?.([...accumulated])
      return clusterServers
    } catch (err) {
      // Suppress demo mode errors - they're expected when agent is unavailable
      const errMsg = err instanceof Error ? err.message : String(err)
      if (!errMsg.includes('demo mode')) {
        console.error(`Error fetching from cluster ${cluster}:`, err)
      }
      return []
    }
  })

  await settledWithConcurrency(tasks)
  return accumulated
}

function computeLLMdStatus(servers: LLMdServer[], consecutiveFailures: number): LLMdStatus {
  return {
    healthy: consecutiveFailures < 3,
    totalServers: servers.length,
    runningServers: servers.filter(s => s.status === 'running').length,
    stoppedServers: servers.filter(s => s.status === 'stopped').length,
    totalModels: new Set(servers.map(s => s.model)).size,
    loadedModels: new Set(servers.filter(s => s.status === 'running').map(s => s.model)).size,
  }
}

/**
 * Hook for fetching LLM-d servers with caching
 */
export function useCachedLLMdServers(
  clusters: string[] = ['vllm-d', 'platform-eval']
): CachedHookResult<LLMdServer[]> & { servers: LLMdServer[]; status: LLMdStatus } {
  const key = `llmd-servers:${clusters.join(',')}`

  const result = useCache({
    key,
    category: 'gitops' as RefreshCategory,
    initialData: [] as LLMdServer[],
    demoData: getDemoLLMdServers(),
    fetcher: () => fetchLLMdServers(clusters),
    progressiveFetcher: async (onProgress) => fetchLLMdServers(clusters, onProgress),
  })

  const status = computeLLMdStatus(result.data, result.consecutiveFailures)

  return {
    servers: result.data,
    data: result.data,
    status,
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
    isDemoFallback: result.isDemoFallback,
    error: result.error,
    isFailed: result.isFailed,
    consecutiveFailures: result.consecutiveFailures,
    lastRefresh: result.lastRefresh,
    refetch: result.refetch,
  }
}

/**
 * Fetch LLMd models from all clusters in parallel with progressive updates.
 */
/** @internal Exported for use in `lib/prefetchCardData.ts` specialtyFetchers */
export async function fetchLLMdModels(
  clusters: string[],
  onProgress?: (partial: LLMdModel[]) => void
): Promise<LLMdModel[]> {
  // useCache prevents calling fetchers in demo mode via effectiveEnabled
  const accumulated: LLMdModel[] = []

  const tasks = clusters.map((cluster) => async () => {
    try {
      const response = await kubectlProxy.exec(['get', 'inferencepools', '-A', '-o', 'json'], { context: cluster, timeout: KUBECTL_EXTENDED_TIMEOUT_MS })
      if (response.exitCode !== 0) return []
      const clusterModels: LLMdModel[] = []
      for (const pool of (JSON.parse(response.output).items || []) as InferencePoolResource[]) {
        const modelName = pool.spec.selector?.matchLabels?.['llmd.org/model'] || pool.metadata.name
        const hasAccepted = pool.status?.parents?.some(p => p.conditions?.some(c => c.type === 'Accepted' && c.status === 'True'))
        clusterModels.push({
          id: `${cluster}-${pool.metadata.namespace}-${pool.metadata.name}`,
          name: modelName,
          namespace: pool.metadata.namespace,
          cluster,
          instances: 1,
          status: hasAccepted ? 'loaded' : 'stopped',
        })
      }
      accumulated.push(...clusterModels)
      onProgress?.([...accumulated])
      return clusterModels
    } catch (err) {
      // Suppress demo mode errors - they're expected when agent is unavailable
      const errMsg = err instanceof Error ? err.message : String(err)
      if (!errMsg.includes('demo mode')) {
        console.error(`Error fetching InferencePools from cluster ${cluster}:`, err)
      }
      return []
    }
  })

  await settledWithConcurrency(tasks)
  return accumulated
}

/**
 * Hook for fetching LLM-d models with caching
 */
export function useCachedLLMdModels(
  clusters: string[] = ['vllm-d', 'platform-eval']
): CachedHookResult<LLMdModel[]> & { models: LLMdModel[] } {
  const key = `llmd-models:${clusters.join(',')}`

  const result = useCache({
    key,
    category: 'gitops' as RefreshCategory,
    initialData: [] as LLMdModel[],
    demoData: getDemoLLMdModels(),
    fetcher: () => fetchLLMdModels(clusters),
    progressiveFetcher: async (onProgress) => fetchLLMdModels(clusters, onProgress),
  })

  return {
    models: result.data,
    data: result.data,
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
    isDemoFallback: result.isDemoFallback,
    error: result.error,
    isFailed: result.isFailed,
    consecutiveFailures: result.consecutiveFailures,
    lastRefresh: result.lastRefresh,
    refetch: result.refetch,
  }
}
