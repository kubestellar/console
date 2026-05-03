/**
 * Cached hooks for Kubernetes node data.
 *
 * Extracted from useCachedData.ts for maintainability.
 */

import { useSyncExternalStore } from 'react'
import { useCache, type RefreshCategory, type CachedHookResult } from '../lib/cache'
import { clusterCacheRef, deduplicateClustersByServer } from './mcp/shared'
import { fetchFromAllClusters, fetchViaSSE, getClusterFetcher } from '../lib/cache/fetcherUtils'
import { settledWithConcurrency } from '../lib/utils/concurrency'
import { NodesResponseSchema } from '../lib/schemas'
import { validateArrayResponse } from '../lib/schemas/validate'
import { getDemoCachedNodes, getDemoCoreDNSStatus } from './useCachedData/demoData'
import { classifyError, type ClusterErrorType } from '../lib/errorClassifier'
import type { NodeInfo, PodInfo } from './useMCP'

/**
 * Per-cluster error surfaced by {@link useCachedAllNodes} when a particular
 * cluster's `/api/mcp/nodes` REST call fails during the fan-out (Issue 9355).
 * Lets the multi-cluster drill-down distinguish an RBAC denial
 * ({@link ClusterErrorType} === 'auth') from a transient 5xx/timeout failure
 * so the UI can render a specific "lacks list-nodes RBAC on cluster X"
 * explanation instead of a generic "detailed list is empty" warning.
 */
export interface NodeClusterError {
  cluster: string
  errorType: ClusterErrorType
  message: string
}

/**
 * Per-cluster fan-out result returned by each {@link useCachedAllNodes}
 * concurrency callback. Each task returns one of these synchronous tuples
 * instead of mutating shared accumulators, keeping the callback safe under
 * the concurrent-mutation-safety ratchet
 * (src/test/concurrent-mutation-safety.test.ts).
 */
interface PerClusterNodeResult {
  nodes: NodeInfo[]
  error: NodeClusterError | null
}

// Module-level subscribable snapshot of the most recent per-cluster errors
// emitted by the {@link useCachedAllNodes} fetcher. We use a module-level
// subscribable (rather than per-hook React state) because `useCache`'s
// `fetcher` is invoked outside React and does not have access to a
// component-scoped setState. `useSyncExternalStore` in the hook return gives
// every consumer a fresh snapshot that re-renders when the fetcher publishes
// a new error list (Issue 9355).
let nodeClusterErrorsSnapshot: readonly NodeClusterError[] = []
const nodeClusterErrorsListeners = new Set<() => void>()

function subscribeNodeClusterErrors(listener: () => void) {
  nodeClusterErrorsListeners.add(listener)
  return () => nodeClusterErrorsListeners.delete(listener)
}

function getNodeClusterErrorsSnapshot(): readonly NodeClusterError[] {
  return nodeClusterErrorsSnapshot
}

function publishNodeClusterErrors(next: readonly NodeClusterError[]) {
  nodeClusterErrorsSnapshot = next
  nodeClusterErrorsListeners.forEach(listener => listener())
}

// ============================================================================
// Shared types
// ============================================================================

// ============================================================================
// CoreDNS types (defined here — this is the canonical location)
// ============================================================================

export interface CoreDNSPodInfo {
  name: string
  status: string
  ready: string
  restarts: number
  version: string
}

