/**
 * CNI (Container Network Interface) Status — Demo Data & Type Definitions
 *
 * The CNI plugin provides pod networking inside a Kubernetes cluster. Common
 * implementations include Cilium (eBPF), Calico, Flannel, Weave, Antrea, and
 * Kindnet. This card surfaces:
 *
 *  - Active CNI plugin (name + version)
 *  - Node count with CNI ready / total
 *  - Pod network CIDR
 *  - Services using NetworkPolicy (rough adoption indicator)
 *  - Per-node CNI daemonset health
 *  - Aggregate metrics (pods with IPs, routable services, policies in effect)
 *
 * This is scaffolding — the card renders via demo fallback today. When a real
 * CNI inspection bridge lands (`/api/cni/status`), the hook's fetcher will
 * pick up live data automatically with no component changes.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CniHealth = 'healthy' | 'degraded' | 'not-installed' | 'unknown'
export type CniPlugin =
  | 'cilium'
  | 'calico'
  | 'flannel'
  | 'weave'
  | 'antrea'
  | 'kindnet'
  | 'aws-vpc-cni'
  | 'azure-cni'
  | 'unknown'
export type CniNodeState = 'ready' | 'not-ready' | 'unknown'

export interface CniNodeStatus {
  node: string
  cluster: string
  state: CniNodeState
  plugin: CniPlugin
  pluginVersion: string
  podCidr: string
  lastHeartbeat: string
}

export interface CniStats {
  activePlugin: CniPlugin
  pluginVersion: string
  podNetworkCidr: string
  serviceNetworkCidr: string
  nodeCount: number
  nodesCniReady: number
  networkPolicyCount: number
  servicesWithNetworkPolicy: number
  totalServices: number
  podsWithIp: number
  totalPods: number
}

export interface CniSummary {
  activePlugin: CniPlugin
  pluginVersion: string
  podNetworkCidr: string
  nodesCniReady: number
  nodeCount: number
  networkPolicyCount: number
  servicesWithNetworkPolicy: number
}

export interface CniStatusData {
  health: CniHealth
  nodes: CniNodeStatus[]
  stats: CniStats
  summary: CniSummary
  lastCheckTime: string
}

// ---------------------------------------------------------------------------
// Demo constants (no magic numbers)
// ---------------------------------------------------------------------------

const DEMO_PLUGIN: CniPlugin = 'cilium'
const DEMO_PLUGIN_VERSION = '1.15.6'
const DEMO_POD_CIDR = '10.244.0.0/16'
const DEMO_SERVICE_CIDR = '10.96.0.0/12'
const DEMO_NODE_COUNT = 3
const DEMO_NODES_CNI_READY = 3
const DEMO_NETWORK_POLICY_COUNT = 5
const DEMO_SERVICES_WITH_POLICY = 8
const DEMO_TOTAL_SERVICES = 24
const DEMO_PODS_WITH_IP = 148
const DEMO_TOTAL_PODS = 150

// Per-node pod CIDRs (documented example allocations)
const NODE_1_POD_CIDR = '10.244.0.0/24'
const NODE_2_POD_CIDR = '10.244.1.0/24'
const NODE_3_POD_CIDR = '10.244.2.0/24'

// Heartbeat timestamps relative to "now"
const FIFTEEN_SECONDS_MS = 15 * 1000
const TWENTY_SECONDS_MS = 20 * 1000
const TEN_SECONDS_MS = 10 * 1000

// ---------------------------------------------------------------------------
// Demo data — shown when CNI endpoint is unreachable or in demo mode
// ---------------------------------------------------------------------------

const DEMO_NODES: CniNodeStatus[] = [
  {
    node: 'kind-control-plane',
    cluster: 'prod-east',
    state: 'ready',
    plugin: DEMO_PLUGIN,
    pluginVersion: DEMO_PLUGIN_VERSION,
    podCidr: NODE_1_POD_CIDR,
    lastHeartbeat: new Date(Date.now() - FIFTEEN_SECONDS_MS).toISOString(),
  },
  {
    node: 'kind-worker',
    cluster: 'prod-east',
    state: 'ready',
    plugin: DEMO_PLUGIN,
    pluginVersion: DEMO_PLUGIN_VERSION,
    podCidr: NODE_2_POD_CIDR,
    lastHeartbeat: new Date(Date.now() - TEN_SECONDS_MS).toISOString(),
  },
  {
    node: 'kind-worker2',
    cluster: 'prod-east',
    state: 'ready',
    plugin: DEMO_PLUGIN,
    pluginVersion: DEMO_PLUGIN_VERSION,
    podCidr: NODE_3_POD_CIDR,
    lastHeartbeat: new Date(Date.now() - TWENTY_SECONDS_MS).toISOString(),
  },
]

export const CNI_DEMO_DATA: CniStatusData = {
  health: 'healthy',
  nodes: DEMO_NODES,
  stats: {
    activePlugin: DEMO_PLUGIN,
    pluginVersion: DEMO_PLUGIN_VERSION,
    podNetworkCidr: DEMO_POD_CIDR,
    serviceNetworkCidr: DEMO_SERVICE_CIDR,
    nodeCount: DEMO_NODE_COUNT,
    nodesCniReady: DEMO_NODES_CNI_READY,
    networkPolicyCount: DEMO_NETWORK_POLICY_COUNT,
    servicesWithNetworkPolicy: DEMO_SERVICES_WITH_POLICY,
    totalServices: DEMO_TOTAL_SERVICES,
    podsWithIp: DEMO_PODS_WITH_IP,
    totalPods: DEMO_TOTAL_PODS,
  },
  summary: {
    activePlugin: DEMO_PLUGIN,
    pluginVersion: DEMO_PLUGIN_VERSION,
    podNetworkCidr: DEMO_POD_CIDR,
    nodesCniReady: DEMO_NODES_CNI_READY,
    nodeCount: DEMO_NODE_COUNT,
    networkPolicyCount: DEMO_NETWORK_POLICY_COUNT,
    servicesWithNetworkPolicy: DEMO_SERVICES_WITH_POLICY,
  },
  lastCheckTime: new Date().toISOString(),
}
