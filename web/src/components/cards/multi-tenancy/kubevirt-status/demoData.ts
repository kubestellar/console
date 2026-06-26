/**
 * Demo data for the KubeVirt status card.
 *
 * Represents a healthy multi-cluster KubeVirt deployment with the operator
 * infrastructure running across 3 clusters, with 8 VMs (5 running, 1 stopped,
 * 1 migrating, 1 paused) distributed across tenants. Includes CPU, memory, and
 * creation time per VM. Used when the dashboard is in demo mode or no clusters
 * are connected.
 */

import type { ComponentHealth } from '../shared'
import type { VmState } from './helpers'

/** Individual VM info shown in the card detail list */
export interface VmInfo {
  /** VM name (from virt-launcher pod name) */
  name: string
  /** Tenant namespace */
  namespace: string
  /** Current VM state */
  state: VmState
  /** Cluster where this VM runs */
  cluster: string
  /** CPU cores allocated to this VM */
  cpu?: string
  /** Memory allocated to this VM (e.g. "2Gi") */
  memory?: string
  /** ISO creation timestamp */
  creationTime?: string
}

/** Per-cluster KubeVirt summary for the cluster breakdown view */
export interface ClusterKubevirtInfo {
  /** Cluster name */
  cluster: string
  /** Whether KubeVirt is installed on this cluster */
  installed: boolean
  /** Number of VMs on this cluster */
  vmCount: number
  /** Number of running VMs on this cluster */
  runningCount: number
  /** Number of infra pods on this cluster */
  infraPods: number
  /** Health of KubeVirt on this cluster */
  health: ComponentHealth
}

export interface KubevirtStatusDemoData {
  detected: boolean
  health: ComponentHealth
  podCount: number
  healthyPods: number
  unhealthyPods: number
  vms: VmInfo[]
  tenantCount: number
  lastCheckTime: string
  /** Per-cluster KubeVirt breakdown */
  clusters: ClusterKubevirtInfo[]
}

/** Demo: timestamp offset for latest refresh (2 minutes ago) */
const DEMO_LAST_CHECK_AGO_MS = 2 * 60 * 1000

/** Demo: total KubeVirt infrastructure pods across all clusters */
const DEMO_POD_COUNT = 12

/** Demo: all infrastructure pods healthy */
const DEMO_HEALTHY_PODS = 12

/** Demo: no unhealthy infrastructure pods */
const DEMO_UNHEALTHY_PODS = 0

/** Demo: number of tenants with VMs */
const DEMO_TENANT_COUNT = 3

/** Demo: days ago offset for VM creation timestamps */
const DEMO_CREATION_DAYS_AGO_WEB01 = 14
const DEMO_CREATION_DAYS_AGO_WEB02 = 14
const DEMO_CREATION_DAYS_AGO_DB_PRIMARY = 30
const DEMO_CREATION_DAYS_AGO_DB_REPLICA = 28
const DEMO_CREATION_DAYS_AGO_APP_SERVER = 7
const DEMO_CREATION_DAYS_AGO_BATCH_WORKER = 21
const DEMO_CREATION_DAYS_AGO_ML_TRAINER = 3
const DEMO_CREATION_DAYS_AGO_DEV_ENV = 1

/** Helper to generate a creation timestamp N days ago */
function daysAgo(days: number): string {
  /** Milliseconds per day */
  const MS_PER_DAY = 86_400_000
  return new Date(Date.now() - days * MS_PER_DAY).toISOString()
}

export const KUBEVIRT_DEMO_DATA: KubevirtStatusDemoData = {
  detected: true,
  health: 'healthy',
  podCount: DEMO_POD_COUNT,
  healthyPods: DEMO_HEALTHY_PODS,
  unhealthyPods: DEMO_UNHEALTHY_PODS,
  vms: [
    { name: 'web-server-01', namespace: 'tenant-alpha', state: 'running', cluster: 'prod-east', cpu: '4', memory: '8Gi', creationTime: daysAgo(DEMO_CREATION_DAYS_AGO_WEB01) },
    { name: 'web-server-02', namespace: 'tenant-alpha', state: 'running', cluster: 'prod-east', cpu: '4', memory: '8Gi', creationTime: daysAgo(DEMO_CREATION_DAYS_AGO_WEB02) },
    { name: 'db-primary', namespace: 'tenant-beta', state: 'running', cluster: 'prod-east', cpu: '8', memory: '32Gi', creationTime: daysAgo(DEMO_CREATION_DAYS_AGO_DB_PRIMARY) },
    { name: 'db-replica', namespace: 'tenant-beta', state: 'migrating', cluster: 'prod-west', cpu: '8', memory: '32Gi', creationTime: daysAgo(DEMO_CREATION_DAYS_AGO_DB_REPLICA) },
    { name: 'app-server', namespace: 'tenant-gamma', state: 'running', cluster: 'prod-west', cpu: '2', memory: '4Gi', creationTime: daysAgo(DEMO_CREATION_DAYS_AGO_APP_SERVER) },
    { name: 'batch-worker', namespace: 'tenant-gamma', state: 'stopped', cluster: 'prod-west', cpu: '16', memory: '64Gi', creationTime: daysAgo(DEMO_CREATION_DAYS_AGO_BATCH_WORKER) },
    { name: 'ml-trainer', namespace: 'tenant-alpha', state: 'running', cluster: 'staging', cpu: '4', memory: '16Gi', creationTime: daysAgo(DEMO_CREATION_DAYS_AGO_ML_TRAINER) },
    { name: 'dev-env', namespace: 'tenant-gamma', state: 'paused', cluster: 'staging', cpu: '2', memory: '4Gi', creationTime: daysAgo(DEMO_CREATION_DAYS_AGO_DEV_ENV) },
  ],
  tenantCount: DEMO_TENANT_COUNT,
  lastCheckTime: new Date(Date.now() - DEMO_LAST_CHECK_AGO_MS).toISOString(),
  clusters: [
    { cluster: 'prod-east', installed: true, vmCount: 3, runningCount: 3, infraPods: 5, health: 'healthy' },
    { cluster: 'prod-west', installed: true, vmCount: 3, runningCount: 1, infraPods: 5, health: 'healthy' },
    { cluster: 'staging', installed: true, vmCount: 2, runningCount: 1, infraPods: 2, health: 'healthy' },
  ],
}