export interface CoreDNSClusterStatus {
  cluster: string
  pods: CoreDNSPodInfo[]
  healthy: boolean
  totalRestarts: number
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * Hook for fetching nodes with caching and SSE streaming.
 * When no cluster is specified, fetches from all available clusters via SSE.
 */
export function useCachedNodes(
  cluster?: string,
): CachedHookResult<NodeInfo[]> & { nodes: NodeInfo[] } {
  const key = `nodes:${cluster || 'all'}`

  const result = useCache({
    key,
    category: 'pods' as RefreshCategory,
    initialData: [] as NodeInfo[],
    demoData: getDemoCachedNodes(),
    demoWhenEmpty: !cluster,
    persist: true,
    fetcher: async () => {
      if (cluster) {
        const raw = await getClusterFetcher()<unknown>('nodes', { cluster })
        const data = validateArrayResponse<{ nodes: NodeInfo[] }>(NodesResponseSchema, raw, '/api/mcp/nodes', 'nodes')
        return (data.nodes || []).map(n => ({ ...n, cluster }))
      }
      return fetchFromAllClusters<NodeInfo>('nodes', 'nodes', {})
    },
    progressiveFetcher: cluster ? undefined : async (onProgress) => {
      return fetchViaSSE<NodeInfo>('nodes', 'nodes', {}, onProgress)
    } })

  // Only report demo fallback when NOT loading — prevents Demo badge
  // from flashing during the optimistic demo phase while a real fetch
  // is still in-flight (CLAUDE.md: effectiveIsDemoFallback pattern).
  const effectiveIsDemoFallback = result.isDemoFallback && !result.isLoading

  return {
    nodes: result.data,
    data: result.data,
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
    isDemoFallback: effectiveIsDemoFallback,
    error: result.error,
    isFailed: result.isFailed,
    consecutiveFailures: result.consecutiveFailures,
    lastRefresh: result.lastRefresh,
    refetch: result.refetch, retryFetch: result.retryFetch }
}

/**
 * Hook for fetching a cumulative, cross-cluster node list for the landing
 * dashboard's "Nodes" stat-block drill-down (Issue 8840).
 *
 * Differs from {@link useCachedNodes} (no cluster arg) in two ways:
 *
 * 1. It iterates DEDUPLICATED clusters from the shared cluster cache via
 *    {@link deduplicateClustersByServer}. The generic fan-out in
 *    {@link fetchFromAllClusters} only filters out long-context aliases by
 *    name, which can still double-count when two short-named contexts point
 *    to the same API server. See MEMORY.md: "ALWAYS use
 *    DeduplicatedClusters() when iterating clusters".
 *
 * 2. It DOES NOT fall back to demo data on empty live results. The drill-down
 *    is expected to render an authoritative cross-cluster list (or the
 *    existing "summary reports N nodes but list is empty" explainer),
 *    NOT four hard-coded fake nodes. The parent stat block (on the Dashboard)
 *    retains the original {@link useCachedNodes} optimistic-demo behaviour so
 *    tiles never flash empty. Only the drill-down is switched to this hook.
 *
 * An `isDemoFallback` field is still returned (always `false` in live mode,
 * `true` only when the whole app is in demo mode) so the drill-down can keep
 * its existing `nodesIsDemoFallback` wiring intact — see the task's
 * `isDemoData` preservation rule.
 */
export function useCachedAllNodes(): CachedHookResult<NodeInfo[]> & {
  nodes: NodeInfo[]
  // Per-cluster errors captured during the REST fan-out (Issue 9355) so the
  // multi-cluster drill-down can explain an empty list with
  // "lacks list-nodes RBAC on cluster X" instead of a generic warning.
  clusterErrors: readonly NodeClusterError[]
} {
  const key = 'nodes:all:dedup'

  const result = useCache({
    key,
    category: 'pods' as RefreshCategory,
    initialData: [] as NodeInfo[],
    demoData: getDemoCachedNodes(),
    // IMPORTANT: no demoWhenEmpty — we never want to mask a real empty /
    // partially-failed cross-cluster result with four hard-coded fake nodes
    // in the drill-down list. The drill-down has its own empty-state
    // explainer (RBAC hint, summary-vs-list mismatch) that is much more
    // useful than synthetic demo data.
    persist: true,
    fetcher: async () => {
      const allClusters = clusterCacheRef.clusters || []
      // Apply the same deduplication that useClusters().deduplicatedClusters
      // uses — multiple kubeconfig contexts can point to the same API
      // server, and without dedup each node would be listed once per
      // context. See MEMORY.md: feedback_dedupe_clusters.md.
      const deduped = deduplicateClustersByServer(allClusters)
      const reachable = deduped.filter(
        (c) => c.reachable !== false && !c.name.includes('/'),
      )
      if (reachable.length === 0) {
        // Reset any stale per-cluster errors from a prior fetch before
        // throwing so consumers that still subscribe don't see a stale
        // "cluster X denied" after the user has logged out / lost creds
        // (Issue 9355).
        publishNodeClusterErrors([])
        throw new Error(
          'No reachable clusters (agent connecting or backend not authenticated)',
        )
      }

      // Fan out per-cluster fetches in parallel. Each per-cluster call is
      // identical to what useCachedNodes(clusterName) would do — using the
      // same /api/mcp/nodes endpoint that already works on the per-cluster
      // drill-down, so the "live data path exists" invariant from the
      // issue description holds.
      //
      // Concurrency-safety: each callback RETURNS a tagged { nodes, error }
      // tuple instead of mutating outer-scope accumulators. Aggregation
      // happens after `settledWithConcurrency` resolves (see P2-B static
      // scan, src/test/concurrent-mutation-safety.test.ts).
      const tasks = reachable.map((cluster) => async (): Promise<PerClusterNodeResult> => {
        try {
          const raw = await getClusterFetcher()<unknown>('nodes', { cluster: cluster.name })
          const data = validateArrayResponse<{ nodes: NodeInfo[] }>(
            NodesResponseSchema,
            raw,
            '/api/mcp/nodes',
            'nodes',
          )
          return {
            nodes: (data.nodes || []).map((n) => ({ ...n, cluster: cluster.name })),
            error: null,
          }
        } catch (err: unknown) {
          // Per-cluster failure: tolerate it so a single unreachable cluster
          // doesn't wipe the whole aggregate. Accumulated nodes from other
          // clusters still render.  Issue 9355 — classify the error (auth /
          // timeout / network / certificate / unknown) so the drill-down
          // can tell the user which clusters denied list-nodes RBAC vs.
          // which failed transiently, instead of a generic empty-state
          // warning that conflated every failure mode.
          const message = err instanceof Error ? err.message : String(err)
          const classified = classifyError(message)
          return {
            nodes: [],
            error: {
              cluster: cluster.name,
              errorType: classified.type,
              message,
            },
          }
        }
      })

      // Aggregate per-cluster results AFTER settlement. Both lists are
      // produced by local consts inside handleSettled's caller scope — no
      // outer-scope mutation from inside the concurrency callback.
      const settledResults: PerClusterNodeResult[] = []
      async function handleSettled(res: PromiseSettledResult<PerClusterNodeResult>) {
        if (res.status === 'fulfilled') {
          settledResults.push(res.value)
        }
      }
      await settledWithConcurrency(tasks, undefined, handleSettled)

      const accumulated: NodeInfo[] = settledResults.flatMap((r) => r.nodes)
      const collectedErrors: NodeClusterError[] = settledResults
        .map((r) => r.error)
        .filter((e): e is NodeClusterError => e !== null)

      // Publish the final per-cluster error snapshot so every consumer
      // subscribed via `useSyncExternalStore` re-renders with the fresh
      // list (Issue 9355). We replace the previous module-level snapshot
      // atomically after the fan-out settles so a transient flash of
      // "cluster X failed" isn't left stale after a retry succeeds.
      publishNodeClusterErrors(collectedErrors)
      return accumulated
    } })

  // Subscribe every caller to the module-level per-cluster errors snapshot.
  // The fetcher lives outside React, so we cannot use component-scoped
  // useState for the error list — useSyncExternalStore is the canonical
  // bridge from a mutable external store to React render (Issue 9355).
  const clusterErrors = useSyncExternalStore(
    subscribeNodeClusterErrors,
    getNodeClusterErrorsSnapshot,
    getNodeClusterErrorsSnapshot,
  )

  return {
    nodes: result.data,
    data: result.data,
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
    isDemoFallback: result.isDemoFallback && !result.isLoading,
    error: result.error,
    isFailed: result.isFailed,
    consecutiveFailures: result.consecutiveFailures,
    lastRefresh: result.lastRefresh,
    // Per-cluster errors surfaced from the REST fan-out (Issue 9355) so the
    // multi-cluster drill-down can explain an empty list with "lacks
    // list-nodes RBAC on cluster X" rather than a generic warning.
    clusterErrors,
    refetch: result.refetch, retryFetch: result.retryFetch }
}

// fetches coredns pods from kube-system and builds per-cluster health info
export function useCachedCoreDNSStatus(
  cluster?: string
): CachedHookResult<CoreDNSClusterStatus[]> & { clusters: CoreDNSClusterStatus[] } {
  const key = `coredns:${cluster || 'all'}`

  const result = useCache({
    key,
    category: 'pods' as RefreshCategory,
    initialData: [] as CoreDNSClusterStatus[],
    demoData: getDemoCoreDNSStatus(),
    fetcher: async () => {
      let pods: PodInfo[]
      if (cluster) {
        const data = await getClusterFetcher()<{ pods: PodInfo[] }>('pods', { cluster, namespace: 'kube-system' })
        pods = (data.pods || []).map(p => ({ ...p, cluster }))
      } else {
        pods = await fetchFromAllClusters<PodInfo>('pods', 'pods', { namespace: 'kube-system' })
      }

      const corednsPods = pods.filter(p =>
        p.name?.includes('coredns') || p.name?.includes('kube-dns')
      )

      const byCluster = new Map<string, PodInfo[]>()
      for (const pod of (corednsPods || [])) {
        const c = pod.cluster || 'unknown'
        if (!byCluster.has(c)) byCluster.set(c, [])
        byCluster.get(c)!.push(pod)
      }

      const clusters = Array.from(byCluster.entries()).map(([clusterName, clusterPods]) => {
        const running = clusterPods.filter(p => p.status === 'Running')
        const healthy = running.length === clusterPods.length && clusterPods.length > 0
        const totalRestarts = clusterPods.reduce((s, p) => s + (p.restarts || 0), 0)

        return {
          cluster: clusterName,
          pods: clusterPods.map(p => ({
            name: p.name,
            status: p.status,
            ready: p.ready,
            restarts: p.restarts || 0,
            version: p.containers?.[0]?.image?.split(':')[1]?.replace(/^v/, '') || '' })),
          healthy,
          totalRestarts } satisfies CoreDNSClusterStatus
      })

      // Sort clusters alphabetically for stable UI ordering
      return clusters.sort((a, b) => a.cluster.localeCompare(b.cluster))
    } })

  return {
    clusters: result.data,
    data: result.data,
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
    isDemoFallback: result.isDemoFallback && !result.isLoading,
    error: result.error,
    isFailed: result.isFailed,
    consecutiveFailures: result.consecutiveFailures,
    lastRefresh: result.lastRefresh,
    refetch: result.refetch, retryFetch: result.retryFetch }
}
