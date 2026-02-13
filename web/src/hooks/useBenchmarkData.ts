/**
 * Hook for fetching live benchmark data from the backend via SSE streaming.
 *
 * Uses Server-Sent Events to stream benchmark reports incrementally from
 * Google Drive. Cards update progressively as batches arrive. Falls back to
 * demo data when backend is unavailable or returns empty.
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { useCache } from '../lib/cache'
import {
  generateBenchmarkReports,
  type BenchmarkReport,
} from '../lib/llmd/benchmarkMockData'

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

const DEMO_REPORTS = generateBenchmarkReports()

export function useCachedBenchmarkReports() {
  const [streamedReports, setStreamedReports] = useState<BenchmarkReport[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamDone, setStreamDone] = useState(false)
  const [, setStreamError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const hasStartedRef = useRef(false)

  // Cache hook provides demo fallback + persistence
  const cacheResult = useCache<BenchmarkReport[]>({
    key: 'benchmark-reports',
    category: 'costs',
    refreshInterval: 3_600_000,
    initialData: [],
    demoData: DEMO_REPORTS,
    fetcher: async () => {
      // If streaming already completed, return its data
      if (streamedReports.length > 0 && streamDone) {
        return streamedReports
      }
      // Fallback: try non-streaming endpoint (returns cache quickly)
      const res = await fetch('/api/benchmarks/reports', {
        headers: authHeaders(),
      })
      if (res.status === 503) throw new Error('BENCHMARK_UNAVAILABLE')
      if (!res.ok) throw new Error(`Benchmark API error: ${res.status}`)
      const data = await res.json()
      return (data.reports ?? []) as BenchmarkReport[]
    },
    demoWhenEmpty: true,
  })

  const startStream = useCallback(() => {
    if (hasStartedRef.current) return
    hasStartedRef.current = true

    const abort = new AbortController()
    abortRef.current = abort
    setIsStreaming(true)
    setStreamDone(false)
    setStreamError(null)

    const token = localStorage.getItem('token')

    fetch('/api/benchmarks/reports/stream', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: abort.signal,
    })
      .then(async (res) => {
        if (!res.ok || !res.body) {
          setIsStreaming(false)
          setStreamError(`Stream error: ${res.status}`)
          return
        }

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })

          // Parse SSE events
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''

          let eventType = ''
          let dataLines: string[] = []

          for (const line of lines) {
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
                    setStreamedReports(prev => [...prev, ...batch])
                  } catch {
                    // ignore parse errors
                  }
                } else if (eventType === 'done') {
                  setStreamDone(true)
                  setIsStreaming(false)
                } else if (eventType === 'error') {
                  setStreamError(rawData)
                  setIsStreaming(false)
                }
              }
              eventType = ''
              dataLines = []
            }
          }
        }

        setIsStreaming(false)
        setStreamDone(true)
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          setStreamError(err.message)
          setIsStreaming(false)
        }
      })
  }, [])

  useEffect(() => {
    startStream()
    return () => {
      abortRef.current?.abort()
    }
  }, [startStream])

  // Use streamed data if we have any, otherwise fall back to cache/demo
  const hasStreamedData = streamedReports.length > 0
  const effectiveData = hasStreamedData ? streamedReports : cacheResult.data
  const effectiveIsDemoFallback = hasStreamedData ? false : cacheResult.isDemoFallback

  return {
    ...cacheResult,
    data: effectiveData,
    isDemoFallback: effectiveIsDemoFallback,
    isLoading: cacheResult.isLoading || (isStreaming && !hasStreamedData),
    isStreaming,
    streamProgress: streamedReports.length,
  }
}
