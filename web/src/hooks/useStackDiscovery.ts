/**
 * LLM-d Stack Discovery Hook
 *
 * Discovers llm-d stacks from Kubernetes clusters by finding:
 * - Pods with llm-d.ai/role labels (prefill/decode/both)
 * - InferencePool CRDs
 * - EPP and Gateway services
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { kubectlProxy } from '../lib/kubectlProxy'
import type { LLMdServer } from './useLLMd'

// Refresh interval (2 minutes)
const REFRESH_INTERVAL_MS = 120000

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

/**
 * Hook to discover llm-d stacks from clusters
 */
export function useStackDiscovery(clusters: string[] = ['pok-prod-001', 'vllm-d']) {
  const [stacks, setStacks] = useState<LLMdStack[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const initialLoadDone = useRef(false)

  const refetch = useCallback(async (silent = false) => {
    if (!silent) {
      setIsLoading(true)
      if (!initialLoadDone.current) {
        setStacks([])
      }
    }

    try {
      const discoveredStacks: LLMdStack[] = []

      for (const cluster of clusters) {
        try {
          // Fetch pods with llm-d.ai/role labels
          const podsResponse = await kubectlProxy.exec(
            ['get', 'pods', '-A', '-l', 'llm-d.ai/role', '-o', 'json'],
            { context: cluster, timeout: 30000 }
          )

          if (podsResponse.exitCode !== 0) continue

          const podsData = JSON.parse(podsResponse.output)
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

          // Fetch EPP services
          const svcResponse = await kubectlProxy.exec(
            ['get', 'services', '-A', '-o', 'json'],
            { context: cluster, timeout: 15000 }
          )
          const svcData = svcResponse.exitCode === 0 ? JSON.parse(svcResponse.output) : { items: [] }
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

          // Build stacks from namespaces
          for (const [namespace, nsPods] of podsByNamespace) {
            const prefillPods: PodResource[] = []
            const decodePods: PodResource[] = []
            const bothPods: PodResource[] = []

            for (const pod of nsPods) {
              const role = pod.metadata.labels?.['llm-d.ai/role']
              if (role === 'prefill') prefillPods.push(pod)
              else if (role === 'decode') decodePods.push(pod)
              else if (role === 'both') bothPods.push(pod)
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

            discoveredStacks.push({
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
            })
          }
        } catch (err) {
          console.error(`[useStackDiscovery] Error fetching from ${cluster}:`, err)
        }
      }

      // Sort stacks: healthy first, then by name
      discoveredStacks.sort((a, b) => {
        if (a.status === 'healthy' && b.status !== 'healthy') return -1
        if (a.status !== 'healthy' && b.status === 'healthy') return 1
        return a.name.localeCompare(b.name)
      })

      setStacks(discoveredStacks)
      setError(null)
      setLastRefresh(new Date())
      initialLoadDone.current = true
    } catch (err) {
      console.error('[useStackDiscovery] Error:', err)
      setError(err instanceof Error ? err.message : 'Failed to discover stacks')
    } finally {
      setIsLoading(false)
    }
  }, [clusters.join(',')])

  useEffect(() => {
    refetch(false)
    const interval = setInterval(() => refetch(true), REFRESH_INTERVAL_MS)
    return () => clearInterval(interval)
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
