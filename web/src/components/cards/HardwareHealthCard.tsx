import { useState, useEffect, useMemo, useRef } from 'react'
import { AlertTriangle, CheckCircle, Cpu, HardDrive, Wifi, Server, RefreshCw, XCircle, ChevronRight, List, AlertCircle, BellOff, Clock, MoreVertical } from 'lucide-react'
import { cn } from '../../lib/cn'
import { useCardLoadingState } from './CardDataContext'
import { CardControlsRow, CardSearchInput, CardPaginationFooter, CardAIActions } from '../../lib/cards/CardComponents'
import { ClusterBadge } from '../ui/ClusterBadge'
import { StatusBadge } from '../ui/StatusBadge'
import { RefreshIndicator } from '../ui/RefreshIndicator'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { useClusters } from '../../hooks/useMCP'
import { useCachedHardwareHealth, type DeviceAlert, type NodeDeviceInventory, type DeviceCounts } from '../../hooks/useCachedData'
import { useSnoozedAlerts, SNOOZE_DURATIONS, formatSnoozeRemaining, type SnoozeDuration } from '../../hooks/useSnoozedAlerts'
import { useTranslation } from 'react-i18next'
import { LOCAL_AGENT_HTTP_URL, FETCH_DEFAULT_TIMEOUT_MS } from '../../lib/constants'

// Sort field options — separated by view so only applicable fields are shown
type SortField = 'severity' | 'nodeName' | 'cluster' | 'deviceType' | 'totalDevices'

/** Sort options applicable to the Alerts view */
const ALERTS_SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: 'severity', label: 'Severity' },
  { value: 'nodeName', label: 'Node' },
  { value: 'cluster', label: 'Cluster' },
  { value: 'deviceType', label: 'Device' },
]

/** Sort options applicable to the Inventory view (no severity/device — those are alert-only concepts) */
const INVENTORY_SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: 'nodeName', label: 'Node' },
  { value: 'cluster', label: 'Cluster' },
  { value: 'totalDevices', label: 'Total Devices' },
]

/** Default sort field for each view */
const DEFAULT_ALERTS_SORT: SortField = 'severity'
const DEFAULT_INVENTORY_SORT: SortField = 'totalDevices'

// Get icon for device type
function DeviceIcon({ deviceType, className }: { deviceType: string; className?: string }) {
  switch (deviceType) {
    case 'gpu':
      return <Cpu className={className} />
    case 'nvme':
      return <HardDrive className={className} />
    case 'nic':
    case 'infiniband':
    case 'mellanox':
    case 'sriov':
    case 'rdma':
      return <Wifi className={className} />
    case 'mofed-driver':
    case 'gpu-driver':
    case 'spectrum-scale':
      return <Server className={className} />
    default:
      return <AlertTriangle className={className} />
  }
}

// Get human-readable device type label
function getDeviceLabel(deviceType: string): string {
  const labels: Record<string, string> = {
    gpu: 'GPU',
    nic: 'NIC',
    nvme: 'NVMe',
    infiniband: 'InfiniBand',
    mellanox: 'Mellanox',
    sriov: 'SR-IOV',
    rdma: 'RDMA',
    'mofed-driver': 'MOFED Driver',
    'gpu-driver': 'GPU Driver',
    'spectrum-scale': 'Spectrum Scale' }
  return labels[deviceType] || deviceType.toUpperCase()
}

type ViewMode = 'alerts' | 'inventory'

