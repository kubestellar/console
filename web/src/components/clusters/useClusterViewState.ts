import { useState, useEffect } from 'react'
import type { useSearchParams } from 'react-router-dom'
import { useToast } from '../ui/Toast'
import { useTranslation } from 'react-i18next'
import { STORAGE_KEY_CLUSTER_LAYOUT, STORAGE_KEY_CLUSTER_ORDER } from '../../lib/constants'
import { safeGetItem, safeSetItem } from '../../lib/utils/localStorage'
import type { ClusterLayoutMode } from './components'

export type ClusterHealthFilter = 'all' | 'healthy' | 'unhealthy' | 'unreachable'
export type ClusterSortField = 'name' | 'nodes' | 'pods' | 'health' | 'provider' | 'custom'

export interface ClusterSortState {
  by: ClusterSortField
  customOrder: string[]
}

type SearchParamsTuple = ReturnType<typeof useSearchParams>

/**
 * Encapsulates the Clusters page's health filter, sort, and layout-mode
 * state, including URL sync for the filter and localStorage persistence
 * for sort order and layout mode. Extracted from Clusters.tsx (#21617) to
 * reduce the component's hook count.
 */
export function useClusterViewState(searchParamsTuple: SearchParamsTuple) {
  const { t } = useTranslation()
  const { showToast } = useToast()
  const [searchParams, setSearchParams] = searchParamsTuple

  // Read filter from URL, default to 'all'
  const urlStatus = searchParams.get('status')
  const validFilter: ClusterHealthFilter = (urlStatus === 'healthy' || urlStatus === 'unhealthy' || urlStatus === 'unreachable') ? urlStatus : 'all'
  const [filter, setFilterState] = useState<ClusterHealthFilter>(validFilter)

  // Sync filter state with URL changes (e.g., when navigating from sidebar)
  useEffect(() => {
    const newFilter: ClusterHealthFilter = (urlStatus === 'healthy' || urlStatus === 'unhealthy' || urlStatus === 'unreachable') ? urlStatus : 'all'
    if (newFilter !== filter) {
      setFilterState(newFilter)
    }
  }, [urlStatus, filter])

  // Update URL when filter changes programmatically
  const setFilter = (newFilter: ClusterHealthFilter) => {
    setFilterState(newFilter)
    if (newFilter === 'all') {
      searchParams.delete('status')
    } else {
      searchParams.set('status', newFilter)
    }
    setSearchParams(searchParams, { replace: true })
  }

  const [sortState, setSortState] = useState<ClusterSortState>(() => {
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
  const setSortBy = (by: ClusterSortField) =>
    setSortState(prev => ({ ...prev, by }))

  const [layoutMode, setLayoutModeState] = useState<ClusterLayoutMode>(() => {
    const stored = safeGetItem(STORAGE_KEY_CLUSTER_LAYOUT)
    return (stored as ClusterLayoutMode) || 'grid'
  })
  const setLayoutMode = (mode: ClusterLayoutMode) => {
    setLayoutModeState(mode)
    safeSetItem(STORAGE_KEY_CLUSTER_LAYOUT, mode)
  }

  const handleReorder = (newOrder: string[]) => {
    setSortState({ by: 'custom', customOrder: newOrder })
    safeSetItem(STORAGE_KEY_CLUSTER_ORDER, JSON.stringify(newOrder))
  }

  return {
    filter,
    setFilter,
    sortBy,
    setSortBy,
    sortAsc,
    setSortAsc,
    customOrder,
    layoutMode,
    setLayoutMode,
    handleReorder,
  }
}
