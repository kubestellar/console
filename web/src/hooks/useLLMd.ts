import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { kubectlProxy } from '../lib/kubectlProxy'
import { getDemoMode } from './useDemoMode'

// Refresh interval for automatic polling (2 minutes)
const REFRESH_INTERVAL_MS = 120000

// LLM-d component types
export type LLMdComponentType = 'model' | 'epp' | 'gateway' | 'prometheus' | 'autoscaler' | 'other'

// LLM-d server types
export interface LLMdServer {
  id: string
  name: string
  namespace: string
  cluster: string
  model: string
  type: 'vllm' | 'tgi' | 'llm-d' | 'triton' | 'unknown'
  componentType: LLMdComponentType
  status: 'running' | 'scaling' | 'stopped' | 'error'
  replicas: number
  readyReplicas: number
  gpu?: string
  gpuCount?: number
  hasAutoscaler?: boolean
  autoscalerType?: 'hpa' | 'va' | 'vpa' | 'both'
  // Related component status
  gatewayStatus?: 'running' | 'stopped' | 'unknown'
  gatewayType?: 'istio' | 'kgateway' | 'envoy'
  prometheusStatus?: 'running' | 'stopped' | 'unknown'
}

export interface LLMdModel {
  id: string
  name: string
  namespace: string
  cluster: string
  size?: string
  gpuMemory?: string
  instances: number
  status: 'loaded' | 'downloading' | 'error' | 'stopped'
}

export interface LLMdStatus {
  healthy: boolean
  totalServers: number
  runningServers: number
  stoppedServers: number
  totalModels: number
  loadedModels: number
}

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
            requests?: Record<string, string>
          }
        }>
      }
    }
  }
  status: {
    replicas?: number
    readyReplicas?: number
    availableReplicas?: number
  }
}

interface InferencePoolResource {
  metadata: {
    name: string
    namespace: string
  }
  spec: {
    selector?: {
      matchLabels?: Record<string, string>
    }
  }
  status?: {
    parents?: Array<{
      conditions?: Array<{
        type: string
        status: string
      }>
    }>
  }
}

interface HPAResource {
  metadata: {
    name: string
    namespace: string
  }
  spec: {
    scaleTargetRef: {
      kind: string
      name: string
    }
  }
}

interface VariantAutoscalingResource {
  metadata: {
    name: string
    namespace: string
  }
  spec: {
    targetRef?: {
      kind?: string
      name?: string
    }
  }
}

function detectServerType(name: string, labels?: Record<string, string>): LLMdServer['type'] {
  const nameLower = name.toLowerCase()
  if (labels?.['app.kubernetes.io/name'] === 'tgi' || nameLower.includes('tgi')) return 'tgi'
  if (labels?.['app.kubernetes.io/name'] === 'triton' || nameLower.includes('triton')) return 'triton'
  if (labels?.['llmd.org/inferenceServing'] === 'true' || nameLower.includes('llm-d')) return 'llm-d'
  if (nameLower.includes('vllm')) return 'vllm'
  return 'unknown'
}

