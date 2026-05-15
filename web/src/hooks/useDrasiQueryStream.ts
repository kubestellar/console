/**
 * Hook for subscribing to a Drasi continuous-query event stream over SSE.
 *
 * drasi-server exposes a built-in SSE endpoint per query at:
 *   GET /api/v1/instances/{instanceId}/queries/{queryId}/events/stream
 *
 * The events arrive as `data: <json>` lines. There are two event flavors:
 *
 *   1. Lifecycle events (status changes):
 *      { componentId, componentType, status, timestamp, message }
 *
 *   2. Result-delta events (the interesting ones for the results table):
 *      { added: [...], updated: [...], deleted: [...], timestamp }
 *
 * This hook maintains a rolling result set, applying deltas as they arrive,
 * and exposes it as a flat array of rows for the card's results table.
 *
 * For drasi-platform mode (mode 3) the built-in stream is not exposed —
 * platform deployments require a Result reaction. That path will be added
 * in a follow-up; for now `mode === 'platform'` skips the subscription and
 * returns an empty result set.
 */
import { useState, useEffect, useRef } from 'react'

/** A single row in a result set — Drasi rows are arbitrary key/value maps. */
type LiveResultRow = Record<string, string | number | boolean | null>

/** Identifying key for a row inside a result set. Drasi delta events do not
 *  guarantee a stable key, so we hash the row to a string. */
function rowKey(row: LiveResultRow): string {
  return JSON.stringify(row)
}

/** Update-event element from drasi-server's events/stream. Either a
 *  `{before, after}` envelope or a bare row. */
interface UpdateEnvelope {
  before?: LiveResultRow
  after: LiveResultRow
}

/** A delta event payload from drasi-server's events/stream. */
interface QueryDeltaEvent {
  added?: LiveResultRow[]
  updated?: Array<UpdateEnvelope | LiveResultRow>
  deleted?: LiveResultRow[]
  timestamp?: string
  /** Lifecycle events have these instead. */
  componentId?: string
  componentType?: string
  status?: string
  message?: string
}

/** Type guard: distinguish a `{before, after}` envelope from a bare row. */
function isUpdateEnvelope(v: UpdateEnvelope | LiveResultRow): v is UpdateEnvelope {
  if (!v || typeof v !== 'object') return false
  const after = (v as UpdateEnvelope).after
  return after !== undefined && after !== null && typeof after === 'object'
}

/** Maximum rows held in the rolling result set; oldest dropped if exceeded. */
const MAX_STREAMED_ROWS = 200

export interface UseDrasiQueryStreamResult {
  results: LiveResultRow[]
  connected: boolean
  error: string | null
}

interface Args {
  /** Connection mode — 'server' enables streaming, 'platform' is a no-op. */
  mode: 'server' | 'platform' | null
  /** drasi-server URL (mode 1+2). Required when mode === 'server'. */
  drasiServerUrl?: string
  /** drasi-server instance UUID (mode 1+2). Required when mode === 'server'. */
  instanceId?: string | null
  /** Continuous query ID. Streaming pauses when this is null. */
  queryId: string | null
  /** When true, do not subscribe — used to honor the per-node Stop control. */
  paused?: boolean
}

/**
 * Subscribe to a continuous query's event stream and return a rolling
 * materialized result set. The connection is reopened whenever queryId,
 * mode, or instanceId changes; it is closed on unmount.
 */
