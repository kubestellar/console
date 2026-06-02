import { useState, useMemo, useEffect, useRef } from 'react'
import { useTabKeyboardNav } from '../../hooks/useKeyboardNav'
import { XCircle } from 'lucide-react'
import { useCardLoadingState } from './CardDataContext'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { useClusters } from '../../hooks/useMCP'
import { useCachedHardwareHealth, type DeviceAlert, type NodeDeviceInventory } from '../../hooks/useCachedData'
import { useSnoozedAlerts } from '../../hooks/useSnoozedAlerts'
import { LOCAL_AGENT_HTTP_URL, FETCH_DEFAULT_TIMEOUT_MS } from '../../lib/constants'
import { agentFetch } from '../../hooks/mcp/shared'
import {
  ALERTS_SORT_OPTIONS,
  CLEAR_ERROR_DISMISS_MS,
  DEFAULT_ALERTS_SORT,
  DEFAULT_INVENTORY_SORT,
  extractHostname,
  getTotalDevices,
  GPU_SORT_WEIGHT,
  INVENTORY_SORT_OPTIONS,
  UNKNOWN_SEVERITY_SORT_ORDER,
} from './HardwareHealthCard.utils'
import type { SortField, ViewMode } from './HardwareHealthCard.types'
import { HardwareHealthCardContent } from './HardwareHealthCardContent'
import { HardwareHealthCardHeader } from './HardwareHealthCardHeader'

