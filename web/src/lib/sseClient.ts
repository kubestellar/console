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
import { emitSseAuthFailure } from './analytics'

export interface SSEFetchOptions<T> {
  /** SSE endpoint URL path (e.g. `${LOCAL_AGENT_HTTP_URL}/pods/stream`) */
  url: string
  /** Query parameters appended to the URL */
  params?: Record<string, string | number | undefined>
  /** Called when each cluster's data arrives */
  onClusterData: (clusterName: string, items: T[]) => void
  /**
   * Called when the backend emits a `cluster_error` event for a cluster that
   * failed mid-stream. Used so callers can distinguish "no data for this
   * cluster" from "the cluster fetch errored" (see issues #8080, #8081).
   */
  onClusterError?: (clusterName: string, error: string) => void
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

/** Subscribers waiting for callbacks on an in-flight SSE stream */
interface SSESubscriber<T = unknown> {
  onClusterData: (clusterName: string, items: T[]) => void
  onClusterError?: (clusterName: string, error: string) => void
  onDone?: (summary: Record<string, unknown>) => void
}
const inflightSubscribers = new Map<string, SSESubscriber[]>()

// Result cache: serve cached data on re-navigation within 10s
const resultCache = new Map<string, { data: unknown[]; at: number }>()
/** Cache TTL: 10 seconds */
const RESULT_CACHE_TTL_MS = 10_000

/**
 * Clear the SSE result cache. Call on logout or auth context change to
 * prevent stale data from a previous user session being served (#4712).
 */
export function clearSSECache(): void {
  resultCache.clear()
  inflightRequests.clear()
  inflightSubscribers.clear()
}

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
  const { url, params, onClusterData, onClusterError, onDone, itemsKey, signal } = options

