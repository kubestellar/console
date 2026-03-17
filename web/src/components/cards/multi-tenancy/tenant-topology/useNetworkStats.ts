/**
 * useNetworkStats — Fetches per-interface network throughput data for
 * multi-tenancy infrastructure pods (KubeVirt, K3s, OVN).
 *
 * Uses the unified cache layer with the 'realtime' refresh category (15s).
 * Returns per-connection throughput rates that the topology card uses to
 * scale animation speed, particle size, and throughput labels.
 *
 * When the backend returns empty stats (kubelet API unavailable), the hook
 * falls back to demo data so the topology always shows animated connections.
 */

import { useCache } from '../../../../lib/cache'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../../../../lib/constants/network'

// ============================================================================
// Constants
// ============================================================================

/** Cache key for network stats data */
const NETWORK_STATS_CACHE_KEY = 'tenant-network-stats'

/** Refresh category — 15 seconds (realtime) for live throughput metrics */
const NETWORK_STATS_REFRESH_CATEGORY = 'realtime' as const

// ============================================================================
// Types
// ============================================================================

export interface InterfaceStats {
  /** Interface name (e.g., eth0, eth1) */
  name: string
  /** Receive bytes per second */
  rxBytesPerSec: number
  /** Transmit bytes per second */
  txBytesPerSec: number
}

export interface PodNetworkStats {
  /** Pod name */
  podName: string
  /** Pod namespace */
  namespace: string
  /** Topology component: kubevirt, k3s, or ovn */
  component: 'kubevirt' | 'k3s' | 'ovn'
  /** Per-interface throughput data */
  interfaces: InterfaceStats[]
}

export interface NetworkStatsData {
  /** Array of per-pod network stats */
  stats: PodNetworkStats[]
}

// ============================================================================
// Demo Data
// ============================================================================

/** KubeVirt data-plane (eth0) receive rate — 10 KB/s */
const DEMO_KV_ETH0_RX_RATE = 10240
/** KubeVirt data-plane (eth0) transmit rate — 5 KB/s */
const DEMO_KV_ETH0_TX_RATE = 5120
/** KubeVirt control-plane (eth1) receive rate — 2.5 KB/s */
const DEMO_KV_ETH1_RX_RATE = 2560
/** KubeVirt control-plane (eth1) transmit rate — 1.3 KB/s */
const DEMO_KV_ETH1_TX_RATE = 1280
/** K3s management (eth0) receive rate — 5 KB/s */
const DEMO_K3S_ETH0_RX_RATE = 5120
/** K3s management (eth0) transmit rate — 2.5 KB/s */
const DEMO_K3S_ETH0_TX_RATE = 2560
/** K3s control-plane (eth1) receive rate — 1.3 KB/s */
const DEMO_K3S_ETH1_RX_RATE = 1280
/** K3s control-plane (eth1) transmit rate — 0.6 KB/s */
const DEMO_K3S_ETH1_TX_RATE = 640

const DEMO_NETWORK_STATS: NetworkStatsData = {
  stats: [
    {
      podName: 'tenant-1-vm-virt-launcher',
      namespace: 'tenant-1-ns1',
      component: 'kubevirt',
      interfaces: [
        { name: 'eth0', rxBytesPerSec: DEMO_KV_ETH0_RX_RATE, txBytesPerSec: DEMO_KV_ETH0_TX_RATE },
        { name: 'eth1', rxBytesPerSec: DEMO_KV_ETH1_RX_RATE, txBytesPerSec: DEMO_KV_ETH1_TX_RATE },
      ],
    },
    {
      podName: 'k3s-server',
      namespace: 'tenant-1-ns2',
      component: 'k3s',
      interfaces: [
        { name: 'eth0', rxBytesPerSec: DEMO_K3S_ETH0_RX_RATE, txBytesPerSec: DEMO_K3S_ETH0_TX_RATE },
        { name: 'eth1', rxBytesPerSec: DEMO_K3S_ETH1_RX_RATE, txBytesPerSec: DEMO_K3S_ETH1_TX_RATE },
      ],
    },
  ],
}

/** Empty initial data — shown while first fetch is in progress */
const INITIAL_DATA: NetworkStatsData = { stats: [] }

// ============================================================================
// Fetcher
// ============================================================================

