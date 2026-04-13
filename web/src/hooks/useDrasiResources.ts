/**
 * Hook for fetching Drasi resources (Sources, Continuous Queries, Reactions)
 * from the Drasi API.
 *
 * Drasi exposes a REST API on its management endpoint:
 *   GET /v1/sources
 *   GET /v1/continuousQueries
 *   GET /v1/reactions
 *   GET /v1/continuousQueries/{id}/results  (for live result rows)
 *
 * When the Drasi API is unavailable, returns null so the card falls back
 * to demo data.
 */
import { useState, useEffect, useCallback, useRef } from 'react'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Polling interval for Drasi resource refresh */
const DRASI_POLL_INTERVAL_MS = 10_000
/** Default Drasi API base URL — override via VITE_DRASI_API_URL env var */
const DRASI_API_BASE = import.meta.env.VITE_DRASI_API_URL as string | undefined

// ---------------------------------------------------------------------------
// Types (matching the card's expected shape)
// ---------------------------------------------------------------------------

type SourceKind = 'HTTP' | 'POSTGRES' | 'COSMOSDB' | 'GREMLIN' | 'SQL'
type ReactionKind = 'SSE' | 'SIGNALR' | 'WEBHOOK' | 'KAFKA'

interface DrasiSource {
  id: string
  name: string
  kind: SourceKind
  status: 'ready' | 'error' | 'pending'
}

interface DrasiQuery {
  id: string
  name: string
  language: string
  status: 'ready' | 'error' | 'pending'
  sourceIds: string[]
}

interface DrasiReaction {
  id: string
  name: string
  kind: ReactionKind
  status: 'ready' | 'error' | 'pending'
  queryIds: string[]
}

interface LiveResultRow {
  changePercent: number
  name: string
  previousClose: number
  price: number
  symbol: string
}

export interface DrasiResourceData {
  sources: DrasiSource[]
  queries: DrasiQuery[]
  reactions: DrasiReaction[]
  liveResults: LiveResultRow[]
}

// ---------------------------------------------------------------------------
// API response types (raw Drasi API shapes)
// ---------------------------------------------------------------------------

interface DrasiApiSource {
  id?: string
  metadata?: { name?: string }
  spec?: { kind?: string; properties?: Record<string, unknown> }
  status?: { available?: boolean; message?: string }
}

interface DrasiApiQuery {
  id?: string
  metadata?: { name?: string }
  spec?: { mode?: string; query?: string; sources?: Array<{ name?: string; id?: string }> }
  status?: { available?: boolean }
}

interface DrasiApiReaction {
  id?: string
  metadata?: { name?: string }
  spec?: { kind?: string; queries?: Array<{ name?: string; id?: string }> }
  status?: { available?: boolean }
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

function mapStatus(available?: boolean): 'ready' | 'error' | 'pending' {
  if (available === true) return 'ready'
  if (available === false) return 'error'
  return 'pending'
}

function mapSourceKind(kind?: string): SourceKind {
  const normalized = (kind || '').toUpperCase()
  if (normalized.includes('HTTP')) return 'HTTP'
  if (normalized.includes('POSTGRES') || normalized.includes('PG')) return 'POSTGRES'
  if (normalized.includes('COSMOS')) return 'COSMOSDB'
  if (normalized.includes('GREMLIN')) return 'GREMLIN'
  if (normalized.includes('SQL')) return 'SQL'
  return 'POSTGRES'
}

function mapReactionKind(kind?: string): ReactionKind {
  const normalized = (kind || '').toUpperCase()
  if (normalized.includes('SSE')) return 'SSE'
  if (normalized.includes('SIGNAL')) return 'SIGNALR'
  if (normalized.includes('WEBHOOK') || normalized.includes('HTTP')) return 'WEBHOOK'
  if (normalized.includes('KAFKA')) return 'KAFKA'
  return 'SSE'
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useDrasiResources(): {
  data: DrasiResourceData | null
  isLoading: boolean
  error: string | null
} {
  const [data, setData] = useState<DrasiResourceData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const fetchResources = useCallback(async () => {
    if (!DRASI_API_BASE) {
      // No Drasi API configured — card will use demo data
      return
    }

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setIsLoading(true)
    try {
      const [sourcesRes, queriesRes, reactionsRes] = await Promise.all([
        fetch(`${DRASI_API_BASE}/v1/sources`, { signal: controller.signal }),
        fetch(`${DRASI_API_BASE}/v1/continuousQueries`, { signal: controller.signal }),
        fetch(`${DRASI_API_BASE}/v1/reactions`, { signal: controller.signal }),
      ])

      if (!sourcesRes.ok || !queriesRes.ok || !reactionsRes.ok) {
        throw new Error('Drasi API returned non-OK status')
      }

      const rawSources: DrasiApiSource[] = await sourcesRes.json()
      const rawQueries: DrasiApiQuery[] = await queriesRes.json()
      const rawReactions: DrasiApiReaction[] = await reactionsRes.json()

      const sources: DrasiSource[] = (rawSources || []).map(s => ({
        id: s.id || s.metadata?.name || 'unknown',
        name: s.metadata?.name || s.id || 'unknown',
        kind: mapSourceKind(s.spec?.kind),
        status: mapStatus(s.status?.available),
      }))

      const queries: DrasiQuery[] = (rawQueries || []).map(q => ({
        id: q.id || q.metadata?.name || 'unknown',
        name: q.metadata?.name || q.id || 'unknown',
        language: (q.spec?.mode || 'CYPHER').toUpperCase() + ' QUERY',
        status: mapStatus(q.status?.available),
        sourceIds: (q.spec?.sources || []).map(s => s.id || s.name || ''),
      }))

      const reactions: DrasiReaction[] = (rawReactions || []).map(r => ({
        id: r.id || r.metadata?.name || 'unknown',
        name: r.metadata?.name || r.id || 'unknown',
        kind: mapReactionKind(r.spec?.kind),
        status: mapStatus(r.status?.available),
        queryIds: (r.spec?.queries || []).map(q => q.id || q.name || ''),
      }))

      // Fetch live results from the first query (if any)
      let liveResults: LiveResultRow[] = []
      if (queries.length > 0) {
        try {
          const resultsRes = await fetch(
            `${DRASI_API_BASE}/v1/continuousQueries/${queries[0].id}/results`,
            { signal: controller.signal },
          )
          if (resultsRes.ok) {
            const rawResults = await resultsRes.json()
            liveResults = (rawResults || []).map((r: Record<string, unknown>) => ({
              changePercent: Number(r.changePercent) || 0,
              name: String(r.name || ''),
              previousClose: Number(r.previousClose) || 0,
              price: Number(r.price) || 0,
              symbol: String(r.symbol || ''),
            }))
          }
        } catch {
          // Live results are optional — silently ignore
        }
      }

      setData({ sources, queries, reactions, liveResults })
      setError(null)
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        setError((e as Error).message || 'Failed to fetch Drasi resources')
      }
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchResources()
    const interval = setInterval(fetchResources, DRASI_POLL_INTERVAL_MS)
    return () => {
      clearInterval(interval)
      abortRef.current?.abort()
    }
  }, [fetchResources])

  return { data, isLoading, error }
}
