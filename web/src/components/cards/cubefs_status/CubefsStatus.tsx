import { useState } from 'react'
import { StatGrid } from '../../ui/StatGrid'
import { StatTile } from '../shared/StatTile'
import { CheckCircle, AlertTriangle, Database, Server, Layers } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Skeleton, SkeletonStats, SkeletonList } from '../../ui/Skeleton'
import { RefreshIndicator } from '../../ui/RefreshIndicator'
import { CardSearchInput } from '../../../lib/cards/CardComponents'
import { useCardData } from '../../../lib/cards/cardHooks'
import { useCubefsStatus } from './useCubefsStatus'
import { useDrillDownActions } from '../../../hooks/useDrillDown'
import { useDemoMode } from '../../../hooks/useDemoMode'
import type {
  CubefsVolume,
  CubefsNode,
} from './demoData'
import {
  DEFAULT_SORT,
  NODES_TAB,
  NodeRow,
  TabButton,
  VOLUMES_TAB,
  VolumeRow,
  type Tab,
} from './CubefsStatus.components'

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function CubefsStatus() {
  const { t } = useTranslation('cards')
  useDemoMode()

  const {
    data,
    isRefreshing,
    error,
    showSkeleton,
    showEmptyState,
    lastRefresh,
  } = useCubefsStatus()

  const { drillToAllStorage } = useDrillDownActions()

  const [activeTab, setActiveTab] = useState<Tab>(VOLUMES_TAB)

  // Guard against undefined nested data from API/cache
  const volumes = data.volumes || []
  const nodes = data.nodes || []
  const {
    items: filteredVolumes,
    filters: { search: volumeSearch, setSearch: setVolumeSearch },
  } = useCardData<CubefsVolume, typeof DEFAULT_SORT>(volumes, {
    filter: { searchFields: ['name', 'owner', 'status'], storageKey: 'cubefs-volumes' },
    sort: { defaultField: DEFAULT_SORT, defaultDirection: 'asc', comparators: { [DEFAULT_SORT]: () => 0 } },
    defaultLimit: 'unlimited',
  })
  const {
    items: filteredNodes,
    filters: { search: nodeSearch, setSearch: setNodeSearch },
  } = useCardData<CubefsNode, typeof DEFAULT_SORT>(nodes, {
    filter: { searchFields: ['address', 'role', 'status'], storageKey: 'cubefs-nodes' },
    sort: { defaultField: DEFAULT_SORT, defaultDirection: 'asc', comparators: { [DEFAULT_SORT]: () => 0 } },
    defaultLimit: 'unlimited',
  })

  // Derived stats
  const masterNodes = nodes.filter(n => n.role === 'master')
  const dataNodes = nodes.filter(n => n.role === 'data')
  const stats = {
    volumes: volumes.length,
    masters: masterNodes.length,
    dataNodes: dataNodes.length,
    issues:
      volumes.filter(v => v.status === 'inactive' || v.status === 'unknown').length +
      nodes.filter(n => n.status !== 'active').length,
  }

  // Drill-down handlers
  const handleVolumeDrill = (volume: CubefsVolume) => {
    drillToAllStorage('cubefs', {
      volumeName: volume.name,
      volumeOwner: volume.owner,
      volumeStatus: volume.status,
      volumeCapacity: volume.capacity,
      volumeUsed: volume.usedSize,
    })
  }

  const handleNodeDrill = (node: CubefsNode) => {
    drillToAllStorage('cubefs', {
      nodeAddress: node.address,
      nodeRole: node.role,
      nodeStatus: node.status,
    })
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (showSkeleton) {
    return (
      <div className="h-full flex flex-col min-h-card gap-4">
        <div className="flex flex-wrap items-center justify-between gap-y-2">
          <Skeleton variant="rounded" width={120} height={28} />
          <Skeleton variant="rounded" width={80} height={20} />
        </div>
        <SkeletonStats className="grid-cols-2 @md:grid-cols-4" />
        <Skeleton variant="rounded" height={32} />
        <SkeletonList items={3} className="flex-1" />
      </div>
    )
  }

  // ── Error ──────────────────────────────────────────────────────────────────
  if (error && showEmptyState) {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground gap-2">
        <AlertTriangle className="w-6 h-6 text-red-400" />
        <div className="text-sm text-red-400">
          {t('cubefs.fetchError', 'Failed to fetch CubeFS status')}
        </div>
      </div>
    )
  }

  // ── Not installed ──────────────────────────────────────────────────────────
  if (data.health === 'not-installed') {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground gap-2">
        <Database className="w-6 h-6 text-muted-foreground/50" />
        <div className="text-sm font-medium">
          {t('cubefs.notInstalled', 'CubeFS not detected')}
        </div>
        <div className="text-xs text-center max-w-xs">
          {t(
            'cubefs.notInstalledHint',
            'No CubeFS pods found. Deploy CubeFS to enable distributed file system storage.',
          )}
        </div>
      </div>
    )
  }

  const isHealthy = data.health === 'healthy'
  const healthColorClass = isHealthy
    ? 'bg-green-500/15 text-green-400'
    : 'bg-yellow-500/15 text-yellow-400'

  return (
    <div className="h-full flex flex-col min-h-card content-loaded gap-4 overflow-hidden">
      {/* ── Header: health badge + cluster info + refresh ── */}
      <div className="flex flex-wrap items-center justify-between gap-y-2">
        <div className="flex items-center gap-2">
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${healthColorClass}`}
          >
            {isHealthy ? (
              <CheckCircle className="w-4 h-4" />
            ) : (
              <AlertTriangle className="w-4 h-4" />
            )}
            {isHealthy
              ? t('cubefs.healthy', 'Healthy')
              : t('cubefs.degraded', 'Degraded')}
          </div>
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Server className="w-3 h-3" />
            {data.clusterName || 'cubefs'}
          </span>
        </div>
        <RefreshIndicator
          isRefreshing={isRefreshing}
          lastUpdated={lastRefresh ? new Date(lastRefresh) : null}
          size="sm"
          showLabel={true}
        />
      </div>

      {/* ── Stats grid ── */}
      <StatGrid>
        <StatTile
          icon={<Database className="w-4 h-4 text-blue-400" />}
          label={t('cubefs.volumes', 'Volumes')}
          value={stats.volumes}
          colorClass="text-blue-400"
          borderClass="border-blue-500/20"
        />
        <StatTile
          icon={<Layers className="w-4 h-4 text-purple-400" />}
          label={t('cubefs.masters', 'Masters')}
          value={stats.masters}
          colorClass="text-purple-400"
          borderClass="border-purple-500/20"
        />
        <StatTile
          icon={<Server className="w-4 h-4 text-cyan-400" />}
          label={t('cubefs.dataNodesLabel', 'Data Nodes')}
          value={stats.dataNodes}
          colorClass="text-cyan-400"
          borderClass="border-cyan-500/20"
        />
        <StatTile
          icon={<AlertTriangle className="w-4 h-4 text-red-400" />}
          label={t('cubefs.issues', 'Issues')}
          value={stats.issues}
          colorClass="text-red-400"
          borderClass="border-red-500/20"
        />
      </StatGrid>

      {/* ── Tab bar ── */}
      <div className="flex items-center gap-1">
        <TabButton
          active={activeTab === VOLUMES_TAB}
          onClick={() => { setActiveTab(VOLUMES_TAB); setVolumeSearch('') }}
          icon={<Database className="w-3.5 h-3.5" />}
          label={t('cubefs.volumesTab', 'Volumes')}
          count={volumes.length}
        />
        <TabButton
          active={activeTab === NODES_TAB}
          onClick={() => { setActiveTab(NODES_TAB); setNodeSearch('') }}
          icon={<Server className="w-3.5 h-3.5" />}
          label={t('cubefs.nodesTab', 'Nodes')}
          count={nodes.length}
        />
      </div>

      {/* ── Search ── */}
      <CardSearchInput
        value={activeTab === VOLUMES_TAB ? volumeSearch : nodeSearch}
        onChange={activeTab === VOLUMES_TAB ? setVolumeSearch : setNodeSearch}
        placeholder={
          activeTab === VOLUMES_TAB
            ? t('cubefs.searchVolumesPlaceholder', 'Search volumes…')
            : t('cubefs.searchNodesPlaceholder', 'Search nodes…')
        }
      />

      {/* ── Content list ── */}
      <div className="flex-1 space-y-2 overflow-y-auto">
        {activeTab === VOLUMES_TAB ? (
          filteredVolumes.length > 0 ? (
            filteredVolumes.map(vol => (
              <VolumeRow
                key={vol.name}
                volume={vol}
                onClick={() => handleVolumeDrill(vol)}
              />
            ))
          ) : volumes.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-1 py-6">
              <Database className="w-6 h-6 opacity-40" />
              <div className="text-sm">{t('cubefs.noVolumes', 'No volumes found')}</div>
              <div className="text-xs text-center">
                {t('cubefs.noVolumesHint', 'CubeFS volumes will appear here when created.')}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">
              {t('cubefs.noSearchResults', 'No results match your search.')}
            </div>
          )
        ) : (
          filteredNodes.length > 0 ? (
            filteredNodes.map(n => (
              <NodeRow
                key={n.address}
                node={n}
                onClick={() => handleNodeDrill(n)}
              />
            ))
          ) : nodes.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-1 py-6">
              <Server className="w-6 h-6 opacity-40" />
              <div className="text-sm">{t('cubefs.noNodes', 'No nodes found')}</div>
              <div className="text-xs text-center">
                {t('cubefs.noNodesHint', 'CubeFS nodes (master, meta, data) will appear here.')}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">
              {t('cubefs.noSearchResults', 'No results match your search.')}
            </div>
          )
        )}
      </div>
    </div>
  )
}
