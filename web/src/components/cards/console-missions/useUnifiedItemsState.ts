/**
 * Manages the search/filter/sort/pagination/grouping state for the
 * unified items list rendered by ConsoleOfflineDetectionCard. Extracted
 * from the main component to keep it focused on composition/rendering.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ALERT_SEVERITY_ORDER } from '../../../types/alerts'
import {
  type UnifiedItem,
  type SortField,
  buildRootCauseGroups,
} from './offlineDataTransforms'

export function useUnifiedItemsState(unifiedItems: UnifiedItem[]) {
  const [search, setSearch] = useState('')
  const [localClusterFilter, setLocalClusterFilter] = useState<string[]>([])
  const [showClusterFilter, setShowClusterFilter] = useState(false)
  const [sortField, setSortField] = useState<SortField>('severity')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState<number | 'unlimited'>(5)
  const [viewMode, setViewMode] = useState<'list' | 'grouped'>('list')
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  const clusterFilterRef = useRef<HTMLDivElement>(null)

  // Close cluster dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node
      if (clusterFilterRef.current && !clusterFilterRef.current.contains(target)) {
        setShowClusterFilter(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Available clusters for filtering
  const availableClustersForFilter = useMemo(() => {
    const clusterSet = new Set<string>()
    unifiedItems.forEach(item => clusterSet.add(item.cluster))
    return Array.from(clusterSet).sort()
  }, [unifiedItems])

  // Filter items (memoized)
  const filteredItems = useMemo(() => {
    let result = unifiedItems

    if (search.trim()) {
      const query = search.toLowerCase()
      result = result.filter(item =>
        item.name.toLowerCase().includes(query) ||
        item.cluster.toLowerCase().includes(query) ||
        item.reason.toLowerCase().includes(query)
      )
    }

    if (localClusterFilter.length > 0) {
      result = result.filter(item => localClusterFilter.includes(item.cluster))
    }

    return result
  }, [unifiedItems, search, localClusterFilter])

  // Sort items (memoized)
  const sortedItems = useMemo(() => {
    const sevOrder = ALERT_SEVERITY_ORDER as Record<string, number>
    const categoryOrder: Record<string, number> = { offline: 0, gpu: 1, prediction: 2 }

    return [...filteredItems].sort((a, b) => {
      let cmp = 0
      switch (sortField) {
        case 'name':
          cmp = a.name.localeCompare(b.name)
          break
        case 'cluster':
          cmp = a.cluster.localeCompare(b.cluster)
          break
        case 'severity':
          cmp = (sevOrder[a.severity] ?? 999) - (sevOrder[b.severity] ?? 999)
          break
        case 'category':
          cmp = (categoryOrder[a.category] ?? 999) - (categoryOrder[b.category] ?? 999)
          break
      }
      return sortDirection === 'asc' ? cmp : -cmp
    })
  }, [filteredItems, sortField, sortDirection])

  // Pagination (memoized)
  const { effectivePerPage, totalPages, needsPagination, paginatedItems } = useMemo(() => {
    const eff = itemsPerPage === 'unlimited' ? sortedItems.length : itemsPerPage
    const tp = Math.ceil(sortedItems.length / eff) || 1
    const needs = itemsPerPage !== 'unlimited' && sortedItems.length > eff
    const items = itemsPerPage === 'unlimited'
      ? sortedItems
      : sortedItems.slice((currentPage - 1) * eff, (currentPage - 1) * eff + eff)
    return { effectivePerPage: eff, totalPages: tp, needsPagination: needs, paginatedItems: items }
  }, [sortedItems, itemsPerPage, currentPage])

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [search, localClusterFilter, sortField])

  // Ensure current page is valid (#5762)
  useEffect(() => {
    if (totalPages > 0 && currentPage > totalPages) {
      setCurrentPage(totalPages)
    }
  }, [totalPages, currentPage])

  const toggleClusterFilter = useCallback((cluster: string) => {
    setLocalClusterFilter(prev =>
      prev.includes(cluster) ? prev.filter(c => c !== cluster) : [...prev, cluster]
    )
  }, [])

  const clearClusterFilter = useCallback(() => {
    setLocalClusterFilter([])
  }, [])

  // Single-pass partition: categorize items by type in one iteration
  const categorizedItems = useMemo(() => {
    const offline: UnifiedItem[] = []
    const gpu: UnifiedItem[] = []
    const prediction: UnifiedItem[] = []
    const criticalPredictions: UnifiedItem[] = []
    const aiPredictions: UnifiedItem[] = []

    for (const item of sortedItems) {
      if (item.category === 'offline') {
        offline.push(item)
      } else if (item.category === 'gpu') {
        gpu.push(item)
      } else if (item.category === 'prediction') {
        prediction.push(item)
        if (item.predictionData?.severity === 'critical') {
          criticalPredictions.push(item)
        }
        if (item.predictionData?.source === 'ai') {
          aiPredictions.push(item)
        }
      }
    }

    return {
      offline,
      gpu,
      prediction,
      criticalPredictions,
      aiPredictions,
    }
  }, [sortedItems])

  // Filtered counts for the action button
  const filteredOfflineCount = categorizedItems.offline.length
  const filteredGpuCount = categorizedItems.gpu.length
  const filteredPredictionCount = categorizedItems.prediction.length

  const rootCauseGroups = useMemo(
    () => buildRootCauseGroups(sortedItems, ALERT_SEVERITY_ORDER as Record<string, number>),
    [sortedItems],
  )

  // Fixed: immutable Set update pattern
  const toggleGroupExpand = useCallback((cause: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(cause)) next.delete(cause)
      else next.add(cause)
      return next
    })
  }, [])

  const filteredTotalIssues = filteredOfflineCount + filteredGpuCount
  const filteredTotalPredicted = filteredPredictionCount
  const filteredCriticalPredicted = categorizedItems.criticalPredictions.length
  const filteredAIPredictionCount = categorizedItems.aiPredictions.length
  const isFiltered = search.trim() !== '' || localClusterFilter.length > 0

  return {
    search,
    setSearch,
    localClusterFilter,
    showClusterFilter,
    setShowClusterFilter,
    sortField,
    setSortField,
    sortDirection,
    setSortDirection,
    currentPage,
    setCurrentPage,
    itemsPerPage,
    setItemsPerPage,
    viewMode,
    setViewMode,
    expandedGroups,
    clusterFilterRef,
    availableClustersForFilter,
    sortedItems,
    effectivePerPage,
    totalPages,
    needsPagination,
    paginatedItems,
    toggleClusterFilter,
    clearClusterFilter,
    categorizedItems,
    rootCauseGroups,
    toggleGroupExpand,
    filteredOfflineCount,
    filteredGpuCount,
    filteredTotalIssues,
    filteredTotalPredicted,
    filteredCriticalPredicted,
    filteredAIPredictionCount,
    isFiltered,
  }
}
