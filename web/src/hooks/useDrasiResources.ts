/**
 * Hook for fetching Drasi resources (Sources, Continuous Queries, Reactions)
 * from a real Drasi installation. Falls back to null so the card uses demo
 * data when nothing is reachable.
 *
 * Drasi ships in three deployment modes and the dashboard supports all three
 * with the same code path:
 *
 *   1. drasi-lib  — Rust library embedded in another program. No wire protocol
 *                   on its own; embedders expose it via the drasi-server REST
 *                   API, so it is covered transitively by mode 2.
 *   2. drasi-server — standalone REST server. Default port 8080. Routes are
 *                     under `/api/v1/*` and responses use the
 *                     `{success, data, error}` wrapper.
 *   3. drasi-platform — Kubernetes operator. The `drasi-api` Service in
 *                       `drasi-system` exposes a REST API at `/v1/*` (NOT
 *                       `/api/v1/*` — different from drasi-server). Responses
 *                       are raw arrays/objects, no wrapper. Has NO Kubernetes
 *                       CRDs — the listing path is HTTP, not kubectl.
 *
 * Detection order:
 *
 *   a. `VITE_DRASI_SERVER_URL` env var → drasi-server adapter via the
 *      backend proxy (`/api/drasi/proxy/...?target=server&url=...`).
 *   b. Probe the configured cluster contexts for `drasi-api` in `drasi-system`
 *      → drasi-platform adapter via
 *      `/api/drasi/proxy/...?target=platform&cluster=<ctx>`.
 *   c. Neither configured → return null, card uses demo data.
 *
 * Both adapters return the same normalized `DrasiResourceData` shape so
 * `DrasiReactiveGraph.tsx` is oblivious to which mode is active.
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { useDrasiConnections } from './useDrasiConnections'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Polling interval for Drasi resource refresh */
const DRASI_POLL_INTERVAL_MS = 10_000
/** Maximum result rows pulled into the live results table per query. */
const MAX_LIVE_RESULTS_PER_QUERY = 50

// ---------------------------------------------------------------------------
// Public types — matches the shapes the card already renders
// ---------------------------------------------------------------------------

type SourceKind = 'HTTP' | 'POSTGRES' | 'COSMOSDB' | 'GREMLIN' | 'SQL'
type ReactionKind = 'SSE' | 'SIGNALR' | 'WEBHOOK' | 'KAFKA'
// Status enum kept aligned with the card's internal type. Drasi `Stopped`
// maps to `pending` since the card has no separate stopped-vs-paused visual
// (the Stop button uses local UI state, not the backend status).
type DrasiStatus = 'ready' | 'error' | 'pending'

interface DrasiSource {
  id: string
  name: string
  kind: SourceKind
  status: DrasiStatus
}

interface DrasiQuery {
  id: string
  name: string
  language: string
  status: DrasiStatus
  sourceIds: string[]
  /** Body of the query if available — used by the gear/configure modal. */
  queryText?: string
}

interface DrasiReaction {
  id: string
  name: string
  kind: ReactionKind
  status: DrasiStatus
  queryIds: string[]
}

/** A single row in a continuous-query result set. Drasi result rows are
 *  arbitrary key/value maps, so we keep them dynamic. */
type LiveResultRow = Record<string, string | number | boolean | null>

export interface DrasiResourceData {
  /** "server" | "platform" — set by the active adapter; informs the card's
   *  mode indicator and which mutation endpoint the gear modals call. */
  mode: 'server' | 'platform'
  /** drasi-server's instance UUID (mode 2) — used to scope SSE stream URLs.
   *  null in platform mode. */
  instanceId: string | null
  sources: DrasiSource[]
  queries: DrasiQuery[]
  reactions: DrasiReaction[]
  liveResults: LiveResultRow[]
}

// ---------------------------------------------------------------------------
// Status normalization (shared by both adapters)
// ---------------------------------------------------------------------------

/** Map any backend status string into the card's 3-state enum. */
function normalizeStatus(raw: unknown): DrasiStatus {
  const s = String(raw || '').toLowerCase()
  if (s === 'running' || s === 'available' || s === 'ready' || s === 'true') return 'ready'
  if (s === 'starting' || s === 'pending' || s === 'creating' || s === 'updating') return 'pending'
  if (s === 'stopped' || s === 'paused' || s === 'disabled') return 'pending'
  if (s === 'error' || s === 'failed' || s === 'unhealthy' || s === 'false') return 'error'
  return 'pending'
}

function mapSourceKind(raw: unknown): SourceKind {
  const k = String(raw || '').toUpperCase()
  if (k.includes('HTTP') || k.includes('REST')) return 'HTTP'
  if (k.includes('POSTGRES') || k.includes('PG') || k.includes('MYSQL') || k.includes('DEBEZIUM')) return 'POSTGRES'
  if (k.includes('COSMOS')) return 'COSMOSDB'
  if (k.includes('GREMLIN')) return 'GREMLIN'
  if (k.includes('SQL')) return 'SQL'
  return 'POSTGRES'
}

