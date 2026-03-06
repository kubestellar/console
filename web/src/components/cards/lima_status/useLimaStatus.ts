import { useCache } from '../../../lib/cache'
import { useCardLoadingState } from '../CardDataContext'
import { LIMA_DEMO_DATA, type LimaDemoData, type LimaInstance } from './demoData'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../../../lib/constants/network'

export interface LimaStatus {
  instances: LimaInstance[]
  totalNodes: number
  runningNodes: number
  stoppedNodes: number
  brokenNodes: number
  health: 'healthy' | 'degraded' | 'not-detected'
  totalCpuCores: number
  totalMemoryGB: number
  lastCheckTime: string
}

const INITIAL_DATA: LimaStatus = {
  instances: [],
  totalNodes: 0,
  runningNodes: 0,
  stoppedNodes: 0,
  brokenNodes: 0,
  health: 'not-detected',
  totalCpuCores: 0,
  totalMemoryGB: 0,
  lastCheckTime: new Date().toISOString(),
}

const CACHE_KEY = 'lima-status'

/**
 * NodeInfo shape returned by the console backend at GET /api/mcp/nodes.
 * Only the fields we need for Lima detection are typed here.
 * Backend returns flat cpuCapacity/memoryCapacity fields, not nested capacity object.
 */
interface BackendNodeInfo {
  name?: string
  osImage?: string
  labels?: Record<string, string>
  conditions?: Array<{ type?: string; status?: string }>
  cpuCapacity?: string
  memoryCapacity?: string
}

/**
 * Fetch Lima VM status via the console backend proxy.
 *
 * Lima nodes are identified by:
 * - A `lima.sh/instance` label on the node
 * - Node name starting with "lima-"
 * - The osImage or annotation containing "lima"
 *
 * Uses GET /api/mcp/nodes which proxies through the backend to all connected
 * clusters. The backend returns { nodes: NodeInfo[], source: string }.
 */
async function fetchLimaStatus(): Promise<LimaStatus> {
  const resp = await fetch('/api/mcp/nodes', {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
  })

  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status}`)
  }

  const body: { nodes?: BackendNodeInfo[] } = await resp.json()
  const allNodes = Array.isArray(body?.nodes) ? body.nodes : []

  // Detect Lima nodes by name prefix, label, or OS image
  // Note: Backend only exposes labels, not annotations
  const limaNodes = allNodes.filter(
    (n) =>
      n.name?.startsWith('lima-') ||
      n.labels?.['lima.sh/instance'] !== undefined ||
      n.osImage?.toLowerCase().includes('lima'),
  )

  if (limaNodes.length === 0) {
    return {
      ...INITIAL_DATA,
      health: 'not-detected',
      lastCheckTime: new Date().toISOString(),
    }
  }

  /**
   * Parse CPU quantity strings like "4", "4000m" to integer Core count.
   */
  function parseCpuCores(cpu?: string): number {
    if (!cpu) return 0
    if (cpu.endsWith('m')) return Math.ceil(parseInt(cpu) / 1000)
    return parseInt(cpu) || 0
  }

  /**
   * Parse memory quantity strings like "8Gi", "4096Mi" to integer GB.
   */
  function parseMemoryGB(mem?: string): number {
    if (!mem) return 0
    const gib = mem.match(/^(\d+)Gi$/)
    if (gib) return parseInt(gib[1])
    const mib = mem.match(/^(\d+)Mi$/)
    if (mib) return Math.round(parseInt(mib[1]) / 1024)
    const ki = mem.match(/^(\d+)Ki$/)
    if (ki) return Math.round(parseInt(ki[1]) / (1024 * 1024))
    return 0
  }

  const instances: LimaInstance[] = limaNodes.map((n) => {
    const isReady =
      n.conditions?.some((c) => c.type === 'Ready' && c.status === 'True') ??
      false
    const hasPressure =
      n.conditions?.some(
        (c) =>
          (c.type === 'DiskPressure' ||
            c.type === 'MemoryPressure' ||
            c.type === 'PIDPressure') &&
          c.status === 'True',
      ) ?? false

    const nodeStatus: 'running' | 'stopped' | 'broken' = hasPressure
      ? 'broken'
      : isReady
        ? 'running'
        : 'stopped'

    // Try to extract Lima version from label (best effort)
    const limaVersion = n.labels?.['lima.sh/version'] ?? 'unknown'

    return {
      name: n.name ?? 'unknown',
      status: nodeStatus,
      cpuCores: parseCpuCores(n.cpuCapacity),
      memoryGB: parseMemoryGB(n.memoryCapacity),
      diskGB: 0, // disk info not in standard node capacity
      arch:
        n.labels?.['kubernetes.io/arch'] ??
        n.labels?.['beta.kubernetes.io/arch'] ??
        'unknown',
      os: n.osImage ?? 'Linux',
      limaVersion,
      lastSeen: new Date().toISOString(),
    }
  })

  const runningNodes = instances.filter((i) => i.status === 'running').length
  const stoppedNodes = instances.filter((i) => i.status === 'stopped').length
  const brokenNodes = instances.filter((i) => i.status === 'broken').length

  const totalCpuCores = instances.reduce((s, i) => s + i.cpuCores, 0)
  const totalMemoryGB = instances.reduce((s, i) => s + i.memoryGB, 0)

  const health: 'healthy' | 'degraded' =
    brokenNodes > 0 || stoppedNodes > 0 ? 'degraded' : 'healthy'

  return {
    instances,
    totalNodes: limaNodes.length,
    runningNodes,
    stoppedNodes,
    brokenNodes,
    health,
    totalCpuCores,
    totalMemoryGB,
    lastCheckTime: new Date().toISOString(),
  }
}

function toDemoStatus(demo: LimaDemoData): LimaStatus {
  return {
    instances: demo.instances,
    totalNodes: demo.totalNodes,
    runningNodes: demo.runningNodes,
    stoppedNodes: demo.stoppedNodes,
    brokenNodes: demo.brokenNodes,
    health: demo.health,
    totalCpuCores: demo.totalCpuCores,
    totalMemoryGB: demo.totalMemoryGB,
    lastCheckTime: demo.lastCheckTime,
  }
}

export interface UseLimaStatusResult {
  data: LimaStatus
  loading: boolean
  error: boolean
  consecutiveFailures: number
  showSkeleton: boolean
  showEmptyState: boolean
}

export function useLimaStatus(): UseLimaStatusResult {
  const { data, isLoading, isFailed, consecutiveFailures, isDemoFallback } =
    useCache<LimaStatus>({
      key: CACHE_KEY,
      category: 'default',
      initialData: INITIAL_DATA,
      demoData: toDemoStatus(LIMA_DEMO_DATA),
      persist: true,
      fetcher: fetchLimaStatus,
    })

  // hasAnyData is true only when Lima nodes exist.
  // 'not-detected' is NOT counted as "has data" so the empty state shows properly.
  const hasAnyData = data.totalNodes > 0

  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading,
    hasAnyData,
    isFailed,
    consecutiveFailures,
    isDemoData: isDemoFallback,
  })

  return {
    data,
    loading: isLoading,
    error: isFailed && !hasAnyData,
    consecutiveFailures,
    showSkeleton,
    showEmptyState,
  }
}
