import { useState } from 'react'
import { StatTile } from '../shared/StatTile'
import {
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Cloud,
  Radio,
  XCircle,
  Server,
  Wifi,
  WifiOff,
  Shield,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Skeleton, SkeletonStats, SkeletonList } from '../../ui/Skeleton'
import { CardSearchInput } from '../../../lib/cards/CardComponents'
import { useOpenYurtStatus } from './useOpenYurtStatus'
import type { OpenYurtNodePool, NodePoolStatus, NodePoolType, OpenYurtGateway, GatewayStatus } from './demoData'
import { createCardSyncFormatter } from '../../../lib/formatters'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const POOL_STATUS_CONFIG: Record<
  NodePoolStatus,
  { label: string; color: string; icon: React.ReactNode }
> = {
  ready: {
    label: 'Ready',
    color: 'text-green-400',
    icon: <CheckCircle className="w-3.5 h-3.5 text-green-400" />,
  },
  degraded: {
    label: 'Degraded',
    color: 'text-yellow-400',
    icon: <AlertTriangle className="w-3.5 h-3.5 text-yellow-400" />,
  },
  'not-ready': {
    label: 'Not Ready',
    color: 'text-red-400',
    icon: <XCircle className="w-3.5 h-3.5 text-red-400" />,
  },
}

const POOL_TYPE_CONFIG: Record<
  NodePoolType,
  { label: string; icon: React.ReactNode }
> = {
  edge: {
    label: 'Edge',
    icon: <Radio className="w-3 h-3 text-purple-400" />,
  },
  cloud: {
    label: 'Cloud',
    icon: <Cloud className="w-3 h-3 text-blue-400" />,
  },
}

const GATEWAY_STATUS_CONFIG: Record<
  GatewayStatus,
  { label: string; color: string; icon: React.ReactNode }
> = {
  connected: {
    label: 'Connected',
    color: 'text-green-400',
    icon: <Wifi className="w-3 h-3 text-green-400" />,
  },
  disconnected: {
    label: 'Disconnected',
    color: 'text-red-400',
    icon: <WifiOff className="w-3 h-3 text-red-400" />,
  },
  pending: {
    label: 'Pending',
    color: 'text-yellow-400',
    icon: <RefreshCw className="w-3 h-3 text-yellow-400" />,
  },
}


// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function NodeReadinessBar({
  ready,
  total,
}: {
  ready: number
  total: number
}) {
  const pct = total > 0 ? Math.min((ready / total) * 100, 100) : 0
  const allReady = ready === total && total > 0
  return (
    <div className="mt-1.5">
      <div className="relative h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={`absolute h-full rounded-full transition-all ${allReady ? 'bg-green-500' : 'bg-yellow-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

function NodePoolRow({ pool }: { pool: OpenYurtNodePool }) {
  const { t } = useTranslation('cards')
  const statusCfg = POOL_STATUS_CONFIG[pool.status]
  const typeCfg = POOL_TYPE_CONFIG[pool.type]

  return (
    <div className="rounded-md bg-muted/30 px-3 py-2 space-y-1.5">
      {/* Row 1: name + status + node count */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {statusCfg.icon}
          <span className="text-xs font-medium truncate">{pool.name}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-muted-foreground">
            {pool.readyNodes}/{pool.nodeCount} {t('openyurt.nodes', 'nodes')}
          </span>
          <span className={`text-xs ${statusCfg.color}`}>{statusCfg.label}</span>
        </div>
      </div>

      {/* Row 2: pool type + autonomy */}
      <div className="flex flex-wrap items-center justify-between gap-y-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          {typeCfg.icon}
          {typeCfg.label}
        </span>
        {pool.autonomyEnabled && (
          <span className="flex items-center gap-1 text-purple-400/80">
            <Shield className="w-3 h-3" />
            {t('openyurt.autonomous', 'Autonomous')}
          </span>
        )}
      </div>

      {/* Row 3: node readiness bar */}
      <NodeReadinessBar ready={pool.readyNodes} total={pool.nodeCount} />
    </div>
  )
}

function GatewayRow({ gw }: { gw: OpenYurtGateway }) {
  const cfg = GATEWAY_STATUS_CONFIG[gw.status]

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 rounded-md bg-muted/20">
      <div className="flex items-center gap-1.5 min-w-0">
        {cfg.icon}
        <span className="text-xs truncate">{gw.name}</span>
        <span className="text-xs text-muted-foreground truncate">→ {gw.nodePool}</span>
      </div>
      <span className={`text-xs shrink-0 ${cfg.color}`}>{cfg.label}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function OpenYurtStatus() {
  const { t } = useTranslation('cards')
  const formatRelativeTime = createCardSyncFormatter(t, 'openyurt')
  const { data, isRefreshing, error, showSkeleton, showEmptyState } = useOpenYurtStatus()
  const [search, setSearch] = useState('')

  // Guard against undefined nested data
  const nodePools = data.nodePools || []
  const gateways = data.gateways || []
  const controllerPods = data.controllerPods || { ready: 0, total: 0 }

  // Derived stats
  const stats = (() => {
    return {
      totalPools: nodePools.length,
      readyPools: nodePools.filter(p => p.status === 'ready').length,
      edgePools: nodePools.filter(p => p.type === 'edge').length,
      connectedGateways: gateways.filter(g => g.status === 'connected').length,
    }
  })()

  // Filtered list (local search)
  const filteredPools = (() => {
    if (!search.trim()) return nodePools
    const q = search.toLowerCase()
    return nodePools.filter(
      p =>
        p.name.toLowerCase().includes(q) ||
        p.type.toLowerCase().includes(q) ||
        p.status.toLowerCase().includes(q),
    )
  })()

  // ── Loading ──────────────────────────────────────────────────────────────
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

  // ── Error ─────────────────────────────────────────────────────────────────
  if (error && showEmptyState) {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground gap-2">
        <AlertTriangle className="w-6 h-6 text-red-400" />
        <p className="text-sm text-red-400">
          {t('openyurt.fetchError', 'Failed to fetch OpenYurt status')}
        </p>
      </div>
    )
  }

  // ── Not installed ─────────────────────────────────────────────────────────
  if (data.health === 'not-installed') {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground gap-2">
        <Radio className="w-6 h-6 text-muted-foreground/50" />
        <p className="text-sm font-medium">
          {t('openyurt.notInstalled', 'OpenYurt not detected')}
        </p>
        <p className="text-xs text-center max-w-xs">
          {t(
            'openyurt.notInstalledHint',
            'No OpenYurt controller pods found. Deploy OpenYurt to enable edge computing features.',
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
      {/* ── Header: health badge + controller pods + last check ── */}
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
              ? t('openyurt.healthy', 'Healthy')
              : t('openyurt.degraded', 'Degraded')}
          </div>
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Server className="w-3 h-3" />
            {controllerPods.ready}/{controllerPods.total}{' '}
            {t('openyurt.controllerPods', 'pods')}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
          <span>{formatRelativeTime(data.lastCheckTime)}</span>
        </div>
      </div>

      {/* ── Stats grid ── */}
      {nodePools.length > 0 && (
        <div className="grid grid-cols-2 @md:grid-cols-4 gap-2">
          <StatTile
            icon={<Server className="w-4 h-4 text-blue-400" />}
            label={t('openyurt.totalNodes', 'Nodes')}
            value={data.totalNodes}
            colorClass="text-blue-400"
            borderClass="border-blue-500/20"
          />
          <StatTile
            icon={<Radio className="w-4 h-4 text-purple-400" />}
            label={t('openyurt.edgePools', 'Edge Pools')}
            value={stats.edgePools}
            colorClass="text-purple-400"
            borderClass="border-purple-500/20"
          />
          <StatTile
            icon={<CheckCircle className="w-4 h-4 text-green-400" />}
            label={t('openyurt.readyPools', 'Ready')}
            value={stats.readyPools}
            colorClass="text-green-400"
            borderClass="border-green-500/20"
          />
          <StatTile
            icon={<Wifi className="w-4 h-4 text-cyan-400" />}
            label={t('openyurt.gateways', 'Gateways')}
            value={stats.connectedGateways}
            colorClass="text-cyan-400"
            borderClass="border-cyan-500/20"
          />
        </div>
      )}

      {/* ── Search ── */}
      {nodePools.length > 0 && (
        <CardSearchInput
          value={search}
          onChange={setSearch}
          placeholder={t('openyurt.searchPlaceholder', 'Search node pools…')}
        />
      )}

      {/* ── Node pools list ── */}
      <div className="flex-1 space-y-2 overflow-y-auto">
        {filteredPools.length > 0 ? (
          filteredPools.map(pool => (
            <NodePoolRow key={pool.name} pool={pool} />
          ))
        ) : nodePools.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-1 py-6">
            <Radio className="w-6 h-6 opacity-40" />
            <p className="text-sm">{t('openyurt.noNodePools', 'Controller running')}</p>
            <p className="text-xs text-center">
              {t(
                'openyurt.noNodePoolsHint',
                'NodePool data requires the OpenYurt CRD API.',
              )}
            </p>
          </div>
        ) : (
          <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">
            {t('openyurt.noSearchResults', 'No node pools match your search.')}
          </div>
        )}
      </div>

      {/* ── Footer: gateways summary ── */}
      {gateways.length > 0 && (
        <div className="pt-2 border-t border-border/50 space-y-1.5">
          <div className="text-xs text-muted-foreground font-medium">
            {t('openyurt.ravenGateways', 'Raven Gateways')}
          </div>
          {gateways.map(gw => (
            <GatewayRow key={gw.name} gw={gw} />
          ))}
        </div>
      )}
    </div>
  )
}