function mapReactionKind(raw: unknown): ReactionKind {
  const k = String(raw || '').toUpperCase()
  if (k.includes('SSE') || k === 'LOG' || k === 'DEBUG') return 'SSE'
  if (k.includes('SIGNAL')) return 'SIGNALR'
  if (k.includes('WEBHOOK') || k.includes('HTTP')) return 'WEBHOOK'
  if (k.includes('KAFKA')) return 'KAFKA'
  return 'SSE'
}

// ---------------------------------------------------------------------------
// Adapter 1 — drasi-server (REST `/api/v1/*` with `{success, data, error}` wrap)
// ---------------------------------------------------------------------------

/** Wrapper shape used by every drasi-server response. */
interface ServerWrap<T> {
  success: boolean
  data: T
  error: string | null
}

interface ServerSummary {
  id: string
  status: string
}

interface ServerInstance extends ServerSummary {
  source_count?: number
  query_count?: number
  reaction_count?: number
}

interface ServerQueryFull extends ServerSummary {
  config?: {
    query?: string
    queryLanguage?: string
    sources?: Array<{ sourceId?: string }>
  }
}

/** GET via the backend proxy targeted at the configured drasi-server URL. */
async function serverGet<T>(
  drasiServerUrl: string,
  upstreamPath: string,
  signal: AbortSignal,
): Promise<T> {
  const proxyUrl =
    `/api/drasi/proxy${upstreamPath}` +
    `?target=server&url=${encodeURIComponent(drasiServerUrl)}`
  const r = await fetch(proxyUrl, { signal })
  if (!r.ok) throw new Error(`drasi-server ${upstreamPath}: HTTP ${r.status}`)
  const wrapped = (await r.json()) as ServerWrap<T>
  if (wrapped.error || wrapped.success === false) {
    throw new Error(`drasi-server ${upstreamPath}: ${wrapped.error || 'unknown'}`)
  }
  return wrapped.data
}

async function fetchViaDrasiServer(
  drasiServerUrl: string,
  signal: AbortSignal,
): Promise<DrasiResourceData> {
  // Pick the first instance — drasi-server's flat `/api/v1/sources` etc. use
  // the default instance, but the per-query results endpoint requires the
  // explicit instance ID, so we discover it once.
  const instances = await serverGet<ServerInstance[]>(drasiServerUrl, '/api/v1/instances', signal)
  const instanceId = instances[0]?.id ?? null

  const [rawSources, rawQueries, rawReactions] = await Promise.all([
    serverGet<ServerSummary[]>(drasiServerUrl, '/api/v1/sources', signal),
    serverGet<ServerSummary[]>(drasiServerUrl, '/api/v1/queries', signal),
    serverGet<ServerSummary[]>(drasiServerUrl, '/api/v1/reactions', signal),
  ])

  const sources: DrasiSource[] = rawSources.map(s => ({
    id: s.id,
    name: s.id,
    kind: mapSourceKind(s.id),
    status: normalizeStatus(s.status),
  }))

  // Pull each query's full view to get its queryLanguage + source linkages.
  const queriesFull = await Promise.all(
    rawQueries.map(q =>
      instanceId
        ? serverGet<ServerQueryFull>(
            drasiServerUrl,
            `/api/v1/instances/${instanceId}/queries/${encodeURIComponent(q.id)}?view=full`,
            signal,
          ).catch(() => ({ id: q.id, status: q.status }) as ServerQueryFull)
        : Promise.resolve({ id: q.id, status: q.status } as ServerQueryFull),
    ),
  )

  const queries: DrasiQuery[] = queriesFull.map(q => ({
    id: q.id,
    name: q.id,
    language: ((q.config?.queryLanguage as string) || 'GQL').toUpperCase() + ' QUERY',
    status: normalizeStatus(q.status),
    sourceIds: (q.config?.sources || []).map(s => s.sourceId || '').filter(Boolean),
    queryText: q.config?.query,
  }))

  const reactions: DrasiReaction[] = rawReactions.map(r => ({
    id: r.id,
    name: r.id,
    kind: mapReactionKind(r.id),
    status: normalizeStatus(r.status),
    // drasi-server's flat list view doesn't expose the reaction→queries
    // edge; would need a second `?view=full` round-trip per reaction. For
    // mode 2 we treat the reaction as subscribed to all queries by default,
    // which is the common case for the SSE/log reactions.
    queryIds: queries.map(q => q.id),
  }))

  // Pull the first running query's results so the card can populate its
  // results table immediately (the SSE stream takes over for live updates).
  let liveResults: LiveResultRow[] = []
  const firstRunning = queries.find(q => q.status === 'ready')
  if (firstRunning && instanceId) {
    try {
      liveResults = await serverGet<LiveResultRow[]>(
        drasiServerUrl,
        `/api/v1/instances/${instanceId}/queries/${encodeURIComponent(firstRunning.id)}/results`,
        signal,
      )
      liveResults = (liveResults || []).slice(0, MAX_LIVE_RESULTS_PER_QUERY)
    } catch {
      // Results endpoint may 404 if query has no results yet. Non-fatal.
    }
  }

  return { mode: 'server', instanceId, sources, queries, reactions, liveResults }
}

