import { useState, useEffect } from 'react'
import { useSearchParams, useLocation, useNavigate } from 'react-router-dom'
import { useModalState } from '../../lib/modals'
import { safeGetItem, safeSetItem } from '../../lib/utils/localStorage'
import { agentFetch } from '../../hooks/mcp/shared'
import {
  LOCAL_AGENT_HTTP_URL,
  FETCH_DEFAULT_TIMEOUT_MS,
  STORAGE_KEY_CLUSTER_LAYOUT,
  STORAGE_KEY_CLUSTER_ORDER,
} from '../../lib/constants'
import type { TFunction } from 'i18next'
import type { ClusterLayoutMode } from './components'

type ClusterFilter = 'all' | 'healthy' | 'unhealthy' | 'unreachable'
type ClusterSortBy = 'name' | 'nodes' | 'pods' | 'health' | 'provider' | 'custom'

interface UseClusterPageStateParams {
  refetch: () => void
  showToast: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void
  t: TFunction
  isConnected: boolean
}

export function useClusterPageState({
  refetch,
  showToast,
  t,
  isConnected,
}: UseClusterPageStateParams) {
  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()

  const [selectedCluster, setSelectedCluster] = useState<string | null>(null)

  const urlStatus = searchParams.get('status')
  const validFilter = (
    urlStatus === 'healthy' || urlStatus === 'unhealthy' || urlStatus === 'unreachable'
  ) ? urlStatus : 'all'
  const [filter, setFilterState] = useState<ClusterFilter>(validFilter)

  useEffect(() => {
    const newFilter = (
      urlStatus === 'healthy' || urlStatus === 'unhealthy' || urlStatus === 'unreachable'
    ) ? urlStatus : 'all'
    if (newFilter !== filter) setFilterState(newFilter)
  }, [urlStatus, filter])

  const setFilter = (newFilter: ClusterFilter) => {
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
        customOrder: savedOrder ? JSON.parse(savedOrder) : [],
      }
    } catch {
      return { by: 'name', customOrder: [] }
    }
  })
  const [sortAsc, setSortAsc] = useState(true)

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

  const sortBy = sortState.by
  const customOrder = sortState.customOrder
  const setSortBy = (by: ClusterSortBy) => setSortState(prev => ({ ...prev, by }))

  const [layoutMode, setLayoutMode] = useState<ClusterLayoutMode>(() => {
    const stored = safeGetItem(STORAGE_KEY_CLUSTER_LAYOUT)
    return (stored as ClusterLayoutMode) || 'grid'
  })

  const [renamingCluster, setRenamingCluster] = useState<string | null>(null)
  const [removingCluster, setRemovingCluster] = useState<string | null>(null)
  const [showClusterGrid, setShowClusterGrid] = useState(true)
  const { isOpen: showGPUModal, open: openGPUModal, close: closeGPUModal } = useModalState()
  const [showAddCluster, setShowAddCluster] = useState(false)

  useEffect(() => {
    refetch()
  }, [location.key]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleRenameContext = async (oldName: string, newName: string) => {
    if (!isConnected) throw new Error(t('cluster.renameNoAgent'))
    const response = await agentFetch(`${LOCAL_AGENT_HTTP_URL}/rename-context`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldName, newName }),
      signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
    })
    if (!response.ok) {
      const data = await response.json().catch(() => ({})) as { error?: string; message?: string }
      const fallback = `HTTP ${response.status}: ${response.statusText || 'Failed to rename context'}`
      throw new Error(data.error || data.message || fallback)
    }
    refetch()
  }

  const handleRemoveCluster = async (contextName: string) => {
    if (!isConnected) throw new Error(t('cluster.removeClusterNoAgent'))
    const response = await agentFetch(`${LOCAL_AGENT_HTTP_URL}/kubeconfig/remove`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context: contextName }),
      signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
    })
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(t('cluster.removeClusterAgentTooOld'))
      }
      const data = await response.json().catch(() => ({})) as { error?: string; message?: string }
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
    navigate,
    selectedCluster, setSelectedCluster,
    filter, setFilter,
    sortBy, sortAsc, setSortAsc, customOrder, setSortBy,
    layoutMode, setLayoutMode,
    renamingCluster, setRenamingCluster,
    removingCluster, setRemovingCluster,
    showClusterGrid, setShowClusterGrid,
    showGPUModal, openGPUModal, closeGPUModal,
    showAddCluster, setShowAddCluster,
    handleRenameContext, handleRemoveCluster, handleReorder,
  }
}
