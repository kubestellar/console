import { useEffect, useRef, useState } from 'react'
import { useSearchParams, useLocation, useNavigate } from 'react-router-dom'
import { GitCompare, CheckSquare, Square, ChevronDown, ChevronRight, AlertCircle } from 'lucide-react'
import { Button } from '../ui/Button'
import { useClusters, useGPUNodes } from '../../hooks/useMCP'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { useUniversalStats, createMergedStatValueGetter } from '../../hooks/useUniversalStats'
import { StatBlockValue } from '../ui/StatsOverview'
import { DashboardPage } from '../../lib/dashboards/DashboardPage'
import { getDefaultCards } from '../../config/dashboards'
import { ensureCardInDashboard } from '../../lib/dashboards/migrateStorageKey'
import { RotatingTip } from '../ui/RotatingTip'
import { ROUTES } from '../../config/routes'
import { useTranslation } from 'react-i18next'

const COMPUTE_CARDS_KEY = 'kubestellar-compute-cards'

// Ensure new virtualization cards are present in existing saved layouts.
// IMPORTANT: Use `card_type` (snake_case) to match the DashboardCard interface.
// Previously this used `cardType` which caused card.card_type to be undefined,
// crashing formatCardTitle() with "cardType is undefined" when clicking the
// "nodes" stat block from the My Clusters dashboard (issue #5902).
ensureCardInDashboard(COMPUTE_CARDS_KEY, 'vcluster_status', {
  id: 'compute-6',
  card_type: 'vcluster_status',
  position: { w: 6, h: 3, x: 0, y: 6 } })
ensureCardInDashboard(COMPUTE_CARDS_KEY, 'kubevirt_status', {
  id: 'compute-7',
  card_type: 'kubevirt_status',
  position: { w: 6, h: 3, x: 6, y: 6 } })

// Default cards for the compute dashboard
const DEFAULT_COMPUTE_CARDS = getDefaultCards('compute')

