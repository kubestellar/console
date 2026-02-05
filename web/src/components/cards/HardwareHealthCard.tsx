import { useState, useEffect, useMemo, useRef } from 'react'
import { AlertTriangle, CheckCircle, Cpu, HardDrive, Wifi, Server, RefreshCw, XCircle, ChevronRight, List, AlertCircle } from 'lucide-react'
import { cn } from '../../lib/cn'
import { useCardLoadingState } from './CardDataContext'
import { CardControlsRow, CardSearchInput, CardPaginationFooter } from '../../lib/cards/CardComponents'
import { ClusterBadge } from '../ui/ClusterBadge'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { isAgentUnavailable } from '../../hooks/useLocalAgent'
import { getDemoMode } from '../../hooks/useDemoMode'

const AGENT_HTTP_URL = 'http://127.0.0.1:8585'

// Device alert from backend
interface DeviceAlert {
  id: string
  nodeName: string
  cluster: string
  deviceType: string // "gpu", "nic", "nvme", "infiniband", "mofed-driver", "gpu-driver", etc.
  previousCount: number
  currentCount: number
  droppedCount: number
  firstSeen: string
  lastSeen: string
  severity: string // "warning", "critical"
}

interface DeviceAlertsResponse {
  alerts: DeviceAlert[]
  nodeCount: number
  timestamp: string
}

// Device counts for inventory
interface DeviceCounts {
  gpuCount: number
  nicCount: number
  nvmeCount: number
  infinibandCount: number
  sriovCapable: boolean
  rdmaAvailable: boolean
  mellanoxPresent: boolean
  nvidiaNicPresent: boolean
  spectrumScale: boolean
  mofedReady: boolean
  gpuDriverReady: boolean
}

interface NodeDeviceInventory {
  nodeName: string
  cluster: string
  devices: DeviceCounts
  lastSeen: string
}

interface DeviceInventoryResponse {
  nodes: NodeDeviceInventory[]
  timestamp: string
}

// Sort field options
type SortField = 'severity' | 'nodeName' | 'cluster' | 'deviceType'

const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: 'severity', label: 'Severity' },
  { value: 'nodeName', label: 'Node' },
  { value: 'cluster', label: 'Cluster' },
  { value: 'deviceType', label: 'Device' },
]

// Demo data for when agent is not available
const DEMO_ALERTS: DeviceAlert[] = [
  {
    id: 'demo-1',
    nodeName: 'gpu-node-1',
    cluster: 'production',
    deviceType: 'gpu',
    previousCount: 8,
    currentCount: 6,
    droppedCount: 2,
    firstSeen: new Date().toISOString(),
    lastSeen: new Date().toISOString(),
    severity: 'critical',
  },
  {
    id: 'demo-2',
    nodeName: 'gpu-node-2',
    cluster: 'production',
    deviceType: 'infiniband',
    previousCount: 2,
    currentCount: 1,
    droppedCount: 1,
    firstSeen: new Date().toISOString(),
    lastSeen: new Date().toISOString(),
    severity: 'warning',
  },
]

// Demo inventory data
const DEMO_INVENTORY: NodeDeviceInventory[] = [
  {
    nodeName: 'gpu-node-1',
    cluster: 'production',
    devices: { gpuCount: 8, nicCount: 2, nvmeCount: 4, infinibandCount: 2, sriovCapable: true, rdmaAvailable: true, mellanoxPresent: true, nvidiaNicPresent: false, spectrumScale: false, mofedReady: true, gpuDriverReady: true },
    lastSeen: new Date().toISOString(),
  },
  {
    nodeName: 'gpu-node-2',
    cluster: 'production',
    devices: { gpuCount: 8, nicCount: 2, nvmeCount: 4, infinibandCount: 2, sriovCapable: true, rdmaAvailable: true, mellanoxPresent: true, nvidiaNicPresent: false, spectrumScale: false, mofedReady: true, gpuDriverReady: true },
    lastSeen: new Date().toISOString(),
  },
  {
    nodeName: 'compute-node-1',
    cluster: 'staging',
    devices: { gpuCount: 0, nicCount: 1, nvmeCount: 2, infinibandCount: 0, sriovCapable: false, rdmaAvailable: false, mellanoxPresent: false, nvidiaNicPresent: false, spectrumScale: false, mofedReady: false, gpuDriverReady: false },
    lastSeen: new Date().toISOString(),
  },
]

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
    'spectrum-scale': 'Spectrum Scale',
  }
  return labels[deviceType] || deviceType.toUpperCase()
}

type ViewMode = 'alerts' | 'inventory'

