import { useAuth } from '../lib/auth'
import { useCache } from '../lib/cache'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../lib/constants/network'
import { isQuantumForcedToDemo } from '../lib/demoMode'
import { isGlobalQuantumPollingPaused } from '../lib/quantum/pollingContext'

export type HistogramSort = 'count' | 'pattern'

export interface HistogramEntry {
  pattern: string
  count: number
  probability: number
}

export interface HistogramData {
  histogram: HistogramEntry[]
  sort: HistogramSort
  num_patterns: number
  total_shots: number
  num_qubits: number | null
  timestamp: string | null
  backend: string | null
  backend_type: string | null
  execution_sequence: number | null
}

interface HistogramResponse extends Partial<HistogramData> {
  warning?: string
}

interface UseResultHistogramResult {
  data: HistogramData | null
  isLoading: boolean
  isRefreshing: boolean
  isDemoData: boolean
  error: string | null
  isFailed: boolean
  consecutiveFailures: number
  lastRefresh: number | null
  refetch: () => Promise<void>
}

const HISTOGRAM_ENDPOINT = '/api/result/histogram'
const DEFAULT_SORT: HistogramSort = 'count'
const DEFAULT_POLL_MS = 5000
const RATE_LIMIT_STATUS = 429

const EMPTY_HISTOGRAM_DATA: HistogramData = {
  histogram: [],
  sort: DEFAULT_SORT,
  num_patterns: 0,
  total_shots: 0,
  num_qubits: null,
  timestamp: null,
  backend: null,
  backend_type: null,
  execution_sequence: null,
}

const DEMO_HISTOGRAM_DATA: HistogramData = {
  histogram: [
    { pattern: '00', count: 496, probability: 0.4844 },
    { pattern: '11', count: 372, probability: 0.3633 },
    { pattern: '01', count: 94, probability: 0.0918 },
    { pattern: '10', count: 62, probability: 0.0605 },
  ],
  sort: DEFAULT_SORT,
  num_patterns: 4,
  total_shots: 1024,
  num_qubits: 2,
  timestamp: '2026-05-08T14:00:00Z',
  backend: 'ibmq_qasm_simulator',
  backend_type: 'simulator',
  execution_sequence: 7,
}

function toNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function toNullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function toNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function normalizeSort(sortBy: string | undefined): HistogramSort {
  return sortBy === 'pattern' ? 'pattern' : 'count'
}

function normalizeHistogramData(raw: HistogramResponse, sortBy: HistogramSort): HistogramData {
  const entries = Array.isArray(raw.histogram)
    ? raw.histogram.map((entry): HistogramEntry => {
        const record = typeof entry === 'object' && entry !== null
          ? entry as unknown as Record<string, unknown>
          : {}

        return {
          pattern: typeof record.pattern === 'string' ? record.pattern : '',
          count: toNumber(record.count),
          probability: toNumber(record.probability),
        }
      })
    : []

  return {
    histogram: entries,
    sort: typeof raw.sort === 'string' ? normalizeSort(raw.sort) : sortBy,
    num_patterns: toNumber(raw.num_patterns, entries.length),
    total_shots: toNumber(raw.total_shots),
    num_qubits: toNullableNumber(raw.num_qubits),
    timestamp: toNullableString(raw.timestamp),
    backend: toNullableString(raw.backend),
    backend_type: toNullableString(raw.backend_type),
    execution_sequence: toNullableNumber(raw.execution_sequence),
  }
}

async function fetchHistogram(sortBy: HistogramSort): Promise<HistogramData> {
  const response = await fetch(`${HISTOGRAM_ENDPOINT}?sort=${sortBy}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
  })

  if (response.status === RATE_LIMIT_STATUS) {
    throw new Error(`Failed to fetch histogram (${RATE_LIMIT_STATUS})`)
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    const message = body.trim() || `Failed to fetch histogram (${response.status})`
    throw new Error(message)
  }

  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) {
    throw new Error('Failed to fetch histogram (unexpected response)')
  }

  const payload = await response.json() as HistogramResponse
  if (payload.warning) {
    return {
      ...EMPTY_HISTOGRAM_DATA,
      sort: sortBy,
    }
  }

  return normalizeHistogramData(payload, sortBy)
}

export function useResultHistogram(
  sortBy: HistogramSort = DEFAULT_SORT,
  pollInterval: number = DEFAULT_POLL_MS,
): UseResultHistogramResult {
  const { isAuthenticated } = useAuth()
  const isQuantumDemoOnly = isQuantumForcedToDemo()

  const result = useCache<HistogramData>({
    key: `quantum-result-histogram:${sortBy}`,
    category: 'realtime',
    refreshInterval: pollInterval,
    autoRefresh: !isGlobalQuantumPollingPaused(),
    enabled: isAuthenticated && !isQuantumDemoOnly,
    initialData: EMPTY_HISTOGRAM_DATA,
    demoData: {
      ...DEMO_HISTOGRAM_DATA,
      sort: sortBy,
      histogram: sortBy === 'pattern'
        ? [...DEMO_HISTOGRAM_DATA.histogram].sort((left, right) => left.pattern.localeCompare(right.pattern))
        : [...DEMO_HISTOGRAM_DATA.histogram].sort((left, right) => right.count - left.count),
    },
    fetcher: () => fetchHistogram(sortBy),
  })

  if (!isAuthenticated) {
    return {
      data: null,
      isLoading: false,
      isRefreshing: false,
      isDemoData: false,
      error: null,
      isFailed: false,
      consecutiveFailures: 0,
      lastRefresh: null,
      refetch: result.refetch,
    }
  }

  return {
    data: result.data,
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
    isDemoData: result.isDemoFallback && !result.isLoading,
    error: result.error,
    isFailed: result.isFailed,
    consecutiveFailures: result.consecutiveFailures,
    lastRefresh: result.lastRefresh,
    refetch: result.refetch,
  }
}
