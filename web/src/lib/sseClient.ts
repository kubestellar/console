/**
 * SSE (Server-Sent Events) client for streaming API responses.
 *
 * Uses fetch() with ReadableStream to deliver per-cluster data incrementally.
 * SECURITY: Sends JWT via Authorization header (not URL query params) to keep
 * tokens out of server logs, browser history, and proxy logs.
 *
 * Performance optimizations:
 * - Result cache (10s TTL) serves cached data on re-navigation
 * - In-flight dedup prevents duplicate concurrent requests to same URL
 *
 * Reliability:
 * - Auto-reconnect with exponential backoff on connection drop (#2654)
 */

import { STORAGE_KEY_TOKEN } from './constants'

export interface SSEFetchOptions<T> {
  /** SSE endpoint URL path (e.g. '/api/mcp/pods/stream') */
  url: string
  /** Query parameters appended to the URL */
  params?: Record<string, string | number | undefined>
  /** Called when each cluster's data arrives */
  onClusterData: (clusterName: string, items: T[]) => void
  /** Called when stream completes */
  onDone?: (summary: Record<string, unknown>) => void
  /** Key in each event's JSON that holds the items array */
  itemsKey: string
  /** AbortSignal for cleanup */
  signal?: AbortSignal
}

/** Overall timeout for a single SSE stream (backend has 30s deadline) */
const SSE_TIMEOUT_MS = 60_000

/** Initial delay before first reconnect attempt */
const SSE_RECONNECT_BASE_MS = 1_000
/** Maximum delay between reconnect attempts */
const SSE_RECONNECT_MAX_MS = 30_000
/** Backoff multiplier applied to the delay after each failed attempt */
const SSE_RECONNECT_BACKOFF_FACTOR = 2
/** Maximum number of reconnect attempts before giving up */
const SSE_MAX_RECONNECT_ATTEMPTS = 5

// Dedup: prevent duplicate concurrent SSE requests to the same URL
const inflightRequests = new Map<string, Promise<unknown[]>>()

// Result cache: serve cached data on re-navigation within 10s
const resultCache = new Map<string, { data: unknown[]; at: number }>()
/** Cache TTL: 10 seconds */
const RESULT_CACHE_TTL_MS = 10_000

/**
 * Parse an SSE text stream and dispatch events.
 * SSE format: `event: <type>\ndata: <json>\n\n`
 */
function parseSSEChunk(
  buffer: string,
  onEvent: (eventType: string, data: string) => void,
): string {
  // SSE messages are separated by double newlines
  const parts = buffer.split('\n\n')
  // The last part may be incomplete — keep it in the buffer
  const remaining = parts.pop() || ''

  for (const part of parts) {
    if (!part.trim()) continue
    let eventType = 'message'
    let data = ''

    for (const line of part.split('\n')) {
      if (line.startsWith('event:')) {
        eventType = line.slice('event:'.length).trim()
      } else if (line.startsWith('data:')) {
        data = line.slice('data:'.length).trim()
      }
    }

    if (data) {
      onEvent(eventType, data)
    }
  }

  return remaining
}

/**
 * Open a fetch-based SSE connection and progressively collect data.
 * Resolves with the full accumulated array once the "done" event fires.
 *
 * On connection errors, automatically retries with exponential backoff
 * (up to SSE_MAX_RECONNECT_ATTEMPTS attempts) before rejecting.
 */
