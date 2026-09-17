/**
 * Cached hooks for core Kubernetes workload data:
 * Pods, Events, Pod Issues, Deployment Issues, Deployments, Services,
 * Security Issues, Workloads, and All Pods (GPU allocation).
 *
 * Implementations live in ./useCachedData/*; this module is a thin barrel so
 * existing import paths keep working.
 */

export { useCachedPods, useCachedAllPods, useCachedEvents } from './useCachedData/corePodHooks'
export { useCachedPodIssues, useCachedDeploymentIssues } from './useCachedData/coreIssueHooks'
export {
  useCachedDeployments,
  useCachedServices,
  useCachedSecurityIssues,
  useCachedWorkloads,
} from './useCachedData/coreResourceHooks'

// Re-exports for prefetch access
export {
  fetchPodIssuesViaAgent,
  fetchDeploymentsViaAgent,
  fetchWorkloadsFromAgent,
} from './useCachedData/agentFetchers'
export { fetchSecurityIssuesViaKubectl } from './useCachedData/securityScanner'