export function HardwareHealthCard() {
  const { t } = useTranslation(['cards', 'common'])
  // Use cached hook — persists to IndexedDB, survives navigation, handles demo mode
  const {
    data: hwData,
    isLoading,
    isRefreshing,
    isFailed,
    consecutiveFailures,
    isDemoFallback,
    error: fetchError,
    refetch } = useCachedHardwareHealth()

  const alerts = hwData.alerts
  const inventory = hwData.inventory
  const nodeCount = hwData.nodeCount
  const lastUpdate = hwData.lastUpdate ? new Date(hwData.lastUpdate) : null

  const [viewMode, setViewMode] = useState<ViewMode>('inventory')
  // Track whether the user has explicitly chosen a view tab.
  // When true, auto-switch logic is suppressed so data refreshes
  // don't override the user's choice.
  const userSelectedView = useRef(false)
  const [showSnoozed, setShowSnoozed] = useState(false)
  const [snoozeMenuOpen, setSnoozeMenuOpen] = useState<string | null>(null)
  const [snoozeAllMenuOpen, setSnoozeAllMenuOpen] = useState(false)
  const { drillToNode } = useDrillDownActions()
  const { deduplicatedClusters } = useClusters()
  const { snoozeAlert, snoozeMultiple, unsnoozeAlert, isSnoozed, getSnoozeRemaining, clearAllSnoozed } = useSnoozedAlerts()
  const snoozeMenuRef = useRef<HTMLDivElement>(null)
  const snoozeAllMenuRef = useRef<HTMLDivElement>(null)

  // Build a map of raw cluster names to deduplicated primary names (same as ClusterDetailModal)
  const clusterNameMap = (() => {
    const map: Record<string, string> = {}
    deduplicatedClusters.forEach(c => {
      map[c.name] = c.name // Primary maps to itself
      c.aliases?.forEach(alias => {
        map[alias] = c.name // Aliases map to primary
      })
    })
    return map
  })()

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

  // Extract canonical hostname from node name
  // Handles both short names (fmaas-vllm-d-wv25b-worker-h100-3-89pkb) and
  // long API/SA paths (api-fmaas-...:6443/system:serviceaccount:.../fmaas-vllm-d-wv25b-...)
  const extractHostname = (nodeName: string): string => {
    // If name contains API path indicators, try to extract the actual hostname
    if (nodeName.includes(':6443/') || nodeName.includes('/system:serviceaccount:')) {
      // Try to extract hostname from end of path (after last /)
      const parts = nodeName.split('/')
      const lastPart = parts[parts.length - 1]
      // If the last part looks like a hostname (not a path component), use it
      if (lastPart && !lastPart.includes(':') && lastPart.length > 5) {
        return lastPart
      }
      // Otherwise try to find a worker/gpu/compute node pattern anywhere in the string
      const nodePattern = /([a-z0-9-]+-worker-[a-z0-9-]+|[a-z0-9-]+-gpu-[a-z0-9-]+|[a-z0-9-]+-compute-[a-z0-9-]+)/i
      const match = nodeName.match(nodePattern)
      if (match) {
        return match[1]
      }
    }
    return nodeName
  }

  // Deduplicate alerts by canonical hostname (same node may appear with different names/cluster contexts)
  // Uses clusterNameMap to map raw cluster names to deduplicated primary names (same as ClusterDetailModal)
  const deduplicatedAlerts = (() => {
    const byHostnameAndDevice = new Map<string, DeviceAlert>()
    alerts.forEach(alert => {
      const hostname = extractHostname(alert.nodeName)
      const mappedCluster = clusterNameMap[alert.cluster] || alert.cluster
      const key = `${hostname}-${alert.deviceType}`
      const existing = byHostnameAndDevice.get(key)
      // Keep first occurrence (or update if this one has better data)
      if (!existing) {
        byHostnameAndDevice.set(key, { ...alert, nodeName: hostname, cluster: mappedCluster })
      }
    })
    return Array.from(byHostnameAndDevice.values())
  })()

  // Deduplicate inventory by canonical hostname
  // Uses clusterNameMap to map raw cluster names to deduplicated primary names (same as ClusterDetailModal)
  const deduplicatedInventory = (() => {
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
  })()

  // Node count should use deduplicated inventory count for consistency
  const deduplicatedNodeCount = deduplicatedInventory.length || nodeCount

  // Available clusters for filtering (from deduplicated data)
  const availableClustersForFilter = (() => {
    const clusterSet = new Set<string>()
    deduplicatedAlerts.forEach(alert => clusterSet.add(alert.cluster))
    deduplicatedInventory.forEach(node => clusterSet.add(node.cluster))
    return Array.from(clusterSet).sort()
  })()

  // Filter alerts (using deduplicated data)
  const filteredAlerts = (() => {
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
  })()

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
          cmp = (severityOrder[a.severity] ?? 999) - (severityOrder[b.severity] ?? 999)
          break
      }
      return sortDirection === 'asc' ? cmp : -cmp
    })
  }, [filteredAlerts, sortField, sortDirection])

  // Pagination
  const effectivePerPage = itemsPerPage === 'unlimited' ? sortedAlerts.length : itemsPerPage
  const totalPages = Math.ceil(sortedAlerts.length / effectivePerPage) || 1
  const needsPagination = itemsPerPage !== 'unlimited' && sortedAlerts.length > effectivePerPage

  const paginatedAlerts = (() => {
    if (itemsPerPage === 'unlimited') return sortedAlerts
    const start = (currentPage - 1) * effectivePerPage
    return sortedAlerts.slice(start, start + effectivePerPage)
  })()

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
      const response = await fetch(`${LOCAL_AGENT_HTTP_URL}/devices/alerts/clear`, {
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
  const filteredInventory = (() => {
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
  })()

  // Get total devices for a node (defined before sortedInventory which uses it)
  const getTotalDevices = (devices: DeviceCounts): number => {
    return devices.gpuCount + devices.nicCount + devices.nvmeCount + devices.infinibandCount
  }

  // Sort inventory
  /** Weight multiplier so GPU-heavy nodes sort above nodes with only other device types */
  const GPU_SORT_WEIGHT = 100
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

  const paginatedInventory = (() => {
    if (itemsPerPage === 'unlimited') return sortedInventory
    const start = (currentPage - 1) * effectivePerPage
    return sortedInventory.slice(start, start + effectivePerPage)
  })()

  // Count active (non-snoozed) alerts by severity
  const criticalCount = deduplicatedAlerts.filter(a => a.severity === 'critical' && !isSnoozed(a.id)).length
  const warningCount = deduplicatedAlerts.filter(a => a.severity === 'warning' && !isSnoozed(a.id)).length
  const snoozedAlertCount = deduplicatedAlerts.filter(a => isSnoozed(a.id)).length

  // Current view data
  const currentTotalPages = viewMode === 'alerts' ? totalPages : inventoryTotalPages
  const currentNeedsPagination = viewMode === 'alerts' ? needsPagination : inventoryNeedsPagination
  const currentTotalItems = viewMode === 'alerts' ? sortedAlerts.length : sortedInventory.length

  // Ensure current page is valid for current view (#5762).
  // Only depend on currentTotalPages — including currentPage risks infinite loop.
  useEffect(() => {
    if (currentTotalPages > 0 && currentPage > currentTotalPages) {
      setCurrentPage(currentTotalPages)
    }
  }, [currentTotalPages]) // eslint-disable-line react-hooks/exhaustive-deps

  /** Auto-dismiss delay for alert clear error messages */
  const CLEAR_ERROR_DISMISS_MS = 5000
  useEffect(() => {
    if (!clearAlertError) return
    const timer = setTimeout(() => setClearAlertError(null), CLEAR_ERROR_DISMISS_MS)
    return () => clearTimeout(timer)
  }, [clearAlertError])

  return (
    <div className="h-full flex flex-col">
      {/* Clear alert error feedback */}
      {clearAlertError && (
        <div className="mb-2 p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
          <XCircle className="w-4 h-4 shrink-0" />
          <span>{clearAlertError}</span>
        </div>
      )}
      {/* Status Summary */}
      {/* #9881 — Normalize tile backgrounds to the design-system pattern (bg-*-500/10 + border-*-500/20). */}
      <div className="grid grid-cols-2 @md:grid-cols-3 gap-1.5 @md:gap-2 mb-4">
        <div className={cn(
          'p-2 rounded-lg border',
          criticalCount > 0
            ? 'bg-red-500/10 border-red-500/20'
            : 'bg-green-500/10 border-green-500/20'
        )}>
          <div className="text-xl font-bold text-foreground">{criticalCount}</div>
          <div className={cn('text-2xs', criticalCount > 0 ? 'text-red-400' : 'text-green-400')}>
            Critical
          </div>
        </div>
        <div className={cn(
          'p-2 rounded-lg border',
          warningCount > 0
            ? 'bg-yellow-500/10 border-yellow-500/20'
            : 'bg-green-500/10 border-green-500/20'
        )}>
          <div className="text-xl font-bold text-foreground">{warningCount}</div>
          <div className={cn('text-2xs', warningCount > 0 ? 'text-yellow-400' : 'text-green-400')}>
            Warning
          </div>
        </div>
        <button
          onClick={() => { userSelectedView.current = true; setViewMode('inventory') }}
          className="p-2 rounded-lg border bg-muted/20 border-muted/30 hover:bg-muted/40 transition-colors cursor-pointer text-left"
        >
          <div className="text-xl font-bold text-foreground">{deduplicatedNodeCount}</div>
          <div className="text-2xs text-muted-foreground">
            Nodes Tracked
          </div>
        </button>
      </div>

      {/* View Mode Toggle — Inventory first (default), Alerts second */}
      <div className="flex flex-wrap gap-2 mb-3">
        <div className="flex flex-1 min-w-0 bg-muted/30 rounded-lg p-0.5">
          <button
            onClick={() => { userSelectedView.current = true; setViewMode('inventory') }}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
              viewMode === 'inventory'
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <List className="w-3.5 h-3.5" />
            Inventory
            {deduplicatedInventory.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 text-2xs font-semibold rounded-full bg-muted text-muted-foreground">
                {deduplicatedInventory.length}
              </span>
            )}
          </button>
          <button
            onClick={() => { userSelectedView.current = true; setViewMode('alerts') }}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
              viewMode === 'alerts'
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <AlertCircle className="w-3.5 h-3.5" />
            Alerts
            {activeAlertCount > 0 && (
              <span className={cn(
                'ml-1 px-1.5 py-0.5 text-2xs font-semibold rounded-full',
                criticalCount > 0
                  ? 'bg-red-500/20 text-red-400'
                  : 'bg-yellow-500/20 text-yellow-400'
              )}>
                {activeAlertCount}
              </span>
            )}
          </button>
        </div>

        {/* Snooze controls - only show in alerts view */}
        {viewMode === 'alerts' && (
          <div className="flex items-center gap-1">
            {/* Show snoozed toggle */}
            {snoozedAlertCount > 0 && (
              <button
                onClick={() => setShowSnoozed(!showSnoozed)}
                className={cn(
                  'flex items-center gap-1 px-2 py-1.5 text-xs rounded-md transition-colors',
                  showSnoozed
                    ? 'bg-yellow-500/20 text-yellow-400'
                    : 'bg-muted/30 text-muted-foreground hover:text-foreground'
                )}
                title={showSnoozed ? t('cards:hardwareHealth.hideSnoozedAlerts') : t('cards:hardwareHealth.showSnoozedAlerts')}
                aria-label={showSnoozed ? t('cards:hardwareHealth.hideSnoozedAlerts') : t('cards:hardwareHealth.showSnoozedAlerts')}
                aria-pressed={showSnoozed}
              >
                <BellOff className="w-3.5 h-3.5" />
                <span className="font-medium">{snoozedAlertCount}</span>
              </button>
            )}

            {/* Snooze All dropdown */}
            {visibleAlertIds.length > 0 && (
              <div className="relative" ref={snoozeAllMenuRef}>
                <button
                  onClick={() => setSnoozeAllMenuOpen(!snoozeAllMenuOpen)}
                  className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-md transition-colors"
                  title={t('cards:hardwareHealth.snoozeAllVisible')}
                  aria-label={t('cards:hardwareHealth.snoozeAllVisible')}
                  aria-haspopup="menu"
                  aria-expanded={snoozeAllMenuOpen}
                >
                  <MoreVertical className="w-4 h-4" />
                </button>
                {snoozeAllMenuOpen && (
                  <div className="absolute right-0 top-full mt-1 z-50 bg-popover border border-border rounded-lg shadow-lg py-1 min-w-[160px]">
                    <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground border-b border-border mb-1">
                      Snooze All ({visibleAlertIds.length})
                    </div>
                    {(Object.keys(SNOOZE_DURATIONS) as SnoozeDuration[]).map(duration => (
                      <button
                        key={duration}
                        onClick={() => {
                          snoozeMultiple(visibleAlertIds, duration)
                          setSnoozeAllMenuOpen(false)
                        }}
                        className="w-full px-3 py-1.5 text-xs text-left hover:bg-muted/50 transition-colors flex items-center gap-2"
                      >
                        <Clock className="w-3 h-3 text-muted-foreground" />
                        {duration}
                      </button>
                    ))}
                    {snoozedAlertCount > 0 && (
                      <>
                        <div className="border-t border-border my-1" />
                        <button
                          onClick={() => {
                            clearAllSnoozed()
                            setSnoozeAllMenuOpen(false)
                          }}
                          className="w-full px-3 py-1.5 text-xs text-left text-yellow-400 hover:bg-muted/50 transition-colors"
                        >
                          Clear all snoozes
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Card Controls */}
      <CardControlsRow
        clusterFilter={{
          availableClusters: availableClustersForFilter.map(c => ({ name: c })),
          selectedClusters: localClusterFilter,
          onToggle: toggleClusterFilter,
          onClear: clearClusterFilter,
          isOpen: showClusterFilter,
          setIsOpen: setShowClusterFilter,
          containerRef: clusterFilterRef,
          minClusters: 1 }}
        clusterIndicator={localClusterFilter.length > 0 ? {
          selectedCount: localClusterFilter.length,
          totalCount: availableClustersForFilter.length } : undefined}
        cardControls={{
          limit: itemsPerPage,
          onLimitChange: setItemsPerPage,
          sortBy: sortField,
          sortOptions: currentSortOptions,
          onSortChange: (s) => setSortField(s as SortField),
          sortDirection,
          onSortDirectionChange: setSortDirection }}
      />

      <CardSearchInput
        value={search}
        onChange={setSearch}
        placeholder="Search devices..."
        className="mb-3"
      />

      {/* Error display with retry */}
      {fetchError && (
        <div className="mb-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-y-2 gap-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{fetchError}</span>
            </div>
            <button
              onClick={() => refetch()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-red-500/20 hover:bg-red-500/30 transition-colors whitespace-nowrap"
            >
              <RefreshCw className="w-3 h-3" />
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Content based on view mode */}
      <div className="flex-1 space-y-1.5 overflow-y-auto mb-2">
        {viewMode === 'alerts' ? (
          <>
            {/* Alerts List */}
            {paginatedAlerts.map((alert) => (
              <div
                key={alert.id}
                className={cn(
                  'p-2 rounded text-xs transition-colors group',
                  alert.severity === 'critical'
                    ? 'bg-red-500/10 hover:bg-red-500/20'
                    : 'bg-yellow-500/10 hover:bg-yellow-500/20'
                )}
              >
                <div className="flex items-start justify-between gap-1">
                  <div
                    className="min-w-0 flex items-start gap-2 flex-1 cursor-pointer focus:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-400 rounded"
                    role="button"
                    tabIndex={0}
                    onClick={() => drillToNode(alert.cluster, alert.nodeName, {
                      issue: `${getDeviceLabel(alert.deviceType)} disappeared: ${alert.previousCount} → ${alert.currentCount}`
                    })}
                    onKeyDown={(e) => {
                      // Issue #8837: keyboard activation for alert drill-down
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault()
                        drillToNode(alert.cluster, alert.nodeName, {
                          issue: `${getDeviceLabel(alert.deviceType)} disappeared: ${alert.previousCount} → ${alert.currentCount}`
                        })
                      }
                    }}
                  >
                    <DeviceIcon
                      deviceType={alert.deviceType}
                      className={cn(
                        'w-4 h-4 shrink-0 mt-0.5',
                        alert.severity === 'critical' ? 'text-red-400' : 'text-yellow-400'
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-medium text-foreground break-all">{extractHostname(alert.nodeName)}</span>
                        <span className={cn(
                          'shrink-0 px-1 py-0.5 text-[9px] font-medium rounded',
                          alert.severity === 'critical'
                            ? 'bg-red-500/20 text-red-400'
                            : 'bg-yellow-500/20 text-yellow-400'
                        )}>
                          {getDeviceLabel(alert.deviceType)}
                        </span>
                        <ClusterBadge cluster={alert.cluster} size="sm" />
                      </div>
                      <div className={cn(
                        'truncate mt-0.5',
                        alert.severity === 'critical' ? 'text-red-400' : 'text-yellow-400'
                      )}>
                        {alert.previousCount} → {alert.currentCount} ({alert.droppedCount} disappeared)
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0 ml-2">
                    <CardAIActions
                      resource={{ kind: 'HardwareDevice', name: alert.nodeName, cluster: alert.cluster, status: alert.severity }}
                      issues={[{ name: `${getDeviceLabel(alert.deviceType)} disappeared`, message: `${alert.previousCount} → ${alert.currentCount} (${alert.droppedCount} disappeared)` }]}
                    />
                    {/* Snooze indicator or snooze button */}
                    {isSnoozed(alert.id) ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          unsnoozeAlert(alert.id)
                        }}
                        className="flex items-center gap-1 px-1.5 py-0.5 rounded text-yellow-400 bg-yellow-500/20 hover:bg-yellow-500/30 transition-colors"
                        title="Click to unsnooze"
                      >
                        <BellOff className="w-3 h-3" />
                        <span className="text-2xs font-medium">
                          {formatSnoozeRemaining(getSnoozeRemaining(alert.id) || 0)}
                        </span>
                      </button>
                    ) : (
                      <div className="relative" ref={snoozeMenuOpen === alert.id ? snoozeMenuRef : undefined}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setSnoozeMenuOpen(snoozeMenuOpen === alert.id ? null : alert.id)
                          }}
                          className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                          title="Snooze alert"
                        >
                          <BellOff className="w-3 h-3" />
                        </button>
                        {snoozeMenuOpen === alert.id && (
                          <div className="absolute right-0 top-full mt-1 z-50 bg-popover border border-border rounded-lg shadow-lg py-1 min-w-[100px]">
                            {(Object.keys(SNOOZE_DURATIONS) as SnoozeDuration[]).map(duration => (
                              <button
                                key={duration}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  snoozeAlert(alert.id, duration)
                                  setSnoozeMenuOpen(null)
                                }}
                                className="w-full px-3 py-1.5 text-xs text-left hover:bg-muted/50 transition-colors"
                              >
                                {duration}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        clearAlert(alert.id)
                      }}
                      className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                      title="Clear alert (after power cycle)"
                    >
                      <XCircle className="w-3 h-3" />
                    </button>
                    <ChevronRight
                      className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100"
                    />
                  </div>
                </div>
              </div>
            ))}

            {/* Alerts Empty state */}
            {sortedAlerts.length === 0 && (
              <div className="flex items-center justify-center h-full text-sm text-muted-foreground py-8">
                <CheckCircle className="w-4 h-4 mr-2 text-green-400" />
                {search || localClusterFilter.length > 0
                  ? 'No matching alerts'
                  : 'All hardware devices healthy'}
              </div>
            )}
          </>
        ) : (
          <>
            {/* Inventory List */}
            {paginatedInventory.map((node) => (
              <div
                key={`${node.cluster}/${node.nodeName}`}
                className="p-2 rounded text-xs transition-colors group bg-muted/20 hover:bg-muted/40 cursor-pointer focus:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-400"
                role="button"
                tabIndex={0}
                onClick={() => drillToNode(node.cluster, node.nodeName)}
                onKeyDown={(e) => {
                  // Issue #8837: keyboard activation for inventory node drill-down
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    drillToNode(node.cluster, node.nodeName)
                  }
                }}
              >
                <div className="flex items-start justify-between gap-1">
                  <div className="min-w-0 flex items-start gap-2 flex-1">
                    <Server className="w-4 h-4 shrink-0 text-blue-400 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-medium text-foreground break-all">{extractHostname(node.nodeName)}</span>
                        <ClusterBadge cluster={node.cluster} size="sm" />
                      </div>
                      {/* Device counts row */}
                      <div className="flex flex-wrap gap-2 mt-1">
                        {node.devices.gpuCount > 0 && (
                          <span className="flex items-center gap-1 text-2xs text-muted-foreground">
                            <Cpu className="w-3 h-3 text-green-400" />
                            {node.devices.gpuCount} GPU
                          </span>
                        )}
                        {node.devices.nicCount > 0 && (
                          <span className="flex items-center gap-1 text-2xs text-muted-foreground">
                            <Wifi className="w-3 h-3 text-blue-400" />
                            {node.devices.nicCount} NIC
                          </span>
                        )}
                        {node.devices.nvmeCount > 0 && (
                          <span className="flex items-center gap-1 text-2xs text-muted-foreground">
                            <HardDrive className="w-3 h-3 text-purple-400" />
                            {node.devices.nvmeCount} NVMe
                          </span>
                        )}
                        {node.devices.infinibandCount > 0 && (
                          <span className="flex items-center gap-1 text-2xs text-muted-foreground">
                            <Wifi className="w-3 h-3 text-orange-400" />
                            {node.devices.infinibandCount} IB
                          </span>
                        )}
                        {/* Status indicators */}
                        {node.devices.sriovCapable && (
                          <StatusBadge color="blue" size="xs">SR-IOV</StatusBadge>
                        )}
                        {node.devices.rdmaAvailable && (
                          <StatusBadge color="purple" size="xs">RDMA</StatusBadge>
                        )}
                        {node.devices.mellanoxPresent && (
                          <StatusBadge color="orange" size="xs">Mellanox</StatusBadge>
                        )}
                        {node.devices.mofedReady && (
                          <StatusBadge color="green" size="xs">MOFED</StatusBadge>
                        )}
                        {node.devices.gpuDriverReady && (
                          <StatusBadge color="green" size="xs">GPU Driver</StatusBadge>
                        )}
                        {getTotalDevices(node.devices) === 0 && (
                          <span className="text-2xs text-muted-foreground italic">{t('hardwareHealth.noDevicesDetected')}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0" />
                </div>
              </div>
            ))}

            {/* Inventory Empty state */}
            {sortedInventory.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-sm text-muted-foreground py-8">
                <Server className="w-6 h-6 mb-2 text-muted-foreground/50" />
                {search || localClusterFilter.length > 0
                  ? 'No matching nodes'
                  : 'No nodes tracked yet'}
                <span className="text-xs mt-1">Waiting for device scan...</span>
              </div>
            )}
          </>
        )}
      </div>

      {/* Pagination */}
      <CardPaginationFooter
        currentPage={currentPage}
        totalPages={currentTotalPages}
        totalItems={currentTotalItems}
        itemsPerPage={effectivePerPage}
        onPageChange={setCurrentPage}
        needsPagination={currentNeedsPagination}
      />

      {/* part 4: replaced bespoke "Updated HH:MM:SS" footer with the
          standard RefreshIndicator so it matches the rest of the card
          deck and shows a stale-data warning past 5 minutes.
          part 4 followup: hide the timestamp in demo mode — the cache
          can preserve `lastUpdate` from a prior live session, which
          would show a misleading "Updated 3h ago" against demo data. */}
      <div className="mt-2 flex items-center justify-center">
        <RefreshIndicator
          isRefreshing={isRefreshing}
          lastUpdated={isDemoFallback ? null : lastUpdate}
          size="sm"
          showLabel={true}
          staleThresholdMinutes={5}
        />
      </div>
    </div>
  )
}
