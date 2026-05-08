import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../lib/auth'

const DEBUG = import.meta.env.VITE_DEBUG === 'true' || (typeof window !== 'undefined' && (window as any).DEBUG_QUANTUM)

export interface HistogramEntry {
  pattern: string
  count: number
  probability: number
}

export interface HistogramData {
  histogram: HistogramEntry[]
  sort: string
  num_patterns: number
  total_shots: number
  num_qubits: number | null
  timestamp: string | null
  backend: string | null
  backend_type: string | null
  execution_sequence: number | null
}

export function useResultHistogram(
  sortBy: 'count' | 'pattern' = 'count',
  pollInterval: number = 5000
) {
  const { isAuthenticated } = useAuth()
  const [data, setData] = useState<HistogramData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchHistogram = useCallback(async () => {
    if (!isAuthenticated) return

    setIsLoading(true)
    setError(null)
    try {
      if (DEBUG) console.log('[useResultHistogram] Fetching:', `/api/result/histogram?sort=${sortBy}`)
      const res = await fetch(`/api/result/histogram?sort=${sortBy}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      })

      if (DEBUG) console.log('[useResultHistogram] Response status:', res.status, 'content-type:', res.headers.get('content-type'))

      // Silently ignore 429 (rate limit) — don't report as error, just skip this poll
      if (res.status === 429) {
        if (DEBUG) console.debug('[useResultHistogram] Rate limited, skipping')
        setIsLoading(false)
        return
      }

      if (!res.ok) {
        const text = await res.text()
        if (DEBUG) console.error('[useResultHistogram] Non-ok response:', res.status, text.substring(0, 200))
        throw new Error(`Failed to fetch histogram (${res.status})`)
      }

      const json = await res.json()
      if (DEBUG) console.log('[useResultHistogram] Got data, num_patterns:', json.num_patterns)
      if (json.warning) {
        setData(null)
      } else {
        setData(json as HistogramData)
      }
      setError(null)
    } catch (err) {
      // Detect if we got HTML (loading page) instead of JSON — this means the backend
      // is temporarily unhealthy. Don't report an error, just silently skip this poll
      // and try again next time.
      const errMsg = err instanceof Error ? err.message : 'Failed to fetch histogram'
      if (errMsg.includes("<!doctype") || errMsg.includes("Unexpected token '<'")) {
        if (DEBUG) console.debug('[useResultHistogram] Got HTML (backend loading), retrying next poll')
        setIsLoading(false)
        return
      }
      if (DEBUG) console.error('[useResultHistogram] Fetch error:', errMsg, err)
      setError(errMsg)
    } finally {
      setIsLoading(false)
    }
  }, [isAuthenticated, sortBy])

  useEffect(() => {
    if (!isAuthenticated) return
    fetchHistogram()
    const timer = setInterval(fetchHistogram, pollInterval)
    return () => clearInterval(timer)
  }, [fetchHistogram, isAuthenticated, pollInterval])

  return { data, isLoading, error, refetch: fetchHistogram }
}
