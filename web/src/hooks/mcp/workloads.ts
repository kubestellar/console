/**
 * Workloads hooks module - orchestrator that re-exports query and subscription functionality.
 *
 * This module was split from a 1880-line god module into:
 * - workloadQueries.ts: Query hooks and their dependencies (~1852 lines)
 * - workloadSubscriptions.ts: Subscription state management (~37 lines)
 * - workloads.ts: Backward-compatible re-exports and orchestration (~63 lines)
 *
 * Issue #11546: Decompose god module for better maintainability.
 */

// ============================================================================
// Re-export all types from workloadQueries for backward compatibility
// ============================================================================

export type {
  PodClusterError,
  UsePodsResult,
  UseAllPodsResult,
  UsePodIssuesResult,
  UseDeploymentIssuesResult,
  UseDeploymentsResult,
  UseJobsResult,
  UseHPAsResult,
  UseReplicaSetsResult,
  UseStatefulSetsResult,
  UseDaemonSetsResult,
  UseCronJobsResult,
  UsePodLogsResult,
} from './workloadQueries'

export { USE_POD_LOGS_DEFAULT_TAIL } from './workloadQueries'

// ============================================================================
// Re-export all hooks from workloadQueries
// ============================================================================

export {
  usePods,
  useAllPods,
  usePodIssues,
  useDeploymentIssues,
  useDeployments,
  useJobs,
  useHPAs,
  useReplicaSets,
  useStatefulSets,
  useDaemonSets,
  useCronJobs,
  usePodLogs,
} from './workloadQueries'

// ============================================================================
// Re-export subscription functionality from workloadSubscriptions
// ============================================================================

export type { WorkloadsSharedState, WorkloadsSubscriber } from './workloadSubscriptions'
export { subscribeWorkloadsCache } from './workloadSubscriptions'

// ============================================================================
// Re-export test utilities for internal testing
// ============================================================================

export { __workloadsTestables } from './workloadQueries'
