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
  autoRefresh?: boolean
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

/**
 * Structured upstream-error channel returned by the quantum-kc-demo workload
 * (v0.4.0+). Absent on older workloads, in which case the Console falls back
 * to message-text classification via `classifyApiError`.
 */
export interface QuantumIbmError {
  code:
    | 'rate_limited'
    | 'service_unavailable'
    | 'timeout'
    | 'account_not_found'
    | 'unknown'
  message: string
  retryable: boolean
}

export interface QuantumAuthStatus {
  authenticated: boolean
  /**
   * Whether a saved token exists on the workload backend (auth.json on
   * emptyDir OR Qiskit's account file on the PV — either present = `true`).
   *
   * Provided by quantum-kc-demo v0.4.0+. Older workloads omit this field;
   * the fetcher coerces missing values to `false`. The badge sits at "Not
   * configured" against an older workload until the next successful
   * validation flips `authenticated:true` — harmless and self-healing.
   */
  tokenStored: boolean
  /**
   * Structured payload describing the most recent IBM-side validation
   * error, when one occurred. `null` when validation succeeded or was not
   * attempted. Provided by v0.4.0+ workloads.
   */
  lastIbmError: QuantumIbmError | null
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
  qasm_file: 'bell.qasm',
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
  num_qubits: 2,
  pattern: '00',
}

export const DEMO_QUANTUM_CIRCUIT: QuantumCircuitAsciiData = {
  circuitAscii: `     ┌───┐     ┌─┐
q_0: ┤ H ├──■──┤M├───
     └───┘┌─┴─┐└╥┘┌─┐
q_1: ─────┤ X ├─╫─┤M├
          └───┘ ║ └╥┘
c: 2/═══════════╩══╩═
                0  1`,
}

const DEFAULT_AUTH_STATUS: QuantumAuthStatus = {
  authenticated: false,
  tokenStored: false,
  lastIbmError: null,
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

/**
 * Validate a `lastIbmError` payload from the workload at the fetcher
 * boundary. Returns the value typed as `QuantumIbmError` if the shape is
 * complete and well-formed; returns `null` for any malformed payload.
 *
 * This is defensive coercion: TypeScript types lie about JSON, and
 * downstream UI code interprets a non-null `lastIbmError` as "the workload
 * told us something authoritative" — suppressing the message-text
 * `classifyApiError` fallback. A partial object (e.g. `{code: 'rate_limited'}`
 * with no `retryable`) would silently disable that fallback while also
 * having nothing useful to render. Treating partial payloads as `null`
 * keeps the fallback alive.
 *
 * Unrecognized `code` values are accepted as-is (typed back to the union
 * via cast) so a future workload version that adds a new code doesn't
 * silently lose its error classification on older Console builds.
 */
function coerceLastIbmError(raw: unknown): QuantumIbmError | null {
  if (raw === null || raw === undefined) return null
  if (typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  if (typeof obj.code !== 'string') return null
  if (typeof obj.message !== 'string') return null
  if (typeof obj.retryable !== 'boolean') return null
  return {
    code: obj.code as QuantumIbmError['code'],
    message: obj.message,
    retryable: obj.retryable,
  }
}

async function fetchQuantumAuthStatus(): Promise<QuantumAuthStatus> {
  const response = await fetchQuantumJson<{
    authenticated?: unknown
    tokenStored?: unknown
    lastIbmError?: unknown
  }>(QUANTUM_AUTH_STATUS_ENDPOINT)
  // Coerce missing or malformed v0.4.0 fields to safe defaults so this
  // hook works against pre-v0.4 workloads AND defends against a
  // misbehaving workload returning a partial `lastIbmError` payload.
  // `tokenStored:false` is the conservative choice; the Console badge
  // falls back to "Not configured" until `authenticated:true` arrives,
  // which self-heals on first valid check.
  return {
    authenticated: response.authenticated === true,
    tokenStored: response.tokenStored === true,
    lastIbmError: coerceLastIbmError(response.lastIbmError),
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
  autoRefresh,
}: UseQuantumCacheOptions): UseCachedQuantumResult<QuantumAuthStatus> {
  const result = useCache<QuantumAuthStatus>({
    key: QUANTUM_AUTH_STATUS_CACHE_KEY,
    category: 'realtime',
    refreshInterval: pollInterval,
    autoRefresh: (autoRefresh ?? true) && !isGlobalQuantumPollingPaused(),
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
    demoData: DEMO_QUANTUM_CIRCUIT,
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
