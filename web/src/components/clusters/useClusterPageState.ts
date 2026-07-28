import { useState, useEffect } from 'react'
import { useSearchParams, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { agentFetch } from '../../hooks/mcp/shared'
import { useModalState } from '../../lib/modals'
import { useToast } from '../ui/Toast'
import { safeGetItem, safeSetItem } from '../../lib/utils/localStorage'
import { LOCAL_AGENT_HTTP_URL, STORAGE_KEY_CLUSTER_LAYOUT, STORAGE_KEY_CLUSTER_ORDER, FETCH_DEFAULT_TIMEOUT_MS } from '../../lib/constants'
import type { ClusterLayoutMode } from './components'

export type ClusterFilterValue = 'all' | 'healthy' | 'unhealthy' | 'unreachable'
export type ClusterSortBy = 'name' | 'nodes' | 'pods' | 'health' | 'provider' | 'custom'

export interface UseClusterPageStateArgs {
  isConnected: boolean
  refetch: () => void
}

/**
 * Encapsulates all filter/sort/layout/modal UI state and cluster mutation
 * handlers (rename, remove, reorder) for the Clusters page. Extracted from
 * Clusters.tsx to keep the page component focused on rendering (#21617).
 */
export function useClusterPageState({ isConnected, refetch }: UseClusterPageStateArgs) {
  const { t } = useTranslation()
  const { showToast } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()
  const [selectedCluster, setSelectedCluster] = useState<string | null>(null)

  // Read filter from URL, default to 'all'
  const urlStatus = searchParams.get('status')
  const validFilter: ClusterFilterValue = (urlStatus === 'healthy' || urlStatus === 'unhealthy' || urlStatus === 'unreachable') ? urlStatus : 'all'
  const [filter, setFilterState] = useState<ClusterFilterValue>(validFilter)

  // Sync filter state with URL changes (e.g., when navigating from sidebar)
  useEffect(() => {
    const newFilter: ClusterFilterValue = (urlStatus === 'healthy' || urlStatus === 'unhealthy' || urlStatus === 'unreachable') ? urlStatus : 'all'
    if (newFilter !== filter) {
      setFilterState(newFilter)
    }
  }, [urlStatus, filter])

  // Update URL when filter changes programmatically
  const setFilter = (newFilter: ClusterFilterValue) => {
    setFilterState(newFilter)
    if (newFilter === 'all') {
      searchParams.delete('status')
    } else {
      searchParams.set('status', newFilter)
    }
    setSearchParams(searchParams, { replace: true })
  }

  const [sortState, setSortState] = useState<{ by: ClusterSortBy; customOrder: string[] }>(() => {
    try {
      const savedOrder = safeGetItem(STORAGE_KEY_CLUSTER_ORDER)
      return {
        by: savedOrder ? 'custom' : 'name',
        customOrder: savedOrder ? JSON.parse(savedOrder) : [] }
    } catch {
      return { by: 'name', customOrder: [] }
    }
  })
  const [sortAsc, setSortAsc] = useState(true)

  // Notify user if saved cluster sort configuration was corrupt and had to be reset
  useEffect(() => {
    const savedOrder = safeGetItem(STORAGE_KEY_CLUSTER_ORDER)
    if (savedOrder) {
      try {
        JSON.parse(savedOrder)
      } catch {
        showToast(t('cluster.sortPreferencesCorrupted'), 'warning')
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Convenience aliases so downstream code stays unchanged
  const sortBy = sortState.by
  const customOrder = sortState.customOrder
  const setSortBy = (by: ClusterSortBy) =>
      setSortState(prev => ({ ...prev, by }))
  const [layoutMode, setLayoutMode] = useState<ClusterLayoutMode>(() => {
    const stored = safeGetItem(STORAGE_KEY_CLUSTER_LAYOUT)
    return (stored as ClusterLayoutMode) || 'grid'
  })
  const [renamingCluster, setRenamingCluster] = useState<string | null>(null)
  const [removingCluster, setRemovingCluster] = useState<string | null>(null)

  // Additional UI state
  const [showClusterGrid, setShowClusterGrid] = useState(true) // Cluster cards visible by default
  const { isOpen: showGPUModal, open: openGPUModal, close: closeGPUModal } = useModalState()
  const [showAddCluster, setShowAddCluster] = useState(false)

  // Trigger refresh when navigating to this page (location.key changes on each navigation)
  useEffect(() => {
    refetch()
  }, [location.key]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleRenameContext = async (oldName: string, newName: string) => {
    if (!isConnected) throw new Error(t('cluster.renameNoAgent'))
    // Use agentFetch so the Authorization: Bearer <KC_AGENT_TOKEN> header
    // is injected — plain fetch() is rejected with 401 when the agent has
    // a token configured (#6133).
    const response = await agentFetch(`${LOCAL_AGENT_HTTP_URL}/rename-context`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldName, newName }),
      signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS) })
    if (!response.ok) {
      const data = await response.json().catch(() => ({})) as { error?: string; message?: string }
      // Fall back to HTTP status so users see e.g. "HTTP 401: Unauthorized"
      // instead of a silent generic error when the body has no message.
      const fallback = `HTTP ${response.status}: ${response.statusText || 'Failed to rename context'}`
      throw new Error(data.error || data.message || fallback)
    }
    refetch()
  }

  /**
   * Remove an offline cluster's kubeconfig context (#5901).
   * Backend: `RemoveContext` in pkg/k8s/client.go (added in #5658). The agent
   * exposes it at POST /kubeconfig/remove on the localhost-only HTTP server.
   *
   * Uses agentFetch() to inject the KC_AGENT_TOKEN Authorization header;
   * without this the kc-agent rejects the request with 401 Unauthorized
   * whenever a token is configured, which manifested as a silent "Failed
   * to remove cluster from kubeconfig" in the UI (#6133).
   */
  const handleRemoveCluster = async (contextName: string) => {
    if (!isConnected) throw new Error(t('cluster.removeClusterNoAgent'))
    const response = await agentFetch(`${LOCAL_AGENT_HTTP_URL}/kubeconfig/remove`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context: contextName }),
      signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS) })
    if (!response.ok) {
      // #6293: check for the 404-means-stale-agent case BEFORE attempting
      // to parse the body. An old kc-agent returns a plain-text Go
      // default 404 ("404 page not found") which is not JSON — reading
      // it first would be a wasted round-trip. Same reason #6288 added
      // the status-specific branch in the first place.
      if (response.status === 404) {
        throw new Error(t('cluster.removeClusterAgentTooOld'))
      }
      const data = await response.json().catch(() => ({})) as { error?: string; message?: string }
      // Always surface the HTTP status if the body has no structured error,
      // so the user sees "HTTP 401: Unauthorized" instead of the generic
      // fallback — this was the root cause of #6133 being unactionable.
      const fallback = `HTTP ${response.status}: ${response.statusText || t('cluster.removeClusterError')}`
      throw new Error(data.error || data.message || fallback)
    }
    showToast(t('cluster.removeClusterSuccess', { name: contextName }), 'success')
    refetch()
  }

  const handleReorder = (newOrder: string[]) => {
    setSortState({ by: 'custom', customOrder: newOrder })
    safeSetItem(STORAGE_KEY_CLUSTER_ORDER, JSON.stringify(newOrder))
  }

  return {
    selectedCluster,
    setSelectedCluster,
    filter,
    setFilter,
    sortBy,
    setSortBy,
    sortAsc,
    setSortAsc,
    customOrder,
    layoutMode,
    setLayoutMode,
    renamingCluster,
    setRenamingCluster,
    removingCluster,
    setRemovingCluster,
    showClusterGrid,
    setShowClusterGrid,
    showGPUModal,
    openGPUModal,
    closeGPUModal,
    showAddCluster,
    setShowAddCluster,
    handleRenameContext,
    handleRemoveCluster,
    handleReorder,
  }
}
