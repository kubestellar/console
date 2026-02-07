/**
 * LLM-d Stack Discovery Hook
 *
 * Discovers llm-d stacks from Kubernetes clusters by finding:
 * - Pods with llm-d.ai/role labels (prefill/decode/both)
 * - InferencePool CRDs
 * - Deployments matching LLM-d name/label/namespace patterns (broad discovery)
 * - EPP and Gateway services
 */
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { kubectlProxy } from '../lib/kubectlProxy'
import { getDemoMode } from './useDemoMode'
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

interface DeploymentResource {
  metadata: { name: string; namespace: string; labels?: Record<string, string> }
  spec: {
    replicas?: number
    template?: { metadata?: { labels?: Record<string, string> } }
  }
  status: { replicas?: number; readyReplicas?: number; availableReplicas?: number }
}

// Namespace heuristics for LLM-d workloads (mirrors useLLMdServers patterns)
function isLlmdNamespace(ns: string): boolean {
  const n = ns.toLowerCase()
  return n.includes('llm-d') || n.includes('llmd') || n.includes('e2e') || n.includes('vllm') ||
    n === 'b2' || n.includes('effi') || n.includes('guygir') || n.includes('aibrix') ||
    n.includes('hc4ai') || n.includes('inf') || n.includes('gaie') || n.includes('sched') ||
    n.includes('inference') || n.includes('serving') || n.includes('model') ||
    n.includes('ai-') || n.includes('-ai') || n.includes('ml-')
}

// Deployment-level detection for LLM-d workloads (mirrors useLLMdServers patterns)
function isLlmdDeployment(d: DeploymentResource): boolean {
  const name = d.metadata.name.toLowerCase()
  const labels = d.spec.template?.metadata?.labels || {}
  const nsMatch = isLlmdNamespace(d.metadata.namespace)
  return (
    name.includes('vllm') || name.includes('llm-d') || name.includes('llmd') ||
    name.includes('tgi') || name.includes('triton') ||
    name.includes('llama') || name.includes('granite') ||
    name.includes('qwen') || name.includes('mistral') || name.includes('mixtral') ||
    name.includes('inference') || name.includes('modelservice') ||
    labels['llmd.org/inferenceServing'] === 'true' ||
    !!labels['llmd.org/model'] ||
    !!labels['llm-d.ai/role'] ||
    labels['app'] === 'llm-inference' ||
    labels['app.kubernetes.io/name'] === 'vllm' ||
    labels['app.kubernetes.io/name'] === 'tgi' ||
    labels['app.kubernetes.io/part-of'] === 'inference' ||
    name.includes('-epp') || name.endsWith('epp') ||
    name.includes('scheduling') || name.includes('inference-pool') ||
    (nsMatch && (name.includes('gateway') || name.includes('ingress')))
  )
}

/**
 * Merge fresh stack data with cached, preserving details when fresh data degraded
 * due to partial API failures (e.g., pods fetch timed out but pools succeeded).
 * This prevents the dropdown from losing P/D/WVA details during background refreshes.
 */
