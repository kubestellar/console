/**
 * LLM-d Stack Discovery Hook
 *
 * Discovers llm-d stacks from Kubernetes clusters by finding:
 * - Pods with llm-d.ai/role labels (prefill/decode/both)
 * - InferencePool CRDs
 * - EPP and Gateway services
 */
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { kubectlProxy } from '../lib/kubectlProxy'
import type { LLMdServer } from './useLLMd'

// Refresh interval (2 minutes)
const REFRESH_INTERVAL_MS = 120000
const CACHE_KEY = 'kubestellar-stack-cache'
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

export interface LLMdStackComponent {
  name: string
  namespace: string
  cluster: string
  type: 'prefill' | 'decode' | 'both' | 'epp' | 'gateway'
  status: 'running' | 'pending' | 'error' | 'unknown'
  replicas: number
  readyReplicas: number
  model?: string
  podNames?: string[]
}

export type AutoscalerType = 'HPA' | 'WVA' | 'VPA' | null

export interface AutoscalerInfo {
  type: AutoscalerType
  name?: string
  minReplicas?: number
  maxReplicas?: number
  currentReplicas?: number
  desiredReplicas?: number
}

export interface LLMdStack {
  id: string                    // Format: "namespace@cluster"
  name: string                  // Display name (namespace or InferencePool name)
  namespace: string             // Primary namespace
  cluster: string
  inferencePool?: string        // InferencePool CR name if exists
  components: {
    prefill: LLMdStackComponent[]
    decode: LLMdStackComponent[]
    both: LLMdStackComponent[]   // Unified serving pods
    epp: LLMdStackComponent | null
    gateway: LLMdStackComponent | null
  }
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown'
  hasDisaggregation: boolean    // true if prefill.length > 0 && decode.length > 0
  model?: string                // Primary model name
  totalReplicas: number
  readyReplicas: number
  autoscaler?: AutoscalerInfo   // Autoscaler info if detected
}

interface PodResource {
  metadata: {
    name: string
    namespace: string
    labels?: Record<string, string>
  }
  status: {
    phase: string
    containerStatuses?: Array<{
      ready: boolean
    }>
  }
}

interface ServiceResource {
  metadata: {
    name: string
    namespace: string
  }
  spec: {
    ports?: Array<{
      port: number
    }>
  }
}

interface InferencePoolResource {
  metadata: {
    name: string
    namespace: string
  }
  spec?: {
    selector?: {
      matchLabels?: Record<string, string>
    }
  }
}

interface GatewayResource {
  metadata: {
    name: string
    namespace: string
  }
  spec?: {
    gatewayClassName?: string
  }
  status?: {
    addresses?: Array<{
      value: string
    }>
  }
}

function getStackStatus(components: LLMdStack['components']): LLMdStack['status'] {
  const allComponents = [
    ...components.prefill,
    ...components.decode,
    ...components.both,
    components.epp,
    components.gateway,
  ].filter(Boolean) as LLMdStackComponent[]

  if (allComponents.length === 0) return 'unknown'

  const running = allComponents.filter(c => c.status === 'running').length
  const total = allComponents.length

  if (running === total) return 'healthy'
  if (running > 0) return 'degraded'
  return 'unhealthy'
}

// Load cached stacks from localStorage
function loadCachedStacks(): { stacks: LLMdStack[]; timestamp: number } | null {
  try {
    const cached = localStorage.getItem(CACHE_KEY)
    if (!cached) return null
    const parsed = JSON.parse(cached)
    if (parsed.timestamp && parsed.stacks) {
      return parsed
    }
  } catch {
    // Ignore parse errors
  }
  return null
}

// Save stacks to localStorage cache
function saveCachedStacks(stacks: LLMdStack[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      stacks,
      timestamp: Date.now(),
    }))
  } catch {
    // Ignore storage errors
  }
}

/**
 * Hook to discover llm-d stacks from clusters
 *
 * Uses localStorage caching for instant initial display.
 */
