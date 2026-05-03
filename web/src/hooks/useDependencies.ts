import { useState } from 'react'
import { isAgentUnavailable } from './useLocalAgent'
import { clusterCacheRef, agentFetch } from './mcp/shared'
import { isDemoMode } from '../lib/demoMode'
import { LOCAL_AGENT_HTTP_URL, STORAGE_KEY_TOKEN } from '../lib/constants'
import { MCP_HOOK_TIMEOUT_MS } from '../lib/constants/network'

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
  const token = localStorage.getItem(STORAGE_KEY_TOKEN)
  return token ? { Authorization: `Bearer ${token}` } : {}
}

/** Fetch a JSON endpoint from the local agent with timeout. */
async function agentRequest(path: string, timeout = MCP_HOOK_TIMEOUT_MS): Promise<Record<string, unknown>> {
  const ctrl = new AbortController()
  const tid = setTimeout(() => ctrl.abort(), timeout)
  try {
    const res = await agentFetch(`${LOCAL_AGENT_HTTP_URL}${path}`, {
      signal: ctrl.signal,
      headers: { Accept: 'application/json' } })
    if (!res.ok) throw new Error(`Agent ${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(tid)
  }
}

/**
 * Resolve dependencies via the local agent's /resolve-deps endpoint.
 * This dynamically traces the workload's pod spec to find actual referenced
 * resources (ConfigMaps, Secrets, SAs, RBAC, PVCs, Services, Ingresses,
 * NetworkPolicies, PDBs, HPAs, CRDs, Webhooks).
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

  const params = `cluster=${encodeURIComponent(context)}&namespace=${encodeURIComponent(namespace)}&name=${encodeURIComponent(name)}`
  // Dependency resolution can be slow — give it 30s
  const result = await agentRequest(`/resolve-deps?${params}`, 30_000)

  if (result.error) {
    throw new Error(result.error as string)
  }

  return {
    workload: result.workload as string || name,
    kind: result.kind as string || 'Deployment',
    namespace: result.namespace as string || namespace,
    cluster: result.cluster as string || cluster,
    dependencies: (result.dependencies as ResolvedDependency[]) || [],
    warnings: (result.warnings as string[]) || [] }
}

/**
 * Hook to resolve dependencies for a workload (dry-run).
 * Used by the pre-deploy confirmation dialog and the Resource Marshall card.
 */
export function useResolveDependencies() {
  const [data, setData] = useState<DependencyResolution | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [progressMessage, setProgressMessage] = useState<string>('')

  const resolve = async (
    cluster: string,
    namespace: string,
    name: string,
  ): Promise<DependencyResolution | null> => {
    setIsLoading(true)
    setError(null)
    setProgressMessage('Connecting to cluster…')

    // Demo mode returns synthetic dependency data
    if (isDemoMode()) {
      const demoResult: DependencyResolution = {
        workload: name,
        kind: 'Deployment',
        namespace,
        cluster,
        dependencies: [
          { kind: 'ConfigMap', name: `${name}-config`, namespace, optional: false, order: 0 },
          { kind: 'Secret', name: `${name}-secrets`, namespace, optional: false, order: 1 },
          { kind: 'ServiceAccount', name: `${name}-sa`, namespace, optional: false, order: 2 },
          { kind: 'Service', name: name, namespace, optional: false, order: 3 },
          { kind: 'HorizontalPodAutoscaler', name: `${name}-hpa`, namespace, optional: true, order: 4 },
          { kind: 'PersistentVolumeClaim', name: `${name}-data`, namespace, optional: true, order: 5 },
          { kind: 'NetworkPolicy', name: `${name}-netpol`, namespace, optional: true, order: 6 },
          { kind: 'StorageClass', name: 'fast-ssd', namespace, optional: true, order: 7 },
          { kind: 'ResourceQuota', name: `${namespace}-quota`, namespace, optional: true, order: 8 },
          { kind: 'PriorityClass', name: 'high-priority', namespace, optional: true, order: 9 },
        ],
        warnings: [] }
      setData(demoResult)
      setIsLoading(false)
      return demoResult
    }

    // Keep previous data visible while loading (stale-while-revalidate)
    // Clearing data here would collapse the card content, shrinking the
    // grid row and causing the browser to scroll to the top of the page.

    try {
      let restError: unknown
      let agentError: unknown

      // Try backend REST API first (works when JWT auth is available)
      try {
        setProgressMessage('Scanning pod spec for references…')
        const res = await fetch(
          `/api/workloads/resolve-deps/${encodeURIComponent(cluster)}/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`,
          { headers: authHeaders(), signal: AbortSignal.timeout(3000) },
        )
        if (!res.ok) {
          throw new Error(`REST ${res.status}`)
        }
        const result: DependencyResolution = await res.json()
        setData(result)
        return result
      } catch (restErr: unknown) {
        restError = restErr
        console.error('[useDependencies] REST API failed, trying agent:', restErr)
      }

      // Fall back to agent's dynamic resolve-deps endpoint
      try {
        setProgressMessage('Tracing ConfigMaps, Secrets, RBAC, Services, PVCs…')
        const agentResult = await resolveViaAgent(cluster, namespace, name)
        if (agentResult) {
          setData(agentResult)
          return agentResult
        }
      } catch (agentErr: unknown) {
        agentError = agentErr
        console.error('[useDependencies] Agent resolve-deps failed:', agentErr)
      }

      // Both sources failed — build a descriptive error for UI consumers
      const details: string[] = []
      if (restError) details.push(`REST API: ${restError instanceof Error ? restError.message : String(restError)}`)
      if (agentError) details.push(`Agent: ${agentError instanceof Error ? agentError.message : String(agentError)}`)
      const message = details.length > 0
        ? `Dependency resolution failed (${details.join('; ')})`
        : 'No data source available for dependency resolution'
      setError(new Error(message))
      return null
    } finally {
      setIsLoading(false)
    }
  }

  const reset = () => {
    setData(null)
    setError(null)
    setIsLoading(false)
    setProgressMessage('')
  }

  return { data, isLoading, error, progressMessage, resolve, reset }
}
