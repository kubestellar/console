/**
 * Demo data for the K3s status card.
 *
 * Represents a healthy K3s deployment with 3 server pods (one per tenant),
 * 6 agent connections, and all pods healthy. Used when the dashboard is in
 * demo mode or no Kubernetes clusters are connected.
 */

import type { ComponentHealth } from '../shared'

/** Individual K3s server/agent pod info shown in the card detail list */
export interface K3sServerPodInfo {
  /** Pod name */
  name: string
  /** Namespace where the pod runs */
  namespace: string
  /** Pod status: running, pending, or failed */
  status: 'running' | 'pending' | 'failed'
  /** K3s version extracted from the container image tag */
  version: string
}

export interface K3sStatusDemoData {
  detected: boolean
  health: ComponentHealth
  podCount: number
  healthyPods: number
  unhealthyPods: number
  serverPods: K3sServerPodInfo[]
  lastCheckTime: string
}

/** Demo: timestamp offset for latest refresh (2 minutes ago) */
const DEMO_LAST_CHECK_AGO_MS = 2 * 60 * 1000

/** Demo: total K3s pods (3 servers + 6 agents = 9) */
const DEMO_POD_COUNT = 9

/** Demo: all pods healthy */
const DEMO_HEALTHY_PODS = 9

/** Demo: no unhealthy pods */
const DEMO_UNHEALTHY_PODS = 0

export const K3S_DEMO_DATA: K3sStatusDemoData = {
  detected: true,
  health: 'healthy',
  podCount: DEMO_POD_COUNT,
  healthyPods: DEMO_HEALTHY_PODS,
  unhealthyPods: DEMO_UNHEALTHY_PODS,
  serverPods: [
    { name: 'k3s-server-tenant-1', namespace: 'tenant-1', status: 'running', version: 'v1.30.4+k3s1' },
    { name: 'k3s-server-tenant-2', namespace: 'tenant-2', status: 'running', version: 'v1.30.4+k3s1' },
    { name: 'k3s-server-tenant-3', namespace: 'tenant-3', status: 'running', version: 'v1.29.8+k3s1' },
  ],
  lastCheckTime: new Date(Date.now() - DEMO_LAST_CHECK_AGO_MS).toISOString(),
}
