/**
 * Aggregated cluster data hook for drill-down views
 * Combines data from multiple MCP hooks for convenience.
 *
 * All returned arrays are guaranteed non-undefined. If an upstream hook
 * returns undefined (e.g., API 404/500, backend offline, hook error),
 * the value is coalesced to an empty array to prevent render crashes
 * in consumers that call .map(), .filter(), .flatMap(), .join(), etc.
 */

import { useClusters, useAllPods, useDeployments, useNamespaces, useEvents, useHelmReleases, useOperatorSubscriptions, useSecurityIssues } from './useMCP'

export function useClusterData() {
  const { clusters, deduplicatedClusters } = useClusters()
  // Use useAllPods (no pagination limit) so the multi-cluster drill-down
  // sees every pod. usePods() defaults to limit=10 and was causing the
  // stat block (total pod count) and drill-down list to disagree. #6100
  const { pods } = useAllPods()
  const { deployments } = useDeployments()
  const { namespaces } = useNamespaces()
  const { events } = useEvents()
  const { releases: helmReleases } = useHelmReleases()
  const { subscriptions: operatorSubscriptions } = useOperatorSubscriptions()
  const { issues: securityIssues } = useSecurityIssues()

  return {
    clusters: clusters || [],
    deduplicatedClusters: deduplicatedClusters || [],
    pods: pods || [],
    deployments: deployments || [],
    namespaces: namespaces || [],
    events: events || [],
    helmReleases: helmReleases || [],
    operatorSubscriptions: operatorSubscriptions || [],
    securityIssues: securityIssues || [],
  }
}
