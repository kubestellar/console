/**
 * Hook for fetching live benchmark data from the backend via SSE streaming.
 *
 * Uses Server-Sent Events to stream benchmark reports incrementally from
 * Google Drive. Cards update progressively as batches arrive. Falls back to
 * demo data when backend is unavailable or returns empty.
 *
 * The SSE connection is a module-level singleton so that multiple card
 * components sharing this hook don't open duplicate connections.
 *
 * Supports a `since` parameter (e.g. "30d") to limit data to recent reports.
 * Changing the time range via `resetStream()` clears state and reconnects.
 */
import { useSyncExternalStore } from 'react'
import { useCache } from '../lib/cache'
import {
  generateBenchmarkReports,
  type BenchmarkReport,
} from '../lib/llmd/benchmarkMockData'
import { STORAGE_KEY_TOKEN } from '../lib/constants'

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem(STORAGE_KEY_TOKEN)
  return token ? { Authorization: `Bearer ${token}` } : {}
}

const DEMO_REPORTS = generateBenchmarkReports()

// ---------------------------------------------------------------------------
// Module-level SSE singleton — shared across all card hook instances
// ---------------------------------------------------------------------------

interface StreamState {
  reports: BenchmarkReport[]
  isStreaming: boolean
  isDone: boolean
  status: string
  error: string | null
  since: string
}

let streamState: StreamState = {
  reports: [],
  isStreaming: false,
  isDone: false,
  status: '',
  error: null,
  since: '0',
}

const subscribers = new Set<() => void>()
let started = false
let abortController: AbortController | null = null

function notifySubscribers() {
  for (const cb of subscribers) cb()
}

function getSnapshot(): StreamState {
  return streamState
}

function subscribe(cb: () => void) {
  subscribers.add(cb)
  // Start the stream on first subscriber
  if (!started) {
    started = true
    startGlobalStream(streamState.since)
  }
  return () => {
    subscribers.delete(cb)
  }
}

/** Reset the stream with a new time range. Clears all data and reconnects. */
export function resetBenchmarkStream(since: string) {
  // Abort existing stream
  if (abortController) {
    abortController.abort()
    abortController = null
  }
  streamState = {
    reports: [],
    isStreaming: false,
    isDone: false,
    status: '',
    error: null,
    since,
  }
  notifySubscribers()
  started = true
  startGlobalStream(since)
}

/** Get the current `since` value the stream is using. */
export function getBenchmarkStreamSince(): string {
  return streamState.since
}

function startGlobalStream(since: string) {
  streamState = { ...streamState, isStreaming: true, status: 'connecting', since }
  notifySubscribers()

  const token = localStorage.getItem(STORAGE_KEY_TOKEN)
  abortController = new AbortController()

  fetch(`/api/benchmarks/reports/stream?since=${encodeURIComponent(since)}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    signal: abortController.signal,
  })
    .then(async (res) => {
      if (!res.ok || !res.body) {
        streamState = { ...streamState, isStreaming: false, error: `Stream error: ${res.status}` }
        notifySubscribers()
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let eventType = ''
      let dataLines: string[] = []

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (line.startsWith(':')) continue

          if (line.startsWith('event: ')) {
            eventType = line.slice(7).trim()
          } else if (line.startsWith('data: ')) {
            dataLines.push(line.slice(6))
          } else if (line === '') {
            if (eventType && dataLines.length > 0) {
              const rawData = dataLines.join('\n')
              if (eventType === 'batch') {
                try {
                  const batch = JSON.parse(rawData) as BenchmarkReport[]
                  streamState = {
                    ...streamState,
                    reports: [...streamState.reports, ...batch],
                    status: 'streaming',
                  }
                  notifySubscribers()
                } catch {
                  // ignore parse errors
                }
              } else if (eventType === 'progress') {
                try {
                  const progress = JSON.parse(rawData) as { status: string }
                  streamState = { ...streamState, status: progress.status }
                  notifySubscribers()
                } catch {
                  // ignore
                }
              } else if (eventType === 'done') {
                streamState = { ...streamState, isDone: true, isStreaming: false, status: 'done' }
                notifySubscribers()
              } else if (eventType === 'error') {
                streamState = { ...streamState, error: rawData, isStreaming: false, status: 'error' }
                notifySubscribers()
              }
            }
            eventType = ''
            dataLines = []
          }
        }
      }

      streamState = { ...streamState, isDone: true, isStreaming: false }
      notifySubscribers()
    })
    .catch((err) => {
      if (err.name !== 'AbortError') {
        streamState = { ...streamState, error: err.message, isStreaming: false }
        notifySubscribers()
      }
    })
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useCachedBenchmarkReports() {
  const stream = useSyncExternalStore(subscribe, getSnapshot)

  // Cache hook provides demo fallback + persistence
  const cacheResult = useCache<BenchmarkReport[]>({
    key: 'benchmark-reports',
    category: 'costs',
    refreshInterval: 3_600_000,
    initialData: [],
    demoData: DEMO_REPORTS,
    fetcher: async () => {
      // If streaming already completed, return its data
      if (stream.reports.length > 0 && stream.isDone) {
        return stream.reports
      }
      // Fallback: try non-streaming endpoint (returns cache quickly)
      const res = await fetch(`/api/benchmarks/reports?since=${encodeURIComponent(stream.since)}`, {
        headers: authHeaders(),
      })
      if (res.status === 503) throw new Error('BENCHMARK_UNAVAILABLE')
      if (!res.ok) throw new Error(`Benchmark API error: ${res.status}`)
      const data = await res.json()
      return (data.reports ?? []) as BenchmarkReport[]
    },
    demoWhenEmpty: true,
  })

  // Use streamed data if we have any, otherwise fall back to cache/demo
  const hasStreamedData = stream.reports.length > 0
  const effectiveData = hasStreamedData ? stream.reports : cacheResult.data
  const effectiveIsDemoFallback = hasStreamedData ? false : (cacheResult.isDemoFallback && !cacheResult.isLoading)

  return {
    ...cacheResult,
    data: effectiveData,
    isDemoFallback: effectiveIsDemoFallback,
    isLoading: cacheResult.isLoading || (stream.isStreaming && !hasStreamedData),
    isStreaming: stream.isStreaming,
    streamProgress: stream.reports.length,
    streamStatus: stream.status,
    currentSince: stream.since,
  }
}