export function useStackDiscovery(clusters: string[] = ['pok-prod-001', 'vllm-d']) {
  // Initialize from cache for instant display
  const cached = useMemo(() => loadCachedStacks(), [])
  const isCacheValid = cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)

  const [stacks, setStacks] = useState<LLMdStack[]>(cached?.stacks || [])
  const [isLoading, setIsLoading] = useState(!isCacheValid)
  const [error, setError] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(cached ? new Date(cached.timestamp) : null)
  const initialLoadDone = useRef(isCacheValid || false)
  const isRefetching = useRef(false) // Guard against concurrent refetches

  const refetch = useCallback(async (silent = false) => {
    // Prevent concurrent refetches
    if (isRefetching.current) {
      return
    }
    isRefetching.current = true

    if (!silent) {
      setIsLoading(true)
      if (!initialLoadDone.current) {
        setStacks([])
      }
    }

    try {
      // Progressive discovery: process clusters sequentially, update UI after each completes
      for (const cluster of clusters) {
        const clusterStacks: LLMdStack[] = []

        try {
          // Fetch pods with llm-d.ai/role labels
          const podsResponse = await kubectlProxy.exec(
            ['get', 'pods', '-A', '-l', 'llm-d.ai/role', '-o', 'json'],
            { context: cluster, timeout: 15000 }
          )

          // Skip cluster entirely if it's unreachable (connection error or timeout)
          if (podsResponse.exitCode !== 0 &&
              (podsResponse.output.includes('Unable to connect') ||
               podsResponse.output.includes('connection refused') ||
               podsResponse.output.includes('timeout') ||
               podsResponse.output.includes('no such host') ||
               podsResponse.output.includes('context deadline exceeded'))) {
            continue
          }

          const podsData = podsResponse.exitCode === 0 ? JSON.parse(podsResponse.output) : { items: [] }
          const pods = (podsData.items || []) as PodResource[]

          // Group pods by namespace
          const podsByNamespace = new Map<string, PodResource[]>()
          for (const pod of pods) {
            const ns = pod.metadata.namespace
            if (!podsByNamespace.has(ns)) {
              podsByNamespace.set(ns, [])
            }
            podsByNamespace.get(ns)!.push(pod)
          }

          // Fetch InferencePools
          const poolsResponse = await kubectlProxy.exec(
            ['get', 'inferencepools', '-A', '-o', 'json'],
            { context: cluster, timeout: 15000 }
          )
          const poolsData = poolsResponse.exitCode === 0 ? JSON.parse(poolsResponse.output) : { items: [] }
          const pools = (poolsData.items || []) as InferencePoolResource[]
          const poolsByNamespace = new Map(pools.map(p => [p.metadata.namespace, p]))

          // Skip cluster early if no pods AND no InferencePools (like offline platform-eval)
          if (pods.length === 0 && pools.length === 0) {
            continue
          }

          // NOTE: We no longer show "basic stacks" immediately because they lack P/D/WVA data
          // and would overwrite cached stacks that have full data. Instead, we wait for the
          // complete stack data below. The cache provides instant display on initial load.

          // Fetch EPP services
          const svcResponse = await kubectlProxy.exec(
            ['get', 'services', '-A', '-o', 'json'],
            { context: cluster, timeout: 30000 }
          )
          let svcData = { items: [] as ServiceResource[] }
          try {
            if (svcResponse.exitCode === 0) {
              svcData = JSON.parse(svcResponse.output)
            }
          } catch (e) {
            console.error(`[useStackDiscovery] Error parsing services on ${cluster}:`, e)
          }
          const services = (svcData.items || []) as ServiceResource[]
          const eppByNamespace = new Map<string, ServiceResource>()
          for (const svc of services) {
            if (svc.metadata.name.includes('-epp') || svc.metadata.name.endsWith('epp')) {
              eppByNamespace.set(svc.metadata.namespace, svc)
            }
          }

          // Fetch Gateways
          const gwResponse = await kubectlProxy.exec(
            ['get', 'gateway', '-A', '-o', 'json'],
            { context: cluster, timeout: 15000 }
          )
          const gwData = gwResponse.exitCode === 0 ? JSON.parse(gwResponse.output) : { items: [] }
          const gateways = (gwData.items || []) as GatewayResource[]
          const gatewayByNamespace = new Map(gateways.map(g => [g.metadata.namespace, g]))

          // Fetch HPAs
          const hpaResponse = await kubectlProxy.exec(
            ['get', 'hpa', '-A', '-o', 'json'],
            { context: cluster, timeout: 15000 }
          )
          const hpaData = hpaResponse.exitCode === 0 ? JSON.parse(hpaResponse.output) : { items: [] }
          interface HPAResource {
            metadata: { name: string; namespace: string }
            spec?: { minReplicas?: number; maxReplicas?: number }
            status?: { currentReplicas?: number; desiredReplicas?: number }
          }
          const hpas = (hpaData.items || []) as HPAResource[]
          const hpaByNamespace = new Map<string, HPAResource>()
          for (const hpa of hpas) {
            // Associate HPA with namespace if it targets llm-d resources
            if (!hpaByNamespace.has(hpa.metadata.namespace)) {
              hpaByNamespace.set(hpa.metadata.namespace, hpa)
            }
          }

          // Fetch WVA (VariantAutoscaling) - custom CRD
          const wvaResponse = await kubectlProxy.exec(
            ['get', 'variantautoscalings', '-A', '-o', 'json'],
            { context: cluster, timeout: 15000 }
          )
          const wvaData = wvaResponse.exitCode === 0 ? JSON.parse(wvaResponse.output) : { items: [] }
          interface WVAResource {
            metadata: { name: string; namespace: string }
            spec?: {
              minReplicas?: number
              maxReplicas?: number
              scaleTargetRef?: {
                namespace?: string  // Cross-namespace targeting
              }
            }
            status?: {
              currentReplicas?: number
              desiredReplicas?: number
              desiredOptimizedAlloc?: {
                numReplicas?: number
              }
            }
          }
          const wvas = (wvaData.items || []) as WVAResource[]
          // Map WVA by its own namespace (same-namespace autoscaling)
          const wvaByNamespace = new Map<string, WVAResource>()
          // Map WVA by target namespace (cross-namespace autoscaling)
          const wvaByTargetNamespace = new Map<string, WVAResource>()
          for (const wva of wvas) {
            wvaByNamespace.set(wva.metadata.namespace, wva)
            // If WVA targets a different namespace, map it there too
            const targetNs = wva.spec?.scaleTargetRef?.namespace
            if (targetNs && targetNs !== wva.metadata.namespace) {
              wvaByTargetNamespace.set(targetNs, wva)
            }
          }

          // Fetch VPA (VerticalPodAutoscaler)
          const vpaResponse = await kubectlProxy.exec(
            ['get', 'vpa', '-A', '-o', 'json'],
            { context: cluster, timeout: 15000 }
          )
          const vpaData = vpaResponse.exitCode === 0 ? JSON.parse(vpaResponse.output) : { items: [] }
          interface VPAResource {
            metadata: { name: string; namespace: string }
          }
          const vpas = (vpaData.items || []) as VPAResource[]
          const vpaByNamespace = new Map<string, VPAResource>()
          for (const vpa of vpas) {
            vpaByNamespace.set(vpa.metadata.namespace, vpa)
          }

          // Collect all namespaces that have either pods OR InferencePools
          const allStackNamespaces = new Set<string>([
            ...podsByNamespace.keys(),
            ...poolsByNamespace.keys(),
          ])

          // Build stacks from namespaces
          for (const namespace of allStackNamespaces) {
            const nsPods = podsByNamespace.get(namespace) || []
            const prefillPods: PodResource[] = []
            const decodePods: PodResource[] = []
            const bothPods: PodResource[] = []

            for (const pod of nsPods) {
              const role = pod.metadata.labels?.['llm-d.ai/role']?.toLowerCase()
              const podName = pod.metadata.name.toLowerCase()

              // Match by explicit role label first
              if (role === 'prefill' || role === 'prefill-server') {
                prefillPods.push(pod)
              } else if (role === 'decode' || role === 'decode-server') {
                decodePods.push(pod)
              } else if (role === 'both' || role === 'unified' || role === 'model' || role === 'server' || role === 'vllm') {
                bothPods.push(pod)
              }
              // Infer from pod name patterns if role is unrecognized
              else if (podName.includes('prefill')) {
                prefillPods.push(pod)
              } else if (podName.includes('decode')) {
                decodePods.push(pod)
              }
              // Default: treat as unified server
              else {
                bothPods.push(pod)
              }
            }

            // Get model name from first pod
            const firstPod = nsPods[0]
            const model = firstPod?.metadata.labels?.['llm-d.ai/model']

            // Build components
            const buildComponent = (pods: PodResource[], type: LLMdStackComponent['type']): LLMdStackComponent[] => {
              if (pods.length === 0) return []

              // Group by deployment (using pod-template-hash)
              const byDeployment = new Map<string, PodResource[]>()
              for (const pod of pods) {
                const hash = pod.metadata.labels?.['pod-template-hash'] || 'default'
                if (!byDeployment.has(hash)) {
                  byDeployment.set(hash, [])
                }
                byDeployment.get(hash)!.push(pod)
              }

              return Array.from(byDeployment.entries()).map(([, deploymentPods]) => {
                const ready = deploymentPods.filter(p =>
                  p.status.phase === 'Running' &&
                  p.status.containerStatuses?.every(c => c.ready)
                ).length

                return {
                  name: deploymentPods[0].metadata.name.replace(/-[a-z0-9]+$/, ''),
                  namespace,
                  cluster,
                  type,
                  status: ready === deploymentPods.length ? 'running' : ready > 0 ? 'running' : 'error',
                  replicas: deploymentPods.length,
                  readyReplicas: ready,
                  model,
                  podNames: deploymentPods.map(p => p.metadata.name),
                }
              })
            }

            const prefillComponents = buildComponent(prefillPods, 'prefill')
            const decodeComponents = buildComponent(decodePods, 'decode')
            const bothComponents = buildComponent(bothPods, 'both')

            // EPP component
            const eppService = eppByNamespace.get(namespace)
            const eppComponent: LLMdStackComponent | null = eppService ? {
              name: eppService.metadata.name,
              namespace,
              cluster,
              type: 'epp',
              status: 'running', // Assume running if service exists
              replicas: 1,
              readyReplicas: 1,
            } : null

            // Gateway component
            const gateway = gatewayByNamespace.get(namespace)
            const gatewayComponent: LLMdStackComponent | null = gateway ? {
              name: gateway.metadata.name,
              namespace,
              cluster,
              type: 'gateway',
              status: gateway.status?.addresses?.length ? 'running' : 'pending',
              replicas: 1,
              readyReplicas: gateway.status?.addresses?.length ? 1 : 0,
            } : null

            const components = {
              prefill: prefillComponents,
              decode: decodeComponents,
              both: bothComponents,
              epp: eppComponent,
              gateway: gatewayComponent,
            }

            const pool = poolsByNamespace.get(namespace)
            const totalReplicas =
              prefillComponents.reduce((sum, c) => sum + c.replicas, 0) +
              decodeComponents.reduce((sum, c) => sum + c.replicas, 0) +
              bothComponents.reduce((sum, c) => sum + c.replicas, 0)
            const readyReplicas =
              prefillComponents.reduce((sum, c) => sum + c.readyReplicas, 0) +
              decodeComponents.reduce((sum, c) => sum + c.readyReplicas, 0) +
              bothComponents.reduce((sum, c) => sum + c.readyReplicas, 0)

            // Detect autoscaler - WVA takes precedence, then HPA, then VPA
            // Check both same-namespace and cross-namespace WVA targeting
            let autoscaler: AutoscalerInfo | undefined
            const wva = wvaByNamespace.get(namespace) || wvaByTargetNamespace.get(namespace)
            const hpa = hpaByNamespace.get(namespace)
            const vpa = vpaByNamespace.get(namespace)

            if (wva) {
              // Use desiredOptimizedAlloc.numReplicas if available (WVA status field)
              const desiredReplicas = wva.status?.desiredOptimizedAlloc?.numReplicas ?? wva.status?.desiredReplicas
              autoscaler = {
                type: 'WVA',
                name: wva.metadata.name,
                minReplicas: wva.spec?.minReplicas,
                maxReplicas: wva.spec?.maxReplicas,
                currentReplicas: wva.status?.currentReplicas,
                desiredReplicas,
              }
            } else if (hpa) {
              autoscaler = {
                type: 'HPA',
                name: hpa.metadata.name,
                minReplicas: hpa.spec?.minReplicas,
                maxReplicas: hpa.spec?.maxReplicas,
                currentReplicas: hpa.status?.currentReplicas,
                desiredReplicas: hpa.status?.desiredReplicas,
              }
            } else if (vpa) {
              autoscaler = {
                type: 'VPA',
                name: vpa.metadata.name,
              }
            }

            clusterStacks.push({
              id: `${namespace}@${cluster}`,
              name: pool?.metadata.name || namespace,
              namespace,
              cluster,
              inferencePool: pool?.metadata.name,
              components,
              status: getStackStatus(components),
              hasDisaggregation: prefillComponents.length > 0 && decodeComponents.length > 0,
              model,
              totalReplicas,
              readyReplicas,
              autoscaler,
            })
          }

          // Progressive update: add this cluster's stacks immediately
          if (clusterStacks.length > 0) {
            setStacks(prev => {
              // Remove any existing stacks from this cluster (in case of refresh)
              const filtered = prev.filter(s => s.cluster !== cluster)
              const merged = [...filtered, ...clusterStacks]
              // Sort: healthy first, then by name
              merged.sort((a, b) => {
                if (a.status === 'healthy' && b.status !== 'healthy') return -1
                if (a.status !== 'healthy' && b.status === 'healthy') return 1
                return a.name.localeCompare(b.name)
              })
              saveCachedStacks(merged) // Cache progressively too
              return merged
            })
          }

        } catch (err) {
          console.error(`[useStackDiscovery] Error fetching from ${cluster}:`, err)
        }
      }

      setError(null)
      setLastRefresh(new Date())
      initialLoadDone.current = true
    } catch (err) {
      console.error('[useStackDiscovery] Error:', err)
      setError(err instanceof Error ? err.message : 'Failed to discover stacks')
    } finally {
      setIsLoading(false)
      isRefetching.current = false
    }
  }, [clusters.join(',')])

  useEffect(() => {
    // If we have valid cache, do a silent refresh in background
    // Otherwise do a full fetch with loading state
    refetch(Boolean(isCacheValid))
    const interval = setInterval(() => refetch(true), REFRESH_INTERVAL_MS)
    return () => clearInterval(interval)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refetch])

  return {
    stacks,
    isLoading,
    error,
    refetch: () => refetch(false),
    lastRefresh,
  }
}

