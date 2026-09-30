import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle, AlertTriangle, XCircle, HardDrive, Eye } from 'lucide-react'
import { Button } from '../../ui/Button'
import type {
  CubefsVolume,
  CubefsVolumeStatus,
  CubefsNode,
  CubefsNodeStatus,
} from './demoData'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const USAGE_FULL_PERCENT = 100
export const USAGE_HIGH_THRESHOLD = 80
export const USAGE_MED_THRESHOLD = 50
export const VOLUMES_TAB = 'volumes' as const
export const NODES_TAB = 'nodes' as const
export const DEFAULT_SORT = 'default' as const

export type Tab = typeof VOLUMES_TAB | typeof NODES_TAB

// ---------------------------------------------------------------------------
// Status config factory functions (i18n-safe — labels go through t())
// ---------------------------------------------------------------------------

/** Re-use the exact type that useTranslation('cards') returns to avoid TS brand mismatches. */
type CardT = ReturnType<typeof useTranslation<'cards'>>['t']

function getVolumeStatusConfig(
  t: CardT,
): Record<CubefsVolumeStatus, { label: string; color: string; icon: ReactNode }> {
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
): Record<CubefsNodeStatus, { label: string; color: string; icon: ReactNode }> {
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

export function UsageBar({ percent }: { percent: number }) {
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

export function VolumeRow({
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

export function NodeRow({
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

export function TabButton({
  active,
  onClick,
  icon,
  label,
  count,
}: {
  active: boolean
  onClick: () => void
  icon: ReactNode
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

