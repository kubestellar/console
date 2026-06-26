/**
 * Demo data for the KubeFlex status card.
 *
 * Represents a healthy KubeFlex deployment with 1 controller and 3 control
 * planes (tenant-1, tenant-2, tenant-3), all healthy. Used when the dashboard
 * is in demo mode or no Kubernetes clusters are connected.
 */

import type { ControlPlaneInfo } from './helpers'
import type { ComponentHealth } from '../shared'

export interface KubeFlexStatusDemoData {
  detected: boolean
  health: ComponentHealth
  controllerHealthy: boolean
  controlPlanes: ControlPlaneInfo[]
  tenantCount: number
  lastCheckTime: string
}

/** Demo: timestamp offset for latest refresh (2 minutes ago) */
const DEMO_LAST_CHECK_AGO_MS = 2 * 60 * 1000

/** Demo: number of tenants (matching control plane count) */
const DEMO_TENANT_COUNT = 3

export const KUBEFLEX_DEMO_DATA: KubeFlexStatusDemoData = {
  detected: true,
  health: 'healthy',
  controllerHealthy: true,
  controlPlanes: [
    { name: 'tenant-1', healthy: true },
    { name: 'tenant-2', healthy: true },
    { name: 'tenant-3', healthy: true },
  ],
  tenantCount: DEMO_TENANT_COUNT,
  lastCheckTime: new Date(Date.now() - DEMO_LAST_CHECK_AGO_MS).toISOString(),
}
