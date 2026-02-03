import { useMemo } from 'react'
import { createPortal } from 'react-dom'
import { HardDrive, Database, CheckCircle, AlertTriangle, Clock, Filter, ChevronDown, Server } from 'lucide-react'
import { useClusters, usePVCs } from '../../hooks/useMCP'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { useReportCardDataState } from './CardDataContext'
import { formatStat, formatStorageStat } from '../../lib/formatStats'
import { useChartFilters } from '../../lib/cards'

export function StorageOverview() {
  const { deduplicatedClusters: clusters, isLoading } = useClusters()
  const { pvcs, isLoading: pvcsLoading, isRefreshing, consecutiveFailures, isFailed } = usePVCs()

  const { selectedClusters, isAllClustersSelected } = useGlobalFilters()
  const { drillToPVC } = useDrillDownActions()

  // Report card data state
  // hasData should be true once loading completes (even with empty data)
  const combinedLoading = isLoading || pvcsLoading
  const hasData = !combinedLoading || pvcs.length > 0
  useReportCardDataState({
    isFailed,
    consecutiveFailures,
    isLoading: combinedLoading && pvcs.length === 0,
    isRefreshing: isRefreshing || (combinedLoading && pvcs.length > 0),
    hasData,
  })

  // Local cluster filter
  const {
    localClusterFilter,
    toggleClusterFilter,
    clearClusterFilter,
    availableClusters,
    showClusterFilter,
    setShowClusterFilter,
    clusterFilterRef,

    clusterFilterBtnRef,

    dropdownStyle,
  } = useChartFilters({
    storageKey: 'storage-overview',
  })

  // Filter clusters by global selection first
  const globalFilteredClusters = useMemo(() => {
    if (isAllClustersSelected) return clusters
    return clusters.filter(c => selectedClusters.includes(c.name))
  }, [clusters, selectedClusters, isAllClustersSelected])

  // Apply local cluster filter
  const filteredClusters = useMemo(() => {
    if (localClusterFilter.length === 0) return globalFilteredClusters
    return globalFilteredClusters.filter(c => localClusterFilter.includes(c.name))
  }, [globalFilteredClusters, localClusterFilter])

  // Filter PVCs by selection
  const filteredPVCs = useMemo(() => {
    let result = pvcs
    if (!isAllClustersSelected) {
      result = result.filter(p => p.cluster && selectedClusters.includes(p.cluster))
    }
    if (localClusterFilter.length > 0) {
      result = result.filter(p => p.cluster && localClusterFilter.includes(p.cluster))
    }
    return result
  }, [pvcs, selectedClusters, isAllClustersSelected, localClusterFilter])

  // Calculate storage stats
  const stats = useMemo(() => {
    const totalStorageGB = filteredClusters.reduce((sum, c) => sum + (c.storageGB || 0), 0)
    const totalPVCs = filteredPVCs.length
    const boundPVCs = filteredPVCs.filter(p => p.status === 'Bound').length
    const pendingPVCs = filteredPVCs.filter(p => p.status === 'Pending').length
    const failedPVCs = totalPVCs - boundPVCs - pendingPVCs

    // Group by storage class
    const storageClasses = new Map<string, number>()
    filteredPVCs.forEach(p => {
      const sc = p.storageClass || 'default'
      storageClasses.set(sc, (storageClasses.get(sc) || 0) + 1)
    })

    return {
      totalStorageGB,
      totalPVCs,
      boundPVCs,
      pendingPVCs,
      failedPVCs,
      storageClasses: Array.from(storageClasses.entries()).sort((a, b) => b[1] - a[1]),
      clustersWithStorage: filteredClusters.filter(c => (c.storageGB || 0) > 0).length,
    }
  }, [filteredClusters, filteredPVCs])

  // Check if we have real data from reachable clusters
  const hasRealData = !isLoading && filteredClusters.length > 0 &&
    filteredClusters.some(c => c.reachable !== false && c.storageGB !== undefined && c.nodeCount !== undefined && c.nodeCount > 0)

  if (isLoading && !clusters.length) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading storage data...</div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Controls */}
      <div className="flex items-center justify-between mb-4">
        <div />
        <div className="flex items-center gap-2">
          {/* Cluster count indicator */}
          {localClusterFilter.length > 0 && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground bg-secondary/50 px-1.5 py-0.5 rounded">
              <Server className="w-3 h-3" />
              {localClusterFilter.length}/{availableClusters.length}
            </span>
          )}

          {/* Cluster filter dropdown */}
          {availableClusters.length >= 1 && (
            <div ref={clusterFilterRef} className="relative">
              <button
                ref={clusterFilterBtnRef}
                onClick={() => setShowClusterFilter(!showClusterFilter)}
                className={`flex items-center gap-1 px-2 py-1 text-xs rounded-lg border transition-colors ${
                  localClusterFilter.length > 0
                    ? 'bg-purple-500/20 border-purple-500/30 text-purple-400'
                    : 'bg-secondary border-border text-muted-foreground hover:text-foreground'
                }`}
                title="Filter by cluster"
              >
                <Filter className="w-3 h-3" />
                <ChevronDown className="w-3 h-3" />
              </button>

              {showClusterFilter && dropdownStyle && createPortal(
                <div className="fixed w-48 max-h-48 overflow-y-auto rounded-lg bg-card border border-border shadow-lg z-50"
                  style={{ top: dropdownStyle.top, left: dropdownStyle.left }}
                  onMouseDown={e => e.stopPropagation()}>
                  <div className="p-1">
                    <button
                      onClick={clearClusterFilter}
                      className={`w-full px-2 py-1.5 text-xs text-left rounded transition-colors ${
                        localClusterFilter.length === 0 ? 'bg-purple-500/20 text-purple-400' : 'hover:bg-secondary text-foreground'
                      }`}
                    >
                      All clusters
                    </button>
                    {availableClusters.map(cluster => (
                      <button
                        key={cluster.name}
                        onClick={() => toggleClusterFilter(cluster.name)}
                        className={`w-full px-2 py-1.5 text-xs text-left rounded transition-colors ${
                          localClusterFilter.includes(cluster.name) ? 'bg-purple-500/20 text-purple-400' : 'hover:bg-secondary text-foreground'
                        }`}
                      >
                        {cluster.name}
                      </button>
                    ))}
                  </div>
                </div>,
              document.body
              )}
            </div>
          )}

        </div>
      </div>

      {/* Main stats */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div
          className="p-3 rounded-lg bg-purple-500/10 border border-purple-500/20 cursor-default"
          title={hasRealData ? `Total storage capacity: ${formatStorageStat(stats.totalStorageGB)} across ${stats.clustersWithStorage} cluster${stats.clustersWithStorage !== 1 ? 's' : ''}` : 'No data available - clusters may be offline'}
        >
          <div className="flex items-center gap-2 mb-1">
            <Database className="w-4 h-4 text-purple-400" />
            <span className="text-xs text-purple-400">Total Capacity</span>
          </div>
          <span className="text-2xl font-bold text-foreground">
            {formatStorageStat(stats.totalStorageGB, hasRealData)}
          </span>
          <div className="text-xs text-muted-foreground mt-1">
            across {formatStat(stats.clustersWithStorage)} cluster{stats.clustersWithStorage !== 1 ? 's' : ''}
          </div>
        </div>

        <div
          className={`p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 ${stats.totalPVCs > 0 ? 'cursor-pointer hover:bg-blue-500/20' : 'cursor-default'} transition-colors`}
          onClick={() => {
            if (filteredPVCs.length > 0 && filteredPVCs[0]) {
              drillToPVC(filteredPVCs[0].cluster || 'default', filteredPVCs[0].namespace, filteredPVCs[0].name)
            }
          }}
          title={stats.totalPVCs > 0 ? `${stats.totalPVCs} Persistent Volume Claims - Click to view details` : 'No PVCs found'}
        >
          <div className="flex items-center gap-2 mb-1">
            <HardDrive className="w-4 h-4 text-blue-400" />
            <span className="text-xs text-blue-400">PVCs</span>
          </div>
          <span className="text-2xl font-bold text-foreground">{formatStat(stats.totalPVCs)}</span>
          <div className="text-xs text-muted-foreground mt-1">
            persistent volume claims
          </div>
        </div>
      </div>

      {/* PVC Status breakdown */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div
          className={`p-2 rounded-lg bg-green-500/10 border border-green-500/20 ${stats.boundPVCs > 0 ? 'cursor-pointer hover:bg-green-500/20' : 'cursor-default'} transition-colors`}
          onClick={() => {
            const boundPVC = filteredPVCs.find(p => p.status === 'Bound')
            if (boundPVC) drillToPVC(boundPVC.cluster || 'default', boundPVC.namespace, boundPVC.name)
          }}
          title={stats.boundPVCs > 0 ? `${stats.boundPVCs} PVC${stats.boundPVCs !== 1 ? 's' : ''} successfully bound - Click to view` : 'No bound PVCs'}
        >
          <div className="flex items-center gap-1.5 mb-1">
            <CheckCircle className="w-3 h-3 text-green-400" />
            <span className="text-xs text-green-400">Bound</span>
          </div>
          <span className="text-lg font-bold text-foreground">{formatStat(stats.boundPVCs)}</span>
        </div>
        <div
          className={`p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20 ${stats.pendingPVCs > 0 ? 'cursor-pointer hover:bg-yellow-500/20' : 'cursor-default'} transition-colors`}
          onClick={() => {
            const pendingPVC = filteredPVCs.find(p => p.status === 'Pending')
            if (pendingPVC) drillToPVC(pendingPVC.cluster || 'default', pendingPVC.namespace, pendingPVC.name)
          }}
          title={stats.pendingPVCs > 0 ? `${stats.pendingPVCs} PVC${stats.pendingPVCs !== 1 ? 's' : ''} pending - Click to view` : 'No pending PVCs'}
        >
          <div className="flex items-center gap-1.5 mb-1">
            <Clock className="w-3 h-3 text-yellow-400" />
            <span className="text-xs text-yellow-400">Pending</span>
          </div>
          <span className="text-lg font-bold text-foreground">{formatStat(stats.pendingPVCs)}</span>
        </div>
        <div
          className={`p-2 rounded-lg bg-red-500/10 border border-red-500/20 ${stats.failedPVCs > 0 ? 'cursor-pointer hover:bg-red-500/20' : 'cursor-default'} transition-colors`}
          onClick={() => {
            const failedPVC = filteredPVCs.find(p => p.status !== 'Bound' && p.status !== 'Pending')
            if (failedPVC) drillToPVC(failedPVC.cluster || 'default', failedPVC.namespace, failedPVC.name)
          }}
          title={stats.failedPVCs > 0 ? `${stats.failedPVCs} PVC${stats.failedPVCs !== 1 ? 's' : ''} in failed/lost state - Click to view` : 'No failed PVCs'}
        >
          <div className="flex items-center gap-1.5 mb-1">
            <AlertTriangle className="w-3 h-3 text-red-400" />
            <span className="text-xs text-red-400">Failed</span>
          </div>
          <span className="text-lg font-bold text-foreground">{formatStat(stats.failedPVCs)}</span>
        </div>
      </div>

      {/* Storage Classes */}
      {stats.storageClasses.length > 0 && (
        <div className="flex-1">
          <div className="text-xs text-muted-foreground mb-2">Storage Classes</div>
          <div className="space-y-1.5">
            {stats.storageClasses.slice(0, 5).map(([name, count]) => (
              <div key={name} className="flex items-center justify-between p-2 rounded bg-secondary/30 cursor-default" title={`Storage class "${name}" has ${count} PVC${count !== 1 ? 's' : ''}`}>
                <span className="text-sm text-foreground truncate" title={name}>{name}</span>
                <span className="text-xs text-muted-foreground">{count} PVCs</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="mt-3 pt-3 border-t border-border/50 text-xs text-muted-foreground">
        {pvcsLoading ? 'Loading PVC data...' : `${stats.totalPVCs} PVCs across ${filteredClusters.length} clusters`}
      </div>
    </div>
  )
}
