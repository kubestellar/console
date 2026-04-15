import { useCache } from '../../../lib/cache'
import { useCardLoadingState } from '../CardDataContext'
import { KEYCLOAK_DEMO_DATA, type KeycloakDemoData, type KeycloakRealm } from './demoData'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../../../lib/constants'
import { authFetch } from '../../../lib/api'

export type KeycloakStatus = KeycloakDemoData

const INITIAL_DATA: KeycloakStatus = {
  health: 'not-installed',
  operatorPods: { ready: 0, total: 0 },
  realms: [],
  totalClients: 0,
  totalUsers: 0,
  totalActiveSessions: 0,
  lastCheckTime: new Date().toISOString(),
}

const CACHE_KEY = 'keycloak-status'

// ---------------------------------------------------------------------------
// Backend response types
// ---------------------------------------------------------------------------

interface BackendPodInfo {
  name?: string
  namespace?: string
  status?: string
  ready?: string
  labels?: Record<string, string>
  cluster?: string
}

interface CRItem {
  name: string
  namespace?: string
  cluster: string
  status?: Record<string, unknown>
  spec?: Record<string, unknown>
  labels?: Record<string, string>
}

interface CRResponse {
  items?: CRItem[]
  isDemoData?: boolean
}

// ---------------------------------------------------------------------------
// Pod detection helpers
// ---------------------------------------------------------------------------

// Exported for unit testing.
export function isKeycloakOperatorPod(pod: BackendPodInfo): boolean {
  const labels = pod.labels ?? {}
  const name = (pod.name ?? '').toLowerCase()
  // Match only the Keycloak Operator itself, not generic Keycloak workloads
  // (keycloak-ui, keycloak-proxy, etc.) which share the broad `app=keycloak` label.
  return (
    labels['app'] === 'keycloak-operator' ||
    labels['app.kubernetes.io/name'] === 'keycloak-operator' ||
    labels['app.kubernetes.io/part-of'] === 'keycloak-operator' ||
    name.startsWith('keycloak-operator')
  )
}

// Exported for unit testing.
export function isPodReady(pod: BackendPodInfo): boolean {
  const status = (pod.status ?? '').toLowerCase()
  const ready = pod.ready ?? ''
  if (status !== 'running') return false
  const parts = ready.split('/')
  if (parts.length !== 2) return false
  return parts[0] === parts[1] && parseInt(parts[0], 10) > 0
}

// ---------------------------------------------------------------------------
// CRD helpers
// ---------------------------------------------------------------------------

