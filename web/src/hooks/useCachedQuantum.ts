import { useCache } from '../lib/cache'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../lib/constants/network'
import { isGlobalQuantumPollingPaused } from '../lib/quantum/pollingContext'

const QUANTUM_STATUS_CACHE_KEY = 'quantum-system-status'
const QUANTUM_AUTH_STATUS_CACHE_KEY = 'quantum-auth-status'
const QUANTUM_CIRCUIT_CACHE_KEY = 'quantum-circuit-ascii'
const QUANTUM_QUBIT_GRID_CACHE_KEY = 'quantum-qubit-grid'

const QUANTUM_STATUS_ENDPOINT = '/api/quantum/status'
const QUANTUM_AUTH_STATUS_ENDPOINT = '/api/quantum/auth/status'
const QUANTUM_CIRCUIT_ENDPOINT = '/api/quantum/qasm/circuit/ascii'
const QUANTUM_QUBIT_GRID_ENDPOINT = '/api/quantum/qubits/simple'

export const QUANTUM_STATUS_DEFAULT_POLL_MS = 8000
export const QUANTUM_CIRCUIT_DEFAULT_POLL_MS = 10000
export const QUANTUM_QUBIT_GRID_DEFAULT_POLL_MS = 10000

interface UseQuantumCacheOptions {
  isAuthenticated: boolean
  forceDemo?: boolean
  pollInterval?: number
}

interface UseCachedQuantumResult<T> {
  data: T
  isLoading: boolean
  isRefreshing: boolean
  isDemoData: boolean
  error: string | null
  isFailed: boolean
  consecutiveFailures: number
  lastRefresh: number | null
  refetch: () => Promise<void>
}

export interface QuantumVersionInfo {
  version: string
  commit: string
  timestamp: string
}

export interface QuantumCircuitInfo {
  num_qubits: number
  depth?: number
}

export interface QuantumControlSystem {
  command: string
  description: string
  status: string
  timestamp?: string
}

export interface QuantumSystemStatus {
  status: string
  running: boolean
  loop_running?: boolean
  execution_mode: string
  loop_mode: boolean
  circuit_info?: QuantumCircuitInfo
  control_system?: QuantumControlSystem
  backend_info?: {
    name?: string
    shots?: number
    type?: 'simulator' | 'noise_model' | 'real'
  } | null
  last_result?: {
    num_qubits: number
    shots: number
    counts: Record<string, number>
    timestamp: string
  } | null
  last_result_time?: string
  qasm_file: string
  message: string
  version_info?: QuantumVersionInfo
}

export interface QuantumAuthStatus {
  authenticated: boolean
}

export interface QuantumCircuitAsciiData {
  circuitAscii: string | null
}

export interface QuantumQubitSimpleData {
  num_qubits: number
  pattern: string
}

export interface QuantumQubitGridData {
  qubits: QuantumQubitSimpleData | null
  versionInfo: QuantumVersionInfo | null
}

export const DEMO_QUANTUM_STATUS: QuantumSystemStatus = {
  status: 'idle',
  running: false,
  loop_running: false,
  loop_mode: false,
  execution_mode: 'control-based',
  qasm_file: 'demo.qasm',
  message: 'Quantum system ready',
  backend_info: {
    name: 'aer',
    shots: 1024,
    type: 'simulator',
  },
  control_system: {
    command: 'idle',
    description: 'System idle, ready for commands',
    status: 'ready',
    timestamp: new Date().toISOString(),
  },
  version_info: {
    version: 'v0.2.58',
    commit: 'demo',
    timestamp: new Date().toISOString(),
  },
}

export const DEMO_QUANTUM_QUBITS: QuantumQubitSimpleData = {
  num_qubits: 8,
  pattern: '01010101',
}

const EMPTY_CIRCUIT_DATA: QuantumCircuitAsciiData = {
  circuitAscii: null,
}

const DEFAULT_AUTH_STATUS: QuantumAuthStatus = {
  authenticated: false,
}

async function fetchQuantumJson<T>(endpoint: string): Promise<T> {
  const response = await fetch(endpoint, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(body.trim() || `Failed to fetch quantum data (${response.status})`)
  }

  return response.json() as Promise<T>
}

async function fetchQuantumStatus(): Promise<QuantumSystemStatus> {
  return fetchQuantumJson<QuantumSystemStatus>(QUANTUM_STATUS_ENDPOINT)
}

async function fetchQuantumAuthStatus(): Promise<QuantumAuthStatus> {
  const response = await fetchQuantumJson<{ authenticated?: boolean }>(QUANTUM_AUTH_STATUS_ENDPOINT)
  return {
    authenticated: response.authenticated === true,
  }
}

