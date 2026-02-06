import { useMemo } from 'react'
import { Globe, Server, Layers, ExternalLink, Activity } from 'lucide-react'
import { useClusters } from '../../hooks/useMCP'
import { useCachedServices } from '../../hooks/useCachedData'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { useCardLoadingState } from './CardDataContext'
import { useChartFilters, CardClusterFilter } from '../../lib/cards'
import { ClusterStatusDot } from '../ui/ClusterStatusBadge'

export function NetworkOverview() {
  const { deduplicatedClusters: clusters, isLoading } = useClusters()
  const { services, isLoading: servicesLoading, consecutiveFailures, isFailed } = useCachedServices()

  const { selectedClusters, isAllClustersSelected } = useGlobalFilters()
  const { drillToService } = useDrillDownActions()

  // Report card data state
  const combinedLoading = isLoading || servicesLoading
  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: combinedLoading,
    hasAnyData: services.length > 0,
    isFailed,
    consecutiveFailures,
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
  } = useChartFilters({
    storageKey: 'network-overview',
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

  // Filter services by selection
  const filteredServices = useMemo(() => {
    let result = services
    if (!isAllClustersSelected) {
      result = result.filter(s => s.cluster && selectedClusters.includes(s.cluster))
    }
    if (localClusterFilter.length > 0) {
      result = result.filter(s => s.cluster && localClusterFilter.includes(s.cluster))
    }
    return result
  }, [services, selectedClusters, isAllClustersSelected, localClusterFilter])

  // Calculate network stats
  const stats = useMemo(() => {
    const totalServices = filteredServices.length
    const loadBalancers = filteredServices.filter(s => s.type === 'LoadBalancer').length
    const nodePort = filteredServices.filter(s => s.type === 'NodePort').length
    const clusterIP = filteredServices.filter(s => s.type === 'ClusterIP').length
    const externalName = filteredServices.filter(s => s.type === 'ExternalName').length

    // Group by namespace
    const namespaces = new Map<string, number>()
    filteredServices.forEach(s => {
      const ns = s.namespace || 'default'
      namespaces.set(ns, (namespaces.get(ns) || 0) + 1)
    })

    // Calculate cluster health stats
    const healthyClusters = filteredClusters.filter(c => c.healthy && c.reachable !== false).length
    const degradedClusters = filteredClusters.filter(c => !c.healthy && c.reachable !== false).length
    const offlineClusters = filteredClusters.filter(c => c.reachable === false).length

    return {
      totalServices,
      loadBalancers,
      nodePort,
      clusterIP,
      externalName,
      namespaces: Array.from(namespaces.entries()).sort((a, b) => b[1] - a[1]),
      clustersWithServices: new Set(filteredServices.map(s => s.cluster)).size,
      healthyClusters,
      degradedClusters,
      offlineClusters,
    }
  }, [filteredServices, filteredClusters])

  if (showSkeleton) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading network data...</div>
      </div>
    )
  }

  if (showEmptyState) {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground">
        <p className="text-sm">No network services</p>
        <p className="text-xs mt-1">Services will appear when deployed</p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Health Indicator */}
      {filteredClusters.length > 0 && (
        <div className="flex items-center gap-2 mb-3 px-2 py-1.5 bg-secondary/30 rounded-lg">
          <Activity className="w-3 h-3 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Cluster Health:</span>
          {stats.healthyClusters > 0 && (
            <span className="flex items-center gap-1 text-xs">
              <ClusterStatusDot state="healthy" size="sm" />
              <span className="text-green-400">{stats.healthyClusters} healthy</span>
            </span>
          )}
          {stats.degradedClusters > 0 && (
            <span className="flex items-center gap-1 text-xs">
              <ClusterStatusDot state="degraded" size="sm" />
              <span className="text-orange-400">{stats.degradedClusters} degraded</span>
            </span>
          )}
          {stats.offlineClusters > 0 && (
            <span className="flex items-center gap-1 text-xs">
              <ClusterStatusDot state="unreachable-timeout" size="sm" />
              <span className="text-yellow-400">{stats.offlineClusters} offline</span>
            </span>
          )}
        </div>
      )}

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
          <CardClusterFilter
            availableClusters={availableClusters}
            selectedClusters={localClusterFilter}
            onToggle={toggleClusterFilter}
            onClear={clearClusterFilter}
            isOpen={showClusterFilter}
            setIsOpen={setShowClusterFilter}
            containerRef={clusterFilterRef}
            minClusters={1}
          />

        </div>
      </div>

      {/* Main stat */}
      <div
        className={`p-3 rounded-lg bg-cyan-500/10 border border-cyan-500/20 mb-4 ${stats.totalServices > 0 ? 'cursor-pointer hover:bg-cyan-500/20' : 'cursor-default'} transition-colors`}
        onClick={() => {
          if (stats.totalServices > 0 && filteredServices[0]) {
            const svc = filteredServices[0]
            if (svc.cluster && svc.namespace) {
              drillToService(svc.cluster, svc.namespace, svc.name)
            }
          }
        }}
        title={stats.totalServices > 0 ? `${stats.totalServices} total services across ${stats.clustersWithServices} cluster${stats.clustersWithServices !== 1 ? 's' : ''} - Click to view details` : 'No services found'}
      >
        <div className="flex items-center gap-2 mb-1">
          <Layers className="w-4 h-4 text-cyan-400" />
          <span className="text-xs text-cyan-400">Total Services</span>
        </div>
        <span className="text-2xl font-bold text-foreground">{stats.totalServices}</span>
        <div className="text-xs text-muted-foreground mt-1">
          across {stats.clustersWithServices} cluster{stats.clustersWithServices !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Service Types */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        <div
          className={`p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 ${stats.loadBalancers > 0 ? 'cursor-pointer hover:bg-blue-500/20' : 'cursor-default'} transition-colors`}
          onClick={() => {
            const svc = filteredServices.find(s => s.type === 'LoadBalancer')
            if (svc?.cluster && svc?.namespace) {
              drillToService(svc.cluster, svc.namespace, svc.name)
            }
          }}
          title={stats.loadBalancers > 0 ? `${stats.loadBalancers} LoadBalancer service${stats.loadBalancers !== 1 ? 's' : ''} - Click to view` : 'No LoadBalancer services'}
        >
          <div className="flex items-center gap-1.5 mb-1">
            <Globe className="w-3 h-3 text-blue-400" />
            <span className="text-xs text-blue-400">LoadBalancer</span>
          </div>
          <span className="text-lg font-bold text-foreground">{stats.loadBalancers}</span>
        </div>
        <div
          className={`p-2 rounded-lg bg-purple-500/10 border border-purple-500/20 ${stats.nodePort > 0 ? 'cursor-pointer hover:bg-purple-500/20' : 'cursor-default'} transition-colors`}
          onClick={() => {
            const svc = filteredServices.find(s => s.type === 'NodePort')
            if (svc?.cluster && svc?.namespace) {
              drillToService(svc.cluster, svc.namespace, svc.name)
            }
          }}
          title={stats.nodePort > 0 ? `${stats.nodePort} NodePort service${stats.nodePort !== 1 ? 's' : ''} - Click to view` : 'No NodePort services'}
        >
          <div className="flex items-center gap-1.5 mb-1">
            <Server className="w-3 h-3 text-purple-400" />
            <span className="text-xs text-purple-400">NodePort</span>
          </div>
          <span className="text-lg font-bold text-foreground">{stats.nodePort}</span>
        </div>
        <div
          className={`p-2 rounded-lg bg-green-500/10 border border-green-500/20 ${stats.clusterIP > 0 ? 'cursor-pointer hover:bg-green-500/20' : 'cursor-default'} transition-colors`}
          onClick={() => {
            const svc = filteredServices.find(s => s.type === 'ClusterIP')
            if (svc?.cluster && svc?.namespace) {
              drillToService(svc.cluster, svc.namespace, svc.name)
            }
          }}
          title={stats.clusterIP > 0 ? `${stats.clusterIP} ClusterIP service${stats.clusterIP !== 1 ? 's' : ''} - Click to view` : 'No ClusterIP services'}
        >
          <div className="flex items-center gap-1.5 mb-1">
            <Server className="w-3 h-3 text-green-400" />
            <span className="text-xs text-green-400">ClusterIP</span>
          </div>
          <span className="text-lg font-bold text-foreground">{stats.clusterIP}</span>
        </div>
        <div
          className={`p-2 rounded-lg bg-orange-500/10 border border-orange-500/20 ${stats.externalName > 0 ? 'cursor-pointer hover:bg-orange-500/20' : 'cursor-default'} transition-colors`}
          onClick={() => {
            const svc = filteredServices.find(s => s.type === 'ExternalName')
            if (svc?.cluster && svc?.namespace) {
              drillToService(svc.cluster, svc.namespace, svc.name)
            }
          }}
          title={stats.externalName > 0 ? `${stats.externalName} ExternalName service${stats.externalName !== 1 ? 's' : ''} - Click to view` : 'No ExternalName services'}
        >
          <div className="flex items-center gap-1.5 mb-1">
            <ExternalLink className="w-3 h-3 text-orange-400" />
            <span className="text-xs text-orange-400">ExternalName</span>
          </div>
          <span className="text-lg font-bold text-foreground">{stats.externalName}</span>
        </div>
      </div>

      {/* Top Namespaces */}
      {stats.namespaces.length > 0 && (
        <div className="flex-1">
          <div className="text-xs text-muted-foreground mb-2">Top Namespaces</div>
          <div className="space-y-1.5">
            {stats.namespaces.slice(0, 5).map(([name, count]) => {
              const svc = filteredServices.find(s => s.namespace === name)
              return (
                <div
                  key={name}
                  className={`flex items-center justify-between gap-2 p-2 rounded bg-secondary/30 ${svc ? 'cursor-pointer hover:bg-secondary/50' : 'cursor-default'} transition-colors`}
                  onClick={() => svc?.cluster && svc?.namespace && drillToService(svc.cluster, svc.namespace, svc.name)}
                  title={`${count} service${count !== 1 ? 's' : ''} in namespace ${name}${svc ? ' - Click to view' : ''}`}
                >
                  <span className="text-sm text-foreground truncate min-w-0 flex-1">{name}</span>
                  <span className="text-xs text-muted-foreground shrink-0">{count} services</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="mt-3 pt-3 border-t border-border/50 text-xs text-muted-foreground">
        {servicesLoading ? 'Loading service data...' : `${stats.totalServices} services across ${filteredClusters.length} clusters`}
      </div>
    </div>
  )
}
