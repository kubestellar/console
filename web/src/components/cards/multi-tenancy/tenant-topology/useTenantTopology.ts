/**
 * useTenantTopology — Aggregates the 4 technology hooks plus network stats
 * to determine component detection status and live throughput for each
 * topology node.
 *
 * Returns simple detected/healthy booleans per component, per-connection
 * throughput rates (bytes/sec), and a combined isDemoData flag that the card
 * uses for the Demo badge via useCardLoadingState.
 */
import { useMemo } from 'react'
import { useOvnStatus } from '../ovn-status/useOvnStatus'
import { useKubeFlexStatus } from '../kubeflex-status/useKubeflexStatus'
import { useK3sStatus } from '../k3s-status/useK3sStatus'
import { useKubevirtStatus } from '../kubevirt-status/useKubevirtStatus'
import { useNetworkStats } from './useNetworkStats'

export interface TenantTopologyData {
  ovnDetected: boolean
  ovnHealthy: boolean
  kubeflexDetected: boolean
  kubeflexHealthy: boolean
  k3sDetected: boolean
  k3sHealthy: boolean
  kubevirtDetected: boolean
  kubevirtHealthy: boolean
  /** Combined rx+tx bytes/sec: KubeVirt eth0 -> L3 UDN (data-plane) */
  kvEth0Rate: number
  /** Combined rx+tx bytes/sec: KubeVirt eth1 -> L2 UDN (control-plane) */
  kvEth1Rate: number
  /** Combined rx+tx bytes/sec: K3s eth0 -> Default Net -> KubeFlex (management) */
  k3sEth0Rate: number
  /** Combined rx+tx bytes/sec: K3s eth1 -> L2 UDN (control-plane) */
  k3sEth1Rate: number
  /** Receive/transmit split for ingress/egress labels */
  kvEth0Rx: number
  kvEth0Tx: number
  kvEth1Rx: number
  kvEth1Tx: number
  k3sEth0Rx: number
  k3sEth0Tx: number
  k3sEth1Rx: number
  k3sEth1Tx: number
  isLoading: boolean
  isRefreshing: boolean
  isDemoData: boolean
}

export function useTenantTopology(): TenantTopologyData {
  const ovnResult = useOvnStatus()
  const kubeflexResult = useKubeFlexStatus()
  const k3sResult = useK3sStatus()
  const kubevirtResult = useKubevirtStatus()
  const netStats = useNetworkStats()

  const ovn = ovnResult.data
  const kubeflex = kubeflexResult.data
  const k3s = k3sResult.data
  const kubevirt = kubevirtResult.data

  const isLoading =
    ovnResult.loading || kubeflexResult.loading || k3sResult.loading || kubevirtResult.loading
  const isRefreshing =
    ovnResult.isRefreshing || kubeflexResult.isRefreshing || k3sResult.isRefreshing || kubevirtResult.isRefreshing

  // Demo when ALL hooks are returning demo fallback data
  const isDemoData = ovnResult.isDemoData && kubeflexResult.isDemoData && k3sResult.isDemoData && kubevirtResult.isDemoData

  return useMemo(
    () => ({
      ovnDetected: ovn.detected,
      ovnHealthy: ovn.health === 'healthy',
      kubeflexDetected: kubeflex.detected,
      kubeflexHealthy: kubeflex.health === 'healthy',
      k3sDetected: k3s.detected,
      k3sHealthy: k3s.health === 'healthy',
      kubevirtDetected: kubevirt.detected,
      kubevirtHealthy: kubevirt.health === 'healthy',
      kvEth0Rate: netStats.kvEth0Rate,
      kvEth1Rate: netStats.kvEth1Rate,
      k3sEth0Rate: netStats.k3sEth0Rate,
      k3sEth1Rate: netStats.k3sEth1Rate,
      kvEth0Rx: netStats.kvEth0Rx,
      kvEth0Tx: netStats.kvEth0Tx,
      kvEth1Rx: netStats.kvEth1Rx,
      kvEth1Tx: netStats.kvEth1Tx,
      k3sEth0Rx: netStats.k3sEth0Rx,
      k3sEth0Tx: netStats.k3sEth0Tx,
      k3sEth1Rx: netStats.k3sEth1Rx,
      k3sEth1Tx: netStats.k3sEth1Tx,
      isLoading,
      isRefreshing,
      isDemoData,
    }),
    [
      ovn.detected, ovn.health,
      kubeflex.detected, kubeflex.health,
      k3s.detected, k3s.health,
      kubevirt.detected, kubevirt.health,
      netStats.kvEth0Rate, netStats.kvEth1Rate,
      netStats.k3sEth0Rate, netStats.k3sEth1Rate,
      netStats.kvEth0Rx, netStats.kvEth0Tx,
      netStats.kvEth1Rx, netStats.kvEth1Tx,
      netStats.k3sEth0Rx, netStats.k3sEth0Tx,
      netStats.k3sEth1Rx, netStats.k3sEth1Tx,
      isLoading, isRefreshing, isDemoData,
    ],
  )
}