async function fetchQuantumCircuitAscii(): Promise<QuantumCircuitAsciiData> {
  const response = await fetch(QUANTUM_CIRCUIT_ENDPOINT, {
    credentials: 'include',
    signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch circuit (${response.status})`)
  }

  const html = await response.text()
  const preMatch = html.match(/<pre>([\s\S]*?)<\/pre>/)
  if (!preMatch) {
    throw new Error('No circuit data found in response')
  }

  return {
    circuitAscii: preMatch[1].trimEnd(),
  }
}

async function fetchQuantumQubitGrid(): Promise<QuantumQubitGridData> {
  const payload = await fetchQuantumJson<Record<string, unknown>>(QUANTUM_QUBIT_GRID_ENDPOINT)

  let qubits: QuantumQubitSimpleData | null = null
  if (!payload.error) {
    qubits = {
      num_qubits: typeof payload.num_qubits === 'number' ? payload.num_qubits : 0,
      pattern: typeof payload.pattern === 'string' ? payload.pattern : '',
    }
  }

  try {
    const status = await fetchQuantumStatus()
    return {
      qubits,
      versionInfo: status.version_info ?? null,
    }
  } catch {
    return {
      qubits,
      versionInfo: null,
    }
  }
}

function getDisabledResult<T>(
  data: T,
  refetch: () => Promise<void>,
): UseCachedQuantumResult<T> {
  return {
    data,
    isLoading: false,
    isRefreshing: false,
    isDemoData: false,
    error: null,
    isFailed: false,
    consecutiveFailures: 0,
    lastRefresh: null,
    refetch,
  }
}

export function useQuantumSystemStatus({
  isAuthenticated,
  forceDemo = false,
  pollInterval = QUANTUM_STATUS_DEFAULT_POLL_MS,
}: UseQuantumCacheOptions): UseCachedQuantumResult<QuantumSystemStatus | null> {
  const result = useCache<QuantumSystemStatus | null>({
    key: QUANTUM_STATUS_CACHE_KEY,
    category: 'realtime',
    refreshInterval: pollInterval,
    autoRefresh: !isGlobalQuantumPollingPaused(),
    enabled: isAuthenticated && !forceDemo,
    initialData: null,
    demoData: DEMO_QUANTUM_STATUS,
    fetcher: fetchQuantumStatus,
  })

  if (!isAuthenticated) {
    return getDisabledResult<QuantumSystemStatus | null>(null, result.refetch)
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

export function useQuantumAuthStatus({
  isAuthenticated,
  forceDemo = false,
  pollInterval = QUANTUM_STATUS_DEFAULT_POLL_MS,
}: UseQuantumCacheOptions): UseCachedQuantumResult<QuantumAuthStatus> {
  const result = useCache<QuantumAuthStatus>({
    key: QUANTUM_AUTH_STATUS_CACHE_KEY,
    category: 'realtime',
    refreshInterval: pollInterval,
    autoRefresh: !isGlobalQuantumPollingPaused(),
    enabled: isAuthenticated && !forceDemo,
    initialData: DEFAULT_AUTH_STATUS,
    demoData: DEFAULT_AUTH_STATUS,
    fetcher: fetchQuantumAuthStatus,
  })

  if (!isAuthenticated) {
    return getDisabledResult(DEFAULT_AUTH_STATUS, result.refetch)
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

export function useQuantumCircuitAscii({
  isAuthenticated,
  forceDemo = false,
  pollInterval = QUANTUM_CIRCUIT_DEFAULT_POLL_MS,
}: UseQuantumCacheOptions): UseCachedQuantumResult<QuantumCircuitAsciiData | null> {
  const result = useCache<QuantumCircuitAsciiData | null>({
    key: QUANTUM_CIRCUIT_CACHE_KEY,
    category: 'realtime',
    refreshInterval: pollInterval,
    autoRefresh: !isGlobalQuantumPollingPaused(),
    enabled: isAuthenticated && !forceDemo,
    initialData: null,
    demoData: EMPTY_CIRCUIT_DATA,
    fetcher: fetchQuantumCircuitAscii,
  })

  if (!isAuthenticated) {
    return getDisabledResult<QuantumCircuitAsciiData | null>(null, result.refetch)
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

export function useQuantumQubitGridData({
  isAuthenticated,
  forceDemo = false,
  pollInterval = QUANTUM_QUBIT_GRID_DEFAULT_POLL_MS,
}: UseQuantumCacheOptions): UseCachedQuantumResult<QuantumQubitGridData | null> {
  const result = useCache<QuantumQubitGridData | null>({
    key: QUANTUM_QUBIT_GRID_CACHE_KEY,
    category: 'realtime',
    refreshInterval: pollInterval,
    autoRefresh: !isGlobalQuantumPollingPaused(),
    enabled: isAuthenticated && !forceDemo,
    initialData: null,
    demoData: {
      qubits: DEMO_QUANTUM_QUBITS,
      versionInfo: DEMO_QUANTUM_STATUS.version_info ?? null,
    },
    fetcher: fetchQuantumQubitGrid,
  })

  if (!isAuthenticated) {
    return getDisabledResult<QuantumQubitGridData | null>(null, result.refetch)
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

export const __testables = {
  fetchQuantumStatus,
  fetchQuantumAuthStatus,
  fetchQuantumCircuitAscii,
  fetchQuantumQubitGrid,
}