export function Compute() {
  const { t } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const { deduplicatedClusters: clusters, isLoading, isRefreshing: dataRefreshing, lastUpdated, refetch, error: clustersError } = useClusters()
  const { nodes: gpuNodes } = useGPUNodes()
  // Only show cluster errors - GPU node errors are not useful (many clusters have no GPUs)
  const error = clustersError
  const {
    selectedClusters: globalSelectedClusters,
    isAllClustersSelected } = useGlobalFilters()
  const { drillToResources } = useDrillDownActions()
  const { getStatValue: getUniversalStatValue } = useUniversalStats()

  // State for cluster comparison selection
  const [selectedForComparison, setSelectedForComparison] = useState<string[]>([])
  const [showClusterList, setShowClusterList] = useState(false)

  // Handle addCard URL param - open modal and clear param.
  // Guard: KeepAlive keeps hidden dashboards mounted; only process on active route.
  useEffect(() => {
    if (location.pathname !== '/compute') return
    if (searchParams.get('addCard') === 'true') {
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, setSearchParams, location.pathname])

  // Trigger refresh only when navigating TO this page (not on every navigation event)
  useEffect(() => {
    if (location.pathname === '/compute') {
      refetch()
    }
  }, [location.key, location.pathname]) // eslint-disable-line react-hooks/exhaustive-deps

  // Filter clusters based on global selection
  const filteredClusters = clusters.filter(c =>
    isAllClustersSelected || globalSelectedClusters.includes(c.name)
  )

  // Calculate compute stats from clusters (only from reachable clusters)
  // Clusters with reachable !== false are considered (includes undefined during refresh)
  const reachableClusters = filteredClusters.filter(c => c.reachable !== false)
  const currentStats = {
    totalCPUs: reachableClusters.reduce((sum, c) => sum + (c.cpuCores || 0), 0),
    totalMemoryGB: reachableClusters.reduce((sum, c) => sum + (c.memoryGB || 0), 0),
    totalNodes: reachableClusters.reduce((sum, c) => sum + (c.nodeCount || 0), 0),
    totalPods: reachableClusters.reduce((sum, c) => sum + (c.podCount || 0), 0),
    totalGPUs: gpuNodes
      .filter(node => isAllClustersSelected || globalSelectedClusters.includes(node.cluster))
      .reduce((sum, node) => sum + node.gpuCount, 0) }

  // Check if we have any reachable clusters with actual data (not refreshing).
  // A cluster counts as "has data" as soon as nodeCount has been reported —
  // even if the reported value is 0. Previously, valid zero-node clusters were
  // treated as "no data" and rendered as '-' (issue #6106). Zero nodes is a
  // meaningful value (e.g. a newly-provisioned cluster before any worker is
  // attached), not a missing one.
  const hasActualData = filteredClusters.some(c =>
    c.reachable !== false && c.nodeCount !== undefined
  )

  // Cache the last known good stats to show during refresh
  const cachedStats = useRef(currentStats)

  // Update cache when we have real data — including valid zero-node states
  // after scale-down (#7347). The hasActualData guard already ensures nodeCount
  // has been reported, so a zero value is a real measurement, not a placeholder.
  useEffect(() => {
    if (hasActualData) {
      cachedStats.current = currentStats
    }
  }, [hasActualData, currentStats])

  // Use cached stats during refresh, current stats when data is available
  // Show dash only when we've never had data (initial state with no clusters)
  const stats = (hasActualData || cachedStats.current.totalNodes > 0)
    ? (hasActualData ? currentStats : cachedStats.current)
    : null

  // Determine if we should show data or dashes
  const hasDataToShow = stats !== null

  // Format memory size - returns '-' if no data
  const formatMemory = (gb: number, hasData = true) => {
    if (!hasData) return '-'
    const safeValue = Math.max(0, gb) // Never show negative
    if (safeValue >= 1024) {
      return `${(safeValue / 1024).toFixed(1)} TB`
    }
    return `${Math.round(safeValue)} GB`
  }

  // Format stat - returns '-' if no data available
  const formatStatValue = (value: number, hasData = true) => {
    if (!hasData) return '-'
    return Math.max(0, value) // Never show negative
  }

  // Calculate utilization from available data
  const cpuUtilization = (() => {
    const totalCPU = reachableClusters.reduce((sum, c) => sum + (c.cpuCores || 0), 0)
    const requestedCPU = reachableClusters.reduce((sum, c) => sum + (c.cpuRequestsCores || 0), 0)
    return totalCPU > 0 ? Math.round((requestedCPU / totalCPU) * 100) : 0
  })()

  const memoryUtilization = (() => {
    const totalMemory = reachableClusters.reduce((sum, c) => sum + (c.memoryGB || 0), 0)
    const requestedMemory = reachableClusters.reduce((sum, c) => sum + (c.memoryRequestsGB || 0), 0)
    return totalMemory > 0 ? Math.round((requestedMemory / totalMemory) * 100) : 0
  })()

  // Stats value getter for the configurable StatsOverview component
  const getDashboardStatValue = (blockId: string): StatBlockValue => {
    switch (blockId) {
      case 'nodes':
        return { value: formatStatValue(stats?.totalNodes || 0, hasDataToShow), sublabel: 'total nodes', onClick: drillToResources, isClickable: hasDataToShow }
      case 'cpus':
        return { value: formatStatValue(stats?.totalCPUs || 0, hasDataToShow), sublabel: 'cores allocatable', onClick: drillToResources, isClickable: hasDataToShow }
      case 'memory':
        return { value: formatMemory(stats?.totalMemoryGB || 0, hasDataToShow), sublabel: 'allocatable', onClick: drillToResources, isClickable: hasDataToShow }
      case 'gpus':
        return { value: formatStatValue(stats?.totalGPUs || 0, hasDataToShow), sublabel: 'total GPUs', onClick: drillToResources, isClickable: hasDataToShow }
      case 'tpus':
        return { value: 0, sublabel: 'total TPUs', onClick: drillToResources, isClickable: hasDataToShow }
      case 'pods':
        return { value: formatStatValue(stats?.totalPods || 0, hasDataToShow), sublabel: 'running pods', onClick: drillToResources, isClickable: hasDataToShow }
      case 'cpu_util':
        return { value: hasDataToShow ? `${cpuUtilization}%` : '-', sublabel: 'average', onClick: drillToResources, isClickable: hasDataToShow }
      case 'memory_util':
        return { value: hasDataToShow ? `${memoryUtilization}%` : '-', sublabel: 'average', onClick: drillToResources, isClickable: hasDataToShow }
      default:
        return { value: '-', sublabel: '' }
    }
  }

  const getStatValue = (blockId: string) => createMergedStatValueGetter(getDashboardStatValue, getUniversalStatValue)(blockId)

  // Cluster comparison handlers
  const toggleClusterSelection = (clusterName: string) => {
    setSelectedForComparison(prev => {
      if (prev.includes(clusterName)) {
        return prev.filter(name => name !== clusterName)
      }
      // Max 4 clusters
      if (prev.length >= 4) return prev
      return [...prev, clusterName]
    })
  }

  const handleCompare = () => {
    if (selectedForComparison.length >= 2) {
      navigate(`${ROUTES.COMPUTE_COMPARE}?clusters=${selectedForComparison.map(encodeURIComponent).join(',')}`)
    }
  }

  const clearSelection = () => {
    setSelectedForComparison([])
  }

  // Cluster comparison section (rendered between stats and cards)
  const clusterComparisonSection = (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => setShowClusterList(!showClusterList)}
          className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          aria-expanded={showClusterList}
          aria-controls="cluster-comparison-list"
        >
          <GitCompare className="w-4 h-4" />
          <span>Cluster Comparison</span>
          {showClusterList ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        {selectedForComparison.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {selectedForComparison.length} selected
            </span>
            <button
              onClick={clearSelection}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Clear
            </button>
            {selectedForComparison.length >= 2 && (
              <Button
                variant="accent"
                size="sm"
                onClick={handleCompare}
                icon={<GitCompare className="w-4 h-4" />}
              >
                Compare ({selectedForComparison.length})
              </Button>
            )}
          </div>
        )}
      </div>

      {showClusterList && (
        <div id="cluster-comparison-list" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {filteredClusters.map((cluster) => {
            const isSelected = selectedForComparison.includes(cluster.name)
            const isDisabled = !isSelected && selectedForComparison.length >= 4

            return (
              <button
                key={cluster.name}
                onClick={() => !isDisabled && toggleClusterSelection(cluster.name)}
                disabled={isDisabled}
                className={`glass p-4 rounded-lg text-left transition-all ${
                  isSelected
                    ? 'ring-2 ring-purple-500 bg-purple-500/10'
                    : isDisabled
                      ? 'opacity-50 cursor-not-allowed'
                      : 'hover:bg-secondary/50'
                }`}
                aria-label={`${isSelected ? 'Deselect' : 'Select'} ${cluster.context || cluster.name} for comparison`}
                aria-pressed={isSelected}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 mt-1">
                    {isSelected ? (
                      <CheckSquare className="w-5 h-5 text-purple-400" />
                    ) : (
                      <Square className="w-5 h-5 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${cluster.healthy ? 'bg-green-400' : 'bg-red-400'}`} />
                      <h4 className="font-medium text-foreground truncate" title={cluster.name}>
                        {cluster.context || cluster.name}
                      </h4>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <div className="text-muted-foreground">{t('common.nodes')}</div>
                        <div className="text-foreground font-medium">{cluster.nodeCount || 0}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">{t('common.cpus')}</div>
                        <div className="text-foreground font-medium">{cluster.cpuCores || 0}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">{t('common.pods')}</div>
                        <div className="text-foreground font-medium">{cluster.podCount || 0}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {showClusterList && filteredClusters.length === 0 && (
        <div className="glass p-8 rounded-lg text-center">
          <p className="text-muted-foreground">No clusters available</p>
        </div>
      )}
    </div>
  )

  return (
    <DashboardPage
      title="Compute"
      subtitle="Monitor compute resources across clusters"
      icon="Cpu"
      rightExtra={<RotatingTip page="compute" />}
      storageKey={COMPUTE_CARDS_KEY}
      defaultCards={DEFAULT_COMPUTE_CARDS}
      statsType="compute"
      getStatValue={getStatValue}
      onRefresh={refetch}
      isLoading={isLoading}
      isRefreshing={dataRefreshing}
      lastUpdated={lastUpdated}
      hasData={hasDataToShow}
      beforeCards={clusterComparisonSection}
      emptyState={{
        title: 'Compute Dashboard',
        description: 'Add cards to monitor CPU and memory utilization, node health, and resource quotas across your clusters.' }}
    >
      {/* Error Display */}
      {error && (
        <div className="mb-4 p-4 rounded-lg bg-red-500/10 border border-red-500/20 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-400">Error loading compute data</p>
            <p className="text-xs text-muted-foreground mt-1">{error}</p>
          </div>
        </div>
      )}
    </DashboardPage>
  )
}