async function fetchNetworkStats(): Promise<NetworkStatsData> {
  const resp = await fetch('/api/mcp/pod-network-stats', {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
  })
  if (!resp.ok) {
    // 401/403 — not authenticated or insufficient permissions — return empty
    // so useCache falls back to demo data
    if (resp.status === 401 || resp.status === 403) {
      return { stats: [] }
    }
    throw new Error(`HTTP ${resp.status}`)
  }
  return resp.json()
}

// ============================================================================
// Hook
// ============================================================================

export interface UseNetworkStatsResult {
  /** Combined rx+tx bytes/sec for KubeVirt eth0 (data-plane to L3 UDN) */
  kvEth0Rate: number
  /** Combined rx+tx bytes/sec for KubeVirt eth1 (control-plane to L2 UDN) */
  kvEth1Rate: number
  /** Combined rx+tx bytes/sec for K3s eth0 (management to KubeFlex via default net) */
  k3sEth0Rate: number
  /** Combined rx+tx bytes/sec for K3s eth1 (control-plane to L2 UDN) */
  k3sEth1Rate: number
  /** Receive bytes/sec for KubeVirt eth0 */
  kvEth0Rx: number
  /** Transmit bytes/sec for KubeVirt eth0 */
  kvEth0Tx: number
  /** Receive bytes/sec for KubeVirt eth1 */
  kvEth1Rx: number
  /** Transmit bytes/sec for KubeVirt eth1 */
  kvEth1Tx: number
  /** Receive bytes/sec for K3s eth0 */
  k3sEth0Rx: number
  /** Transmit bytes/sec for K3s eth0 */
  k3sEth0Tx: number
  /** Receive bytes/sec for K3s eth1 */
  k3sEth1Rx: number
  /** Transmit bytes/sec for K3s eth1 */
  k3sEth1Tx: number
  /** Whether we are showing demo/fallback data */
  isDemoData: boolean
  /** Whether any real stats were returned */
  hasData: boolean
}

export function useNetworkStats(): UseNetworkStatsResult {
  const { data, isDemoFallback, isLoading } = useCache<NetworkStatsData>({
    key: NETWORK_STATS_CACHE_KEY,
    category: NETWORK_STATS_REFRESH_CATEGORY,
    initialData: INITIAL_DATA,
    demoData: DEMO_NETWORK_STATS,
    fetcher: fetchNetworkStats,
  })

  // Extract throughput per connection:
  // kvEth0 = KubeVirt eth0 (data-plane to L3 UDN)
  // kvEth1 = KubeVirt eth1 (control-plane to L2 UDN)
  // k3sEth0 = K3s eth0 (management to KubeFlex)
  // k3sEth1 = K3s eth1 (control-plane to L2 UDN)

  const kvStats = (data.stats || []).find((s) => s.component === 'kubevirt')
  const k3sStats = (data.stats || []).find((s) => s.component === 'k3s')

  const getRate = (stats: PodNetworkStats | undefined, ifName: string): number => {
    const iface = (stats?.interfaces || []).find((i) => i.name === ifName)
    return iface ? iface.rxBytesPerSec + iface.txBytesPerSec : 0
  }

  const getRx = (stats: PodNetworkStats | undefined, ifName: string): number => {
    const iface = (stats?.interfaces || []).find((i) => i.name === ifName)
    return iface ? iface.rxBytesPerSec : 0
  }

  const getTx = (stats: PodNetworkStats | undefined, ifName: string): number => {
    const iface = (stats?.interfaces || []).find((i) => i.name === ifName)
    return iface ? iface.txBytesPerSec : 0
  }

  return {
    kvEth0Rate: getRate(kvStats, 'eth0'),
    kvEth1Rate: getRate(kvStats, 'eth1'),
    k3sEth0Rate: getRate(k3sStats, 'eth0'),
    k3sEth1Rate: getRate(k3sStats, 'eth1'),
    kvEth0Rx: getRx(kvStats, 'eth0'),
    kvEth0Tx: getTx(kvStats, 'eth0'),
    kvEth1Rx: getRx(kvStats, 'eth1'),
    kvEth1Tx: getTx(kvStats, 'eth1'),
    k3sEth0Rx: getRx(k3sStats, 'eth0'),
    k3sEth0Tx: getTx(k3sStats, 'eth0'),
    k3sEth1Rx: getRx(k3sStats, 'eth1'),
    k3sEth1Tx: getTx(k3sStats, 'eth1'),
    isDemoData: isDemoFallback && !isLoading,
    hasData: (data.stats || []).length > 0,
  }
}