  const searchParams = new URLSearchParams()
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) searchParams.append(key, String(value))
    })
  }

  // SECURITY: Token is sent via Authorization header, NOT in the URL
  const queryString = searchParams.toString()
  const fullUrl = queryString ? `${url}?${queryString}` : url

  // SECURITY: Include the current auth token in the cache key so that data
  // fetched under one user session is never served to a different user within
  // the cache TTL window (#4712).
  const currentTokenForKey = localStorage.getItem(STORAGE_KEY_TOKEN) || ''
  const cacheKey = `${fullUrl}::${currentTokenForKey}`

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

  // Dedup: if same URL is already in-flight, register as a subscriber and
  // return the existing promise so all consumers get progressive callbacks.
  const inflight = inflightRequests.get(cacheKey)
  if (inflight) {
    const subscribers = inflightSubscribers.get(cacheKey) || []
    subscribers.push({
      onClusterData: onClusterData as SSESubscriber['onClusterData'],
      onClusterError: onClusterError as SSESubscriber['onClusterError'],
      onDone })
    inflightSubscribers.set(cacheKey, subscribers)
    return inflight as Promise<T[]>
  }

  // Register the first caller as a subscriber too
  inflightSubscribers.set(cacheKey, [])

  const promise = new Promise<T[]>((resolve, reject) => {
    const accumulated: T[] = []
    /**
     * Track items already received per-cluster so that reconnect retries
     * replace stale data instead of appending duplicates (#5403).
     */
    const clusterItemCounts = new Map<string, number>()
    let aborted = false
    /** Whether we received a proper "done" event from the server */
    let receivedDone = false
    /** Timer ID for scheduled reconnect — cleared on unmount/abort */
    let reconnectTimerId: ReturnType<typeof setTimeout> | null = null

    const cleanup = (wasAborted = false) => {
      inflightRequests.delete(cacheKey)
      inflightSubscribers.delete(cacheKey)
      if (reconnectTimerId !== null) {
        clearTimeout(reconnectTimerId)
        reconnectTimerId = null
      }
      // Remove abort listener to prevent accumulation (#4772)
      if (signal) {
        signal.removeEventListener('abort', onSignalAbort)
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
      // Timeout with partial data — do NOT cache incomplete results (#5402).
      // Pass wasAborted=true so the partial accumulation is not stored.
      cleanup(/* wasAborted */ true)
      resolve(accumulated)
    }, SSE_TIMEOUT_MS)

    // Named handler so we can remove the listener after completion (#4772)
    const onSignalAbort = () => {
      aborted = true
      timeoutController.abort()
      clearTimeout(timeoutId)
      cleanup(/* wasAborted */ true)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    if (signal) {
      signal.addEventListener('abort', onSignalAbort)
    }

    /**
     * Execute one SSE fetch attempt. On recoverable errors, schedules a retry
     * with exponential backoff up to SSE_MAX_RECONNECT_ATTEMPTS.
     *
     * The auth token is read from localStorage on EVERY attempt so that
     * reconnects after a silent token refresh use the fresh token (#3897).
     */
    const attempt = (attemptNumber: number): void => {
      const headers: Record<string, string> = {
        Accept: 'text/event-stream',
      }
      const currentToken = localStorage.getItem(STORAGE_KEY_TOKEN)
      if (currentToken) {
        headers.Authorization = `Bearer ${currentToken}`
      }

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

                // Deduplicate: if this cluster was already received (e.g. on a
                // reconnect retry), remove the previous items before appending
                // the fresh set so rows are not duplicated (#5403).
                const prevCount = clusterItemCounts.get(clusterName)
                if (prevCount !== undefined && prevCount > 0) {
                  // Remove old items for this cluster from accumulated
                  let removed = 0
                  for (let i = accumulated.length - 1; i >= 0 && removed < prevCount; i--) {
                    const rec = accumulated[i] as Record<string, unknown>
                    if (rec.cluster === clusterName) {
                      accumulated.splice(i, 1)
                      removed++
                    }
                  }
                }

                accumulated.push(...tagged)
                clusterItemCounts.set(clusterName, tagged.length)
                onClusterData(clusterName, tagged)
                // Fan out to additional subscribers that joined via dedup
                const subs = inflightSubscribers.get(cacheKey) || []
                for (const sub of subs) {
                  try { sub.onClusterData(clusterName, tagged) } catch { /* subscriber error */ }
                }
              } catch (e) {
                console.error('[SSE] Failed to parse cluster_data:', e)
              }
            } else if (eventType === 'cluster_error') {
              // Backend emits cluster_error when a single cluster fetch
              // failed mid-stream (see pkg/api/handlers/sse.go). Surface this
              // to callers so they can distinguish "zero results" from
              // "some clusters errored". Without this, a transient failure
              // on the only GPU-bearing cluster looks like "no GPUs" to the
              // client and flaps the inventory (issues #8080, #8081).
              try {
                const parsed = JSON.parse(data) as Record<string, unknown>
                const clusterName = (parsed.cluster as string) || 'unknown'
                const errorMessage = (parsed.error as string) || 'unknown error'
                onClusterError?.(clusterName, errorMessage)
                const subs = inflightSubscribers.get(cacheKey) || []
                for (const sub of subs) {
                  try { sub.onClusterError?.(clusterName, errorMessage) } catch { /* subscriber error */ }
                }
              } catch (e) {
                console.error('[SSE] Failed to parse cluster_error:', e)
              }
            } else if (eventType === 'done') {
              receivedDone = true
              clearTimeout(timeoutId)
              cleanup()
              try {
                const summary = JSON.parse(data) as Record<string, unknown>
                onDone?.(summary)
                // Fan out onDone to additional subscribers
                const doneSubs = inflightSubscribers.get(cacheKey) || []
                for (const sub of doneSubs) {
                  try { sub.onDone?.(summary) } catch { /* subscriber error */ }
                }
              } catch {
                /* ignore parse errors on summary */
              }
              inflightSubscribers.delete(cacheKey)
              resolve(accumulated)
            }
          }

          const pump = (): Promise<void> =>
            reader.read().then(({ done, value }) => {
              if (done) {
                // Stream ended without a "done" event — partial data (#4934).
                // Flush remaining buffer and resolve with what we have.
                if (sseBuffer.trim()) {
                  parseSSEChunk(sseBuffer + '\n\n', handleEvent)
                }
                // Only cache results if we received a proper "done" event.
                // Without it, the data is incomplete and should not be
                // served from cache on re-navigation (#5402).
                const isPartial = !receivedDone
                if (isPartial && accumulated.length > 0) {
                  console.warn(
                    `[SSE] Stream ended without "done" event — returning ${accumulated.length} partial items (not cached)`,
                  )
                }
                cleanup(/* wasAborted */ isPartial)
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

          // Don't retry on auth (401) or service unavailable (503) — expected in demo mode
          const is401 = err.message?.includes('401')
          const isNonRetryable = is401 || err.message?.includes('503')
          if (is401) {
            emitSseAuthFailure(fullUrl)
          }
          if (isNonRetryable) {
            console.debug('[SSE] Non-retryable error — skipping retries (demo mode)')
            // Clear the in-flight entry and timers so future requests for the
            // same URL start a fresh stream instead of reusing this stale
            // resolved promise (#5404).
            clearTimeout(timeoutId)
            cleanup(/* wasAborted */ true)
            resolve(accumulated)
            return
          }

          // Retry with exponential backoff if we haven't exceeded attempts (#4934).
          // Even with partial data, a retry can complete the stream from remaining
          // clusters. Only resolve with partial data when all retries are exhausted.
          const retriesRemaining = SSE_MAX_RECONNECT_ATTEMPTS - attemptNumber
          if (retriesRemaining > 0 && !aborted) {
            const delay = Math.min(
              SSE_RECONNECT_BASE_MS * Math.pow(SSE_RECONNECT_BACKOFF_FACTOR, attemptNumber),
              SSE_RECONNECT_MAX_MS,
            )
            console.warn(
              `[SSE] Connection failed (attempt ${attemptNumber + 1}/${SSE_MAX_RECONNECT_ATTEMPTS + 1}, ` +
              `${accumulated.length} items so far), retrying in ${delay}ms: ${err.message}`,
            )
            reconnectTimerId = setTimeout(() => {
              reconnectTimerId = null
              if (!aborted) {
                attempt(attemptNumber + 1)
              }
            }, delay)
            return
          }

          // All retries exhausted — resolve with partial data if we have any
          if (accumulated.length > 0) {
            console.warn(`[SSE] All retries exhausted — resolving with ${accumulated.length} partial items`)
            clearTimeout(timeoutId)
            cleanup()
            resolve(accumulated)
            return
          }

          // No data at all — clean up and reject. Pass wasAborted=true so the
          // empty accumulated array is NOT written to the result cache (#9104):
          // caching a failed result meant the manual refresh button hit the
          // 10-second TTL cache and silently reused the failure instead of
          // retrying, so the card's lastUpdated timestamp never advanced.
          clearTimeout(timeoutId)
          cleanup(/* wasAborted */ true)
          reject(new Error(`SSE stream error: ${err.message}`))
        })
    }

    // Start the first attempt
    attempt(0)
  })

  inflightRequests.set(cacheKey, promise as Promise<unknown[]>)
  return promise
}
