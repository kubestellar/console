/**
 * Aggregated cluster data hook for drill-down views
 * Combines data from multiple MCP hooks for convenience.
 *
 * All returned arrays are guaranteed non-undefined. If an upstream hook
 * returns undefined (e.g., API 404/500, backend offline, hook error),
 * the value is coalesced to an empty array to prevent render crashes
 * in consumers that call .map(), .filter(), .flatMap(), .join(), etc.
 */

import { useClusters, useAllPods, useDeployments, useNamespaces, useEvents, useWarningEvents, useHelmReleases, useOperatorSubscriptions, useSecurityIssues } from './useMCP'

export function useClusterData() {
  const { clusters, deduplicatedClusters } = useClusters()
  // Use useAllPods (no pagination limit) so the multi-cluster drill-down
  // sees every pod. usePods() defaults to limit=10 and was causing the
  // stat block (total pod count) and drill-down list to disagree. #6100
  //
  // `podClusterErrors` surfaces per-cluster SSE `cluster_error` events so
  // the all-pods drill-down can distinguish an RBAC denial from a
  // transient failure when the count disagrees with the list (Issue 9353).
  const { pods, clusterErrors: podClusterErrors } = useAllPods()
  const { deployments } = useDeployments()
  const { namespaces } = useNamespaces()
  const { events } = useEvents()
  // Issue #12371 — The warnings stat block uses warningEvents (via
  // useUniversalStats), so the drill-down must use the same data source.
  // Previously the drill-down filtered the general events list by type,
  // but if useEvents() was empty, the drill-down showed 0 items even when
  // the stat block showed a non-zero count.
  const { events: warningEvents } = useWarningEvents(undefined, undefined, 100)
  const { releases: helmReleases } = useHelmReleases()
  const { subscriptions: operatorSubscriptions } = useOperatorSubscriptions()
  const { issues: securityIssues } = useSecurityIssues()

  return {
    clusters: clusters || [],
    deduplicatedClusters: deduplicatedClusters || [],
    pods: pods || [],
    podClusterErrors: podClusterErrors || [],
    deployments: deployments || [],
    namespaces: namespaces || [],
    events: events || [],
    warningEvents: warningEvents || [],
    helmReleases: helmReleases || [],
    operatorSubscriptions: operatorSubscriptions || [],
    securityIssues: securityIssues || [],
  }
}
