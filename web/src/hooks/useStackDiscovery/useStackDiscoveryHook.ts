import { useCallback, useEffect, useRef, useState } from 'react'
import { DEFAULT_REFRESH_INTERVAL_MS as REFRESH_INTERVAL_MS } from '../../lib/constants'
import { KUBECTL_EXTENDED_TIMEOUT_MS, KUBECTL_MEDIUM_TIMEOUT_MS } from '../../lib/constants/network'
import { kubectlProxy } from '../../lib/kubectlProxy'
import { getDemoMode } from '../useDemoMode'
import type { AutoscalerInfo, GatewayResource, HPAResource, InferencePoolResource, LLMdStack, LLMdStackComponent, PodResource, ServiceResource, StackDiscoveryResult, VPAResource, WVAResource } from './types'
import { DEPLOYMENT_BATCH_SIZE, buildComponentsFromDeployments, getStackStatus, isLlmdDeployment, isLlmdNamespace, loadCachedStacks, mergeStackWithCached, safeJsonParse, saveCachedStacks, sortStacks } from './utils'

export function useStackDiscovery(clusters: string[]): StackDiscoveryResult {
  const cached = loadCachedStacks()
  const hasCachedStacks = cached !== null && cached.stacks.length > 0
  const isCacheValid = cached && (Date.now() - cached.timestamp < 5 * 60_000)
  const [stacks, setStacks] = useState<LLMdStack[]>(cached?.stacks || [])
  const [isLoading, setIsLoading] = useState(!hasCachedStacks)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(cached ? new Date(cached.timestamp) : null)
  const hasStacksRef = useRef(hasCachedStacks)
  const refetchGenRef = useRef(0)
  const clustersKey = (clusters || []).join(',')
  const clustersRef = useRef(clusters)
  clustersRef.current = clusters

  const refetch = useCallback(async (silent = false) => {
    const activeClusters = clustersRef.current
    if (getDemoMode()) {
      setIsLoading(false)
      return
    }
    if (activeClusters.length === 0) return

    const generation = ++refetchGenRef.current
    if (!silent) {
      if (!hasStacksRef.current) setIsLoading(true)
      else setIsRefreshing(true)
    } else if (hasStacksRef.current) {
      setIsRefreshing(true)
    }

    try {
      const mergeIntoState = (cluster: string, newStacks: LLMdStack[], replace: boolean) => {
        if (newStacks.length === 0) return
        setStacks(prev => {
          if (replace) {
            const cachedById = new Map<string, LLMdStack>()
            const filtered: LLMdStack[] = []
            for (const stack of prev) {
              if (stack.cluster === cluster) cachedById.set(stack.id, stack)
              else filtered.push(stack)
            }
            const merged = [...filtered, ...newStacks.map(stack => {
              const cachedStack = cachedById.get(stack.id)
              return cachedStack ? mergeStackWithCached(stack, cachedStack) : stack
            })]
            merged.sort(sortStacks)
            saveCachedStacks(merged)
            hasStacksRef.current = merged.length > 0
            return merged
          }
          const existingIds = new Set(prev.map(stack => stack.id))
          const trulyNew = newStacks.filter(stack => !existingIds.has(stack.id))
          if (trulyNew.length === 0) return prev
          const merged = [...prev, ...trulyNew].sort(sortStacks)
          saveCachedStacks(merged)
          hasStacksRef.current = true
          return merged
        })
      }

      for (const cluster of (activeClusters || [])) {
        if (generation !== refetchGenRef.current) return
        try {
          const [podsResponse, poolsResponse, svcResponse, gwResponse, hpaResponse, wvaResponse, vpaResponse] = await Promise.all([
            kubectlProxy.exec(['get', 'pods', '-A', '-l', 'llm-d.ai/role', '-o', 'json'], { context: cluster, timeout: KUBECTL_EXTENDED_TIMEOUT_MS }),
            kubectlProxy.exec(['get', 'inferencepools', '-A', '-o', 'json'], { context: cluster, timeout: KUBECTL_EXTENDED_TIMEOUT_MS }),
            kubectlProxy.exec(['get', 'services', '-A', '-o', 'json'], { context: cluster, timeout: KUBECTL_EXTENDED_TIMEOUT_MS }),
            kubectlProxy.exec(['get', 'gateway', '-A', '-o', 'json'], { context: cluster, timeout: KUBECTL_EXTENDED_TIMEOUT_MS }),
            kubectlProxy.exec(['get', 'hpa', '-A', '-o', 'json'], { context: cluster, timeout: KUBECTL_EXTENDED_TIMEOUT_MS }),
            kubectlProxy.exec(['get', 'variantautoscalings', '-A', '-o', 'json'], { context: cluster, timeout: KUBECTL_EXTENDED_TIMEOUT_MS }),
            kubectlProxy.exec(['get', 'vpa', '-A', '-o', 'json'], { context: cluster, timeout: KUBECTL_EXTENDED_TIMEOUT_MS }),
          ])

          if (podsResponse.exitCode !== 0 && ['Unable to connect', 'connection refused', 'timeout', 'no such host', 'context deadline exceeded'].some(message => podsResponse.output.includes(message))) {
            continue
          }

          const pods = safeJsonParse<{ items: PodResource[] }>(podsResponse.exitCode === 0 ? podsResponse.output : '{"items":[]}', { items: [] }, `${cluster} pods`).items || []
          const podsByNamespace = new Map<string, PodResource[]>()
          for (const pod of pods) {
            const namespace = pod.metadata.namespace
            if (!podsByNamespace.has(namespace)) podsByNamespace.set(namespace, [])
            podsByNamespace.get(namespace)!.push(pod)
          }

          const pools = safeJsonParse<{ items: InferencePoolResource[] }>(poolsResponse.exitCode === 0 ? poolsResponse.output : '{"items":[]}', { items: [] }, `${cluster} inferencepools`).items || []
          const poolsByNamespace = new Map(pools.map(pool => [pool.metadata.namespace, pool]))
          const services = safeJsonParse<{ items: ServiceResource[] }>(svcResponse.exitCode === 0 ? svcResponse.output : '{"items":[]}', { items: [] }, `${cluster} services`).items || []
          const gateways = safeJsonParse<{ items: GatewayResource[] }>(gwResponse.exitCode === 0 ? gwResponse.output : '{"items":[]}', { items: [] }, `${cluster} gateways`).items || []
          const hpas = safeJsonParse<{ items: HPAResource[] }>(hpaResponse.exitCode === 0 ? hpaResponse.output : '{"items":[]}', { items: [] }, `${cluster} HPAs`).items || []
          const wvas = safeJsonParse<{ items: WVAResource[] }>(wvaResponse.exitCode === 0 ? wvaResponse.output : '{"items":[]}', { items: [] }, `${cluster} variantautoscalings`).items || []
          const vpas = safeJsonParse<{ items: VPAResource[] }>(vpaResponse.exitCode === 0 ? vpaResponse.output : '{"items":[]}', { items: [] }, `${cluster} VPAs`).items || []

          const eppByNamespace = new Map(services.filter(service => service.metadata.name.includes('-epp') || service.metadata.name.endsWith('epp')).map(service => [service.metadata.namespace, service]))
          const gatewayByNamespace = new Map(gateways.map(gateway => [gateway.metadata.namespace, gateway]))
          const hpaByNamespace = new Map(hpas.map(item => [item.metadata.namespace, item]))
          const wvaByNamespace = new Map(wvas.map(item => [item.metadata.namespace, item]))
          const wvaByTargetNamespace = new Map(wvas.flatMap(item => item.spec?.scaleTargetRef?.namespace && item.spec.scaleTargetRef.namespace !== item.metadata.namespace ? [[item.spec.scaleTargetRef.namespace, item] as const] : []))
          const vpaByNamespace = new Map(vpas.map(item => [item.metadata.namespace, item]))

          const detectAutoscaler = (namespace: string): AutoscalerInfo | undefined => {
            const wva = wvaByNamespace.get(namespace) || wvaByTargetNamespace.get(namespace)
            const hpa = hpaByNamespace.get(namespace)
            const vpa = vpaByNamespace.get(namespace)
            if (wva) return { type: 'WVA', name: wva.metadata.name, minReplicas: wva.spec?.minReplicas, maxReplicas: wva.spec?.maxReplicas, currentReplicas: wva.status?.currentReplicas, desiredReplicas: wva.status?.desiredOptimizedAlloc?.numReplicas ?? wva.status?.desiredReplicas }
            if (hpa) return { type: 'HPA', name: hpa.metadata.name, minReplicas: hpa.spec?.minReplicas, maxReplicas: hpa.spec?.maxReplicas, currentReplicas: hpa.status?.currentReplicas, desiredReplicas: hpa.status?.desiredReplicas }
            if (vpa) return { type: 'VPA', name: vpa.metadata.name }
            return undefined
          }

          const buildInfraComponents = (namespace: string, eppOverride: LLMdStackComponent | null = null) => {
            const eppService = eppByNamespace.get(namespace)
            const epp = eppOverride || (eppService ? { name: eppService.metadata.name, namespace, cluster, type: 'epp', status: 'running', replicas: 1, readyReplicas: 1 } : null)
            const gateway = gatewayByNamespace.get(namespace)
            return {
              epp,
              gateway: gateway ? { name: gateway.metadata.name, namespace, cluster, type: 'gateway', status: gateway.status?.addresses?.length ? 'running' : 'pending', replicas: 1, readyReplicas: gateway.status?.addresses?.length ? 1 : 0 } : null,
            }
          }

          const phase1Namespaces = new Set<string>([...podsByNamespace.keys(), ...poolsByNamespace.keys()])
          const phase1Stacks: LLMdStack[] = []
          for (const namespace of phase1Namespaces) {
            const namespacePods = podsByNamespace.get(namespace) || []
            const prefillPods: PodResource[] = []
            const decodePods: PodResource[] = []
            const bothPods: PodResource[] = []
            for (const pod of namespacePods) {
              const role = pod.metadata.labels?.['llm-d.ai/role']?.toLowerCase()
              const podName = pod.metadata.name.toLowerCase()
              if (role === 'prefill' || role === 'prefill-server') prefillPods.push(pod)
              else if (role === 'decode' || role === 'decode-server') decodePods.push(pod)
              else if (role === 'both' || role === 'unified' || role === 'model' || role === 'server' || role === 'vllm') bothPods.push(pod)
              else if (podName.includes('prefill')) prefillPods.push(pod)
              else if (podName.includes('decode')) decodePods.push(pod)
              else bothPods.push(pod)
            }
            const model = namespacePods[0]?.metadata.labels?.['llm-d.ai/model']
            const buildFromPods = (pods: PodResource[], type: LLMdStackComponent['type']): LLMdStackComponent[] => {
              if (pods.length === 0) return []
              const byHash = new Map<string, PodResource[]>()
              for (const pod of pods) {
                const hash = pod.metadata.labels?.['pod-template-hash'] || 'default'
                if (!byHash.has(hash)) byHash.set(hash, [])
                byHash.get(hash)!.push(pod)
              }
              return Array.from(byHash.values()).map(group => ({
                name: group[0].metadata.name.replace(/-[a-z0-9]+$/, ''),
                namespace,
                cluster,
                type,
                status: group.filter(item => item.status.phase === 'Running' && item.status.containerStatuses?.every(container => container.ready)).length === group.length ? 'running' : group.some(item => item.status.phase === 'Running') ? 'running' : 'error',
                replicas: group.length,
                readyReplicas: group.filter(item => item.status.phase === 'Running' && item.status.containerStatuses?.every(container => container.ready)).length,
                model,
                podNames: group.map(item => item.metadata.name),
              }))
            }
            const prefill = buildFromPods(prefillPods, 'prefill')
            const decode = buildFromPods(decodePods, 'decode')
            const both = buildFromPods(bothPods, 'both')
            const components = { ...buildInfraComponents(namespace), prefill, decode, both }
            const pool = poolsByNamespace.get(namespace)
            const allServing = [...prefill, ...decode, ...both]
            phase1Stacks.push({ id: `${namespace}@${cluster}`, name: pool?.metadata.name || namespace, namespace, cluster, inferencePool: pool?.metadata.name, components, status: getStackStatus(components), hasDisaggregation: prefill.length > 0 && decode.length > 0, model, totalReplicas: allServing.reduce((sum, item) => sum + item.replicas, 0), readyReplicas: allServing.reduce((sum, item) => sum + item.readyReplicas, 0), autoscaler: detectAutoscaler(namespace) })
          }
          mergeIntoState(cluster, phase1Stacks, true)

          const nsResponse = await kubectlProxy.exec(['get', 'namespaces', '-o', 'jsonpath={.items[*].metadata.name}'], { context: cluster, timeout: KUBECTL_MEDIUM_TIMEOUT_MS })
          const candidateNamespaces = (nsResponse.exitCode === 0 ? nsResponse.output.split(/\s+/).filter(Boolean) : []).filter(isLlmdNamespace).filter(namespace => !phase1Namespaces.has(namespace))

          for (let index = 0; index < candidateNamespaces.length; index += DEPLOYMENT_BATCH_SIZE) {
            const batch = candidateNamespaces.slice(index, index + DEPLOYMENT_BATCH_SIZE)
            const batchResults = await Promise.all(batch.map(namespace => kubectlProxy.exec(['get', 'deployments', '-n', namespace, '-o', 'json'], { context: cluster, timeout: KUBECTL_MEDIUM_TIMEOUT_MS })))
            const batchStacks: LLMdStack[] = []
            for (let batchIndex = 0; batchIndex < batch.length; batchIndex += 1) {
              const namespace = batch[batchIndex]
              const response = batchResults[batchIndex]
              if (response.exitCode !== 0) continue
              let deploymentsData: { items?: any[] }
              try {
                deploymentsData = JSON.parse(response.output)
              } catch {
                continue
              }
              const deployments = (deploymentsData.items || []).filter(isLlmdDeployment)
              if (deployments.length === 0) continue
              const built = buildComponentsFromDeployments(deployments, namespace, cluster)
              const components = { ...buildInfraComponents(namespace, built.epp), prefill: built.prefill, decode: built.decode, both: built.both }
              const pool = poolsByNamespace.get(namespace)
              const allServing = [...built.prefill, ...built.decode, ...built.both]
              batchStacks.push({ id: `${namespace}@${cluster}`, name: pool?.metadata.name || namespace, namespace, cluster, inferencePool: pool?.metadata.name, components, status: getStackStatus(components), hasDisaggregation: built.prefill.length > 0 && built.decode.length > 0, model: built.model, totalReplicas: allServing.reduce((sum, item) => sum + item.replicas, 0), readyReplicas: allServing.reduce((sum, item) => sum + item.readyReplicas, 0), autoscaler: detectAutoscaler(namespace) })
            }
            mergeIntoState(cluster, batchStacks, false)
          }
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err)
          if (!message.includes('demo mode') && !message.includes('timed out')) {
            console.error(`[useStackDiscovery] Error fetching from ${cluster}:`, err)
          }
        }
      }

      if (generation !== refetchGenRef.current) return
      setError(null)
      setLastRefresh(new Date())
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      if (!message.includes('demo mode')) {
        console.error('[useStackDiscovery] Error:', err)
      }
      setError(err instanceof Error ? err.message : 'Failed to discover stacks')
    } finally {
      if (generation === refetchGenRef.current) {
        setIsLoading(false)
        setIsRefreshing(false)
      }
    }
  }, [clustersKey])

  useEffect(() => {
    if (clustersRef.current.length === 0) return undefined
    refetch(hasCachedStacks || Boolean(isCacheValid))
    const interval = setInterval(() => refetch(true), REFRESH_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [refetch])

  return { stacks, isLoading, isRefreshing, error, refetch: () => refetch(false), lastRefresh }
}