/**
 * Convert stack components to server metrics format for visualizations
 */
export function stackToServerMetrics(stack: LLMdStack): LLMdServer[] {
  const servers: LLMdServer[] = []

  // Add prefill servers
  stack.components.prefill.forEach((comp, i) => {
    servers.push({
      id: `${stack.id}-prefill-${i}`,
      name: `Prefill-${i}`,
      namespace: stack.namespace,
      cluster: stack.cluster,
      model: comp.model || stack.model || 'unknown',
      type: 'llm-d',
      componentType: 'model',
      status: comp.status === 'running' ? 'running' : 'error',
      replicas: comp.replicas,
      readyReplicas: comp.readyReplicas,
    })
  })

  // Add decode servers
  stack.components.decode.forEach((comp, i) => {
    servers.push({
      id: `${stack.id}-decode-${i}`,
      name: `Decode-${i}`,
      namespace: stack.namespace,
      cluster: stack.cluster,
      model: comp.model || stack.model || 'unknown',
      type: 'llm-d',
      componentType: 'model',
      status: comp.status === 'running' ? 'running' : 'error',
      replicas: comp.replicas,
      readyReplicas: comp.readyReplicas,
    })
  })

  // Add unified servers
  stack.components.both.forEach((comp, i) => {
    servers.push({
      id: `${stack.id}-unified-${i}`,
      name: `Server-${i}`,
      namespace: stack.namespace,
      cluster: stack.cluster,
      model: comp.model || stack.model || 'unknown',
      type: 'llm-d',
      componentType: 'model',
      status: comp.status === 'running' ? 'running' : 'error',
      replicas: comp.replicas,
      readyReplicas: comp.readyReplicas,
    })
  })

  // Add EPP
  if (stack.components.epp) {
    servers.push({
      id: `${stack.id}-epp`,
      name: 'EPP Scheduler',
      namespace: stack.namespace,
      cluster: stack.cluster,
      model: 'epp',
      type: 'llm-d',
      componentType: 'epp',
      status: stack.components.epp.status === 'running' ? 'running' : 'error',
      replicas: 1,
      readyReplicas: stack.components.epp.status === 'running' ? 1 : 0,
    })
  }

  // Add Gateway
  if (stack.components.gateway) {
    servers.push({
      id: `${stack.id}-gateway`,
      name: 'Istio Gateway',
      namespace: stack.namespace,
      cluster: stack.cluster,
      model: 'gateway',
      type: 'llm-d',
      componentType: 'gateway',
      status: stack.components.gateway.status === 'running' ? 'running' : 'error',
      replicas: 1,
      readyReplicas: stack.components.gateway.status === 'running' ? 1 : 0,
      gatewayStatus: stack.components.gateway.status === 'running' ? 'running' : 'stopped',
      gatewayType: 'istio',
    })
  }

  return servers
}