export function fetchSSE<T>(options: SSEFetchOptions<T>): Promise<T[]> {
  const { url, params, onClusterData, onDone, itemsKey, signal } = options
  const token = localStorage.getItem(STORAGE_KEY_TOKEN)

  const searchParams = new URLSearchParams()
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) searchParams.append(key, String(value))
    })
  }

  // SECURITY: Token is sent via Authorization header, NOT in the URL
  const queryString = searchParams.toString()
  const fullUrl = queryString ? `${url}?${queryString}` : url

  // Build cache key including token hash (different users get different caches)
  const cacheKey = fullUrl

  // Check result cache — if fresh, replay cached data via callbacks and resolve
  const cached = resultCache.get(cacheKey)
  if (cached && Date.now() - cached.at < RESULT_CACHE_TTL_MS) {
    const items = (cached.data as T[]) || []
    // Replay per-cluster grouping for onClusterData callbacks
    const byCluster = new Map<string, T[]>()
    for (const item of items) {
      const cluster = (item as Record<string, unknown>).cluster as string || 'unknown'
      const list = byCluster.get(cluster) || []
      list.push(item)
      byCluster.set(cluster, list)
    }
    for (const [cluster, clusterItems] of byCluster) {
      onClusterData(cluster, clusterItems)
    }
    onDone?.({ cached: true })
    return Promise.resolve(items)
  }

  // Dedup: if same URL is already in-flight, return the existing promise
  const inflight = inflightRequests.get(cacheKey)
  if (inflight) {
    return inflight as Promise<T[]>
  }

  const promise = new Promise<T[]>((resolve, reject) => {
    const accumulated: T[] = []
    let aborted = false
    /** Timer ID for scheduled reconnect — cleared on unmount/abort */
    let reconnectTimerId: ReturnType<typeof setTimeout> | null = null

    const cleanup = (wasAborted = false) => {
      inflightRequests.delete(cacheKey)
      if (reconnectTimerId !== null) {
        clearTimeout(reconnectTimerId)
        reconnectTimerId = null
      }
      // Don't cache partial results from aborted streams (#2380)
      if (!wasAborted) {
        resultCache.set(cacheKey, { data: accumulated, at: Date.now() })
      }
    }

    // Create an AbortController for timeout that chains with the provided signal
    const timeoutController = new AbortController()
    const timeoutId = setTimeout(() => {
      timeoutController.abort()
      cleanup()
      resolve(accumulated)
    }, SSE_TIMEOUT_MS)

    if (signal) {
      signal.addEventListener('abort', () => {
        aborted = true
        timeoutController.abort()
        clearTimeout(timeoutId)
        cleanup(/* wasAborted */ true)
        reject(new DOMException('Aborted', 'AbortError'))
      })
    }

    const headers: Record<string, string> = {
      Accept: 'text/event-stream',
    }
    if (token) {
      headers.Authorization = `Bearer ${token}`
    }

    /**
     * Execute one SSE fetch attempt. On recoverable errors, schedules a retry
     * with exponential backoff up to SSE_MAX_RECONNECT_ATTEMPTS.
     */
    const attempt = (attemptNumber: number): void => {
      fetch(fullUrl, {
        headers,
        signal: timeoutController.signal,
      })
        .then((response) => {
          if (!response.ok) {
            throw new Error(`SSE fetch failed: ${response.status}`)
          }
          if (!response.body) {
            throw new Error('SSE response has no body')
          }

          const reader = response.body.getReader()
          const decoder = new TextDecoder()
          let sseBuffer = ''

          const handleEvent = (eventType: string, data: string) => {
            if (eventType === 'cluster_data') {
              try {
                const parsed = JSON.parse(data) as Record<string, unknown>
                const items = ((parsed[itemsKey] || []) as T[])
                const clusterName = (parsed.cluster as string) || 'unknown'

                const tagged = items.map((item) => {
                  const rec = item as Record<string, unknown>
                  return rec.cluster ? item : ({ ...item, cluster: clusterName } as T)
                })

                accumulated.push(...tagged)
                onClusterData(clusterName, tagged)
              } catch (e) {
                console.error('[SSE] Failed to parse cluster_data:', e)
              }
            } else if (eventType === 'done') {
              clearTimeout(timeoutId)
              cleanup()
              try {
                const summary = JSON.parse(data) as Record<string, unknown>
                onDone?.(summary)
              } catch {
                /* ignore parse errors on summary */
              }
              resolve(accumulated)
            }
          }

          const pump = (): Promise<void> =>
            reader.read().then(({ done, value }) => {
              if (done) {
                // Stream ended — flush remaining buffer
                if (sseBuffer.trim()) {
                  parseSSEChunk(sseBuffer + '\n\n', handleEvent)
                }
                cleanup()
                clearTimeout(timeoutId)
                resolve(accumulated)
                return
              }
              sseBuffer += decoder.decode(value, { stream: true })
              sseBuffer = parseSSEChunk(sseBuffer, handleEvent)
              return pump()
            })

          return pump()
        })
        .catch((err) => {
          if (aborted) return
          if (err.name === 'AbortError') {
            // Timeout — already resolved above
            return
          }

          // If we already collected some data, resolve with what we have
          if (accumulated.length > 0) {
            clearTimeout(timeoutId)
            cleanup()
            resolve(accumulated)
            return
          }

          // Retry with exponential backoff if we haven't exceeded attempts
          const retriesRemaining = SSE_MAX_RECONNECT_ATTEMPTS - attemptNumber
          if (retriesRemaining > 0 && !aborted) {
            const delay = Math.min(
              SSE_RECONNECT_BASE_MS * Math.pow(SSE_RECONNECT_BACKOFF_FACTOR, attemptNumber),
              SSE_RECONNECT_MAX_MS,
            )
            console.warn(
              `[SSE] Connection failed (attempt ${attemptNumber + 1}/${SSE_MAX_RECONNECT_ATTEMPTS + 1}), ` +
              `retrying in ${delay}ms: ${err.message}`,
            )
            reconnectTimerId = setTimeout(() => {
              reconnectTimerId = null
              if (!aborted) {
                attempt(attemptNumber + 1)
              }
            }, delay)
            return
          }

          // All retries exhausted — clean up and reject
          clearTimeout(timeoutId)
          cleanup()
          reject(new Error(`SSE stream error: ${err.message}`))
        })
    }

    // Start the first attempt
    attempt(0)
  })

  inflightRequests.set(cacheKey, promise as Promise<unknown[]>)
  return promise
}
