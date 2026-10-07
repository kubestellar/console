import { Globe, Server, Cloud, Filter } from 'lucide-react'
import { useClusters } from '../../hooks/useMCP'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { Skeleton } from '../ui/Skeleton'
import { useCardLoadingState } from './CardDataContext'
import { useTranslation } from 'react-i18next'
import { useDemoMode } from '../../hooks/useDemoMode'
import { useClusterLocations } from './useClusterLocations'
import {
  ClusterLocationsFilters,
  ClusterMarker,
  MapControls,
  ProviderLegend,
} from './clusterlocations/ClusterLocations.parts'

interface ClusterLocationsProps {
  config?: Record<string, unknown>
}

export function ClusterLocations({ config: _config }: ClusterLocationsProps) {
  const { t } = useTranslation(['cards', 'common'])
  const { deduplicatedClusters: allClusters, isLoading, isRefreshing, isFailed, consecutiveFailures } = useClusters()
  const { drillToCluster } = useDrillDownActions()
  const { isDemoMode } = useDemoMode()

  // Report loading state to CardWrapper for skeleton/refresh behavior
  const hasData = allClusters.length > 0
  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: isLoading && !hasData,
    isRefreshing,
    hasAnyData: hasData,
    isDemoData: isDemoMode,
    isFailed,
    consecutiveFailures })

  const {
    mapSvg,
    mapLoading,
    mapError,
    zoom,
    pan,
    mapRef,
    statusFilter,
    setStatusFilter,
    showFilters,
    setShowFilters,
    searchFilter,
    setSearchFilter,
    hoveredCluster,
    setHoveredCluster,
    regionGroups,
    stats,
    providerLegend,
    handleZoomIn,
    handleZoomOut,
    handleReset,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleWheel,
  } = useClusterLocations(allClusters)

  if (showSkeleton) {
    return (
      <div className="h-full flex flex-col min-h-card">
        <div className="flex flex-wrap items-center justify-between gap-y-2 mb-4">
          <Skeleton variant="text" width={140} height={20} />
          <Skeleton variant="rounded" width={80} height={28} />
        </div>
        <Skeleton variant="rounded" className="flex-1" />
      </div>
    )
  }

  if (showEmptyState) {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground">
        <p className="text-sm">{t('cards:clusterLocations.noClustersAvailable')}</p>
        <p className="text-xs mt-1">{t('cards:clusterLocations.addClustersToSeeLocations')}</p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-card content-loaded">
      {/* Header */}
      <div className="flex items-center justify-end mb-2">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`p-1.5 rounded-md hover:bg-secondary transition-colors ${showFilters ? 'bg-secondary text-purple-400' : 'text-muted-foreground'}`}
            title={t('cards:clusterLocations.toggleFilters')}
          >
            <Filter className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <ClusterLocationsFilters
          searchFilter={searchFilter}
          setSearchFilter={setSearchFilter}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
        />
      )}

      {/* Stats */}
      <div className="flex items-center gap-3 mb-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <Server className="w-3 h-3" />
          <span>{stats.totalClusters}</span>
        </div>
        <div className="flex items-center gap-1">
          <Globe className="w-3 h-3" />
          <span>{t('cards:clusterLocations.regionCount', { count: stats.uniqueRegions })}</span>
        </div>
        <div className="flex items-center gap-1">
          <Cloud className="w-3 h-3" />
          <span>{stats.providerCount}</span>
        </div>
      </div>

      {/* World Map */}
      <div
        ref={mapRef}
        className="flex-1 relative min-h-[180px] bg-linear-to-b from-gray-900/50 to-gray-800/30 rounded-lg overflow-hidden cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        {mapLoading ? (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <Globe className="w-8 h-8 mx-auto mb-2 opacity-50 animate-pulse" />
              <p className="text-sm">{t('cards:clusterLocations.loadingMap')}</p>
            </div>
          </div>
        ) : mapError ? (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <Globe className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">{t('cards:clusterLocations.failedToLoadMap')}</p>
            </div>
          </div>
        ) : regionGroups.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <Globe className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">{t('cards:clusterLocations.noClustersFound')}</p>
            </div>
          </div>
        ) : (
          <div
            className="absolute inset-0 transition-transform duration-100"
            style={{
              transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
              transformOrigin: 'center center' }}
          >
            {/* SVG Map Background */}
            <div
              className="absolute inset-0 [&_svg]:w-full [&_svg]:h-full [&_rect]:fill-transparent [&_path]:fill-green-800/40 [&_path]:stroke-green-600/20 [&_path]:stroke-[0.3]"
              dangerouslySetInnerHTML={{ __html: mapSvg }}
            />

            {/* Cluster Markers */}
            {regionGroups.map(group => (
              group.clusters.map((cluster, idx) => (
                <ClusterMarker
                  key={cluster.name}
                  cluster={cluster}
                  group={group}
                  idx={idx}
                  isHovered={hoveredCluster === cluster.name}
                  setHoveredCluster={setHoveredCluster}
                  drillToCluster={drillToCluster}
                />
              ))
            ))}
          </div>
        )}

        {/* Map Controls */}
        <MapControls onZoomIn={handleZoomIn} onZoomOut={handleZoomOut} onReset={handleReset} />

        {/* Zoom indicator */}
        {zoom !== 1 && (
          <div className="absolute bottom-2 right-2 text-2xs text-muted-foreground bg-secondary/80 px-1.5 py-0.5 rounded">
            {Math.round(zoom * 100)}%
          </div>
        )}
      </div>

      {/* Footer - Provider Legend */}
      {regionGroups.length > 0 && <ProviderLegend providers={providerLegend} />}
    </div>
  )
}
