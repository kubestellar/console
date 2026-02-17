/**
 * usePrometheusMetrics — polls vLLM Prometheus metrics via the agent's
 * /prometheus/query proxy endpoint. Returns per-pod metric values that
 * LLM-d cards use instead of simulated data.
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { LOCAL_AGENT_HTTP_URL } from '../lib/constants'

const DEFAULT_POLL_INTERVAL_MS = 5_000

/** Per-pod vLLM metrics */
export interface PodMetrics {
  kvCacheUsage: number       // 0-1 (vllm:gpu_cache_usage_perc)
  requestsRunning: number    // integer (vllm:num_requests_running)
  requestsWaiting: number    // integer (vllm:num_requests_waiting)
  throughputTps: number      // tokens/sec (vllm:avg_generation_throughput_toks_per_s)
  ttftP50: number            // seconds (histogram p50)
  tpotP50: number            // seconds (histogram p50)
}

export interface PrometheusMetricsResult {
  /** Per-pod metrics keyed by pod name */
  metrics: Record<string, PodMetrics> | null
  loading: boolean
  error: string | null
}

// The 6 vLLM metric queries we need
const METRIC_QUERIES = {
  kvCacheUsage: 'vllm:gpu_cache_usage_perc',
  requestsRunning: 'vllm:num_requests_running',
  requestsWaiting: 'vllm:num_requests_waiting',
  throughputTps: 'vllm:avg_generation_throughput_toks_per_s',
  ttftP50: 'histogram_quantile(0.5, rate(vllm:time_to_first_token_seconds_bucket[5m]))',
  tpotP50: 'histogram_quantile(0.5, rate(vllm:time_per_output_token_seconds_bucket[5m]))',
} as const

type MetricKey = keyof typeof METRIC_QUERIES

/** Prometheus instant query response shape */
interface PromResponse {
  status: 'success' | 'error'
  data?: {
    resultType: 'vector' | 'matrix' | 'scalar' | 'string'
    result: Array<{
      metric: Record<string, string>
      value: [number, string] // [timestamp, value]
    }>
  }
  error?: string
}

/** Extract pod name from Prometheus metric labels */
function extractPodName(metric: Record<string, string>): string {
  return metric.pod || metric.kubernetes_pod_name || metric.instance || 'unknown'
}

async function queryPrometheus(
  cluster: string,
  namespace: string,
  query: string,
  signal: AbortSignal,
): Promise<PromResponse> {
  const params = new URLSearchParams({ cluster, namespace, query })
  const resp = await fetch(`${LOCAL_AGENT_HTTP_URL}/prometheus/query?${params}`, {
    signal,
    headers: { Accept: 'application/json' },
  })
  if (!resp.ok) {
    throw new Error(`Agent returned ${resp.status}`)
  }
  return resp.json()
}

export function usePrometheusMetrics(
  cluster: string | undefined,
  namespace: string | undefined,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
): PrometheusMetricsResult {
  const [metrics, setMetrics] = useState<Record<string, PodMetrics> | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const fetchMetrics = useCallback(async () => {
    if (!cluster || !namespace) return

    // Cancel any in-flight request
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setLoading(prev => !prev ? true : prev) // only set true on first load

    try {
      // Fire all 6 queries in parallel
      const entries = Object.entries(METRIC_QUERIES) as [MetricKey, string][]
      const results = await Promise.allSettled(
        entries.map(([, query]) =>
          queryPrometheus(cluster, namespace, query, controller.signal)
        ),
      )

      if (controller.signal.aborted) return

      // Build per-pod map
      const podMap: Record<string, PodMetrics> = {}

      const ensurePod = (name: string): PodMetrics => {
        if (!podMap[name]) {
          podMap[name] = {
            kvCacheUsage: 0,
            requestsRunning: 0,
            requestsWaiting: 0,
            throughputTps: 0,
            ttftP50: 0,
            tpotP50: 0,
          }
        }
        return podMap[name]
      }

      let hasAnyData = false

      results.forEach((result, i) => {
        if (result.status !== 'fulfilled') return
        const resp = result.value
        if (resp.status !== 'success' || !resp.data?.result) return

        const key = entries[i][0]
        for (const item of resp.data.result) {
          const pod = extractPodName(item.metric)
          const val = parseFloat(item.value[1])
          if (isNaN(val)) continue

          hasAnyData = true
          const pm = ensurePod(pod)
          pm[key] = val
        }
      })

      if (!hasAnyData) {
        setMetrics(null)
        setError('No Prometheus data available')
      } else {
        setMetrics(podMap)
        setError(null)
      }
    } catch (e) {
      if (controller.signal.aborted) return
      setMetrics(null)
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false)
      }
    }
  }, [cluster, namespace])

  useEffect(() => {
    if (!cluster || !namespace) {
      setMetrics(null)
      setError(null)
      setLoading(false)
      return
    }

    // Fetch immediately, then poll
    fetchMetrics()
    const interval = setInterval(fetchMetrics, pollIntervalMs)

    return () => {
      clearInterval(interval)
      abortRef.current?.abort()
    }
  }, [fetchMetrics, pollIntervalMs])

  return { metrics, loading, error }
}
