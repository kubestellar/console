import { useState, useCallback } from 'react'
import { isAgentUnavailable } from './useLocalAgent'
import { clusterCacheRef } from './mcp/shared'

const AGENT_URL = 'http://127.0.0.1:8585'

export interface ResolvedDependency {
  kind: string
  name: string
  namespace: string
  optional: boolean
  order: number
}

export interface DependencyResolution {
  workload: string
  kind: string
  namespace: string
  cluster: string
  dependencies: ResolvedDependency[]
  warnings: string[]
}

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

/** Fetch a JSON endpoint from the local agent with timeout. */
async function agentFetch(path: string, timeout = 15000): Promise<Record<string, unknown>> {
  const ctrl = new AbortController()
  const tid = setTimeout(() => ctrl.abort(), timeout)
  try {
    const res = await fetch(`${AGENT_URL}${path}`, {
      signal: ctrl.signal,
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) throw new Error(`Agent ${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(tid)
  }
}

/**
 * Resolve dependencies via the local agent by scanning namespace resources.
 * This is a fallback when the backend REST API is unavailable.
 */
async function resolveViaAgent(
  cluster: string,
  namespace: string,
  name: string,
): Promise<DependencyResolution | null> {
  if (isAgentUnavailable()) return null

  // Map display cluster name to kubectl context
  const clusterEntry = clusterCacheRef.clusters.find(
    c => c.name === cluster && c.reachable !== false,
  )
  const context = clusterEntry?.context || cluster

  const params = `cluster=${encodeURIComponent(context)}&namespace=${encodeURIComponent(namespace)}`

  // Fetch namespace resources in parallel
  const [configmaps, secrets, serviceaccounts, services, pvcs, hpas] = await Promise.allSettled([
    agentFetch(`/configmaps?${params}`),
    agentFetch(`/secrets?${params}`),
    agentFetch(`/serviceaccounts?${params}`),
    agentFetch(`/services?${params}`),
    agentFetch(`/pvcs?${params}`),
    agentFetch(`/hpas?${params}`),
  ])

  const deps: ResolvedDependency[] = []
  let order = 0

  // Extract resources from agent responses
  const extract = (result: PromiseSettledResult<Record<string, unknown>>, key: string, kind: string) => {
    if (result.status !== 'fulfilled') return
    const items = result.value[key] as Array<{ name: string; namespace?: string }> | null
    if (!items) return
    for (const item of items) {
      // Skip system resources
      if (item.name.startsWith('kube-') && kind !== 'Service') continue
      if (kind === 'ServiceAccount' && item.name === 'default') continue
      deps.push({
        kind,
        name: item.name,
        namespace: item.namespace || namespace,
        optional: false,
        order: order++,
      })
    }
  }

  extract(configmaps, 'configmaps', 'ConfigMap')
  extract(secrets, 'secrets', 'Secret')
  extract(serviceaccounts, 'serviceaccounts', 'ServiceAccount')
  extract(services, 'services', 'Service')
  extract(pvcs, 'pvcs', 'PersistentVolumeClaim')
  extract(hpas, 'hpas', 'HorizontalPodAutoscaler')

  return {
    workload: name,
    kind: 'Deployment',
    namespace,
    cluster,
    dependencies: deps,
    warnings: deps.length > 0
      ? ['Showing all namespace resources (exact dependency tracing requires backend)']
      : [],
  }
}

/**
 * Hook to resolve dependencies for a workload (dry-run).
 * Used by the pre-deploy confirmation dialog and the Resource Marshall card.
 */
export function useResolveDependencies() {
  const [data, setData] = useState<DependencyResolution | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const resolve = useCallback(async (
    cluster: string,
    namespace: string,
    name: string,
  ): Promise<DependencyResolution | null> => {
    setIsLoading(true)
    setError(null)
    setData(null)

    try {
      // Try backend REST API first (works when JWT auth is available)
      try {
        const res = await fetch(
          `/api/workloads/resolve-deps/${encodeURIComponent(cluster)}/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`,
          { headers: authHeaders() },
        )
        if (!res.ok) {
          throw new Error(`REST ${res.status}`)
        }
        const result: DependencyResolution = await res.json()
        setData(result)
        return result
      } catch {
        // REST API failed, try agent fallback
      }

      // Fall back to agent-based namespace resource scan
      try {
        const agentResult = await resolveViaAgent(cluster, namespace, name)
        if (agentResult) {
          setData(agentResult)
          return agentResult
        }
      } catch {
        // Agent also failed
      }

      setError(new Error('No data source available for dependency resolution'))
      return null
    } finally {
      setIsLoading(false)
    }
  }, [])

  const reset = useCallback(() => {
    setData(null)
    setError(null)
    setIsLoading(false)
  }, [])

  return { data, isLoading, error, resolve, reset }
}