export function HardwareHealthCard() {
  const [alerts, setAlerts] = useState<DeviceAlert[]>([])
  const [inventory, setInventory] = useState<NodeDeviceInventory[]>([])
  const [nodeCount, setNodeCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('alerts')
  const { drillToNode } = useDrillDownActions()

  // Card controls state
  const [search, setSearch] = useState('')
  const [localClusterFilter, setLocalClusterFilter] = useState<string[]>([])
  const [showClusterFilter, setShowClusterFilter] = useState(false)
  const [sortField, setSortField] = useState<SortField>('severity')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState<number | 'unlimited'>(5)

  const clusterFilterRef = useRef<HTMLDivElement>(null)

  // Report loading state to CardWrapper (note: using raw data here since dedup happens later)
  useCardLoadingState({
    isLoading,
    hasAnyData: alerts.length > 0 || inventory.length > 0 || nodeCount > 0,
  })

  // Node count should use deduplicated inventory
  const deduplicatedNodeCount = useMemo(() => {
    const uniqueNodes = new Set<string>()
    inventory.forEach(node => uniqueNodes.add(node.nodeName))
    return uniqueNodes.size || nodeCount
  }, [inventory, nodeCount])

  // Fetch device alerts and inventory
  useEffect(() => {
    if (getDemoMode()) {
      setAlerts(DEMO_ALERTS)
      setInventory(DEMO_INVENTORY)
      setNodeCount(DEMO_INVENTORY.length)
      setIsLoading(false)
      setLastUpdate(new Date())
      return
    }

    if (isAgentUnavailable()) {
      setIsLoading(false)
      return
    }

    const fetchData = async () => {
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 5000)

        // Fetch both alerts and inventory in parallel
        const [alertsRes, inventoryRes] = await Promise.all([
          fetch(`${AGENT_HTTP_URL}/devices/alerts`, {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            signal: controller.signal,
          }),
          fetch(`${AGENT_HTTP_URL}/devices/inventory`, {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            signal: controller.signal,
          }),
        ])
        clearTimeout(timeoutId)

        if (alertsRes.ok) {
          const data: DeviceAlertsResponse = await alertsRes.json()
          setAlerts(data.alerts || [])
          setNodeCount(data.nodeCount)
          setLastUpdate(new Date(data.timestamp))
        }

        if (inventoryRes.ok) {
          const data: DeviceInventoryResponse = await inventoryRes.json()
          setInventory(data.nodes || [])
          // Update nodeCount from inventory if alerts returned 0
          if (data.nodes && data.nodes.length > 0) {
            setNodeCount(data.nodes.length)
          }
        }
      } catch {
        // Silently fail - agent might not be running
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
    const interval = setInterval(fetchData, 30000) // Poll every 30 seconds
    return () => clearInterval(interval)
  }, [])

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
  // Prefer shorter cluster names AND shorter node names
  const deduplicatedAlerts = useMemo(() => {
    const byHostnameAndDevice = new Map<string, DeviceAlert>()
    alerts.forEach(alert => {
      const hostname = extractHostname(alert.nodeName)
      const key = `${hostname}-${alert.deviceType}`
      const existing = byHostnameAndDevice.get(key)
      // Prefer entries with shorter cluster name, then shorter node name
      if (!existing ||
          alert.cluster.length < existing.cluster.length ||
          (alert.cluster.length === existing.cluster.length && alert.nodeName.length < existing.nodeName.length)) {
        byHostnameAndDevice.set(key, alert)
      }
    })
    return Array.from(byHostnameAndDevice.values())
  }, [alerts])

  // Deduplicate inventory by canonical hostname
  const deduplicatedInventory = useMemo(() => {
    const byHostname = new Map<string, NodeDeviceInventory>()
    inventory.forEach(node => {
      const hostname = extractHostname(node.nodeName)
      const existing = byHostname.get(hostname)
      // Prefer entries with shorter cluster name, then shorter node name
      if (!existing ||
          node.cluster.length < existing.cluster.length ||
          (node.cluster.length === existing.cluster.length && node.nodeName.length < existing.nodeName.length)) {
        byHostname.set(hostname, node)
      }
    })
    return Array.from(byHostname.values())
  }, [inventory])

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

    // Apply search
    if (search.trim()) {
      const query = search.toLowerCase()
      result = result.filter(alert =>
        alert.nodeName.toLowerCase().includes(query) ||
        alert.cluster.toLowerCase().includes(query) ||
        alert.deviceType.toLowerCase().includes(query)
      )
    }

    // Apply local cluster filter
    if (localClusterFilter.length > 0) {
      result = result.filter(alert => localClusterFilter.includes(alert.cluster))
    }

    return result
  }, [deduplicatedAlerts, search, localClusterFilter])

  // Sort alerts
  const sortedAlerts = useMemo(() => {
    const severityOrder: Record<string, number> = { critical: 0, warning: 1 }

    return [...filteredAlerts].sort((a, b) => {
      let cmp = 0
      switch (sortField) {
        case 'nodeName':
          cmp = a.nodeName.localeCompare(b.nodeName)
          break
        case 'cluster':
          cmp = a.cluster.localeCompare(b.cluster)
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

  const paginatedAlerts = useMemo(() => {
    if (itemsPerPage === 'unlimited') return sortedAlerts
    const start = (currentPage - 1) * effectivePerPage
    return sortedAlerts.slice(start, start + effectivePerPage)
  }, [sortedAlerts, currentPage, effectivePerPage, itemsPerPage])

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [search, localClusterFilter, sortField])

  // Ensure current page is valid
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(Math.max(1, totalPages))
    }
  }, [currentPage, totalPages])

  const toggleClusterFilter = (cluster: string) => {
    setLocalClusterFilter(prev =>
      prev.includes(cluster) ? prev.filter(c => c !== cluster) : [...prev, cluster]
    )
  }

  const clearClusterFilter = () => {
    setLocalClusterFilter([])
  }

  // Clear an alert (after power cycle)
  const clearAlert = async (alertId: string) => {
    try {
      await fetch(`${AGENT_HTTP_URL}/devices/alerts/clear`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alertId }),
      })
      setAlerts(prev => prev.filter(a => a.id !== alertId))
    } catch {
      // Silently fail
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
        node.cluster.toLowerCase().includes(query)
      )
    }

    // Apply local cluster filter
    if (localClusterFilter.length > 0) {
      result = result.filter(node => localClusterFilter.includes(node.cluster))
    }

    return result
  }, [deduplicatedInventory, search, localClusterFilter])

  // Get total devices for a node (defined before sortedInventory which uses it)
  const getTotalDevices = (devices: DeviceCounts): number => {
    return devices.gpuCount + devices.nicCount + devices.nvmeCount + devices.infinibandCount
  }

  // Sort inventory
  const sortedInventory = useMemo(() => {
    return [...filteredInventory].sort((a, b) => {
      let cmp = 0
      switch (sortField) {
        case 'nodeName':
          cmp = a.nodeName.localeCompare(b.nodeName)
          break
        case 'cluster':
          cmp = a.cluster.localeCompare(b.cluster)
          break
        case 'deviceType':
        case 'severity':
        default: {
          // Sort by total device count for inventory (GPUs prioritized, then other devices)
          const aTotal = getTotalDevices(a.devices) + (a.devices.gpuCount * 100) // Weight GPUs higher
          const bTotal = getTotalDevices(b.devices) + (b.devices.gpuCount * 100)
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
  }, [sortedInventory, currentPage, effectivePerPage, itemsPerPage])

  const criticalCount = deduplicatedAlerts.filter(a => a.severity === 'critical').length
  const warningCount = deduplicatedAlerts.filter(a => a.severity === 'warning').length

  // Current view data
  const currentTotalPages = viewMode === 'alerts' ? totalPages : inventoryTotalPages
  const currentNeedsPagination = viewMode === 'alerts' ? needsPagination : inventoryNeedsPagination
  const currentTotalItems = viewMode === 'alerts' ? sortedAlerts.length : sortedInventory.length

  return (
    <div className="h-full flex flex-col">
      {/* Status Summary */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className={cn(
          'p-2 rounded-lg border',
          criticalCount > 0
            ? 'bg-red-500/10 border-red-500/20'
            : 'bg-green-500/10 border-green-500/20'
        )}>
          <div className="text-xl font-bold text-foreground">{criticalCount}</div>
          <div className={cn('text-[10px]', criticalCount > 0 ? 'text-red-400' : 'text-green-400')}>
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
          <div className={cn('text-[10px]', warningCount > 0 ? 'text-yellow-400' : 'text-green-400')}>
            Warning
          </div>
        </div>
        <div className="p-2 rounded-lg border bg-muted/20 border-muted/30">
          <div className="text-xl font-bold text-foreground">{deduplicatedNodeCount}</div>
          <div className="text-[10px] text-muted-foreground">
            Nodes Tracked
          </div>
        </div>
      </div>

      {/* View Mode Toggle */}
      <div className="flex mb-3 bg-muted/30 rounded-lg p-0.5">
        <button
          onClick={() => setViewMode('alerts')}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
            viewMode === 'alerts'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <AlertCircle className="w-3.5 h-3.5" />
          Alerts
          {deduplicatedAlerts.length > 0 && (
            <span className={cn(
              'ml-1 px-1.5 py-0.5 text-[10px] font-semibold rounded-full',
              deduplicatedAlerts.some(a => a.severity === 'critical')
                ? 'bg-red-500/20 text-red-400'
                : 'bg-yellow-500/20 text-yellow-400'
            )}>
              {deduplicatedAlerts.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setViewMode('inventory')}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
            viewMode === 'inventory'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <List className="w-3.5 h-3.5" />
          Inventory
          {deduplicatedInventory.length > 0 && (
            <span className="ml-1 px-1.5 py-0.5 text-[10px] font-semibold rounded-full bg-muted text-muted-foreground">
              {deduplicatedInventory.length}
            </span>
          )}
        </button>
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
          minClusters: 1,
        }}
        clusterIndicator={localClusterFilter.length > 0 ? {
          selectedCount: localClusterFilter.length,
          totalCount: availableClustersForFilter.length,
        } : undefined}
        cardControls={{
          limit: itemsPerPage,
          onLimitChange: setItemsPerPage,
          sortBy: sortField,
          sortOptions: SORT_OPTIONS,
          onSortChange: (s) => setSortField(s as SortField),
          sortDirection,
          onSortDirectionChange: setSortDirection,
        }}
      />

      <CardSearchInput
        value={search}
        onChange={setSearch}
        placeholder="Search devices..."
        className="mb-3"
      />

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
                <div className="flex items-center justify-between">
                  <div
                    className="min-w-0 flex items-center gap-2 flex-1 cursor-pointer"
                    onClick={() => drillToNode(alert.cluster, alert.nodeName, {
                      issue: `${getDeviceLabel(alert.deviceType)} disappeared: ${alert.previousCount} → ${alert.currentCount}`
                    })}
                  >
                    <DeviceIcon
                      deviceType={alert.deviceType}
                      className={cn(
                        'w-4 h-4 flex-shrink-0',
                        alert.severity === 'critical' ? 'text-red-400' : 'text-yellow-400'
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-medium text-foreground truncate">{alert.nodeName}</span>
                        <span className={cn(
                          'flex-shrink-0 px-1 py-0.5 text-[9px] font-medium rounded',
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
                  <div className="flex items-center gap-1 flex-shrink-0 ml-2">
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
                className="p-2 rounded text-xs transition-colors group bg-muted/20 hover:bg-muted/40 cursor-pointer"
                onClick={() => drillToNode(node.cluster, node.nodeName)}
              >
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex items-center gap-2 flex-1">
                    <Server className="w-4 h-4 flex-shrink-0 text-blue-400" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-medium text-foreground truncate">{node.nodeName}</span>
                        <ClusterBadge cluster={node.cluster} size="sm" />
                      </div>
                      {/* Device counts row */}
                      <div className="flex flex-wrap gap-2 mt-1">
                        {node.devices.gpuCount > 0 && (
                          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                            <Cpu className="w-3 h-3 text-green-400" />
                            {node.devices.gpuCount} GPU
                          </span>
                        )}
                        {node.devices.nicCount > 0 && (
                          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                            <Wifi className="w-3 h-3 text-blue-400" />
                            {node.devices.nicCount} NIC
                          </span>
                        )}
                        {node.devices.nvmeCount > 0 && (
                          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                            <HardDrive className="w-3 h-3 text-purple-400" />
                            {node.devices.nvmeCount} NVMe
                          </span>
                        )}
                        {node.devices.infinibandCount > 0 && (
                          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                            <Wifi className="w-3 h-3 text-orange-400" />
                            {node.devices.infinibandCount} IB
                          </span>
                        )}
                        {/* Status indicators */}
                        {node.devices.sriovCapable && (
                          <span className="px-1 py-0.5 text-[9px] bg-blue-500/20 text-blue-400 rounded">SR-IOV</span>
                        )}
                        {node.devices.rdmaAvailable && (
                          <span className="px-1 py-0.5 text-[9px] bg-purple-500/20 text-purple-400 rounded">RDMA</span>
                        )}
                        {node.devices.mellanoxPresent && (
                          <span className="px-1 py-0.5 text-[9px] bg-orange-500/20 text-orange-400 rounded">Mellanox</span>
                        )}
                        {node.devices.mofedReady && (
                          <span className="px-1 py-0.5 text-[9px] bg-green-500/20 text-green-400 rounded">MOFED</span>
                        )}
                        {node.devices.gpuDriverReady && (
                          <span className="px-1 py-0.5 text-[9px] bg-green-500/20 text-green-400 rounded">GPU Driver</span>
                        )}
                        {getTotalDevices(node.devices) === 0 && (
                          <span className="text-[10px] text-muted-foreground italic">No devices detected</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 flex-shrink-0" />
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

      {/* Last update */}
      {lastUpdate && (
        <div className="text-[10px] text-muted-foreground text-center mt-2 flex items-center justify-center gap-1">
          <RefreshCw className="w-3 h-3" />
          Updated {lastUpdate.toLocaleTimeString()}
        </div>
      )}
    </div>
  )
}