export function useDrasiQueryStream(args: Args): UseDrasiQueryStreamResult {
  const { mode, drasiServerUrl, instanceId, queryId, paused = false } = args
  const [results, setResults] = useState<LiveResultRow[]>([])
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const sourceRef = useRef<EventSource | null>(null)

  useEffect(() => {
    // Reset whenever we switch queries.
    setResults([])
    setConnected(false)
    setError(null)

    if (paused || mode !== 'server' || !drasiServerUrl || !instanceId || !queryId) {
      return
    }

    // Subscribe via the backend reverse proxy so the browser doesn't need
    // direct access to the drasi-server URL. The proxy streams the SSE body
    // through unchanged.
    const upstreamPath =
      `/api/v1/instances/${encodeURIComponent(instanceId)}` +
      `/queries/${encodeURIComponent(queryId)}/events/stream`
    const proxyUrl =
      `/api/drasi/proxy${upstreamPath}` +
      `?target=server&url=${encodeURIComponent(drasiServerUrl)}`

    // Retry/backoff constants (no magic numbers inline)
    const INITIAL_RETRY_MS = 1000
    const MAX_RETRY_MS = 30000
    const BACKOFF_FACTOR = 2
    const JITTER_MS = 300
    const PREFLIGHT_ABORT_TIMEOUT_MS = 10000
    const UNRECOVERABLE_STATUSES = new Set([401, 403, 404])

    const retryCountRef = { current: 0 }
    const lastErrorRef = { current: null as string | null }
    let timer: number | null = null
    let aborted = false

    function clearTimer() {
      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }
    }

    function withJitter(ms: number) {
      return Math.min(MAX_RETRY_MS, ms + Math.floor(Math.random() * JITTER_MS))
    }

    async function preflightCheck(): Promise<{ ok: boolean; status: number }>
    {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), PREFLIGHT_ABORT_TIMEOUT_MS)
      try {
        const resp = await fetch(proxyUrl, {
          method: 'GET',
          headers: { Accept: 'text/event-stream' },
          credentials: 'same-origin',
          signal: controller.signal,
        })
        return { ok: resp.ok, status: resp.status }
      } catch (e) {
        return { ok: false, status: 0 }
      } finally {
        clearTimeout(timeout)
      }
    }

    function setErrorOnce(msg: string | null) {
      if (lastErrorRef.current === msg) return
      lastErrorRef.current = msg
      setError(msg)
    }

    function scheduleReconnect() {
      if (aborted) return
      retryCountRef.current++
      const base = INITIAL_RETRY_MS * Math.pow(BACKOFF_FACTOR, Math.max(0, retryCountRef.current - 1))
      const delay = withJitter(base)
      // Only surface a persistent reconnecting error after a couple attempts
      if (retryCountRef.current >= 2) {
        setConnected(false)
        setErrorOnce('Reconnecting to SSE stream...')
      }
      clearTimer()
      timer = window.setTimeout(() => {
        timer = null
        connect()
      }, delay)
    }

    let es: EventSource | null = null

    async function connect() {
      if (aborted) return
      // Preflight to detect HTTP status codes so we can avoid noisy retries
      const { ok, status } = await preflightCheck()
      if (aborted) return

      if (!ok) {
        if (UNRECOVERABLE_STATUSES.has(status)) {
          // Unrecoverable — surface once and stop retrying
          setConnected(false)
          setErrorOnce(`SSE unavailable (HTTP ${status})`)
          return
        }
        // Transient or unknown — schedule a reconnect with backoff
        setConnected(false)
        setErrorOnce(`SSE connection failed (HTTP ${status || 'network'})`)
        scheduleReconnect()
        return
      }

      // Successful preflight — open EventSource and wire handlers
      try {
        es = new EventSource(proxyUrl)
        sourceRef.current = es

        es.onopen = () => {
          retryCountRef.current = 0
          lastErrorRef.current = null
          setConnected(true)
          setError(null)
        }

        es.onmessage = (ev) => {
          let payload: QueryDeltaEvent
          try {
            payload = JSON.parse(ev.data)
          } catch {
            return // Non-JSON heartbeats etc.
          }

          // Lifecycle events update connection state but don't touch the table.
          if (payload.componentType === 'Query' && payload.status) {
            if (payload.status === 'Stopped' || payload.status === 'Failed') {
              setConnected(false)
            }
            return
          }

          // Apply the delta to the rolling result set.
          setResults(prev => {
            const next = new Map<string, LiveResultRow>(
              prev.map(r => [rowKey(r), r]),
            )
            for (const r of payload.added || []) {
              next.set(rowKey(r), r)
            }
            for (const u of payload.updated || []) {
              const after: LiveResultRow = isUpdateEnvelope(u) ? u.after : u
              next.set(rowKey(after), after)
            }
            for (const r of payload.deleted || []) {
              next.delete(rowKey(r))
            }
            const arr = Array.from(next.values())
            if (arr.length > MAX_STREAMED_ROWS) {
              return arr.slice(arr.length - MAX_STREAMED_ROWS)
            }
            return arr
          })
        }

        es.onerror = async () => {
          // Close the current source and attempt a reconnect backoff loop.
          try { es && es.close() } catch {}
          sourceRef.current = null
          setConnected(false)
          setErrorOnce('SSE connection error')
          // Run a quick preflight to decide whether to retry or stop.
          const { ok: preOk, status: preStatus } = await preflightCheck()
          if (aborted) return
          if (!preOk && UNRECOVERABLE_STATUSES.has(preStatus)) {
            setErrorOnce(`SSE unavailable (HTTP ${preStatus})`)
            return
          }
          scheduleReconnect()
        }
      } catch (e) {
        setConnected(false)
        setErrorOnce('Failed to open SSE stream')
        scheduleReconnect()
      }
    }

    // Start the first connection attempt
    connect()

    return () => {
      aborted = true
      clearTimer()
      try { es && es.close() } catch {}
      sourceRef.current = null
      setConnected(false)
    }
  }, [mode, drasiServerUrl, instanceId, queryId, paused])

  return { results, connected, error }
}
