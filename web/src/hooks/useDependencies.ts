import { useCallback, useEffect, useRef, useState } from 'react'
import type { TFunction } from 'i18next'
import { isAgentUnavailable } from './useLocalAgent'
import { clusterCacheRef, agentFetch } from './mcp/shared'
import { isDemoMode } from '../lib/demoMode'
import { LOCAL_AGENT_HTTP_URL } from '../lib/constants'
import { getStoredAuthToken } from '../lib/authToken'
import { MCP_HOOK_TIMEOUT_MS } from '../lib/constants/network'

const AGENT_RESOLVE_TIMEOUT_MS = 30_000
const REST_RESOLVE_TIMEOUT_MS = 3_000
const MAX_RATE_LIMIT_RETRIES = 3
const BASE_RATE_LIMIT_BACKOFF_MS = 1_000
const MAX_RATE_LIMIT_BACKOFF_MS = 30_000
const MAX_RATE_LIMIT_JITTER_MS = 1_000
const RETRY_AFTER_MS = 1_000

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

type AgentResponse = Record<string, unknown>

export class DependencyResolutionRateLimitError extends Error {
  retryAfterMs: number | null

  constructor(retryAfterMs: number | null) {
    super('Dependency resolution rate limit exhausted')
    this.name = 'DependencyResolutionRateLimitError'
    this.retryAfterMs = retryAfterMs
  }
}

function authHeaders(): Record<string, string> {
  const token = await getStoredAuthToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

function createAbortError(): DOMException {
  return new DOMException('The operation was aborted.', 'AbortError')
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === 'AbortError'
    : error instanceof Error && error.name === 'AbortError'
}

export function isDependencyResolutionRateLimitError(error: unknown): error is DependencyResolutionRateLimitError {
  return error instanceof DependencyResolutionRateLimitError
}

export function getDependencyResolutionErrorMessage(error: Error, t: TFunction): string {
  if (isDependencyResolutionRateLimitError(error)) {
    const retryAfterSeconds = error.retryAfterMs === null
      ? null
      : Math.max(1, Math.ceil(error.retryAfterMs / RETRY_AFTER_MS))

    if (retryAfterSeconds !== null) {
      return t('deploy.resolveRateLimited', { count: retryAfterSeconds })
    }

    return t('deploy.resolveRateLimitedGeneric')
  }

  return error.message
}

function parseRetryAfterMs(response: Response): number | null {
  const retryAfterRaw = response.headers.get('Retry-After')
  if (!retryAfterRaw) return null

  const retryAfterSeconds = Number(retryAfterRaw)
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return retryAfterSeconds * RETRY_AFTER_MS
  }

  const retryAtMs = Date.parse(retryAfterRaw)
  if (Number.isFinite(retryAtMs)) {
    return Math.max(retryAtMs - Date.now(), 0)
  }

  return null
}

function getRateLimitBackoffMs(attempt: number, retryAfterMs: number | null): number {
  if (retryAfterMs !== null) {
    return retryAfterMs
  }

  const jitterMs = Math.floor(Math.random() * MAX_RATE_LIMIT_JITTER_MS)
  const exponentialBackoffMs = BASE_RATE_LIMIT_BACKOFF_MS * (2 ** attempt)
  return Math.min(exponentialBackoffMs + jitterMs, MAX_RATE_LIMIT_BACKOFF_MS)
}

async function waitForRetry(delayMs: number, signal: AbortSignal): Promise<void> {
  if (delayMs <= 0) return
  if (signal.aborted) throw createAbortError()

  await new Promise<void>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, delayMs)

    function onAbort() {
      window.clearTimeout(timeoutId)
      signal.removeEventListener('abort', onAbort)
      reject(createAbortError())
    }

    signal.addEventListener('abort', onAbort, { once: true })
  })
}

function createAttemptController(parentSignal: AbortSignal, timeoutMs: number): {
  signal: AbortSignal
  cleanup: () => void
} {
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs)

  const onAbort = () => controller.abort()
  if (parentSignal.aborted) {
    controller.abort()
  } else {
    parentSignal.addEventListener('abort', onAbort, { once: true })
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      window.clearTimeout(timeoutId)
      parentSignal.removeEventListener('abort', onAbort)
    },
  }
}

