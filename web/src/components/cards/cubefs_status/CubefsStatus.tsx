import { useState } from 'react'
import { StatTile } from '../shared/StatTile'
import {
  CheckCircle,
  AlertTriangle,
  XCircle,
  Database,
  Server,
  HardDrive,
  Layers,
  Eye,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Skeleton, SkeletonStats, SkeletonList } from '../../ui/Skeleton'
import { RefreshIndicator } from '../../ui/RefreshIndicator'
import { Button } from '../../ui/Button'
import { CardSearchInput } from '../../../lib/cards/CardComponents'
import { useCubefsStatus } from './useCubefsStatus'
import { useDemoMode } from '../../../hooks/useDemoMode'
import { useDrillDownActions } from '../../../hooks/useDrillDown'
import type {
  CubefsVolume,
  CubefsVolumeStatus,
  CubefsNode,
  CubefsNodeStatus,
} from './demoData'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USAGE_FULL_PERCENT = 100
const USAGE_HIGH_THRESHOLD = 80
const USAGE_MED_THRESHOLD = 50
const VOLUMES_TAB = 'volumes' as const
const NODES_TAB = 'nodes' as const
type Tab = typeof VOLUMES_TAB | typeof NODES_TAB

// ---------------------------------------------------------------------------
// Status config factory functions (i18n-safe — labels go through t())
// ---------------------------------------------------------------------------

/** Re-use the exact type that useTranslation('cards') returns to avoid TS brand mismatches. */
type CardT = ReturnType<typeof useTranslation<'cards'>>['t']

function getVolumeStatusConfig(
  t: CardT,
): Record<CubefsVolumeStatus, { label: string; color: string; icon: React.ReactNode }> {
  return {
    active: {
      label: t('cubefs.statusActive', 'Active'),
      color: 'text-green-400',
      icon: <CheckCircle className="w-3.5 h-3.5 text-green-400" />,
    },
    inactive: {
      label: t('cubefs.statusInactive', 'Inactive'),
      color: 'text-red-400',
      icon: <XCircle className="w-3.5 h-3.5 text-red-400" />,
    },
    'read-only': {
      label: t('cubefs.statusReadOnly', 'Read-Only'),
      color: 'text-yellow-400',
      icon: <Eye className="w-3.5 h-3.5 text-yellow-400" />,
    },
    unknown: {
      label: t('cubefs.statusUnknown', 'Unknown'),
      color: 'text-yellow-400',
      icon: <AlertTriangle className="w-3.5 h-3.5 text-yellow-400" />,
    },
  }
}

function getNodeStatusConfig(
  t: CardT,
): Record<CubefsNodeStatus, { label: string; color: string; icon: React.ReactNode }> {
  return {
    active: {
      label: t('cubefs.statusActive', 'Active'),
      color: 'text-green-400',
      icon: <CheckCircle className="w-3.5 h-3.5 text-green-400" />,
    },
    inactive: {
      label: t('cubefs.statusInactive', 'Inactive'),
      color: 'text-red-400',
      icon: <XCircle className="w-3.5 h-3.5 text-red-400" />,
    },
    unknown: {
      label: t('cubefs.statusUnknown', 'Unknown'),
      color: 'text-yellow-400',
      icon: <AlertTriangle className="w-3.5 h-3.5 text-yellow-400" />,
    },
  }
}

