import type { InsightCategory, InsightSeverity } from '../../types/insights'
import { MS_PER_MINUTE } from '../constants/time'

export const MIN_CORRELATED_CLUSTERS = 2
export const EVENT_CORRELATION_WINDOW_MS = 5 * MS_PER_MINUTE
export const CASCADE_DETECTION_WINDOW_MS = 15 * MS_PER_MINUTE
export const RESOURCE_IMBALANCE_THRESHOLD_PCT = 30
export const RESTART_CORRELATION_THRESHOLD = 3
export const MAX_INSIGHTS_PER_CATEGORY = 10
export const MAX_TOP_INSIGHTS = 5
export const DELTA_SIGNIFICANCE_HIGH_PCT = 50
export const DELTA_SIGNIFICANCE_MEDIUM_PCT = 20
export const INFRA_ISSUE_MIN_WORKLOADS = 3
export const APP_BUG_MIN_CLUSTERS = 2
export const CPU_CRITICAL_THRESHOLD_PCT = 85
export const RESTART_CRITICAL_THRESHOLD = 20
export const INFRA_CRITICAL_WORKLOADS = 5
export const CRITICAL_CLUSTER_THRESHOLD = 3
export const ROLLOUT_STATUS_IN_PROGRESS = 1
export const ROLLOUT_STATUS_COMPLETE = 2
export const ROLLOUT_STATUS_FAILED = 3
export const FULL_PROGRESS = 100
export const PARTIAL_PROGRESS = 50
export const DEMO_OFFSET_5M_MS = 5 * MS_PER_MINUTE
export const DEMO_OFFSET_10M_MS = 10 * MS_PER_MINUTE
export const DEMO_OFFSET_15M_MS = 15 * MS_PER_MINUTE

export const REASON_FAMILIES: ReadonlyArray<ReadonlyArray<string>> = [
  ['BackOff', 'CrashLoopBackOff', 'OOMKilled', 'ContainerStatusUnknown', 'DeadlineExceeded'],
  ['ImagePullBackOff', 'ErrImagePull', 'ErrImageNeverPull', 'InvalidImageName'],
  ['FailedScheduling', 'Unschedulable', 'TaintManagerEviction'],
  ['NodeNotReady', 'NodeUnreachable', 'Rebooted', 'CordonStarting'],
  ['FailedMount', 'FailedAttachVolume', 'FailedMapVolume', 'VolumeResizeFailed'],
  ['Unhealthy', 'ProbeWarning', 'LivenessProbe', 'ReadinessProbe', 'StartupProbe'],
  ['NetworkNotReady', 'FailedToUpdateEndpoint', 'FailedToUpdateEndpointSlices'],
]

export const REASON_TO_FAMILY = new Map<string, number>()
for (let index = 0; index < REASON_FAMILIES.length; index++) {
  for (const reason of REASON_FAMILIES[index] || []) {
    REASON_TO_FAMILY.set(reason, index)
  }
}

export const SEVERITY_RANK: Record<InsightSeverity, number> = {
  critical: 3,
  warning: 2,
  info: 1,
}

export const EMPTY_INSIGHTS_BY_CATEGORY: Record<InsightCategory, never[]> = {
  'event-correlation': [],
  'cluster-delta': [],
  'cascade-impact': [],
  'config-drift': [],
  'resource-imbalance': [],
  'restart-correlation': [],
  'rollout-tracker': [],
}