function detectComponentType(name: string, labels?: Record<string, string>): LLMdComponentType {
  const nameLower = name.toLowerCase()

  // EPP (Endpoint Picker Pod)
  if (nameLower.includes('-epp') || nameLower.endsWith('epp')) return 'epp'

  // Gateway components
  if (nameLower.includes('gateway') || nameLower.includes('ingress')) return 'gateway'

  // Prometheus
  if (nameLower === 'prometheus' || nameLower.includes('prometheus-')) return 'prometheus'

  // Model serving (vLLM, TGI, etc.)
  if (labels?.['llmd.org/inferenceServing'] === 'true' ||
      labels?.['llmd.org/model'] ||
      nameLower.includes('vllm') ||
      nameLower.includes('tgi') ||
      nameLower.includes('triton') ||
      nameLower.includes('llama') ||
      nameLower.includes('granite') ||
      nameLower.includes('qwen') ||
      nameLower.includes('mistral') ||
      nameLower.includes('mixtral')) {
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

function getServerStatus(replicas: number, readyReplicas: number): LLMdServer['status'] {
  if (replicas === 0) return 'stopped'
  if (readyReplicas === replicas) return 'running'
  if (readyReplicas > 0) return 'scaling'
  return 'error'
}

function extractGPUInfo(deployment: DeploymentResource): { gpu?: string; gpuCount?: number } {
  const container = deployment.spec.template?.spec?.containers?.[0]
  const limits = container?.resources?.limits || {}

  // Check for GPU resources
  const gpuKeys = Object.keys(limits).filter(k =>
    k.includes('nvidia.com/gpu') || k.includes('amd.com/gpu') || k.includes('gpu')
  )

  if (gpuKeys.length > 0) {
    const gpuKey = gpuKeys[0]
    const gpuCount = parseInt(limits[gpuKey] || '0', 10)
    const gpuType = gpuKey.includes('nvidia') ? 'NVIDIA' : gpuKey.includes('amd') ? 'AMD' : 'GPU'
    return { gpu: gpuType, gpuCount }
  }

  return {}
}

/**
 * Hook to fetch LLM-d inference servers from clusters
 */
export function useLLMdServers(clusters: string[] = ['vllm-d', 'platform-eval']) {
  const [servers, setServers] = useState<LLMdServer[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [consecutiveFailures, setConsecutiveFailures] = useState(0)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const initialLoadDone = useRef(false)

  const refetch = useCallback(async (silent = false) => {
    // Skip fetching in demo mode — no agent available
    if (getDemoMode()) {
      setIsLoading(false)
      return
    }

    console.log(`[useLLMdServers] refetch called, silent=${silent}`)

    // Progressive loading: reset state
    if (!silent) {
      setIsRefreshing(true)
      if (!initialLoadDone.current) {
        setIsLoading(true)
      }
      setServers([])
    }

    try {
      // Process clusters sequentially to avoid overwhelming the WebSocket
      for (const cluster of clusters) {
        try {
          console.log(`[useLLMdServers] Fetching from ${cluster}`)

          // Fetch deployments from all namespaces to discover llm-d workloads
          const allDeployments: DeploymentResource[] = []

          try {
            console.log(`[useLLMdServers] Fetching all deployments from ${cluster}`)
            const resp = await kubectlProxy.exec(
              ['get', 'deployments', '-A', '-o', 'json'],
              { context: cluster, timeout: 15000 }
            )
            if (resp.exitCode === 0 && resp.output) {
              const data = JSON.parse(resp.output)
              const items = data.items || []
              console.log(`[useLLMdServers] Got ${items.length} deployments from ${cluster}`)
              allDeployments.push(...items)
            }
          } catch (err) {
            // Suppress demo mode errors - they're expected when agent is unavailable
            const errMsg = err instanceof Error ? err.message : String(err)
            if (!errMsg.includes('demo mode')) {
              console.error(`[useLLMdServers] Error fetching deployments from ${cluster}:`, err)
            }
          }

          console.log(`[useLLMdServers] Found ${allDeployments.length} deployments from ${cluster}`)
          if (allDeployments.length === 0) continue

          const deployments = allDeployments

          // Build autoscaler map (fetch HPAs and VAs sequentially)
          const autoscalerMap = new Map<string, 'hpa' | 'va' | 'both'>()

          try {
            const hpaResponse = await kubectlProxy.exec(['get', 'hpa', '-A', '-o', 'json'], { context: cluster, timeout: 10000 })
            if (hpaResponse.exitCode === 0) {
              const hpaData = JSON.parse(hpaResponse.output)
              const hpas = (hpaData.items || []) as HPAResource[]
              for (const hpa of hpas) {
                if (hpa.spec.scaleTargetRef.kind === 'Deployment') {
                  const key = `${hpa.metadata.namespace}/${hpa.spec.scaleTargetRef.name}`
                  autoscalerMap.set(key, 'hpa')
                }
              }
            }
          } catch { /* ignore */ }

          try {
            const vaResponse = await kubectlProxy.exec(['get', 'variantautoscalings', '-A', '-o', 'json'], { context: cluster, timeout: 10000 })
            if (vaResponse.exitCode === 0) {
              const vaData = JSON.parse(vaResponse.output)
              const vas = (vaData.items || []) as VariantAutoscalingResource[]
              for (const va of vas) {
                if (va.spec.targetRef?.kind === 'Deployment' || va.spec.targetRef?.name) {
                  const targetName = va.spec.targetRef?.name || ''
                  const key = `${va.metadata.namespace}/${targetName}`
                  const existing = autoscalerMap.get(key)
                  autoscalerMap.set(key, existing ? 'both' : 'va')
                }
              }
            }
          } catch { /* ignore */ }

          // Filter for llm-d related deployments (models, EPP, gateways, prometheus)
          const llmdDeployments = deployments.filter(d => {
            const name = d.metadata.name.toLowerCase()
            const labels = d.spec.template?.metadata?.labels || {}
            const ns = d.metadata.namespace.toLowerCase()

            // Include llm-d/inference-related namespaces
            // - llm-d, llmd, vllm, e2e: standard llm namespaces
            // - b2, effi, guygir: known llm namespaces on vllm-d
            // - inf, gaie, sched: inference namespaces on pok-prod clusters
            // - serving, model, ai-, -ai, ml-: generic ML/AI namespaces
            const isLlmdNamespace = ns.includes('llm-d') || ns.includes('llmd') || ns.includes('e2e') || ns.includes('vllm') ||
              ns === 'b2' || ns.includes('effi') || ns.includes('guygir') || ns.includes('aibrix') ||
              ns.includes('hc4ai') || ns.includes('inf') || ns.includes('gaie') || ns.includes('sched') ||
              ns.includes('inference') || ns.includes('serving') || ns.includes('model') ||
              ns.includes('ai-') || ns.includes('-ai') || ns.includes('ml-')

            return (
              // Model serving
              name.includes('vllm') ||
              name.includes('llm-d') ||
              name.includes('llmd') ||
              name.includes('tgi') ||
              name.includes('triton') ||
              name.includes('llama') ||
              name.includes('granite') ||
              name.includes('qwen') ||
              name.includes('mistral') ||
              name.includes('mixtral') ||
              name.includes('inference') ||
              name.includes('modelservice') ||
              labels['llmd.org/inferenceServing'] === 'true' ||
              labels['llmd.org/model'] ||
              labels['llm-d.ai/role'] ||
              labels['app'] === 'llm-inference' ||
              labels['app.kubernetes.io/name'] === 'vllm' ||
              labels['app.kubernetes.io/name'] === 'tgi' ||
              labels['app.kubernetes.io/part-of'] === 'inference' ||
              // EPP / scheduling
              name.includes('-epp') ||
              name.endsWith('epp') ||
              name.includes('scheduling') ||
              name.includes('inference-pool') ||
              // Gateway (in llm-d namespaces)
              (isLlmdNamespace && (name.includes('gateway') || name.includes('ingress'))) ||
              // Prometheus (in llm-d namespaces)
              (isLlmdNamespace && name === 'prometheus')
            )
          })

          console.log(`[useLLMdServers] Filtered to ${llmdDeployments.length} llm-d deployments on ${cluster}`)

          // Build namespace status maps for gateway and prometheus
          const namespaceGatewayStatus = new Map<string, { status: 'running' | 'stopped' | 'unknown', type: LLMdServer['gatewayType'] }>()
          const namespacePrometheusStatus = new Map<string, 'running' | 'stopped' | 'unknown'>()

          for (const dep of llmdDeployments) {
            const name = dep.metadata.name.toLowerCase()
            const ns = dep.metadata.namespace
            const status = getServerStatus(dep.spec.replicas || 0, dep.status.readyReplicas || 0)

            if (name.includes('gateway') || name.includes('ingress')) {
              namespaceGatewayStatus.set(ns, {
                status: status === 'running' ? 'running' : 'stopped',
                type: detectGatewayType(dep.metadata.name)
              })
            }
            if (name === 'prometheus') {
              namespacePrometheusStatus.set(ns, status === 'running' ? 'running' : 'stopped')
            }
          }

          // Build servers for this cluster
          const clusterServers: LLMdServer[] = []
          for (const dep of llmdDeployments) {
            const labels = dep.spec.template?.metadata?.labels || {}
            const model = labels['llmd.org/model'] ||
                         labels['app.kubernetes.io/model'] ||
                         dep.metadata.name
            const gpuInfo = extractGPUInfo(dep)
            const autoscalerKey = `${dep.metadata.namespace}/${dep.metadata.name}`
            const autoscalerType = autoscalerMap.get(autoscalerKey)
            const componentType = detectComponentType(dep.metadata.name, labels)
            const nsGateway = namespaceGatewayStatus.get(dep.metadata.namespace)
            const nsPrometheus = namespacePrometheusStatus.get(dep.metadata.namespace)

            clusterServers.push({
              id: `${cluster}-${dep.metadata.namespace}-${dep.metadata.name}`,
              name: dep.metadata.name,
              namespace: dep.metadata.namespace,
              cluster,
              model,
              type: detectServerType(dep.metadata.name, labels),
              componentType,
              status: getServerStatus(dep.spec.replicas || 0, dep.status.readyReplicas || 0),
              replicas: dep.spec.replicas || 0,
              readyReplicas: dep.status.readyReplicas || 0,
              hasAutoscaler: !!autoscalerType,
              autoscalerType,
              gatewayStatus: nsGateway?.status,
              gatewayType: nsGateway?.type,
              prometheusStatus: nsPrometheus,
              ...gpuInfo,
            })
          }

          // Progressive loading: update state after each cluster
          if (clusterServers.length > 0) {
            console.log(`[useLLMdServers] Progressive update: adding ${clusterServers.length} servers from ${cluster}`)
            setServers(prev => [...prev, ...clusterServers])
            // Clear loading state after first batch of data arrives
            if (!initialLoadDone.current) {
              setIsLoading(false)
              initialLoadDone.current = true
            }
          }
        } catch (err) {
          // Suppress demo mode errors - they're expected when agent is unavailable
          const errMsg = err instanceof Error ? err.message : String(err)
          if (!errMsg.includes('demo mode')) {
            console.error(`Error fetching from cluster ${cluster}:`, err)
          }
        }
      }

      setError(null)
      setConsecutiveFailures(0)
      setLastRefresh(new Date())
      initialLoadDone.current = true
    } catch (err) {
      // Suppress demo mode errors
      const errMsg = err instanceof Error ? err.message : String(err)
      if (!errMsg.includes('demo mode')) {
        console.error('[useLLMdServers] Error in refetch:', err)
      }
      setConsecutiveFailures(prev => prev + 1)
      setLastRefresh(new Date())
      if (!silent) {
        setError(err instanceof Error ? err.message : 'Failed to fetch LLM-d servers')
      }
    } finally {
      console.log('[useLLMdServers] refetch finally block')
      setIsLoading(false)
      setIsRefreshing(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clusters.join(',')])

  useEffect(() => {
    console.log('[useLLMdServers] useEffect mounting, starting initial fetch')
    refetch(false).catch(err => {
      console.error('[useLLMdServers] Initial fetch error:', err)
    })
    const interval = setInterval(() => refetch(true), REFRESH_INTERVAL_MS)
    return () => {
      console.log('[useLLMdServers] useEffect cleanup')
      clearInterval(interval)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Compute status from servers
  const status = useMemo((): LLMdStatus => {
    const runningServers = servers.filter(s => s.status === 'running').length
    const stoppedServers = servers.filter(s => s.status === 'stopped').length

    return {
      healthy: consecutiveFailures < 3,
      totalServers: servers.length,
      runningServers,
      stoppedServers,
      totalModels: new Set(servers.map(s => s.model)).size,
      loadedModels: new Set(servers.filter(s => s.status === 'running').map(s => s.model)).size,
    }
  }, [servers, consecutiveFailures])

  return {
    servers,
    status,
    isLoading,
    isRefreshing,
    error,
    refetch: () => refetch(false),
    isFailed: consecutiveFailures >= 3,
    consecutiveFailures,
    lastRefresh,
  }
}

/**
 * Hook to fetch LLM-d models from InferencePools
 */
export function useLLMdModels(clusters: string[] = ['vllm-d', 'platform-eval']) {
  const [models, setModels] = useState<LLMdModel[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [consecutiveFailures, setConsecutiveFailures] = useState(0)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const initialLoadDone = useRef(false)

  const refetch = useCallback(async (silent = false) => {
    // Skip fetching in demo mode — no agent available
    if (getDemoMode()) {
      setIsLoading(false)
      return
    }

    console.log(`[useLLMdModels] refetch called, silent=${silent}, clusters=${clusters.join(',')}`)

    // Progressive loading: reset state
    if (!silent) {
      setIsRefreshing(true)
      if (!initialLoadDone.current) {
        setIsLoading(true)
      }
      setModels([])
    }

    try {
      for (const cluster of clusters) {
        try {
          // Get InferencePools
          const response = await kubectlProxy.exec(
            ['get', 'inferencepools', '-A', '-o', 'json'],
            { context: cluster, timeout: 30000 }
          )

          if (response.exitCode !== 0) {
            // InferencePools might not exist on all clusters
            continue
          }

          const data = JSON.parse(response.output)
          const pools = (data.items || []) as InferencePoolResource[]

          const clusterModels: LLMdModel[] = []
          for (const pool of pools) {
            const modelName = pool.spec.selector?.matchLabels?.['llmd.org/model'] || pool.metadata.name
            const hasAccepted = pool.status?.parents?.some(p =>
              p.conditions?.some(c => c.type === 'Accepted' && c.status === 'True')
            )

            clusterModels.push({
              id: `${cluster}-${pool.metadata.namespace}-${pool.metadata.name}`,
              name: modelName,
              namespace: pool.metadata.namespace,
              cluster,
              instances: 1, // Would need to count actual pods
              status: hasAccepted ? 'loaded' : 'stopped',
            })
          }

          // Progressive loading: update state after each cluster
          if (clusterModels.length > 0) {
            console.log(`[useLLMdModels] Progressive update: adding ${clusterModels.length} models from ${cluster}`)
            setModels(prev => [...prev, ...clusterModels])
            // Clear loading state after first batch of data arrives
            if (!initialLoadDone.current) {
              setIsLoading(false)
              initialLoadDone.current = true
            }
          }
        } catch (err) {
          // Suppress demo mode errors - they're expected when agent is unavailable
          const errMsg = err instanceof Error ? err.message : String(err)
          if (!errMsg.includes('demo mode')) {
            console.error(`Error fetching InferencePools from cluster ${cluster}:`, err)
          }
        }
      }

      setError(null)
      setConsecutiveFailures(0)
      setLastRefresh(new Date())
      initialLoadDone.current = true
    } catch (err) {
      setConsecutiveFailures(prev => prev + 1)
      setLastRefresh(new Date())
      if (!silent) {
        setError(err instanceof Error ? err.message : 'Failed to fetch LLM-d models')
      }
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clusters.join(',')])

  useEffect(() => {
    refetch(false)
    const interval = setInterval(() => refetch(true), REFRESH_INTERVAL_MS)
    return () => clearInterval(interval)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return {
    models,
    isLoading,
    isRefreshing,
    error,
    refetch: () => refetch(false),
    isFailed: consecutiveFailures >= 3,
    consecutiveFailures,
    lastRefresh,
  }
}