function mergeStackWithCached(fresh: LLMdStack, cached: LLMdStack): LLMdStack {
  const merged = {
    ...fresh,
    components: { ...fresh.components },
  }

  // Preserve pod component details if fresh lost them (likely API failure)
  if (fresh.components.prefill.length === 0 && cached.components.prefill.length > 0) {
    merged.components.prefill = cached.components.prefill
  }
  if (fresh.components.decode.length === 0 && cached.components.decode.length > 0) {
    merged.components.decode = cached.components.decode
  }
  if (fresh.components.both.length === 0 && cached.components.both.length > 0) {
    merged.components.both = cached.components.both
  }

  // Preserve EPP/Gateway if fresh didn't find them
  if (!merged.components.epp && cached.components.epp) {
    merged.components.epp = cached.components.epp
  }
  if (!merged.components.gateway && cached.components.gateway) {
    merged.components.gateway = cached.components.gateway
  }

  // Preserve autoscaler if fresh didn't detect it
  if (!merged.autoscaler && cached.autoscaler) {
    merged.autoscaler = cached.autoscaler
  }

  // Preserve model name
  if (!merged.model && cached.model) {
    merged.model = cached.model
  }

  // Recalculate derived fields from the (possibly preserved) components
  const allServing = [...merged.components.prefill, ...merged.components.decode, ...merged.components.both]
  merged.totalReplicas = allServing.reduce((sum, c) => sum + c.replicas, 0)
  merged.readyReplicas = allServing.reduce((sum, c) => sum + c.readyReplicas, 0)
  merged.hasDisaggregation = merged.components.prefill.length > 0 && merged.components.decode.length > 0
  merged.status = getStackStatus(merged.components)

  return merged
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
export function useStackDiscovery(clusters: string[]) {
  // Initialize from cache for instant display (stale-while-revalidate)
  const cached = useMemo(() => loadCachedStacks(), [])
  const hasCachedStacks = cached !== null && cached.stacks.length > 0
  const isCacheValid = cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)

  const [stacks, setStacks] = useState<LLMdStack[]>(cached?.stacks || [])
  // Only show loading if we have NO cached data at all — stale cache is still shown
  const [isLoading, setIsLoading] = useState(!hasCachedStacks)
  const [error, setError] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(cached ? new Date(cached.timestamp) : null)
  const initialLoadDone = useRef(isCacheValid || false)
  const hasStacksRef = useRef(hasCachedStacks) // Track if we have any data to show
  const isRefetching = useRef(false) // Guard against concurrent refetches

  const refetch = useCallback(async (silent = false) => {
    // Skip fetching in demo mode — no agent available
    if (getDemoMode()) {
      setIsLoading(false)
      return
    }

    // Wait for clusters to be loaded before fetching
    if (clusters.length === 0) {
      console.log('[useStackDiscovery] Waiting for clusters to load...')
      return
    }

    // Prevent concurrent refetches
    if (isRefetching.current) {
      return
    }
    isRefetching.current = true

    console.log('[useStackDiscovery] Fetching stacks from clusters:', clusters)

    if (!silent) {
      // Only show loading spinner if we have no stacks at all.
      // If we have stale cached stacks, keep showing them while fetching fresh data
      // (stale-while-revalidate pattern — never wipe visible data).
      if (!hasStacksRef.current) {
        setIsLoading(true)
      }
    }

    try {
      // Progressive discovery: process clusters sequentially, update UI after each completes
      for (const cluster of clusters) {
        const clusterStacks: LLMdStack[] = []

        try {
          // Run all kubectl calls in parallel for speed
          const [podsResponse, poolsResponse, svcResponse, gwResponse, hpaResponse, wvaResponse, vpaResponse, deploymentsResponse] = await Promise.all([
            kubectlProxy.exec(['get', 'pods', '-A', '-l', 'llm-d.ai/role', '-o', 'json'], { context: cluster, timeout: 30000 }),
            kubectlProxy.exec(['get', 'inferencepools', '-A', '-o', 'json'], { context: cluster, timeout: 30000 }),
            kubectlProxy.exec(['get', 'services', '-A', '-o', 'json'], { context: cluster, timeout: 30000 }),
            kubectlProxy.exec(['get', 'gateway', '-A', '-o', 'json'], { context: cluster, timeout: 30000 }),
            kubectlProxy.exec(['get', 'hpa', '-A', '-o', 'json'], { context: cluster, timeout: 30000 }),
            kubectlProxy.exec(['get', 'variantautoscalings', '-A', '-o', 'json'], { context: cluster, timeout: 30000 }),
            kubectlProxy.exec(['get', 'vpa', '-A', '-o', 'json'], { context: cluster, timeout: 30000 }),
            kubectlProxy.exec(['get', 'deployments', '-A', '-o', 'json'], { context: cluster, timeout: 30000 }),
          ])

          // Skip cluster entirely if it's unreachable (connection error or timeout)
          if (podsResponse.exitCode !== 0 &&
              (podsResponse.output.includes('Unable to connect') ||
               podsResponse.output.includes('connection refused') ||
               podsResponse.output.includes('timeout') ||
               podsResponse.output.includes('no such host') ||
               podsResponse.output.includes('context deadline exceeded'))) {
            continue
          }

          // Parse pods
          const podsData = podsResponse.exitCode === 0 ? JSON.parse(podsResponse.output) : { items: [] }
          const pods = (podsData.items || []) as PodResource[]
          const podsByNamespace = new Map<string, PodResource[]>()
          for (const pod of pods) {
            const ns = pod.metadata.namespace
            if (!podsByNamespace.has(ns)) {
              podsByNamespace.set(ns, [])
            }
            podsByNamespace.get(ns)!.push(pod)
          }

          // Parse InferencePools
          const poolsData = poolsResponse.exitCode === 0 ? JSON.parse(poolsResponse.output) : { items: [] }
          const pools = (poolsData.items || []) as InferencePoolResource[]
          const poolsByNamespace = new Map(pools.map(p => [p.metadata.namespace, p]))

          // Parse and filter Deployments for LLM-d workloads (broad discovery)
          const depsData = deploymentsResponse.exitCode === 0 ? JSON.parse(deploymentsResponse.output) : { items: [] }
          const allDeployments = (depsData.items || []) as DeploymentResource[]
          const llmdDeployments = allDeployments.filter(isLlmdDeployment)
          const deploymentsByNamespace = new Map<string, DeploymentResource[]>()
          for (const dep of llmdDeployments) {
            const ns = dep.metadata.namespace
            if (!deploymentsByNamespace.has(ns)) deploymentsByNamespace.set(ns, [])
            deploymentsByNamespace.get(ns)!.push(dep)
          }

          // DEBUG: Log discovery counts
          console.log(`[useStackDiscovery] Cluster ${cluster}: pods=${pods.length}, pools=${pools.length}, llmdDeployments=${llmdDeployments.length}, totalDeployments=${allDeployments.length}`)
          console.log(`[useStackDiscovery] Cluster ${cluster}: deployment namespaces:`, [...deploymentsByNamespace.keys()])
          console.log(`[useStackDiscovery] Cluster ${cluster}: deploymentsResponse.exitCode=${deploymentsResponse.exitCode}`)

          // Skip cluster early if no labeled pods, InferencePools, or LLM-d Deployments
          if (pods.length === 0 && pools.length === 0 && llmdDeployments.length === 0) {
            console.log(`[useStackDiscovery] SKIPPING cluster ${cluster}: no pods, pools, or llmd deployments`)
            continue
          }

          // Parse services for EPP
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

          // Parse Gateways
          const gwData = gwResponse.exitCode === 0 ? JSON.parse(gwResponse.output) : { items: [] }
          const gateways = (gwData.items || []) as GatewayResource[]
          const gatewayByNamespace = new Map(gateways.map(g => [g.metadata.namespace, g]))

          // Parse HPAs
          const hpaData = hpaResponse.exitCode === 0 ? JSON.parse(hpaResponse.output) : { items: [] }
          interface HPAResource {
            metadata: { name: string; namespace: string }
            spec?: { minReplicas?: number; maxReplicas?: number }
            status?: { currentReplicas?: number; desiredReplicas?: number }
          }
          const hpas = (hpaData.items || []) as HPAResource[]
          const hpaByNamespace = new Map<string, HPAResource>()
          for (const hpa of hpas) {
            if (!hpaByNamespace.has(hpa.metadata.namespace)) {
              hpaByNamespace.set(hpa.metadata.namespace, hpa)
            }
          }

          // Parse WVA (VariantAutoscaling)
          const wvaData = wvaResponse.exitCode === 0 ? JSON.parse(wvaResponse.output) : { items: [] }
          interface WVAResource {
            metadata: { name: string; namespace: string }
            spec?: {
              minReplicas?: number
              maxReplicas?: number
              scaleTargetRef?: {
                namespace?: string
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
          const wvaByNamespace = new Map<string, WVAResource>()
          const wvaByTargetNamespace = new Map<string, WVAResource>()
          for (const wva of wvas) {
            wvaByNamespace.set(wva.metadata.namespace, wva)
            const targetNs = wva.spec?.scaleTargetRef?.namespace
            if (targetNs && targetNs !== wva.metadata.namespace) {
              wvaByTargetNamespace.set(targetNs, wva)
            }
          }

          // Parse VPA
          const vpaData = vpaResponse.exitCode === 0 ? JSON.parse(vpaResponse.output) : { items: [] }
          interface VPAResource {
            metadata: { name: string; namespace: string }
          }
          const vpas = (vpaData.items || []) as VPAResource[]
          const vpaByNamespace = new Map<string, VPAResource>()
          for (const vpa of vpas) {
            vpaByNamespace.set(vpa.metadata.namespace, vpa)
          }

          // Collect all namespaces that have pods, InferencePools, or LLM-d Deployments
          const allStackNamespaces = new Set<string>([
            ...podsByNamespace.keys(),
            ...poolsByNamespace.keys(),
            ...deploymentsByNamespace.keys(),
          ])
          console.log(`[useStackDiscovery] Cluster ${cluster}: allStackNamespaces (${allStackNamespaces.size}):`, [...allStackNamespaces])

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

            // Get model name from first pod (mutable - may be enriched from Deployments)
            const firstPod = nsPods[0]
            let model = firstPod?.metadata.labels?.['llm-d.ai/model']

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

            // Fall back to Deployment-based discovery when no labeled pods exist
            const nsDeployments = deploymentsByNamespace.get(namespace) || []
            let eppFromDeployment: LLMdStackComponent | null = null

            if (prefillPods.length === 0 && decodePods.length === 0 && bothPods.length === 0 && nsDeployments.length > 0) {
              for (const dep of nsDeployments) {
                const depName = dep.metadata.name.toLowerCase()
                const depLabels = dep.spec.template?.metadata?.labels || {}
                const role = depLabels['llm-d.ai/role']?.toLowerCase()
                const replicas = dep.spec.replicas ?? dep.status.replicas ?? 0
                const ready = dep.status.readyReplicas ?? 0
                const depModel = depLabels['llmd.org/model'] || model
                const depStatus: LLMdStackComponent['status'] = ready === replicas && replicas > 0 ? 'running' : ready > 0 ? 'running' : 'error'

                const isEpp = depName.includes('-epp') || depName.endsWith('epp') || depName.includes('scheduling') || depName.includes('inference-pool')

                if (isEpp && !eppFromDeployment) {
                  eppFromDeployment = { name: dep.metadata.name, namespace, cluster, type: 'epp', status: ready > 0 ? 'running' : 'pending', replicas, readyReplicas: ready }
                } else if (role === 'prefill' || depName.includes('prefill')) {
                  prefillComponents.push({ name: dep.metadata.name, namespace, cluster, type: 'prefill', status: depStatus, replicas, readyReplicas: ready, model: depModel })
                } else if (role === 'decode' || depName.includes('decode')) {
                  decodeComponents.push({ name: dep.metadata.name, namespace, cluster, type: 'decode', status: depStatus, replicas, readyReplicas: ready, model: depModel })
                } else {
                  bothComponents.push({ name: dep.metadata.name, namespace, cluster, type: 'both', status: depStatus, replicas, readyReplicas: ready, model: depModel })
                }
              }
            }

            // Extract model name from Deployments when pods don't provide it
            if (!model && nsDeployments.length > 0) {
              model = nsDeployments[0].spec.template?.metadata?.labels?.['llmd.org/model']
            }

            // EPP component
            const eppService = eppByNamespace.get(namespace)
            const eppComponent: LLMdStackComponent | null = eppFromDeployment || (eppService ? {
              name: eppService.metadata.name,
              namespace,
              cluster,
              type: 'epp',
              status: 'running', // Assume running if service exists
              replicas: 1,
              readyReplicas: 1,
            } : null)

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

            const stack = {
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
            }
            console.log(`[useStackDiscovery] Created stack: ${stack.id} (${stack.name}) - P:${prefillComponents.length} D:${decodeComponents.length} B:${bothComponents.length} nsDeployments:${nsDeployments.length}`)
            clusterStacks.push(stack)
          }

          // Progressive update: add this cluster's stacks immediately
          // Only update if we got results - preserve cached data when cluster is unreachable
          if (clusterStacks.length > 0) {
            setStacks(prev => {
              // Build lookup of cached stacks for this cluster
              const cachedById = new Map(
                prev.filter(s => s.cluster === cluster).map(s => [s.id, s])
              )
              const filtered = prev.filter(s => s.cluster !== cluster)

              // Merge each fresh stack with its cached counterpart to preserve
              // P/D/WVA details that may be missing due to partial API failures
              const mergedStacks = clusterStacks.map(freshStack => {
                const cachedStack = cachedById.get(freshStack.id)
                if (!cachedStack) return freshStack
                return mergeStackWithCached(freshStack, cachedStack)
              })

              const merged = [...filtered, ...mergedStacks]
              // Sort: healthy first, then by name
              merged.sort((a, b) => {
                if (a.status === 'healthy' && b.status !== 'healthy') return -1
                if (a.status !== 'healthy' && b.status === 'healthy') return 1
                return a.name.localeCompare(b.name)
              })
              saveCachedStacks(merged) // Cache progressively too
              hasStacksRef.current = merged.length > 0
              return merged
            })
          }
          // Note: If clusterStacks is empty but we had cached data for this cluster,
          // we intentionally preserve the cached data to avoid losing P/D/WVA details
          // when the cluster is temporarily unreachable

        } catch (err) {
          // Suppress demo mode errors - they're expected when agent is unavailable
          const errMsg = err instanceof Error ? err.message : String(err)
          if (!errMsg.includes('demo mode') && !errMsg.includes('timed out')) {
            console.error(`[useStackDiscovery] Error fetching from ${cluster}:`, err)
          }
        }
      }

      setError(null)
      setLastRefresh(new Date())
      initialLoadDone.current = true
    } catch (err) {
      // Suppress demo mode errors
      const errMsg = err instanceof Error ? err.message : String(err)
      if (!errMsg.includes('demo mode')) {
        console.error('[useStackDiscovery] Error:', err)
      }
      setError(err instanceof Error ? err.message : 'Failed to discover stacks')
    } finally {
      setIsLoading(false)
      isRefetching.current = false
    }
  }, [clusters.join(',')])

  useEffect(() => {
    // Wait for clusters to be available
    if (clusters.length === 0) {
      return
    }
    // If we have any cached stacks (even stale), do a silent background refresh
    // to avoid wiping visible data. Only show loading if we have nothing to show.
    refetch(hasCachedStacks || Boolean(isCacheValid))
    const interval = setInterval(() => refetch(true), REFRESH_INTERVAL_MS)
    return () => clearInterval(interval)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refetch, clusters.length])

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