async function fetchCR(group: string, version: string, resource: string): Promise<CRItem[]> {
  try {
    const params = new URLSearchParams({ group, version, resource })
    const resp = await authFetch(`/api/mcp/custom-resources?${params}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
    })
    if (!resp.ok) return []
    const body: CRResponse = await resp.json()
    return body.items ?? []
  } catch {
    return []
  }
}

/** Parse a Keycloak CR (keycloak.org/v2alpha1 Keycloak) into a realm-like shape. Exported for unit testing. */
export function parseKeycloakInstance(item: CRItem): KeycloakRealm {
  const status = (item.status ?? {}) as Record<string, unknown>
  const conditions = Array.isArray(status.conditions) ? status.conditions : []

  let realmStatus: KeycloakRealm['status'] = 'ready'
  for (const c of conditions) {
    const cond = c as Record<string, unknown>
    if (cond.type === 'Ready' && cond.status === 'False') {
      realmStatus = 'error'
      break
    }
    if (cond.type === 'HasErrors' && cond.status === 'True') {
      realmStatus = 'degraded'
      break
    }
  }

  // Provisioning: no Ready condition yet
  const hasReadyCondition = conditions.some(
    (c: unknown) => (c as Record<string, unknown>).type === 'Ready',
  )
  if (!hasReadyCondition && realmStatus === 'ready') {
    realmStatus = 'provisioning'
  }

  return {
    name: item.name,
    namespace: item.namespace ?? '',
    cluster: item.cluster ?? '',
    status: realmStatus,
    enabled: true,
    clients: 0,
    users: 0,
    activeSessions: 0,
  }
}

// ---------------------------------------------------------------------------
// Pod fetcher
// ---------------------------------------------------------------------------

async function fetchPods(url: string): Promise<BackendPodInfo[]> {
  const resp = await authFetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
  })
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
  const body: { pods?: BackendPodInfo[] } = await resp.json()
  return Array.isArray(body?.pods) ? body.pods : []
}

// ---------------------------------------------------------------------------
// Main fetcher
// ---------------------------------------------------------------------------

async function fetchKeycloakStatus(): Promise<KeycloakStatus> {
  // Step 1: Detect Keycloak Operator pods.
  // First try a targeted label-selector query (fast, low noise). Errors here are
  // swallowed — an auth/network failure on the narrow query falls through to the
  // full-list fallback below, which propagates if it also fails so useCache can
  // surface a proper error state instead of silently showing "not installed".
  const labeledPods = await fetchPods(
    '/api/mcp/pods?labelSelector=app.kubernetes.io%2Fname%3Dkeycloak-operator',
  ).catch(() => [] as BackendPodInfo[])

  const keycloakPods = labeledPods.length > 0
    ? labeledPods.filter(isKeycloakOperatorPod)
    // Fallback: scan all pods — error propagates intentionally so the hook
    // transitions to isFailed rather than misreporting "not-installed".
    : (await fetchPods('/api/mcp/pods')).filter(isKeycloakOperatorPod)

  if (keycloakPods.length === 0) {
    return {
      ...INITIAL_DATA,
      health: 'not-installed',
      lastCheckTime: new Date().toISOString(),
    }
  }

  const readyPods = keycloakPods.filter(isPodReady).length
  const allReady = readyPods === keycloakPods.length

  // Step 2: Fetch Keycloak CRs (best-effort)
  const keycloakInstances = await fetchCR('keycloak.org', 'v2alpha1', 'keycloaks')

  const realms = keycloakInstances.map(parseKeycloakInstance)

  const totalClients = realms.reduce((sum, r) => sum + r.clients, 0)
  const totalUsers = realms.reduce((sum, r) => sum + r.users, 0)
  const totalActiveSessions = realms.reduce((sum, r) => sum + r.activeSessions, 0)

  return {
    health: allReady ? 'healthy' : 'degraded',
    operatorPods: { ready: readyPods, total: keycloakPods.length },
    realms,
    totalClients,
    totalUsers,
    totalActiveSessions,
    lastCheckTime: new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Hook return contract for the Keycloak status card.
 *
 * Follows the canonical "Caching Contract" shape documented in CLAUDE.md:
 * `{ data, isLoading, isRefreshing, isDemoData, isFailed,
 *    consecutiveFailures, lastRefresh, refetch }`.
 *
 * `showSkeleton` and `showEmptyState` are card-local helpers derived from
 * `useCardLoadingState` — retained so the component doesn't have to
 * re-compute them — but they are additive to, not replacements for, the
 * canonical contract above.
 */
export interface UseKeycloakStatusResult {
  data: KeycloakStatus
  isLoading: boolean
  isRefreshing: boolean
  isDemoData: boolean
  isFailed: boolean
  consecutiveFailures: number
  lastRefresh: number | null
  refetch: () => Promise<void>
  // card-local helpers (derived from useCardLoadingState)
  showSkeleton: boolean
  showEmptyState: boolean
}

export function useKeycloakStatus(): UseKeycloakStatusResult {
  const {
    data,
    isLoading,
    isRefreshing,
    isFailed,
    consecutiveFailures,
    isDemoFallback,
    lastRefresh,
    refetch,
  } = useCache<KeycloakStatus>({
    key: CACHE_KEY,
    category: 'default',
    initialData: INITIAL_DATA,
    demoData: KEYCLOAK_DEMO_DATA,
    persist: true,
    fetcher: fetchKeycloakStatus,
  })

  const effectiveIsDemoData = isDemoFallback && !isLoading

  // 'not-installed' is a valid, renderable state — the card shows its own
  // "Keycloak not detected" UI. Treat it as hasAnyData so CardWrapper never
  // shows a generic empty state in place of the card's own message.
  const hasAnyData =
    data.health === 'not-installed' ||
    (data.operatorPods?.total ?? 0) > 0 ||
    (data.realms || []).length > 0

  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: isLoading && !hasAnyData,
    isRefreshing,
    hasAnyData,
    isFailed,
    consecutiveFailures,
    isDemoData: effectiveIsDemoData,
    lastRefresh,
  })

  return {
    data,
    isLoading,
    isRefreshing,
    isDemoData: effectiveIsDemoData,
    isFailed: isFailed && !hasAnyData,
    consecutiveFailures,
    lastRefresh,
    refetch,
    showSkeleton,
    showEmptyState,
  }
}
