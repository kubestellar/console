/**
 * LLM-d Stack Discovery Hook
 *
 * Discovers llm-d stacks from Kubernetes clusters by finding:
 * - Pods with llm-d.ai/role labels (prefill/decode/both)
 * - InferencePool CRDs
 * - Deployments matching LLM-d name/label/namespace patterns (broad discovery)
 * - EPP and Gateway services
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { kubectlProxy } from '../lib/kubectlProxy'
import { getDemoMode } from './useDemoMode'
import type { LLMdServer } from './useLLMd'
import { DEFAULT_REFRESH_INTERVAL_MS as REFRESH_INTERVAL_MS } from '../lib/constants'
import { KUBECTL_MEDIUM_TIMEOUT_MS, KUBECTL_EXTENDED_TIMEOUT_MS } from '../lib/constants/network'
import type {
  LLMdStackComponent,
  AutoscalerInfo,
  LLMdStack,
  PodResource,
  ServiceResource,
  InferencePoolResource,
  GatewayResource,
  DeploymentResource,
  HPAResource,
  WVAResource,
  VPAResource,
} from './useStackDiscovery.helpers'
import {
  CACHE_TTL_MS,
  safeJsonParse,
  isLlmdNamespace,
  isLlmdDeployment,
  DEPLOYMENT_BATCH_SIZE,
  sortStacks,
  buildComponentsFromDeployments,
  mergeStackWithCached,
  getStackStatus,
  loadCachedStacks,
  saveCachedStacks,
} from './useStackDiscovery.helpers'

export type {
  LLMdStackComponent,
  AutoscalerType,
  AutoscalerInfo,
  LLMdStack,
} from './useStackDiscovery.helpers'


/**
 * Hook to discover llm-d stacks from clusters
 *
 * Uses localStorage caching for instant initial display.
 */