/** Fetch a JSON endpoint from the local agent with timeout. */
async function agentRequest(
  path: string,
  signal: AbortSignal,
  timeout = MCP_HOOK_TIMEOUT_MS,
): Promise<AgentResponse> {
  const { signal: attemptSignal, cleanup } = createAttemptController(signal, timeout)

  try {
    const res = await agentFetch(`${LOCAL_AGENT_HTTP_URL}${path}`, {
      signal: attemptSignal,
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) throw new Error(`Agent ${res.status}`)
    return await res.json()
  } finally {
    cleanup()
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
  signal: AbortSignal,
): Promise<DependencyResolution | null> {
  if (isAgentUnavailable()) return null

  const clusterEntry = clusterCacheRef.clusters.find(
    c => c.name === cluster && c.reachable !== false,
  )
  const context = clusterEntry?.context || cluster

  const params = `cluster=${encodeURIComponent(context)}&namespace=${encodeURIComponent(namespace)}&name=${encodeURIComponent(name)}`
  const result = await agentRequest(`/resolve-deps?${params}`, signal, AGENT_RESOLVE_TIMEOUT_MS)

  if (typeof result.error === 'string' && result.error.length > 0) {
    throw new Error(result.error)
  }

  return {
    workload: typeof result.workload === 'string' && result.workload.length > 0 ? result.workload : name,
    kind: typeof result.kind === 'string' && result.kind.length > 0 ? result.kind : 'Deployment',
    namespace: typeof result.namespace === 'string' && result.namespace.length > 0 ? result.namespace : namespace,
    cluster: typeof result.cluster === 'string' && result.cluster.length > 0 ? result.cluster : cluster,
    dependencies: Array.isArray(result.dependencies) ? result.dependencies as ResolvedDependency[] : [],
    warnings: Array.isArray(result.warnings) ? result.warnings as string[] : [],
  }
}

async function fetchResolveDepsResponse(
  cluster: string,
  namespace: string,
  name: string,
  signal: AbortSignal,
): Promise<Response> {
  const { signal: attemptSignal, cleanup } = createAttemptController(signal, REST_RESOLVE_TIMEOUT_MS)

  try {
    return await fetch(
      `/api/workloads/resolve-deps/${encodeURIComponent(cluster)}/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`,
      {
        headers: authHeaders(),
        signal: attemptSignal,
      },
    )
  } finally {
    cleanup()
  }
}

async function resolveViaRest(
  cluster: string,
  namespace: string,
  name: string,
  signal: AbortSignal,
): Promise<DependencyResolution> {
  for (let attempt = 0; attempt <= MAX_RATE_LIMIT_RETRIES; attempt += 1) {
    const response = await fetchResolveDepsResponse(cluster, namespace, name, signal)

    if (response.status !== 429) {
      if (!response.ok) {
        throw new Error(`REST ${response.status}`)
      }

      return await response.json() as DependencyResolution
    }

    const retryAfterMs = parseRetryAfterMs(response)
    if (attempt === MAX_RATE_LIMIT_RETRIES) {
      throw new DependencyResolutionRateLimitError(retryAfterMs)
    }

    await waitForRetry(getRateLimitBackoffMs(attempt, retryAfterMs), signal)
  }

  throw new Error('Dependency resolution failed after retries')
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
  const activeControllerRef = useRef<AbortController | null>(null)
  const activeRequestIdRef = useRef(0)

  const cancelActiveRequest = useCallback(() => {
    activeControllerRef.current?.abort()
    activeControllerRef.current = null
    activeRequestIdRef.current += 1
  }, [])

  useEffect(() => () => {
    cancelActiveRequest()
  }, [cancelActiveRequest])

  const resolve = useCallback(async (
    cluster: string,
    namespace: string,
    name: string,
  ): Promise<DependencyResolution | null> => {
    cancelActiveRequest()

    const requestId = activeRequestIdRef.current

    setIsLoading(true)
    setError(null)
    setProgressMessage('Connecting to cluster…')

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
          { kind: 'Service', name, namespace, optional: false, order: 3 },
          { kind: 'HorizontalPodAutoscaler', name: `${name}-hpa`, namespace, optional: true, order: 4 },
          { kind: 'PersistentVolumeClaim', name: `${name}-data`, namespace, optional: true, order: 5 },
          { kind: 'NetworkPolicy', name: `${name}-netpol`, namespace, optional: true, order: 6 },
          { kind: 'StorageClass', name: 'fast-ssd', namespace, optional: true, order: 7 },
          { kind: 'ResourceQuota', name: `${namespace}-quota`, namespace, optional: true, order: 8 },
          { kind: 'PriorityClass', name: 'high-priority', namespace, optional: true, order: 9 },
        ],
        warnings: [],
      }

      if (activeRequestIdRef.current === requestId) {
        setData(demoResult)
        setIsLoading(false)
      }
      return demoResult
    }

    const requestController = new AbortController()
    activeControllerRef.current = requestController

    try {
      let restError: unknown
      let agentError: unknown

      try {
        setProgressMessage('Scanning pod spec for references…')
        const result = await resolveViaRest(cluster, namespace, name, requestController.signal)
        if (activeRequestIdRef.current === requestId) {
          setData(result)
        }
        return result
      } catch (restErr: unknown) {
        if (isAbortError(restErr) || requestController.signal.aborted) {
          return null
        }

        restError = restErr
        if (isDependencyResolutionRateLimitError(restErr)) {
          if (activeRequestIdRef.current === requestId) {
            setError(restErr)
          }
          return null
        }

        console.error('[useDependencies] REST API failed, trying agent:', restErr)
      }

      try {
        setProgressMessage('Tracing ConfigMaps, Secrets, RBAC, Services, PVCs…')
        const agentResult = await resolveViaAgent(cluster, namespace, name, requestController.signal)
        if (agentResult) {
          if (activeRequestIdRef.current === requestId) {
            setData(agentResult)
          }
          return agentResult
        }
      } catch (agentErr: unknown) {
        if (isAbortError(agentErr) || requestController.signal.aborted) {
          return null
        }

        agentError = agentErr
        console.error('[useDependencies] Agent resolve-deps failed:', agentErr)
      }

      const details: string[] = []
      if (restError) details.push(`REST API: ${restError instanceof Error ? restError.message : String(restError)}`)
      if (agentError) details.push(`Agent: ${agentError instanceof Error ? agentError.message : String(agentError)}`)
      const message = details.length > 0
        ? `Dependency resolution failed (${details.join('; ')})`
        : 'No data source available for dependency resolution'

      if (activeRequestIdRef.current === requestId) {
        setError(new Error(message))
      }
      return null
    } finally {
      if (activeRequestIdRef.current === requestId) {
        setIsLoading(false)
        if (activeControllerRef.current === requestController) {
          activeControllerRef.current = null
        }
      }
    }
  }, [cancelActiveRequest])

  const reset = useCallback(() => {
    cancelActiveRequest()
    setData(null)
    setError(null)
    setIsLoading(false)
    setProgressMessage('')
  }, [cancelActiveRequest])

  return { data, isLoading, error, progressMessage, resolve, reset }
}