function getRoleBadgeConfig(
  t: CardT,
): Record<string, { label: string; cls: string }> {
  return {
    master: { label: t('cubefs.roleMaster', 'Master'), cls: 'bg-purple-500/15 text-purple-400' },
    meta: { label: t('cubefs.roleMeta', 'Meta'), cls: 'bg-cyan-500/15 text-cyan-400' },
    data: { label: t('cubefs.roleData', 'Data'), cls: 'bg-blue-500/15 text-blue-400' },
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function UsageBar({ percent }: { percent: number }) {
  const barColor =
    percent >= USAGE_HIGH_THRESHOLD
      ? 'bg-red-500'
      : percent >= USAGE_MED_THRESHOLD
        ? 'bg-yellow-500'
        : 'bg-green-500'

  return (
    <div className="mt-1.5">
      <div className="flex h-1.5 rounded-full overflow-hidden bg-muted">
        <div
          className={`h-full transition-all rounded-full ${barColor}`}
          style={{ width: `${Math.min(percent, USAGE_FULL_PERCENT)}%` }}
          title={`${percent}% used`}
        />
      </div>
      <div className="flex justify-between mt-0.5 text-xs text-muted-foreground tabular-nums">
        <span>{percent}% used</span>
      </div>
    </div>
  )
}

function VolumeRow({
  volume,
  onClick,
}: {
  volume: CubefsVolume
  onClick?: () => void
}) {
  const { t } = useTranslation('cards')
  const statusConfig = getVolumeStatusConfig(t)
  const cfg = statusConfig[volume.status]

  return (
    <div
      className={`rounded-md bg-muted/30 px-3 py-2 space-y-1.5 group ${onClick ? 'cursor-pointer hover:bg-muted/50 transition-colors' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } } : undefined}
    >
      {/* Row 1: name + status */}
      <div className="flex flex-wrap items-center justify-between gap-y-2 gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {cfg.icon}
          <span className="text-xs font-medium truncate">{volume.name}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {volume.owner && (
            <span className="text-xs text-muted-foreground">
              {volume.owner}
            </span>
          )}
          <span className={`text-xs ${cfg.color}`}>{cfg.label}</span>
        </div>
      </div>

      {/* Row 2: capacity + partitions */}
      <div className="flex flex-wrap items-center justify-between gap-y-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1 truncate">
          <HardDrive className="w-3 h-3" />
          {volume.usedSize || '0'} / {volume.capacity || '—'}
        </span>
        <span className="shrink-0 ml-2 flex items-center gap-3">
          <span title={t('cubefs.dataPartitions', 'Data partitions')}>
            DP {volume.dataPartitions}
          </span>
          <span title={t('cubefs.metaPartitions', 'Meta partitions')}>
            MP {volume.metaPartitions}
          </span>
          <span title={t('cubefs.replicas', 'Replicas')}>
            R×{volume.replicaCount}
          </span>
        </span>
      </div>

      {/* Row 3: usage bar */}
      {(volume.status === 'active' || volume.status === 'read-only') && (
        <UsageBar percent={volume.usagePercent} />
      )}
    </div>
  )
}

function NodeRow({
  node,
  onClick,
}: {
  node: CubefsNode
  onClick?: () => void
}) {
  const { t } = useTranslation('cards')
  const statusConfig = getNodeStatusConfig(t)
  const roleBadgeConfig = getRoleBadgeConfig(t)
  const cfg = statusConfig[node.status]
  const roleBadge = roleBadgeConfig[node.role] ?? { label: node.role, cls: 'bg-muted text-muted-foreground' }

  return (
    <div
      className={`rounded-md bg-muted/30 px-3 py-2 space-y-1 group ${onClick ? 'cursor-pointer hover:bg-muted/50 transition-colors' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } } : undefined}
    >
      {/* Row 1: address + status */}
      <div className="flex flex-wrap items-center justify-between gap-y-2 gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {cfg.icon}
          <span className="text-xs font-medium truncate font-mono">{node.address}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${roleBadge.cls}`}>
            {roleBadge.label}
          </span>
          <span className={`text-xs ${cfg.color}`}>{cfg.label}</span>
        </div>
      </div>

      {/* Row 2: disk + partitions */}
      {(node.totalDisk || node.partitions > 0) && (
        <div className="flex flex-wrap items-center justify-between gap-y-2 text-xs text-muted-foreground">
          {node.totalDisk && (
            <span className="flex items-center gap-1">
              <HardDrive className="w-3 h-3" />
              {node.usedDisk || '0'} / {node.totalDisk}
            </span>
          )}
          {node.partitions > 0 && (
            <span className="shrink-0 ml-2">
              {node.partitions} {t('cubefs.partitions', 'partitions')}
            </span>
          )}
        </div>
      )}

      {/* Row 3: disk usage bar */}
      {node.totalDisk && node.diskUsagePercent > 0 && (
        <UsageBar percent={node.diskUsagePercent} />
      )}
    </div>
  )
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  count,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  count: number
}) {
  return (
    <Button
      variant={active ? 'accent' : 'ghost'}
      size="sm"
      type="button"
      onClick={onClick}
      className={`rounded-md font-medium ${
        active
          ? 'bg-primary/15 text-primary'
          : 'text-muted-foreground'
      }`}
      icon={icon}
    >
      {label}
      <span className={`ml-1 px-1.5 py-0.5 rounded-full text-xs ${
        active ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
      }`}>
        {count}
      </span>
    </Button>
  )
}

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
  const [search, setSearch] = useState('')

  // Guard against undefined nested data from API/cache
  const volumes = data.volumes || []
  const nodes = data.nodes || []

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

  // Filtered lists
  const filteredVolumes = (() => {
    if (!search.trim()) return volumes
    const q = search.toLowerCase()
    return volumes.filter(
      v =>
        v.name.toLowerCase().includes(q) ||
        v.owner.toLowerCase().includes(q) ||
        v.status.toLowerCase().includes(q),
    )
  })()

  const filteredNodes = (() => {
    if (!search.trim()) return nodes
    const q = search.toLowerCase()
    return nodes.filter(
      n =>
        n.address.toLowerCase().includes(q) ||
        n.role.toLowerCase().includes(q) ||
        n.status.toLowerCase().includes(q),
    )
  })()

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
        <p className="text-sm text-red-400">
          {t('cubefs.fetchError', 'Failed to fetch CubeFS status')}
        </p>
      </div>
    )
  }

  // ── Not installed ──────────────────────────────────────────────────────────
  if (data.health === 'not-installed') {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground gap-2">
        <Database className="w-6 h-6 text-muted-foreground/50" />
        <p className="text-sm font-medium">
          {t('cubefs.notInstalled', 'CubeFS not detected')}
        </p>
        <p className="text-xs text-center max-w-xs">
          {t(
            'cubefs.notInstalledHint',
            'No CubeFS pods found. Deploy CubeFS to enable distributed file system storage.',
          )}
        </p>
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
      <div className="grid grid-cols-2 @md:grid-cols-4 gap-2">
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
      </div>

      {/* ── Tab bar ── */}
      <div className="flex items-center gap-1">
        <TabButton
          active={activeTab === VOLUMES_TAB}
          onClick={() => { setActiveTab(VOLUMES_TAB); setSearch('') }}
          icon={<Database className="w-3.5 h-3.5" />}
          label={t('cubefs.volumesTab', 'Volumes')}
          count={volumes.length}
        />
        <TabButton
          active={activeTab === NODES_TAB}
          onClick={() => { setActiveTab(NODES_TAB); setSearch('') }}
          icon={<Server className="w-3.5 h-3.5" />}
          label={t('cubefs.nodesTab', 'Nodes')}
          count={nodes.length}
        />
      </div>

      {/* ── Search ── */}
      <CardSearchInput
        value={search}
        onChange={setSearch}
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
              <p className="text-sm">{t('cubefs.noVolumes', 'No volumes found')}</p>
              <p className="text-xs text-center">
                {t('cubefs.noVolumesHint', 'CubeFS volumes will appear here when created.')}
              </p>
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
              <p className="text-sm">{t('cubefs.noNodes', 'No nodes found')}</p>
              <p className="text-xs text-center">
                {t('cubefs.noNodesHint', 'CubeFS nodes (master, meta, data) will appear here.')}
              </p>
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