export function useStackDiscovery(clusters: string[]) {
  // Initialize from cache for instant display (stale-while-revalidate)
  const cached = loadCachedStacks()
  const hasCachedStacks = cached !== null && cached.stacks.length > 0
  const isCacheValid = cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)

  const [stacks, setStacks] = useState<LLMdStack[]>(cached?.stacks || [])
  // Only show loading if we have NO cached data at all — stale cache is still shown
  const [isLoading, setIsLoading] = useState(!hasCachedStacks)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(cached ? new Date(cached.timestamp) : null)
  const initialLoadDone = useRef(isCacheValid || false)
  const hasStacksRef = useRef(hasCachedStacks) // Track if we have any data to show
  const isRefetching = useRef(false) // Guard against concurrent refetches
  const refetchGenRef = useRef(0) // Incremented on each new refetch to detect stale in-flight runs

  // Stable key for cluster list — avoids complex expressions in dependency arrays
  const clustersKey = (clusters || []).join(',')
  // Ref so refetch can read the latest clusters without making refetch unstable
  const clustersRef = useRef(clusters)
  clustersRef.current = clusters

  const refetch = useCallback(async (silent = false) => {
    const clusters = clustersRef.current
    // Skip fetching in demo mode — no agent available
    if (getDemoMode()) {
      setIsLoading(false)
      return
    }

    // Wait for clusters to be loaded before fetching
    if (clusters.length === 0) {
      return
    }

    // Abort any in-flight refetch and restart with the current cluster set.
    // Incrementing the generation signals the running loop to bail out.
    const gen = ++refetchGenRef.current
    isRefetching.current = true

    if (!silent) {
      // Only show loading spinner if we have no stacks at all.
      // If we have stale cached stacks, keep showing them while fetching fresh data
      // (stale-while-revalidate pattern — never wipe visible data).
      if (!hasStacksRef.current) {
        setIsLoading(true)
      } else {
        setIsRefreshing(true)
      }
    } else if (hasStacksRef.current) {
      setIsRefreshing(true)
    }

    try {
      // ── Helper: merge new stacks into state (used by both Phase 1 and Phase 2) ──
      const mergeIntoState = (cluster: string, newStacks: LLMdStack[], replace: boolean) => {
        if (newStacks.length === 0) return

        setStacks(prev => {
          if (replace) {
            // Phase 1: replace all stacks for this cluster
            const cachedById = new Map<string, LLMdStack>()
            const filtered: LLMdStack[] = []
            for (const s of (prev || [])) {
              if (s.cluster === cluster) {
                cachedById.set(s.id, s)
              } else {
                filtered.push(s)
              }
            }
            const mergedStacks = newStacks.map(freshStack => {
              const cachedStack = cachedById.get(freshStack.id)
              if (!cachedStack) return freshStack
              return mergeStackWithCached(freshStack, cachedStack)
            })
            const merged = [...filtered, ...mergedStacks]
            merged.sort(sortStacks)
            saveCachedStacks(merged)
            hasStacksRef.current = merged.length > 0
            return merged
          } else {
            // Phase 2: add stacks that don't already exist (progressive enrichment)
            const existingIds = new Set(prev.map(s => s.id))
            const trulyNew = newStacks.filter(s => !existingIds.has(s.id))
            if (trulyNew.length === 0) return prev
            const merged = [...prev, ...trulyNew]
            merged.sort(sortStacks)
            saveCachedStacks(merged)
            hasStacksRef.current = true
            return merged
          }
        })
      }

      // Progressive discovery: process clusters sequentially, update UI after each phase
      for (const cluster of (clusters || [])) {
        // Bail out if a newer refetch has started (clusters changed mid-flight)
        if (gen !== refetchGenRef.current) return
        try {
          // ════════════════════════════════════════════════════════════════
          // Phase 1: Fast discovery — labeled pods, InferencePools, and
          //          shared resources (services, gateways, autoscalers).
          //          NO bulk deployment query — that's Phase 2.
          // ════════════════════════════════════════════════════════════════
          const [podsResponse, poolsResponse, svcResponse, gwResponse, hpaResponse, wvaResponse, vpaResponse] = await Promise.all([
            kubectlProxy.exec(['get', 'pods', '-A', '-l', 'llm-d.ai/role', '-o', 'json'], { context: cluster, timeout: KUBECTL_EXTENDED_TIMEOUT_MS }),
            kubectlProxy.exec(['get', 'inferencepools', '-A', '-o', 'json'], { context: cluster, timeout: KUBECTL_EXTENDED_TIMEOUT_MS }),
            kubectlProxy.exec(['get', 'services', '-A', '-o', 'json'], { context: cluster, timeout: KUBECTL_EXTENDED_TIMEOUT_MS }),
            kubectlProxy.exec(['get', 'gateway', '-A', '-o', 'json'], { context: cluster, timeout: KUBECTL_EXTENDED_TIMEOUT_MS }),
            kubectlProxy.exec(['get', 'hpa', '-A', '-o', 'json'], { context: cluster, timeout: KUBECTL_EXTENDED_TIMEOUT_MS }),
            kubectlProxy.exec(['get', 'variantautoscalings', '-A', '-o', 'json'], { context: cluster, timeout: KUBECTL_EXTENDED_TIMEOUT_MS }),
            kubectlProxy.exec(['get', 'vpa', '-A', '-o', 'json'], { context: cluster, timeout: KUBECTL_EXTENDED_TIMEOUT_MS }),
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
          const podsData = podsResponse.exitCode === 0 ? safeJsonParse<{ items: PodResource[] }>(podsResponse.output, { items: [] }, `${cluster} pods`) : { items: [] }
          const pods = (podsData.items || []) as PodResource[]
          const podsByNamespace = new Map<string, PodResource[]>()
          for (const pod of (pods || [])) {
            const ns = pod.metadata.namespace
            if (!podsByNamespace.has(ns)) podsByNamespace.set(ns, [])
            podsByNamespace.get(ns)!.push(pod)
          }

          // Parse InferencePools
          const poolsData = poolsResponse.exitCode === 0 ? safeJsonParse<{ items: InferencePoolResource[] }>(poolsResponse.output, { items: [] }, `${cluster} inferencepools`) : { items: [] }
          const pools = (poolsData.items || []) as InferencePoolResource[]
          const poolsByNamespace = new Map(pools.map(p => [p.metadata.namespace, p]))

          // Parse services for EPP
          const svcData = svcResponse.exitCode === 0
            ? safeJsonParse<{ items: ServiceResource[] }>(svcResponse.output, { items: [] }, `${cluster} services`)
            : { items: [] as ServiceResource[] }
          const services = (svcData.items || []) as ServiceResource[]
          const eppByNamespace = new Map<string, ServiceResource>()
          for (const svc of (services || [])) {
            if (svc.metadata.name.includes('-epp') || svc.metadata.name.endsWith('epp')) {
              eppByNamespace.set(svc.metadata.namespace, svc)
            }
          }

          // Parse Gateways
          const gwData = gwResponse.exitCode === 0 ? safeJsonParse<{ items: GatewayResource[] }>(gwResponse.output, { items: [] }, `${cluster} gateways`) : { items: [] }
          const gateways = (gwData.items || []) as GatewayResource[]
          const gatewayByNamespace = new Map(gateways.map(g => [g.metadata.namespace, g]))

          // Parse HPAs
          const hpaData = hpaResponse.exitCode === 0 ? safeJsonParse<{ items: HPAResource[] }>(hpaResponse.output, { items: [] }, `${cluster} HPAs`) : { items: [] }
          const hpas = (hpaData.items || []) as HPAResource[]
          const hpaByNamespace = new Map<string, HPAResource>()
          for (const hpa of (hpas || [])) {
            if (!hpaByNamespace.has(hpa.metadata.namespace)) hpaByNamespace.set(hpa.metadata.namespace, hpa)
          }

          // Parse WVA (VariantAutoscaling)
          const wvaData = wvaResponse.exitCode === 0 ? safeJsonParse<{ items: WVAResource[] }>(wvaResponse.output, { items: [] }, `${cluster} variantautoscalings`) : { items: [] }
          const wvas = (wvaData.items || []) as WVAResource[]
          const wvaByNamespace = new Map<string, WVAResource>()
          const wvaByTargetNamespace = new Map<string, WVAResource>()
          for (const wva of (wvas || [])) {
            wvaByNamespace.set(wva.metadata.namespace, wva)
            const targetNs = wva.spec?.scaleTargetRef?.namespace
            if (targetNs && targetNs !== wva.metadata.namespace) {
              wvaByTargetNamespace.set(targetNs, wva)
            }
          }

          // Parse VPA
          const vpaData = vpaResponse.exitCode === 0 ? safeJsonParse<{ items: VPAResource[] }>(vpaResponse.output, { items: [] }, `${cluster} VPAs`) : { items: [] }
          const vpas = (vpaData.items || []) as VPAResource[]
          const vpaByNamespace = new Map<string, VPAResource>()
          for (const vpa of (vpas || [])) { vpaByNamespace.set(vpa.metadata.namespace, vpa) }

          // ── Helper: detect autoscaler for a namespace ──
          const detectAutoscaler = (namespace: string): AutoscalerInfo | undefined => {
            const wva = wvaByNamespace.get(namespace) || wvaByTargetNamespace.get(namespace)
            const hpa = hpaByNamespace.get(namespace)
            const vpa = vpaByNamespace.get(namespace)
            if (wva) {
              return {
                type: 'WVA', name: wva.metadata.name,
                minReplicas: wva.spec?.minReplicas, maxReplicas: wva.spec?.maxReplicas,
                currentReplicas: wva.status?.currentReplicas,
                desiredReplicas: wva.status?.desiredOptimizedAlloc?.numReplicas ?? wva.status?.desiredReplicas }
            }
            if (hpa) {
              return {
                type: 'HPA', name: hpa.metadata.name,
                minReplicas: hpa.spec?.minReplicas, maxReplicas: hpa.spec?.maxReplicas,
                currentReplicas: hpa.status?.currentReplicas, desiredReplicas: hpa.status?.desiredReplicas }
            }
            if (vpa) return { type: 'VPA', name: vpa.metadata.name }
            return undefined
          }

          // ── Helper: build EPP and Gateway components for a namespace ──
          const buildInfraComponents = (namespace: string, eppOverride: LLMdStackComponent | null = null) => {
            const eppService = eppByNamespace.get(namespace)
            const eppComponent: LLMdStackComponent | null = eppOverride || (eppService ? {
              name: eppService.metadata.name, namespace, cluster, type: 'epp',
              status: 'running', replicas: 1, readyReplicas: 1 } : null)
            const gw = gatewayByNamespace.get(namespace)
            const gatewayComponent: LLMdStackComponent | null = gw ? {
              name: gw.metadata.name, namespace, cluster, type: 'gateway',
              status: gw.status?.addresses?.length ? 'running' : 'pending',
              replicas: 1, readyReplicas: gw.status?.addresses?.length ? 1 : 0 } : null
            return { epp: eppComponent, gateway: gatewayComponent }
          }

          // Collect Phase 1 namespaces from labeled pods and InferencePools
          const phase1Namespaces = new Set<string>([
            ...podsByNamespace.keys(),
            ...poolsByNamespace.keys(),
          ])

          // Build Phase 1 stacks from labeled pods
          const phase1Stacks: LLMdStack[] = []
          for (const namespace of (phase1Namespaces || [])) {
            const nsPods = podsByNamespace.get(namespace) || []
            const prefillPods: PodResource[] = []
            const decodePods: PodResource[] = []
            const bothPods: PodResource[] = []

            for (const pod of (nsPods || [])) {
              const role = pod.metadata.labels?.['llm-d.ai/role']?.toLowerCase()
              const podName = pod.metadata.name.toLowerCase()
              if (role === 'prefill' || role === 'prefill-server') prefillPods.push(pod)
              else if (role === 'decode' || role === 'decode-server') decodePods.push(pod)
              else if (role === 'both' || role === 'unified' || role === 'model' || role === 'server' || role === 'vllm') bothPods.push(pod)
              else if (podName.includes('prefill')) prefillPods.push(pod)
              else if (podName.includes('decode')) decodePods.push(pod)
              else bothPods.push(pod)
            }

            const model = nsPods[0]?.metadata.labels?.['llm-d.ai/model']

            // Build components from pods grouped by deployment (pod-template-hash)
            const buildFromPods = (pods: PodResource[], type: LLMdStackComponent['type']): LLMdStackComponent[] => {
              if (pods.length === 0) return []
              const byHash = new Map<string, PodResource[]>()
              for (const pod of (pods || [])) {
                const hash = pod.metadata.labels?.['pod-template-hash'] || 'default'
                if (!byHash.has(hash)) byHash.set(hash, [])
                byHash.get(hash)!.push(pod)
              }
              return Array.from(byHash.values()).map(group => {
                const ready = group.filter(p =>
                  p.status.phase === 'Running' && p.status.containerStatuses?.every(c => c.ready)
                ).length
                return {
                  name: group[0].metadata.name.replace(/-[a-z0-9]+$/, ''),
                  namespace, cluster, type,
                  status: ready === group.length ? 'running' : ready > 0 ? 'running' : 'error',
                  replicas: group.length, readyReplicas: ready, model,
                  podNames: group.map(p => p.metadata.name) }
              })
            }

            const prefillComponents = buildFromPods(prefillPods, 'prefill')
            const decodeComponents = buildFromPods(decodePods, 'decode')
            const bothComponents = buildFromPods(bothPods, 'both')
            const { epp, gateway } = buildInfraComponents(namespace)
            const components = { prefill: prefillComponents, decode: decodeComponents, both: bothComponents, epp, gateway }

            const pool = poolsByNamespace.get(namespace)
            const totalReplicas = [...prefillComponents, ...decodeComponents, ...bothComponents].reduce((s, c) => s + c.replicas, 0)
            const readyReplicas = [...prefillComponents, ...decodeComponents, ...bothComponents].reduce((s, c) => s + c.readyReplicas, 0)

            phase1Stacks.push({
              id: `${namespace}@${cluster}`, name: pool?.metadata.name || namespace,
              namespace, cluster, inferencePool: pool?.metadata.name,
              components, status: getStackStatus(components),
              hasDisaggregation: prefillComponents.length > 0 && decodeComponents.length > 0,
              model, totalReplicas, readyReplicas, autoscaler: detectAutoscaler(namespace) })
          }

          // ── Phase 1 UI update: show pod/pool stacks immediately ──
          mergeIntoState(cluster, phase1Stacks, true)

          // ════════════════════════════════════════════════════════════════
          // Phase 2: Progressive deployment discovery — query candidate
          //          namespaces one batch at a time, adding new stacks as
          //          they're found. This avoids the 4+ MB bulk query.
          // ════════════════════════════════════════════════════════════════

          // Get all namespaces in the cluster (lightweight query)
          const nsResponse = await kubectlProxy.exec(
            ['get', 'namespaces', '-o', 'jsonpath={.items[*].metadata.name}'],
            { context: cluster, timeout: KUBECTL_MEDIUM_TIMEOUT_MS },
          )
          const allClusterNamespaces = nsResponse.exitCode === 0
            ? nsResponse.output.split(/\s+/).filter(Boolean)
            : []

          // Filter to candidate namespaces not already discovered in Phase 1
          const candidateNamespaces = allClusterNamespaces
            .filter(isLlmdNamespace)
            .filter(ns => !phase1Namespaces.has(ns))

          // Query deployments per namespace in small batches
          for (let i = 0; i < candidateNamespaces.length; i += DEPLOYMENT_BATCH_SIZE) {
            const batch = candidateNamespaces.slice(i, i + DEPLOYMENT_BATCH_SIZE)
            const batchResults = await Promise.all(
              batch.map(ns =>
                kubectlProxy.exec(['get', 'deployments', '-n', ns, '-o', 'json'], { context: cluster, timeout: KUBECTL_MEDIUM_TIMEOUT_MS })
              ),
            )

            const batchStacks: LLMdStack[] = []
            for (let j = 0; j < batch.length; j++) {
              const ns = batch[j]
              const depResponse = batchResults[j]
              if (depResponse.exitCode !== 0) continue

              let depsData: { items?: DeploymentResource[] }
              try { depsData = JSON.parse(depResponse.output) } catch { continue }
              const deps = (depsData.items || []) as DeploymentResource[]
              const llmdDeps = deps.filter(isLlmdDeployment)
              if (llmdDeps.length === 0) continue

              // Build stack from deployments
              const { prefill, decode, both, epp: depEpp, model } = buildComponentsFromDeployments(llmdDeps, ns, cluster)
              const { epp, gateway } = buildInfraComponents(ns, depEpp)
              const components = { prefill, decode, both, epp, gateway }
              const pool = poolsByNamespace.get(ns)
              const totalReplicas = [...prefill, ...decode, ...both].reduce((s, c) => s + c.replicas, 0)
              const readyReplicas = [...prefill, ...decode, ...both].reduce((s, c) => s + c.readyReplicas, 0)

              batchStacks.push({
                id: `${ns}@${cluster}`, name: pool?.metadata.name || ns,
                namespace: ns, cluster, inferencePool: pool?.metadata.name,
                components, status: getStackStatus(components),
                hasDisaggregation: prefill.length > 0 && decode.length > 0,
                model, totalReplicas, readyReplicas, autoscaler: detectAutoscaler(ns) })
            }

            // Progressive UI update after each batch
            mergeIntoState(cluster, batchStacks, false)
          }

        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err)
          if (!errMsg.includes('demo mode') && !errMsg.includes('timed out')) {
            console.error(`[useStackDiscovery] Error fetching from ${cluster}:`, err)
          }
        }
      }

      // Only commit final state if no newer refetch has superseded this one
      if (gen !== refetchGenRef.current) return
      setError(null)
      setLastRefresh(new Date())
      initialLoadDone.current = true
    } catch (err: unknown) {
      // Suppress demo mode errors
      const errMsg = err instanceof Error ? err.message : String(err)
      if (!errMsg.includes('demo mode')) {
        console.error('[useStackDiscovery] Error:', err)
      }
      setError(err instanceof Error ? err.message : 'Failed to discover stacks')
    } finally {
      // Only clear flags if we're still the current run
      if (gen === refetchGenRef.current) {
        setIsLoading(false)
        setIsRefreshing(false)
        isRefetching.current = false
      }
    }
  }, [clustersKey])

  useEffect(() => {
    // Wait for clusters to be available
    if (clustersRef.current.length === 0) {
      return
    }
    // If we have any cached stacks (even stale), do a silent background refresh
    // to avoid wiping visible data. Only show loading if we have nothing to show.
    refetch(hasCachedStacks || Boolean(isCacheValid))
    const interval = setInterval(() => refetch(true), REFRESH_INTERVAL_MS)
    return () => clearInterval(interval)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refetch])

  return {
    stacks,
    isLoading,
    isRefreshing,
    error,
    refetch: () => refetch(false),
    lastRefresh }
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
      readyReplicas: comp.readyReplicas })
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
      readyReplicas: comp.readyReplicas })
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
      readyReplicas: comp.readyReplicas })
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
      readyReplicas: stack.components.epp.status === 'running' ? 1 : 0 })
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
      gatewayType: 'istio' })
  }

  return servers
}
