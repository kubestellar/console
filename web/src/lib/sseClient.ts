/**
 * SSE (Server-Sent Events) client for streaming API responses.
 *
 * Connects to backend /stream endpoints and delivers per-cluster data
 * incrementally as it arrives. Falls back to regular fetch on failure.
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

const SSE_TIMEOUT = 180_000 // 180s — backend has 120s overall deadline, slow clusters need time

/**
 * Open an SSE connection and progressively collect data.
 * Resolves with the full accumulated array once the "done" event fires.
 */
export function fetchSSE<T>(options: SSEFetchOptions<T>): Promise<T[]> {
  const { url, params, onClusterData, onDone, itemsKey, signal } = options
  const token = localStorage.getItem(STORAGE_KEY_TOKEN)

  return new Promise((resolve, reject) => {
    const searchParams = new URLSearchParams()
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) searchParams.append(key, String(value))
      })
    }
    // EventSource doesn't support custom headers — pass token as query param
    if (token) searchParams.append('_token', token)

    const fullUrl = `${url}?${searchParams}`
    const accumulated: T[] = []

    const eventSource = new EventSource(fullUrl)

    // Handle abort
    if (signal) {
      signal.addEventListener('abort', () => {
        eventSource.close()
        reject(new DOMException('Aborted', 'AbortError'))
      })
    }

    eventSource.addEventListener('cluster_data', (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as Record<string, unknown>
        const items = (data[itemsKey] || []) as T[]
        const clusterName = (data.cluster as string) || 'unknown'

        // Tag items with cluster name if they don't already have one
        const tagged = items.map((item) => {
          const rec = item as Record<string, unknown>
          return rec.cluster ? item : ({ ...item, cluster: clusterName } as T)
        })

        accumulated.push(...tagged)
        onClusterData(clusterName, tagged)
      } catch (e) {
        console.warn('[SSE] Failed to parse cluster_data:', e)
      }
    })

    eventSource.addEventListener('done', (event: MessageEvent) => {
      eventSource.close()
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
      // If we got partial data, resolve with what we have
      if (accumulated.length > 0) {
        resolve(accumulated)
      } else {
        reject(new Error('SSE stream error'))
      }
    })

    // Safety timeout
    const timeoutId = setTimeout(() => {
      if (eventSource.readyState !== EventSource.CLOSED) {
        eventSource.close()
        resolve(accumulated)
      }
    }, SSE_TIMEOUT)

    // Clear timeout when stream ends normally
    eventSource.addEventListener('done', () => clearTimeout(timeoutId))
  })
}
