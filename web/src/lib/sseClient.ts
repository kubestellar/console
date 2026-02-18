/**
 * SSE (Server-Sent Events) client for streaming API responses.
 *
 * Connects to backend /stream endpoints and delivers per-cluster data
 * incrementally as it arrives. Falls back to regular fetch on failure.
 *
 * Performance optimizations:
 * - Result cache (10s TTL) serves cached data on re-navigation
 * - In-flight dedup prevents duplicate concurrent requests to same URL
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

const SSE_TIMEOUT = 60_000 // 60s — backend has 30s overall deadline

// Dedup: prevent duplicate concurrent SSE requests to the same URL
const inflightRequests = new Map<string, Promise<unknown[]>>()

// Result cache: serve cached data on re-navigation within 10s
const resultCache = new Map<string, { data: unknown[]; at: number }>()
const RESULT_CACHE_TTL = 10_000

/**
 * Open an SSE connection and progressively collect data.
 * Resolves with the full accumulated array once the "done" event fires.
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
  if (token) searchParams.append('_token', token)

  const fullUrl = `${url}?${searchParams}`

  // Check result cache — if fresh, replay cached data via callbacks and resolve
  const cached = resultCache.get(fullUrl)
  if (cached && Date.now() - cached.at < RESULT_CACHE_TTL) {
    const items = cached.data as T[]
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
  const inflight = inflightRequests.get(fullUrl)
  if (inflight) {
    return inflight as Promise<T[]>
  }

  const promise = new Promise<T[]>((resolve, reject) => {
    const accumulated: T[] = []
    const eventSource = new EventSource(fullUrl)

    const cleanup = () => {
      inflightRequests.delete(fullUrl)
      resultCache.set(fullUrl, { data: accumulated, at: Date.now() })
    }

    if (signal) {
      signal.addEventListener('abort', () => {
        eventSource.close()
        cleanup()
        reject(new DOMException('Aborted', 'AbortError'))
      })
    }

    eventSource.addEventListener('cluster_data', (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as Record<string, unknown>
        const items = (data[itemsKey] || []) as T[]
        const clusterName = (data.cluster as string) || 'unknown'

        const tagged = items.map((item) => {
          const rec = item as Record<string, unknown>
          return rec.cluster ? item : ({ ...item, cluster: clusterName } as T)
        })

        accumulated.push(...tagged)
        onClusterData(clusterName, tagged)
      } catch (e) {
        console.error('[SSE] Failed to parse cluster_data:', e)
      }
    })

    eventSource.addEventListener('done', (event: MessageEvent) => {
      eventSource.close()
      cleanup()
      try {
        const summary = JSON.parse(event.data) as Record<string, unknown>
        onDone?.(summary)
      } catch {
        /* ignore parse errors on summary */
      }
      resolve(accumulated)
    })

    eventSource.addEventListener('error', () => {
      eventSource.close()
      cleanup()
      if (accumulated.length > 0) {
        resolve(accumulated)
      } else {
        reject(new Error('SSE stream error'))
      }
    })

    const timeoutId = setTimeout(() => {
      if (eventSource.readyState !== EventSource.CLOSED) {
        eventSource.close()
        cleanup()
        resolve(accumulated)
      }
    }, SSE_TIMEOUT)

    eventSource.addEventListener('done', () => clearTimeout(timeoutId))
  })

  inflightRequests.set(fullUrl, promise as Promise<unknown[]>)
  return promise
}
