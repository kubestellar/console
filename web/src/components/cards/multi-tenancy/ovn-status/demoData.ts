/**
 * Demo data for the OVN-Kubernetes status card.
 *
 * Represents a healthy OVN deployment with 8 infrastructure pods and 3 User
 * Defined Networks (2 Layer-3 primary, 1 Layer-2 secondary). Used when the
 * dashboard is in demo mode or no Kubernetes clusters are connected.
 */

import type { UdnInfo } from './helpers'
import type { ComponentHealth } from '../shared'

export interface OvnStatusDemoData {
  detected: boolean
  health: ComponentHealth
  podCount: number
  healthyPods: number
  unhealthyPods: number
  udns: UdnInfo[]
  lastCheckTime: string
}

/** Demo: timestamp offset for latest refresh (2 minutes ago) */
const DEMO_LAST_CHECK_AGO_MS = 2 * 60 * 1000

/** Demo: total OVN infrastructure pods */
const DEMO_POD_COUNT = 8

/** Demo: all pods healthy */
const DEMO_HEALTHY_PODS = 8

/** Demo: no unhealthy pods */
const DEMO_UNHEALTHY_PODS = 0

export const OVN_DEMO_DATA: OvnStatusDemoData = {
  detected: true,
  health: 'healthy',
  podCount: DEMO_POD_COUNT,
  healthyPods: DEMO_HEALTHY_PODS,
  unhealthyPods: DEMO_UNHEALTHY_PODS,
  udns: [
    { name: 'tenant-network-a', networkType: 'layer3', role: 'primary' },
    { name: 'tenant-network-b', networkType: 'layer3', role: 'primary' },
    { name: 'shared-services', networkType: 'layer2', role: 'secondary' },
  ],
  lastCheckTime: new Date(Date.now() - DEMO_LAST_CHECK_AGO_MS).toISOString(),
}