export function HardwareHealthCard() {
  // Use cached hook — persists to IndexedDB, survives navigation, handles demo mode
  const {
    data: hwData,
    isLoading,
    isRefreshing,
    isFailed,
    consecutiveFailures,
    isDemoFallback,
    error: fetchError,
    refetch,
    retryFetch } = useCachedHardwareHealth()

  const alerts = hwData.alerts
  const inventory = hwData.inventory
  const nodeCount = hwData.nodeCount
  const lastUpdate = hwData.lastUpdate ? new Date(hwData.lastUpdate) : null

  const [isRetrying, setIsRetrying] = useState(false)
  const [retryError, setRetryError] = useState<string | null>(null)

  const handleRetry = async () => {
    setIsRetrying(true)
    setRetryError(null)
    try {
      await retryFetch()
    } catch (err) {
      setRetryError(err instanceof Error ? err.message : 'Retry failed due to network/CORS issue')
    } finally {
      setIsRetrying(false)
    }
  }

  const [viewMode, setViewMode] = useState<ViewMode>('inventory')
  // Track whether the user has explicitly chosen a view tab.
  // When true, auto-switch logic is suppressed so data refreshes
  // don't override the user's choice.
  const userSelectedView = useRef(false)
  const handleViewModeChange = (mode: ViewMode) => {
    userSelectedView.current = true
    setViewMode(mode)
  }
  const { tabListProps, getTabProps, getTabPanelProps } = useTabKeyboardNav<ViewMode>({
    tabs: ['inventory', 'alerts'],
    activeTab: viewMode,
    onChange: handleViewModeChange,
  })
  const [showSnoozed, setShowSnoozed] = useState(false)
  const [snoozeMenuOpen, setSnoozeMenuOpen] = useState<string | null>(null)
  const [snoozeAllMenuOpen, setSnoozeAllMenuOpen] = useState(false)
  const { drillToNode } = useDrillDownActions()
  const { deduplicatedClusters } = useClusters()
  const { snoozeAlert, snoozeMultiple, unsnoozeAlert, isSnoozed, getSnoozeRemaining, clearAllSnoozed } = useSnoozedAlerts()
  const snoozeMenuRef = useRef<HTMLDivElement>(null)
  const snoozeAllMenuRef = useRef<HTMLDivElement>(null)

  // Build a map of raw cluster names to deduplicated primary names (same as ClusterDetailModal)
  const clusterNameMap = useMemo(() => {
    const map: Record<string, string> = {}
    deduplicatedClusters.forEach(c => {
      map[c.name] = c.name // Primary maps to itself
      c.aliases?.forEach(alias => {
        map[alias] = c.name // Aliases map to primary
      })
    })
    return map
  }, [deduplicatedClusters])

  // Card controls state
  const [search, setSearch] = useState('')
  const [localClusterFilter, setLocalClusterFilter] = useState<string[]>([])
  const [showClusterFilter, setShowClusterFilter] = useState(false)
  const [sortField, setSortField] = useState<SortField>(DEFAULT_INVENTORY_SORT)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState<number | 'unlimited'>(5)
  // Declared here (with other state) to maintain stable hook order across renders.
  // Previously declared after useEffect calls which violated rules of hooks (#4086).
  const [clearAlertError, setClearAlertError] = useState<string | null>(null)

  const clusterFilterRef = useRef<HTMLDivElement>(null)

  // Report loading state to CardWrapper (useCache handles demo mode internally)
  const hasData = alerts.length > 0 || inventory.length > 0 || nodeCount > 0
  useCardLoadingState({
    isLoading: isLoading && !hasData,
    isRefreshing,
    hasAnyData: hasData,
    isDemoData: isDemoFallback,
    isFailed,
    consecutiveFailures })

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node
      if (clusterFilterRef.current && !clusterFilterRef.current.contains(target)) {
        setShowClusterFilter(false)
      }
      if (snoozeMenuRef.current && !snoozeMenuRef.current.contains(target)) {
        setSnoozeMenuOpen(null)
      }
      if (snoozeAllMenuRef.current && !snoozeAllMenuRef.current.contains(target)) {
        setSnoozeAllMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Deduplicate alerts by canonical hostname (same node may appear with different names/cluster contexts)
  // Uses clusterNameMap to map raw cluster names to deduplicated primary names (same as ClusterDetailModal)
  const deduplicatedAlerts = useMemo(() => {
    const byHostnameAndDevice = new Map<string, DeviceAlert>()
    alerts.forEach(alert => {
      const hostname = extractHostname(alert.nodeName)
      const mappedCluster = clusterNameMap[alert.cluster] || alert.cluster
      const key = `${hostname}-${alert.deviceType}`
      const existing = byHostnameAndDevice.get(key)
      // Keep first occurrence, skip duplicates
      if (!existing) {
        byHostnameAndDevice.set(key, { ...alert, nodeName: hostname, cluster: mappedCluster })
      }
    })
    return Array.from(byHostnameAndDevice.values())
  }, [alerts, clusterNameMap])

  // Deduplicate inventory by canonical hostname
  // Uses clusterNameMap to map raw cluster names to deduplicated primary names (same as ClusterDetailModal)
  const deduplicatedInventory = useMemo(() => {
    const byHostname = new Map<string, NodeDeviceInventory>()
    inventory.forEach(node => {
      const hostname = extractHostname(node.nodeName)
      const mappedCluster = clusterNameMap[node.cluster] || node.cluster
      // Keep first occurrence for each unique hostname
      if (!byHostname.has(hostname)) {
        byHostname.set(hostname, { ...node, nodeName: hostname, cluster: mappedCluster })
      }
    })
    return Array.from(byHostname.values())
  }, [inventory, clusterNameMap])

  // Node count should use deduplicated inventory count for consistency
  const deduplicatedNodeCount = deduplicatedInventory.length || nodeCount

  // Available clusters for filtering (from deduplicated data)
  const availableClustersForFilter = useMemo(() => {
    const clusterSet = new Set<string>()
    deduplicatedAlerts.forEach(alert => clusterSet.add(alert.cluster))
    deduplicatedInventory.forEach(node => clusterSet.add(node.cluster))
    return Array.from(clusterSet).sort()
  }, [deduplicatedAlerts, deduplicatedInventory])

  // Filter alerts (using deduplicated data)
  const filteredAlerts = useMemo(() => {
    let result = deduplicatedAlerts

    // Filter out snoozed alerts unless showSnoozed is true
    if (!showSnoozed) {
      result = result.filter(alert => !isSnoozed(alert.id))
    }

    // Apply search
    if (search.trim()) {
      const query = search.toLowerCase()
      result = result.filter(alert =>
        alert.nodeName.toLowerCase().includes(query) ||
        (alert.cluster || '').toLowerCase().includes(query) ||
        alert.deviceType.toLowerCase().includes(query)
      )
    }

    // Apply local cluster filter
    if (localClusterFilter.length > 0) {
      result = result.filter(alert => localClusterFilter.includes(alert.cluster))
    }

    return result
  }, [deduplicatedAlerts, showSnoozed, isSnoozed, search, localClusterFilter])

  // Count of active (non-snoozed) alerts
  const activeAlertCount = useMemo(() => {
    return deduplicatedAlerts.filter(alert => !isSnoozed(alert.id)).length
  }, [deduplicatedAlerts, isSnoozed])

  // Auto-switch to alerts tab on initial load when active alerts exist.
  // Once the user has explicitly clicked a view tab, stop overriding.
  useEffect(() => {
    if (activeAlertCount > 0 && !userSelectedView.current) {
      setViewMode('alerts')
    }
  }, [activeAlertCount])

  // Select sort options applicable to the current view
  const currentSortOptions = viewMode === 'alerts' ? ALERTS_SORT_OPTIONS : INVENTORY_SORT_OPTIONS

  // Reset sort field to the view-appropriate default when switching views
  useEffect(() => {
    const defaultSort = viewMode === 'alerts' ? DEFAULT_ALERTS_SORT : DEFAULT_INVENTORY_SORT
    const validFields = (viewMode === 'alerts' ? ALERTS_SORT_OPTIONS : INVENTORY_SORT_OPTIONS).map(o => o.value)
    // If current sort field is not valid for the new view, reset to default
    if (!validFields.includes(sortField)) {
      setSortField(defaultSort)
    }
  }, [viewMode]) // eslint-disable-line react-hooks/exhaustive-deps -- intentionally only reacts to viewMode changes

  // Get IDs of visible alerts for "Snooze All"
  const visibleAlertIds = useMemo(() => {
    return filteredAlerts.filter(a => !isSnoozed(a.id)).map(a => a.id)
  }, [filteredAlerts, isSnoozed])

  // Sort alerts — memoized so sortedAlerts.length is stable across renders
  // and won't cause totalPages → currentTotalPages → pagination useEffect to loop.
  const sortedAlerts = useMemo(() => {
    const severityOrder: Record<string, number> = { critical: 0, warning: 1 }

    return [...filteredAlerts].sort((a, b) => {
      let cmp = 0
      switch (sortField) {
        case 'nodeName':
          cmp = a.nodeName.localeCompare(b.nodeName)
          break
        case 'cluster':
          cmp = (a.cluster || '').localeCompare(b.cluster || '')
          break
        case 'deviceType':
          cmp = a.deviceType.localeCompare(b.deviceType)
          break
        case 'severity':
        default:
          cmp = (severityOrder[a.severity] ?? UNKNOWN_SEVERITY_SORT_ORDER) - (severityOrder[b.severity] ?? UNKNOWN_SEVERITY_SORT_ORDER)
          break
      }
      return sortDirection === 'asc' ? cmp : -cmp
    })
  }, [filteredAlerts, sortField, sortDirection])

  // Pagination
  const effectivePerPage = itemsPerPage === 'unlimited' ? sortedAlerts.length : itemsPerPage
  const totalPages = Math.ceil(sortedAlerts.length / effectivePerPage) || 1
  const needsPagination = itemsPerPage !== 'unlimited' && sortedAlerts.length > effectivePerPage

  const paginatedAlerts = useMemo(() => {
    if (itemsPerPage === 'unlimited') return sortedAlerts
    const start = (currentPage - 1) * effectivePerPage
    return sortedAlerts.slice(start, start + effectivePerPage)
  }, [sortedAlerts, itemsPerPage, currentPage, effectivePerPage])

  // Reset page when filters or view mode change
  useEffect(() => {
    setCurrentPage(1)
  }, [search, localClusterFilter, sortField, viewMode])

  const toggleClusterFilter = (cluster: string) => {
    setLocalClusterFilter(prev =>
      prev.includes(cluster) ? prev.filter(c => c !== cluster) : [...prev, cluster]
    )
  }

  const clearClusterFilter = () => {
    setLocalClusterFilter([])
  }

  // Clear an alert (after power cycle) — triggers refetch to update cached data
  const clearAlert = async (alertId: string) => {
    setClearAlertError(null)
    try {
      const response = await agentFetch(`${LOCAL_AGENT_HTTP_URL}/devices/alerts/clear`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ alertId }),
        signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS) })
      if (!response.ok) {
        setClearAlertError(`Failed to clear alert (${response.status})`)
        return
      }
      // Refetch to update cached data (the cleared alert won't be in the response)
      refetch()
    } catch {
      setClearAlertError('Failed to clear alert — agent is unreachable')
    }
  }

  // Filter inventory (using deduplicated data)
  const filteredInventory = useMemo(() => {
    let result = deduplicatedInventory

    // Apply search
    if (search.trim()) {
      const query = search.toLowerCase()
      result = result.filter(node =>
        node.nodeName.toLowerCase().includes(query) ||
        (node.cluster || '').toLowerCase().includes(query)
      )
    }

    // Apply local cluster filter
    if (localClusterFilter.length > 0) {
      result = result.filter(node => localClusterFilter.includes(node.cluster))
    }

    return result
  }, [deduplicatedInventory, search, localClusterFilter])

  // Sort inventory
  const sortedInventory = useMemo(() => {
    return [...filteredInventory].sort((a, b) => {
      let cmp = 0
      switch (sortField) {
        case 'nodeName':
          cmp = a.nodeName.localeCompare(b.nodeName)
          break
        case 'cluster':
          cmp = (a.cluster || '').localeCompare(b.cluster || '')
          break
        case 'totalDevices':
        default: {
          // Sort by total device count for inventory (GPUs prioritized via weight)
          const aTotal = getTotalDevices(a.devices) + (a.devices.gpuCount * GPU_SORT_WEIGHT)
          const bTotal = getTotalDevices(b.devices) + (b.devices.gpuCount * GPU_SORT_WEIGHT)
          cmp = aTotal - bTotal
          break
        }
      }
      return sortDirection === 'asc' ? cmp : -cmp
    })
  }, [filteredInventory, sortField, sortDirection])

  // Pagination for inventory
  const inventoryTotalPages = Math.ceil(sortedInventory.length / effectivePerPage) || 1
  const inventoryNeedsPagination = itemsPerPage !== 'unlimited' && sortedInventory.length > effectivePerPage

  const paginatedInventory = useMemo(() => {
    if (itemsPerPage === 'unlimited') return sortedInventory
    const start = (currentPage - 1) * effectivePerPage
    return sortedInventory.slice(start, start + effectivePerPage)
  }, [sortedInventory, itemsPerPage, currentPage, effectivePerPage])

  // Count active (non-snoozed) alerts by severity
  const criticalCount = deduplicatedAlerts.filter(a => a.severity === 'critical' && !isSnoozed(a.id)).length
  const warningCount = deduplicatedAlerts.filter(a => a.severity === 'warning' && !isSnoozed(a.id)).length
  const snoozedAlertCount = deduplicatedAlerts.filter(a => isSnoozed(a.id)).length

  // Current view data
  const currentTotalPages = viewMode === 'alerts' ? totalPages : inventoryTotalPages

  // Ensure current page is valid for current view (#5762).
  // Only depend on currentTotalPages — including currentPage risks infinite loop.
  useEffect(() => {
    if (currentTotalPages > 0 && currentPage > currentTotalPages) {
      setCurrentPage(currentTotalPages)
    }
  }, [currentTotalPages]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!clearAlertError) return
    const timer = setTimeout(() => setClearAlertError(null), CLEAR_ERROR_DISMISS_MS)
    return () => clearTimeout(timer)
  }, [clearAlertError])

  return (
    <div className="h-full flex flex-col">
      {clearAlertError && (
        <div className="mb-2 p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
          <XCircle className="w-4 h-4 shrink-0" />
          <span>{clearAlertError}</span>
        </div>
      )}

      <HardwareHealthCardHeader
        criticalCount={criticalCount}
        warningCount={warningCount}
        deduplicatedNodeCount={deduplicatedNodeCount}
        viewMode={viewMode}
        onViewModeChange={handleViewModeChange}
        tabListProps={tabListProps}
        getTabProps={getTabProps}
        deduplicatedInventoryCount={deduplicatedInventory.length}
        activeAlertCount={activeAlertCount}
        snoozedAlertCount={snoozedAlertCount}
        showSnoozed={showSnoozed}
        onToggleShowSnoozed={() => setShowSnoozed(!showSnoozed)}
        visibleAlertIds={visibleAlertIds}
        snoozeAllMenuOpen={snoozeAllMenuOpen}
        onToggleSnoozeAllMenu={() => setSnoozeAllMenuOpen(!snoozeAllMenuOpen)}
        onSnoozeAll={duration => {
          snoozeMultiple(visibleAlertIds, duration)
          setSnoozeAllMenuOpen(false)
        }}
        onClearAllSnoozed={() => {
          clearAllSnoozed()
          setSnoozeAllMenuOpen(false)
        }}
        snoozeAllMenuRef={snoozeAllMenuRef}
        availableClustersForFilter={availableClustersForFilter}
        localClusterFilter={localClusterFilter}
        toggleClusterFilter={toggleClusterFilter}
        clearClusterFilter={clearClusterFilter}
        showClusterFilter={showClusterFilter}
        setShowClusterFilter={setShowClusterFilter}
        clusterFilterRef={clusterFilterRef}
        itemsPerPage={itemsPerPage}
        setItemsPerPage={setItemsPerPage}
        sortField={sortField}
        currentSortOptions={currentSortOptions}
        setSortField={setSortField}
        sortDirection={sortDirection}
        setSortDirection={setSortDirection}
        search={search}
        setSearch={setSearch}
        fetchError={fetchError}
        retryError={retryError}
        handleRetry={handleRetry}
        isRetrying={isRetrying}
        isRefreshing={isRefreshing}
        isDemoData={isDemoFallback}
      />

      <HardwareHealthCardContent
        viewMode={viewMode}
        getTabPanelProps={getTabPanelProps}
        paginatedAlerts={paginatedAlerts}
        sortedAlerts={sortedAlerts}
        alertsTotalPages={totalPages}
        alertsNeedsPagination={needsPagination}
        paginatedInventory={paginatedInventory}
        sortedInventory={sortedInventory}
        inventoryTotalPages={inventoryTotalPages}
        inventoryNeedsPagination={inventoryNeedsPagination}
        search={search}
        localClusterFilter={localClusterFilter}
        drillToNode={drillToNode}
        isSnoozed={isSnoozed}
        unsnoozeAlert={unsnoozeAlert}
        getSnoozeRemaining={getSnoozeRemaining}
        snoozeMenuOpen={snoozeMenuOpen}
        setSnoozeMenuOpen={setSnoozeMenuOpen}
        snoozeMenuRef={snoozeMenuRef}
        snoozeAlert={snoozeAlert}
        clearAlert={clearAlert}
        currentPage={currentPage}
        effectivePerPage={effectivePerPage}
        setCurrentPage={setCurrentPage}
        isRefreshing={isRefreshing}
        isDemoFallback={isDemoFallback}
        lastUpdate={lastUpdate}
      />
    </div>
  )
}
