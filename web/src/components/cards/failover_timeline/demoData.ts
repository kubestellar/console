/**
 * Demo data for the Cross-Region Failover Timeline card.
 *
 * Represents a realistic failover scenario where a cluster goes down,
 * bindings are rescheduled to healthy clusters, replicas rebalance,
 * and the original cluster eventually recovers.
 *
 * Used in demo mode or when no Karmada control plane is accessible.
 */

import { MS_PER_MINUTE } from '../../../lib/constants/time'

/** Demo data shows as checked 30 seconds ago */
const DEMO_LAST_CHECK_OFFSET_MS = 30_000

/** Offset in minutes for the initial cluster-down event */
const CLUSTER_DOWN_OFFSET_MIN = 47

/** Offset in minutes for the first binding reschedule */
const BINDING_RESCHEDULE_1_OFFSET_MIN = 45

/** Offset in minutes for the second binding reschedule */
const BINDING_RESCHEDULE_2_OFFSET_MIN = 44

/** Offset in minutes for replica rebalance */
const REPLICA_REBALANCE_OFFSET_MIN = 40

/** Offset in minutes for cluster recovery */
const CLUSTER_RECOVERY_OFFSET_MIN = 12

/** Offset in minutes for post-recovery rebalance */
const RECOVERY_REBALANCE_OFFSET_MIN = 10


export type FailoverEventType =
  | 'cluster_down'
  | 'binding_reschedule'
  | 'cluster_recovery'
  | 'replica_rebalance'

export type FailoverSeverity = 'critical' | 'warning' | 'info'

export interface FailoverEvent {
  /** ISO-8601 timestamp of the event */
  timestamp: string
  /** Category of failover event */
  eventType: FailoverEventType
  /** Cluster involved in this event */
  cluster: string
  /** Workload affected (e.g. Deployment name) */
  workload: string
  /** Human-readable event description */
  details: string
  /** Severity for visual color coding */
  severity: FailoverSeverity
}

export interface FailoverTimelineData {
  /** Ordered list of failover events (newest first) */
  events: FailoverEvent[]
  /** Number of currently active (Ready) clusters */
  activeClusters: number
  /** Total number of clusters being monitored */
  totalClusters: number
  /** ISO-8601 timestamp of the most recent failover, or null if none */
  lastFailover: string | null
  /** ISO-8601 timestamp of the last data check */
  lastCheckTime: string
}

// ---------------------------------------------------------------------------
// Demo entries
// ---------------------------------------------------------------------------

function minutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * MS_PER_MINUTE).toISOString()
}

export const FAILOVER_TIMELINE_DEMO_DATA: FailoverTimelineData = {
  events: [
    {
      timestamp: minutesAgo(RECOVERY_REBALANCE_OFFSET_MIN),
      eventType: 'replica_rebalance',
      cluster: 'member-ap-south',
      workload: 'frontend',
      details: 'Replicas rebalanced back to recovered cluster (2 of 6 replicas migrated)',
      severity: 'info',
    },
    {
      timestamp: minutesAgo(CLUSTER_RECOVERY_OFFSET_MIN),
      eventType: 'cluster_recovery',
      cluster: 'member-ap-south',
      workload: '',
      details: 'Cluster returned to Ready state after network partition resolved',
      severity: 'info',
    },
    {
      timestamp: minutesAgo(REPLICA_REBALANCE_OFFSET_MIN),
      eventType: 'replica_rebalance',
      cluster: 'member-us-east',
      workload: 'frontend',
      details: 'Replicas scaled up on healthy cluster (4 -> 6 replicas) to absorb failed cluster load',
      severity: 'warning',
    },
    {
      timestamp: minutesAgo(BINDING_RESCHEDULE_2_OFFSET_MIN),
      eventType: 'binding_reschedule',
      cluster: 'member-eu-west',
      workload: 'backend-api',
      details: 'ResourceBinding rescheduled from member-ap-south to member-eu-west',
      severity: 'warning',
    },
    {
      timestamp: minutesAgo(BINDING_RESCHEDULE_1_OFFSET_MIN),
      eventType: 'binding_reschedule',
      cluster: 'member-us-east',
      workload: 'frontend',
      details: 'ResourceBinding rescheduled from member-ap-south to member-us-east',
      severity: 'warning',
    },
    {
      timestamp: minutesAgo(CLUSTER_DOWN_OFFSET_MIN),
      eventType: 'cluster_down',
      cluster: 'member-ap-south',
      workload: '',
      details: 'Cluster transitioned to NotReady — network partition detected',
      severity: 'critical',
    },
  ],
  activeClusters: 4,
  totalClusters: 4,
  lastFailover: minutesAgo(CLUSTER_DOWN_OFFSET_MIN),
  lastCheckTime: new Date(Date.now() - DEMO_LAST_CHECK_OFFSET_MS).toISOString(),
}
