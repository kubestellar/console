import { useMemo } from 'react'
import { Globe, Server, Layers, ExternalLink, Activity } from 'lucide-react'
import { useClusters } from '../../hooks/useMCP'
import { useCachedServices } from '../../hooks/useCachedData'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { useCardLoadingState } from './CardDataContext'
import { CardClusterFilter } from '../../lib/cards/CardComponents'
import { useChartFilters } from '../../lib/cards/cardHooks'
import { ClusterStatusDot } from '../ui/ClusterStatusBadge'
import { RefreshIndicator } from '../ui/RefreshIndicator'
import { Skeleton, SkeletonStats, SkeletonList } from '../ui/Skeleton'
import { useTranslation } from 'react-i18next'

export function NetworkOverview() {
  const { t } = useTranslation(['cards', 'common'])
  const { deduplicatedClusters: clusters, isLoading, isRefreshing: clustersRefreshing, lastRefresh: clustersLastRefreshDate } = useClusters()
  // #6271: useClusters returns lastRefresh as `Date | null`, but the
  // freshness merge below expects a numeric epoch. Normalize once.
  const clustersLastRefresh: number | null = clustersLastRefreshDate instanceof Date
    ? clustersLastRefreshDate.getTime()
    : (typeof clustersLastRefreshDate === 'number' ? clustersLastRefreshDate : null)
  const { services, isLoading: servicesLoading, isRefreshing, isDemoFallback, consecutiveFailures, isFailed, lastRefresh: servicesLastRefresh } = useCachedServices()

  const { selectedClusters, isAllClustersSelected } = useGlobalFilters()
  const { drillToService, drillToAllServices } = useDrillDownActions()

  // Report card data state.
  // #6267: include clustersRefreshing so the card-level state matches
  // the freshness indicator's combined refresh signal — otherwise a
  // cluster cache refresh would tick the indicator without ticking the
  // CardWrapper refresh animation.
  const combinedLoading = isLoading || servicesLoading
  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: combinedLoading,
    isRefreshing: isRefreshing || clustersRefreshing,
    isDemoData: isDemoFallback,
    hasAnyData: services.length > 0,
    isFailed,
    consecutiveFailures })

  // Local cluster filter
  const {
    localClusterFilter,
    toggleClusterFilter,
    clearClusterFilter,
    availableClusters,
    showClusterFilter,
    setShowClusterFilter,
    clusterFilterRef } = useChartFilters({
    storageKey: 'network-overview' })

  // Filter clusters by global selection first
  const globalFilteredClusters = (() => {
    if (isAllClustersSelected) return clusters
    return clusters.filter(c => selectedClusters.includes(c.name))
  })()

  // Apply local cluster filter
  const filteredClusters = (() => {
    if (localClusterFilter.length === 0) return globalFilteredClusters
    return globalFilteredClusters.filter(c => localClusterFilter.includes(c.name))
  })()

  // Filter services by selection
  const filteredServices = (() => {
    let result = services
    if (!isAllClustersSelected) {
      result = result.filter(s => s.cluster && selectedClusters.includes(s.cluster))
    }
    if (localClusterFilter.length > 0) {
      result = result.filter(s => s.cluster && localClusterFilter.includes(s.cluster))
    }
    return result
  })()

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
      offlineClusters }
  }, [filteredServices, filteredClusters])

  if (showSkeleton) {
    return (
      <div className="h-full flex flex-col min-h-card">
        {/* Header skeleton */}
        <div className="flex flex-wrap items-center justify-between gap-y-2 mb-3">
          <div className="flex items-center gap-2">
            <Skeleton variant="circular" width={16} height={16} />
            <Skeleton variant="text" width={100} height={16} />
          </div>
          <Skeleton variant="rounded" width={80} height={24} />
        </div>
        {/* Stats skeleton */}
        <SkeletonStats className="mb-4" />
        {/* List skeleton */}
        <SkeletonList items={3} className="flex-1" />
      </div>
    )
  }

  if (showEmptyState) {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground">
        <p className="text-sm">{t('cards:networkOverview.noNetworkServices')}</p>
        <p className="text-xs mt-1">{t('cards:networkOverview.servicesWillAppear')}</p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Health Indicator */}
      {filteredClusters.length > 0 && (
        <div className="flex items-center gap-2 mb-3 px-2 py-1.5 bg-secondary/30 rounded-lg">
          <Activity className="w-3 h-3 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">{t('cards:networkOverview.clusterHealth')}</span>
          {stats.healthyClusters > 0 && (
            <span className="flex items-center gap-1 text-xs">
              <ClusterStatusDot state="healthy" size="sm" />
              <span className="text-green-400">{stats.healthyClusters} {t('cards:networkOverview.healthy')}</span>
            </span>
          )}
          {stats.degradedClusters > 0 && (
            <span className="flex items-center gap-1 text-xs">
              <ClusterStatusDot state="degraded" size="sm" />
              <span className="text-orange-400">{stats.degradedClusters} {t('cards:networkOverview.degraded')}</span>
            </span>
          )}
          {stats.offlineClusters > 0 && (
            <span className="flex items-center gap-1 text-xs">
              <ClusterStatusDot state="unreachable-timeout" size="sm" />
              <span className="text-yellow-400">{stats.offlineClusters} {t('cards:networkOverview.offline')}</span>
            </span>
          )}
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-y-2 mb-4">
        {/* part 5: freshness indicator.
            #6265: this card uses BOTH useClusters() and useCachedServices(),
            so the indicator must reflect the OLDER of the two timestamps
            (otherwise stale cluster health could appear fresh). Hide the
            timestamp entirely in demo mode — useCache may preserve a
            lastRefresh from a prior live session that doesn't reflect the
            demo data being shown. */}
        <RefreshIndicator
          isRefreshing={isRefreshing || clustersRefreshing}
          lastUpdated={(() => {
            if (isDemoFallback) return null
            const cl = typeof clustersLastRefresh === 'number' ? clustersLastRefresh : null
            const sv = typeof servicesLastRefresh === 'number' ? servicesLastRefresh : null
            if (cl !== null && sv !== null) return new Date(Math.min(cl, sv))
            if (cl !== null) return new Date(cl)
            if (sv !== null) return new Date(sv)
            return null
          })()}
          size="sm"
          showLabel={true}
          staleThresholdMinutes={5}
        />
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
      {/* Issue 8883: roving-tabindex stat tiles — Enter/Space activates; only
          focusable when the tile is interactive (totalServices > 0). */}
      <div
        className={`p-3 rounded-lg bg-cyan-500/10 border border-cyan-500/20 mb-4 ${stats.totalServices > 0 ? 'cursor-pointer hover:bg-cyan-500/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400' : 'cursor-default'} transition-colors`}
        {...(stats.totalServices > 0 ? { role: 'button' as const, tabIndex: 0 } : {})}
        onClick={() => {
          if (stats.totalServices > 0) {
            drillToAllServices(undefined, { services: filteredServices })
          }
        }}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && stats.totalServices > 0) {
            e.preventDefault()
            drillToAllServices(undefined, { services: filteredServices })
          }
        }}
        title={stats.totalServices > 0 ? `${stats.totalServices} total services across ${stats.clustersWithServices} cluster${stats.clustersWithServices !== 1 ? 's' : ''} - Click to view details` : 'No services found'}
      >
        <div className="flex items-center gap-2 mb-1">
          <Layers className="w-4 h-4 text-cyan-400" />
          <span className="text-xs text-cyan-400">{t('cards:networkOverview.totalServices')}</span>
        </div>
        <span className="text-2xl font-bold text-foreground">{stats.totalServices}</span>
        <div className="text-xs text-muted-foreground mt-1">
          {t('cards:networkOverview.acrossClusters', { count: stats.clustersWithServices })}
        </div>
      </div>

      {/* Service Types */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        <div
          className={`p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 ${stats.loadBalancers > 0 ? 'cursor-pointer hover:bg-blue-500/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400' : 'cursor-default'} transition-colors`}
          {...(stats.loadBalancers > 0 ? { role: 'button' as const, tabIndex: 0 } : {})}
          onClick={() => {
            if (stats.loadBalancers > 0) {
              drillToAllServices('LoadBalancer', {
                services: filteredServices.filter(s => s.type === 'LoadBalancer'),
              })
            }
          }}
          onKeyDown={(e) => {
            if ((e.key === 'Enter' || e.key === ' ') && stats.loadBalancers > 0) {
              e.preventDefault()
              drillToAllServices('LoadBalancer', {
                services: filteredServices.filter(s => s.type === 'LoadBalancer'),
              })
            }
          }}
          title={stats.loadBalancers > 0 ? `${stats.loadBalancers} LoadBalancer service${stats.loadBalancers !== 1 ? 's' : ''} - Click to view all` : 'No LoadBalancer services'}
        >
          <div className="flex items-center gap-1.5 mb-1">
            <Globe className="w-3 h-3 text-blue-400" />
            <span className="text-xs text-blue-400">LoadBalancer</span>
          </div>
          <span className="text-lg font-bold text-foreground">{stats.loadBalancers}</span>
        </div>
        <div
          className={`p-2 rounded-lg bg-purple-500/10 border border-purple-500/20 ${stats.nodePort > 0 ? 'cursor-pointer hover:bg-purple-500/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400' : 'cursor-default'} transition-colors`}
          {...(stats.nodePort > 0 ? { role: 'button' as const, tabIndex: 0 } : {})}
          onClick={() => {
            if (stats.nodePort > 0) {
              drillToAllServices('NodePort', {
                services: filteredServices.filter(s => s.type === 'NodePort'),
              })
            }
          }}
          onKeyDown={(e) => {
            if ((e.key === 'Enter' || e.key === ' ') && stats.nodePort > 0) {
              e.preventDefault()
              drillToAllServices('NodePort', {
                services: filteredServices.filter(s => s.type === 'NodePort'),
              })
            }
          }}
          title={stats.nodePort > 0 ? `${stats.nodePort} NodePort service${stats.nodePort !== 1 ? 's' : ''} - Click to view all` : 'No NodePort services'}
        >
          <div className="flex items-center gap-1.5 mb-1">
            <Server className="w-3 h-3 text-purple-400" />
            <span className="text-xs text-purple-400">NodePort</span>
          </div>
          <span className="text-lg font-bold text-foreground">{stats.nodePort}</span>
        </div>
        <div
          className={`p-2 rounded-lg bg-green-500/10 border border-green-500/20 ${stats.clusterIP > 0 ? 'cursor-pointer hover:bg-green-500/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400' : 'cursor-default'} transition-colors`}
          {...(stats.clusterIP > 0 ? { role: 'button' as const, tabIndex: 0 } : {})}
          onClick={() => {
            if (stats.clusterIP > 0) {
              drillToAllServices('ClusterIP', {
                services: filteredServices.filter(s => s.type === 'ClusterIP'),
              })
            }
          }}
          onKeyDown={(e) => {
            if ((e.key === 'Enter' || e.key === ' ') && stats.clusterIP > 0) {
              e.preventDefault()
              drillToAllServices('ClusterIP', {
                services: filteredServices.filter(s => s.type === 'ClusterIP'),
              })
            }
          }}
          title={stats.clusterIP > 0 ? `${stats.clusterIP} ClusterIP service${stats.clusterIP !== 1 ? 's' : ''} - Click to view all` : 'No ClusterIP services'}
        >
          <div className="flex items-center gap-1.5 mb-1">
            <Server className="w-3 h-3 text-green-400" />
            <span className="text-xs text-green-400">ClusterIP</span>
          </div>
          <span className="text-lg font-bold text-foreground">{stats.clusterIP}</span>
        </div>
        <div
          className={`p-2 rounded-lg bg-orange-500/10 border border-orange-500/20 ${stats.externalName > 0 ? 'cursor-pointer hover:bg-orange-500/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400' : 'cursor-default'} transition-colors`}
          {...(stats.externalName > 0 ? { role: 'button' as const, tabIndex: 0 } : {})}
          onClick={() => {
            if (stats.externalName > 0) {
              drillToAllServices('ExternalName', {
                services: filteredServices.filter(s => s.type === 'ExternalName'),
              })
            }
          }}
          onKeyDown={(e) => {
            if ((e.key === 'Enter' || e.key === ' ') && stats.externalName > 0) {
              e.preventDefault()
              drillToAllServices('ExternalName', {
                services: filteredServices.filter(s => s.type === 'ExternalName'),
              })
            }
          }}
          title={stats.externalName > 0 ? `${stats.externalName} ExternalName service${stats.externalName !== 1 ? 's' : ''} - Click to view all` : 'No ExternalName services'}
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
          <div className="text-xs text-muted-foreground mb-2">{t('cards:networkOverview.topNamespaces')}</div>
          {/* Issue 8883: Top Namespaces is a roving-tabindex list; arrow keys
              traverse siblings, Home/End jump to ends, Enter/Space activate. */}
          <div className="space-y-1.5" role="list">
            {stats.namespaces.slice(0, 5).map(([name, count], idx, arr) => {
              const svc = filteredServices.find(s => s.namespace === name)
              const isInteractive = !!(svc?.cluster && svc?.namespace)
              const activate = () => {
                if (svc?.cluster && svc?.namespace) {
                  drillToService(svc.cluster, svc.namespace, svc.name)
                }
              }
              const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
                if (!isInteractive) return
                const list = e.currentTarget.parentElement
                const items = list ? Array.from(list.querySelectorAll<HTMLDivElement>('[data-keynav-item="namespace"]')) : []
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  activate()
                } else if (e.key === 'ArrowDown' && idx < arr.length - 1) {
                  e.preventDefault()
                  items[idx + 1]?.focus()
                } else if (e.key === 'ArrowUp' && idx > 0) {
                  e.preventDefault()
                  items[idx - 1]?.focus()
                } else if (e.key === 'Home') {
                  e.preventDefault()
                  items[0]?.focus()
                } else if (e.key === 'End') {
                  e.preventDefault()
                  items[items.length - 1]?.focus()
                }
              }
              return (
                <div
                  key={name}
                  data-keynav-item="namespace"
                  className={`flex flex-wrap items-center justify-between gap-y-2 gap-2 p-2 rounded bg-secondary/30 ${isInteractive ? 'cursor-pointer hover:bg-secondary/50' : 'cursor-default'} transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400`}
                  onClick={activate}
                  onKeyDown={handleKeyDown}
                  {...(isInteractive ? { role: 'button' as const, tabIndex: 0 } : { role: 'listitem' as const })}
                  title={`${count} service${count !== 1 ? 's' : ''} in namespace ${name}${isInteractive ? ' - Click or press Enter to view' : ''}`}
                >
                  <span className="text-sm text-foreground truncate min-w-0 flex-1">{name}</span>
                  <span className="text-xs text-muted-foreground shrink-0">{t('cards:networkOverview.servicesCount', { count })}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="mt-3 pt-3 border-t border-border/50 text-xs text-muted-foreground">
        {t('cards:networkOverview.footerSummary', { services: stats.totalServices, clusters: filteredClusters.length })}
      </div>
    </div>
  )
}
