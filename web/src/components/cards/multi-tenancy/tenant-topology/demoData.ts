/**
 * Demo data for the Tenant Topology card.
 *
 * All components detected and healthy with realistic throughput rates.
 * Animated flow particles show active bidirectional data transfer on all connections.
 * Includes rx/tx split for ingress/egress labels.
 */

import type { TenantTopologyData } from './useTenantTopology'

/** Demo KubeVirt eth0 receive — 10 KB/s data-plane ingress */
const DEMO_KV_ETH0_RX = 10240
/** Demo KubeVirt eth0 transmit — 5 KB/s data-plane egress */
const DEMO_KV_ETH0_TX = 5120
/** Demo KubeVirt eth1 receive — 2.5 KB/s control-plane ingress */
const DEMO_KV_ETH1_RX = 2560
/** Demo KubeVirt eth1 transmit — 1.3 KB/s control-plane egress */
const DEMO_KV_ETH1_TX = 1280
/** Demo K3s eth0 receive — 5 KB/s management ingress */
const DEMO_K3S_ETH0_RX = 5120
/** Demo K3s eth0 transmit — 2.5 KB/s management egress */
const DEMO_K3S_ETH0_TX = 2560
/** Demo K3s eth1 receive — 1.3 KB/s control-plane ingress */
const DEMO_K3S_ETH1_RX = 1280
/** Demo K3s eth1 transmit — 0.6 KB/s control-plane egress */
const DEMO_K3S_ETH1_TX = 640

export const DEMO_TENANT_TOPOLOGY: TenantTopologyData = {
  ovnDetected: true,
  ovnHealthy: true,
  kubeflexDetected: true,
  kubeflexHealthy: true,
  k3sDetected: true,
  k3sHealthy: true,
  kubevirtDetected: true,
  kubevirtHealthy: true,
  kvEth0Rate: DEMO_KV_ETH0_RX + DEMO_KV_ETH0_TX,
  kvEth1Rate: DEMO_KV_ETH1_RX + DEMO_KV_ETH1_TX,
  k3sEth0Rate: DEMO_K3S_ETH0_RX + DEMO_K3S_ETH0_TX,
  k3sEth1Rate: DEMO_K3S_ETH1_RX + DEMO_K3S_ETH1_TX,
  kvEth0Rx: DEMO_KV_ETH0_RX,
  kvEth0Tx: DEMO_KV_ETH0_TX,
  kvEth1Rx: DEMO_KV_ETH1_RX,
  kvEth1Tx: DEMO_KV_ETH1_TX,
  k3sEth0Rx: DEMO_K3S_ETH0_RX,
  k3sEth0Tx: DEMO_K3S_ETH0_TX,
  k3sEth1Rx: DEMO_K3S_ETH1_RX,
  k3sEth1Tx: DEMO_K3S_ETH1_TX,
  isLoading: false,
  isRefreshing: false,
  isDemoData: true,
}
