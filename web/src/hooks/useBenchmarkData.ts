/**
 * Hook for fetching live benchmark data from the backend.
 *
 * When a Google Drive API key is configured on the backend, this returns
 * real benchmark reports (v0.1 data adapted to the v0.2 BenchmarkReport
 * interface). When not configured or in demo mode, returns mock data from
 * generateBenchmarkReports().
 */
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
  const result = useCache<BenchmarkReport[]>({
    key: 'benchmark-reports',
    category: 'costs',
    refreshInterval: 3_600_000, // 1 hour — data updates daily
    initialData: [],
    demoData: DEMO_REPORTS,
    fetcher: async () => {
      const res = await fetch('/api/benchmarks/reports', {
        headers: authHeaders(),
      })

      if (res.status === 503) {
        // Backend not configured — caller should fall back to demo data
        throw new Error('BENCHMARK_UNAVAILABLE')
      }

      if (!res.ok) {
        throw new Error(`Benchmark API error: ${res.status}`)
      }

      const data = await res.json()
      return (data.reports ?? []) as BenchmarkReport[]
    },
    demoWhenEmpty: true, // Fall back to demo if live returns empty
  })

  return result
}
