import { useState, useEffect, useMemo } from 'react'
import { useMetricsHistoryReadOnly } from '../../hooks/useMetricsHistory'
import { gpuNodeCache as mcpGPUNodeCache } from '../../hooks/mcp/compute'
import type { GPUNode } from '../../hooks/mcp/types'
import {
  GPU_SNAPSHOT_STALENESS_MS,
  STALENESS_TICK_MS,
  type EffectiveGPUNode } from './GPUUsageTrend.constants'

interface UseEffectiveGPUNodesArgs {
  gpuNodes: GPUNode[]
  hookLoading: boolean
  isFailed: boolean
  consecutiveFailures: number
}

/**
 * Resolves the GPU node list the GPU Usage Trend card should render, falling
 * back to recent metrics-history snapshots and the MCP localStorage cache
 * when the live fetch fails.
 */
export function useEffectiveGPUNodes({
  gpuNodes,
  hookLoading,
  isFailed,
  consecutiveFailures }: UseEffectiveGPUNodesArgs): EffectiveGPUNode[] {
  // Use the shared metrics-history snapshots as a last-known-good fallback
  // when the live GPU-nodes fetch returns empty (intermittent API failure
  // against a cluster that does have GPUs). Without this the card shows
  // "No GPU Nodes" whenever a single poll fails — see GPU Inventory History
  // card which already reads this same history and stays populated.
  //
  // We use the read-only variant here so this card does NOT add a second
  // round of MCP polling (useGPUNodes) or a second capture `setInterval`.
  // The driver `useMetricsHistory()` is hosted elsewhere (GPU Inventory
  // History) and publishes updates through the shared singleton.
  const { history: metricsHistory } = useMetricsHistoryReadOnly()

  // Staleness-tick: a time-bucket derived from Date.now() rounded to
  // STALENESS_TICK_MS. Included in the `effectiveGPUNodes` memo deps so the
  // memo re-evaluates on every bucket boundary, which lets a snapshot that
  // was "fresh" when first shown transition to "stale" as the clock advances.
  const [stalenessTick, setStalenessTick] = useState<number>(
    () => Math.floor(Date.now() / STALENESS_TICK_MS),
  )
  useEffect(() => {
    const intervalId = setInterval(() => {
      setStalenessTick(Math.floor(Date.now() / STALENESS_TICK_MS))
    }, STALENESS_TICK_MS)
    return () => clearInterval(intervalId)
  }, [])

  // Fall back to the most recent snapshot's GPU nodes if the live list is
  // empty. Snapshots use `gpuTotal`; we remap to `gpuCount` so downstream
  // aggregation (currentTotals, filteredNodes) stays unchanged.
  //
  // Three-tier fallback (see issues 8080 and 8081):
  //   1. Live cached GPU nodes from useCachedGPUNodes (SWR)
  //   2. Most recent non-empty snapshot from useMetricsHistoryReadOnly
  //   3. The MCP compute.ts localStorage cache (`kubestellar-gpu-cache`)
  //      which persists across page reloads and is populated by the
  //      useGPUNodes/mcp hook path
  //
  // Tier 3 specifically handles the fresh-page-load + flapping-cluster
  // case: metrics history hasn't captured a snapshot yet and the live
  // fetch returned empty, but a previous session's GPU cache is still
  // sitting in localStorage.
  return useMemo<EffectiveGPUNode[]>(() => {
    if (gpuNodes.length > 0) {
      return gpuNodes.map(n => ({
        name: n.name,
        cluster: n.cluster,
        gpuType: n.gpuType,
        gpuCount: n.gpuCount,
        gpuAllocated: n.gpuAllocated }))
    }
    // Don't fall back during the initial load — the card will show its
    // skeleton while `hookLoading` is true.
    if (hookLoading && !isFailed && consecutiveFailures === 0) {
      return []
    }
    // Only fall back when the live fetch actually failed. A successful fetch
    // that returned an empty list is a legitimate "cluster has no GPUs" state
    // and must NOT be masked by stale history.
    if (!isFailed && consecutiveFailures === 0) {
      return []
    }
    // Use real `Date.now()` for the age computation so a snapshot that just
    // crossed the staleness threshold is measured against true elapsed time
    // rather than the start of the current minute bucket (which can be up to
    // `STALENESS_TICK_MS - 1` ms smaller than real time and would effectively
    // extend the staleness window). `stalenessTick` is still in the memo deps
    // so the recompute fires on each bucket boundary.
    void stalenessTick
    const now = Date.now()
    for (let i = metricsHistory.length - 1; i >= 0; i -= 1) {
      const snap = metricsHistory[i]
      const snapNodes = snap?.gpuNodes || []
      if (snapNodes.length === 0) continue
      const age = now - new Date(snap.timestamp).getTime()
      if (age > GPU_SNAPSHOT_STALENESS_MS) {
        // History is ordered oldest→newest, so every earlier snapshot is
        // even older — we can stop scanning.
        break
      }
      return snapNodes.map(g => ({
        name: g.name,
        cluster: g.cluster,
        gpuType: g.gpuType,
        gpuCount: g.gpuTotal,
        gpuAllocated: g.gpuAllocated }))
    }
    // Tier 3: MCP module-level GPU cache (persisted to localStorage by
    // web/src/hooks/mcp/compute.ts). This is last-resort when both the
    // live fetch and metrics history are empty — typically on a fresh
    // page load against a cluster whose GPU fetch is currently flapping.
    const mcpCachedNodes: GPUNode[] = mcpGPUNodeCache?.nodes || []
    if (mcpCachedNodes.length > 0) {
      return mcpCachedNodes.map(n => ({
        name: n.name,
        cluster: n.cluster,
        gpuType: n.gpuType,
        gpuCount: n.gpuCount,
        gpuAllocated: n.gpuAllocated }))
    }
    return []
  }, [gpuNodes, metricsHistory, hookLoading, isFailed, consecutiveFailures, stalenessTick])
}