// ---------------------------------------------------------------------------
// Adapter 2 — drasi-platform (REST `/v1/*` raw arrays, in-cluster Service proxy)
// ---------------------------------------------------------------------------

interface PlatformResource {
  id: string
  spec?: Record<string, unknown>
  status?: { available?: boolean; message?: string } | string
}

/** GET via the backend proxy targeted at drasi-platform on the named cluster. */
async function platformGet<T>(
  cluster: string,
  upstreamPath: string,
  signal: AbortSignal,
): Promise<T> {
  const proxyUrl =
    `/api/drasi/proxy${upstreamPath}` +
    `?target=platform&cluster=${encodeURIComponent(cluster)}`
  const r = await fetch(proxyUrl, { signal })
  if (!r.ok) throw new Error(`drasi-platform ${upstreamPath}: HTTP ${r.status}`)
  return (await r.json()) as T
}

function platformStatus(raw: PlatformResource['status']): DrasiStatus {
  if (typeof raw === 'string') return normalizeStatus(raw)
  if (raw && typeof raw === 'object') {
    if (raw.available === true) return 'ready'
    if (raw.available === false) return 'error'
  }
  return 'pending'
}

async function fetchViaDrasiPlatform(
  cluster: string,
  signal: AbortSignal,
): Promise<DrasiResourceData> {
  const [rawSources, rawQueries, rawReactions] = await Promise.all([
    platformGet<PlatformResource[]>(cluster, '/v1/sources', signal),
    platformGet<PlatformResource[]>(cluster, '/v1/continuousQueries', signal),
    platformGet<PlatformResource[]>(cluster, '/v1/reactions', signal),
  ])

  const sources: DrasiSource[] = (rawSources || []).map(s => ({
    id: s.id,
    name: s.id,
    kind: mapSourceKind((s.spec as Record<string, unknown>)?.kind ?? s.id),
    status: platformStatus(s.status),
  }))

  const queries: DrasiQuery[] = (rawQueries || []).map(q => {
    const spec = (q.spec || {}) as { mode?: string; query?: string; sources?: Array<{ id?: string; name?: string }> }
    return {
      id: q.id,
      name: q.id,
      language: (spec.mode || 'CYPHER').toUpperCase() + ' QUERY',
      status: platformStatus(q.status),
      sourceIds: (spec.sources || []).map(s => s.id || s.name || '').filter(Boolean),
      queryText: spec.query,
    }
  })

  const reactions: DrasiReaction[] = (rawReactions || []).map(r => {
    const spec = (r.spec || {}) as { kind?: string; queries?: Array<{ id?: string; name?: string }> }
    return {
      id: r.id,
      name: r.id,
      kind: mapReactionKind(spec.kind ?? r.id),
      status: platformStatus(r.status),
      queryIds: (spec.queries || []).map(q => q.id || q.name || '').filter(Boolean),
    }
  })

  // drasi-platform doesn't expose a flat per-query results endpoint the same
  // way drasi-server does — its query results live in the View Service
  // (`default-view-svc`) and are typically consumed via a Result reaction.
  // For Phase 2 we leave liveResults empty in platform mode and let the SSE
  // reaction (Phase 3) populate the table.
  return { mode: 'platform', instanceId: null, sources, queries, reactions, liveResults: [] }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseDrasiResourcesResult {
  data: DrasiResourceData | null
  isLoading: boolean
  isRefreshing: boolean
  error: string | null
  refetch: () => void
}

export function useDrasiResources(): UseDrasiResourcesResult {
  const { activeConnection } = useDrasiConnections()
  const [data, setData] = useState<DrasiResourceData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const hasDataRef = useRef(false)

  const fetchOnce = useCallback(async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    if (!activeConnection || activeConnection.isDemoSeed) {
      // No active connection, or the active one is a demo seed (fake URL
      // that points nowhere) — leave data null so the card stays in demo
      // mode without triggering failing fetches.
      setData(null)
      setIsRefreshing(false)
      hasDataRef.current = false
      return
    }

    if (hasDataRef.current) {
      setIsRefreshing(true)
    } else {
      setIsLoading(true)
    }
    try {
      let next: DrasiResourceData | null = null
      if (activeConnection.mode === 'server' && activeConnection.url) {
        next = await fetchViaDrasiServer(activeConnection.url, controller.signal)
      } else if (activeConnection.mode === 'platform' && activeConnection.cluster) {
        next = await fetchViaDrasiPlatform(activeConnection.cluster, controller.signal)
      }
      setData(next)
      hasDataRef.current = next !== null
      setError(null)
    } catch (e: unknown) {
      if ((e as Error).name !== 'AbortError') {
        setError((e as Error).message || 'Failed to fetch Drasi resources')
        setData(null)
        hasDataRef.current = false
      }
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [activeConnection])

  useEffect(() => {
    fetchOnce()
    const interval = setInterval(fetchOnce, DRASI_POLL_INTERVAL_MS)
    return () => {
      clearInterval(interval)
      abortRef.current?.abort()
    }
  }, [fetchOnce])

  return { data, isLoading, isRefreshing, error, refetch: fetchOnce }
}
