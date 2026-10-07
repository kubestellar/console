import { ZoomIn, ZoomOut, Maximize2, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { ClusterInfo } from '../../hooks/useMCP'
import { detectCloudProvider, CloudProviderIcon, type CloudProvider } from '../ui/CloudProviderIcon'
import { CLUSTER_MARKER_FONT_SIZE } from '../../lib/constants'
import {
  MAX_CLUSTER_NAME_DISPLAY,
  TRUNCATED_NAME_LENGTH,
  PING_ANIMATION_STYLE,
  type RegionInfo,
  type StatusFilter,
} from './ClusterLocations.constants'

interface ClusterLocationsFiltersProps {
  searchFilter: string
  setSearchFilter: (value: string) => void
  statusFilter: StatusFilter
  setStatusFilter: (value: StatusFilter) => void
}

export function ClusterLocationsFilters({
  searchFilter,
  setSearchFilter,
  statusFilter,
  setStatusFilter,
}: ClusterLocationsFiltersProps) {
  const { t } = useTranslation(['cards', 'common'])
  return (
    <div className="mb-2 p-2 bg-secondary/30 rounded-lg border border-border/50 space-y-2">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={searchFilter}
          onChange={(e) => setSearchFilter(e.target.value)}
          placeholder={t('common:common.searchClusters')}
          className="flex-1 px-2 py-1 text-xs bg-secondary rounded border border-border text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-purple-500/50"
        />
        {searchFilter && (
          <button onClick={() => setSearchFilter('')} aria-label={t('common:common.clearSearch', 'Clear search')} className="text-muted-foreground hover:text-foreground">
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">{t('common:common.status')}:</span>
        <div className="flex gap-1">
          {(['all', 'healthy', 'unhealthy'] as StatusFilter[]).map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-2 py-0.5 text-xs rounded transition-colors ${
                statusFilter === status
                  ? status === 'healthy' ? 'bg-green-500/20 text-green-400'
                    : status === 'unhealthy' ? 'bg-red-500/20 text-red-400'
                    : 'bg-purple-500/20 text-purple-400'
                  : 'bg-secondary text-muted-foreground hover:text-foreground'
              }`}
            >
              {t(`cards:clusterLocations.status.${status}`)}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

interface ClusterMarkerProps {
  cluster: ClusterInfo
  group: RegionInfo
  idx: number
  isHovered: boolean
  setHoveredCluster: (name: string | null) => void
  drillToCluster: (name: string) => void
}

export function ClusterMarker({
  cluster,
  group,
  idx,
  isHovered,
  setHoveredCluster,
  drillToCluster,
}: ClusterMarkerProps) {
  const { t } = useTranslation(['cards', 'common'])
  const provider = detectCloudProvider(cluster.name, cluster.server, cluster.namespaces)
  // Offset multiple clusters in same region
  const offsetX = (idx % 3) * 2 - 2
  const offsetY = Math.floor(idx / 3) * 2.5

  return (
    <div
      className="absolute transform -translate-x-1/2 -translate-y-1/2 z-10"
      style={{
        left: `${group.coordinates.x + offsetX}%`,
        top: `${group.coordinates.y + offsetY}%` }}
      onMouseEnter={() => setHoveredCluster(cluster.name)}
      onMouseLeave={() => setHoveredCluster(null)}
    >
      {/* Subtle ping animation */}
      <div
        className={`absolute inset-0 rounded-full animate-pulse opacity-20 ${cluster.healthy ? 'bg-green-400' : 'bg-red-400'}`}
        style={PING_ANIMATION_STYLE}
      />

      {/* Cluster badge */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          drillToCluster(cluster.name)
        }}
        className={`relative flex items-center gap-1 px-1.5 py-0.5 rounded-md border transition-all duration-200 ${
          isHovered ? 'scale-125 z-20' : ''
        } ${
          cluster.healthy
            ? 'bg-green-500/20 border-green-500/40 hover:bg-green-500/30'
            : 'bg-red-500/20 border-red-500/40 hover:bg-red-500/30'
        }`}
        style={{ fontSize: CLUSTER_MARKER_FONT_SIZE }}
      >
        <CloudProviderIcon provider={provider} size={10} />
        <span className="text-[9px] font-medium text-foreground max-w-[60px] truncate">
          {cluster.name.length > MAX_CLUSTER_NAME_DISPLAY ? cluster.name.substring(0, TRUNCATED_NAME_LENGTH) + '…' : cluster.name}
        </span>
        <div className={`w-1.5 h-1.5 rounded-full ${cluster.healthy ? 'bg-green-400' : 'bg-red-400'}`} />
      </button>

      {/* Hover tooltip */}
      {isHovered && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1 z-50 pointer-events-none">
          <div className="bg-popover border border-border rounded-lg shadow-xl p-2 min-w-[140px]">
            <div className="flex items-center gap-1.5 mb-1">
              <CloudProviderIcon provider={provider} size={14} />
              <span className="text-xs font-medium text-foreground">{cluster.name}</span>
            </div>
            <div className="text-2xs text-muted-foreground space-y-0.5">
              <div>{t('cards:clusterLocations.region')}: {group.displayName}</div>
              <div>{t('common:common.status')}: <span className={cluster.healthy ? 'text-green-400' : 'text-red-400'}>{cluster.healthy ? t('common:common.healthy') : t('common:common.unhealthy')}</span></div>
              {cluster.context && <div className="truncate">{t('cards:clusterLocations.context')}: {cluster.context}</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

interface MapControlsProps {
  onZoomIn: () => void
  onZoomOut: () => void
  onReset: () => void
}

export function MapControls({ onZoomIn, onZoomOut, onReset }: MapControlsProps) {
  const { t } = useTranslation(['cards', 'common'])
  return (
    <div className="absolute top-2 right-2 flex flex-col gap-1 z-20">
      <button
        onClick={onZoomIn}
        className="p-1 bg-secondary/80 hover:bg-secondary rounded border border-border/50 text-muted-foreground hover:text-foreground transition-colors"
        title={t('cards:clusterLocations.zoomIn')}
      >
        <ZoomIn className="w-3 h-3" />
      </button>
      <button
        onClick={onZoomOut}
        className="p-1 bg-secondary/80 hover:bg-secondary rounded border border-border/50 text-muted-foreground hover:text-foreground transition-colors"
        title={t('cards:clusterLocations.zoomOut')}
      >
        <ZoomOut className="w-3 h-3" />
      </button>
      <button
        onClick={onReset}
        className="p-1 bg-secondary/80 hover:bg-secondary rounded border border-border/50 text-muted-foreground hover:text-foreground transition-colors"
        title={t('cards:clusterLocations.resetView')}
      >
        <Maximize2 className="w-3 h-3" />
      </button>
    </div>
  )
}

export function ProviderLegend({ providers }: { providers: CloudProvider[] }) {
  const { t } = useTranslation(['cards', 'common'])
  return (
    <div className="mt-2 pt-2 border-t border-border/50">
      <div className="flex flex-wrap items-center gap-2 text-2xs text-muted-foreground">
        {providers.map(provider => (
          <div key={provider} className="flex items-center gap-1">
            <CloudProviderIcon provider={provider} size={10} />
            <span className="capitalize">{provider}</span>
          </div>
        ))}
        <div className="flex items-center gap-1 ml-auto">
          <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
          <span>{t('common:common.healthy')}</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
          <span>{t('cards:clusterLocations.issues')}</span>
        </div>
      </div>
    </div>
  )
}
