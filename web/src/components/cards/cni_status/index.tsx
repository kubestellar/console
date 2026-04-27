/**
 * CNI Status Card
 *
 * The Container Network Interface (CNI) plugin provides pod networking inside
 * a Kubernetes cluster. This card surfaces the active plugin, node readiness
 * for CNI, the pod network CIDR, and NetworkPolicy coverage across services.
 *
 * Follows the spiffe_status / linkerd_status pattern for structure and
 * styling.
 *
 * This is scaffolding — the card renders via demo fallback today. When a
 * real CNI inspection bridge lands (`/api/cni/status`), the hook's fetcher
 * will pick up live data automatically with no component changes.
 */

import {
  AlertTriangle,
  CheckCircle,
  Cpu,
  Network,
  RefreshCw,
  Shield,
  Share2,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { MetricTile } from '../../../lib/cards/CardComponents'
import { Skeleton, SkeletonList, SkeletonStats } from '../../ui/Skeleton'
import { useCachedCni } from '../../../hooks/useCachedCni'
import type { CniNodeState, CniNodeStatus } from '../../../lib/demo/cni'
import { formatTimeAgo } from '../../../lib/formatters'

// ---------------------------------------------------------------------------
// Named constants (no magic numbers)
// ---------------------------------------------------------------------------

const SKELETON_TITLE_WIDTH = 140
const SKELETON_TITLE_HEIGHT = 28
const SKELETON_BADGE_WIDTH = 90
const SKELETON_BADGE_HEIGHT = 20
const SKELETON_LIST_ITEMS = 5

const MAX_NODES_DISPLAYED = 6

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NODE_STATE_CLASS_MAP: Record<CniNodeState, string> = {
  'ready': 'bg-green-500/20 text-green-400',
  'not-ready': 'bg-red-500/20 text-red-400',
  'unknown': 'bg-yellow-500/20 text-yellow-400',
}

function nodeStateClass(state: CniNodeState): string {
  return NODE_STATE_CLASS_MAP[state] ?? NODE_STATE_CLASS_MAP.unknown
}

// ---------------------------------------------------------------------------
// Subsections
// ---------------------------------------------------------------------------

function NodeRow({ node }: { node: CniNodeStatus }) {
  return (
    <div className="rounded-md bg-secondary/30 px-3 py-2 space-y-1">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex items-center gap-1.5">
          <Cpu className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          <span className="text-xs font-medium text-foreground truncate font-mono">
            {node.node}
          </span>
        </div>
        <span
          className={`text-[11px] px-1.5 py-0.5 rounded-full shrink-0 ${nodeStateClass(
            node.state,
          )}`}
        >
          {node.state}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
        <span className="truncate font-mono">{node.podCidr}</span>
        <span className="ml-auto shrink-0">
          {node.plugin} {node.pluginVersion}
        </span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function CniStatus() {
  const { t } = useTranslation('cards')
  const { data, isRefreshing, error, showSkeleton, showEmptyState } = useCachedCni()

  const isHealthy = data.health === 'healthy'
  const nodes = data.nodes ?? []
  const displayedNodes = nodes.slice(0, MAX_NODES_DISPLAYED)

  if (showSkeleton) {
    return (
      <div className="h-full flex flex-col min-h-card gap-4">
        <div className="flex items-center justify-between">
          <Skeleton variant="rounded" width={SKELETON_TITLE_WIDTH} height={SKELETON_TITLE_HEIGHT} />
          <Skeleton variant="rounded" width={SKELETON_BADGE_WIDTH} height={SKELETON_BADGE_HEIGHT} />
        </div>
        <SkeletonStats className="grid-cols-2 @md:grid-cols-4" />
        <SkeletonList items={SKELETON_LIST_ITEMS} className="flex-1" />
      </div>
    )
  }

  if (error && showEmptyState) {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground gap-2">
        <AlertTriangle className="w-6 h-6 text-red-400" />
        <p className="text-sm text-red-400">
          {t('cniStatus.fetchError', 'Unable to fetch CNI status')}
        </p>
      </div>
    )
  }

  if (data.health === 'not-installed') {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground gap-2">
        <Network className="w-6 h-6 text-muted-foreground/50" />
        <p className="text-sm font-medium">
          {t('cniStatus.notInstalled', 'CNI plugin not detected')}
        </p>
        <p className="text-xs text-center max-w-xs">
          {t(
            'cniStatus.notInstalledHint',
            'No CNI metadata reachable from the connected clusters.',
          )}
        </p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-card content-loaded gap-4 overflow-hidden">
      {/* Header — health pill + freshness */}
      <div className="flex items-center justify-between gap-2">
        <div
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${
            isHealthy
              ? 'bg-green-500/15 text-green-400'
              : 'bg-yellow-500/15 text-yellow-400'
          }`}
        >
          {isHealthy ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          {isHealthy
            ? t('cniStatus.healthy', 'Healthy')
            : t('cniStatus.degraded', 'Degraded')}
        </div>

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
          <span>{formatTimeAgo(data.lastCheckTime)}</span>
        </div>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 @md:grid-cols-4 gap-2">
        <MetricTile
          label={t('cniStatus.plugin', 'Plugin')}
          value={data.summary.activePlugin}
          colorClass="text-cyan-400"
          icon={<Network className="w-4 h-4 text-cyan-400" />}
        />
        <MetricTile
          label={t('cniStatus.nodesReady', 'Nodes Ready')}
          value={`${data.summary.nodesCniReady}/${data.summary.nodeCount}`}
          colorClass="text-green-400"
          icon={<Cpu className="w-4 h-4 text-green-400" />}
        />
        <MetricTile
          label={t('cniStatus.policies', 'NetworkPolicies')}
          value={`${data.summary.networkPolicyCount}`}
          colorClass="text-purple-400"
          icon={<Shield className="w-4 h-4 text-purple-400" />}
        />
        <MetricTile
          label={t('cniStatus.servicesWithPolicy', 'Svcs w/ Policy')}
          value={`${data.summary.servicesWithNetworkPolicy}/${data.stats.totalServices}`}
          colorClass="text-yellow-400"
          icon={<Share2 className="w-4 h-4 text-yellow-400" />}
        />
      </div>

      {/* Pod CIDR + node list */}
      <div className="space-y-3 overflow-y-auto scrollbar-thin pr-0.5">
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <Network className="w-4 h-4 text-cyan-400" />
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('cniStatus.sectionPodCidr', 'Pod network CIDR')}
            </h4>
            <span className="text-[11px] text-muted-foreground ml-auto">
              {t('cniStatus.version', 'version')}:{' '}
              <span className="text-foreground">{data.summary.pluginVersion}</span>
            </span>
          </div>
          <div className="rounded-md bg-secondary/30 px-3 py-2 text-xs font-mono text-foreground">
            {data.summary.podNetworkCidr || t('cniStatus.unknownCidr', 'unknown')}
          </div>
        </section>

        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-cyan-400" />
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('cniStatus.sectionNodes', 'Nodes')}
            </h4>
            <span className="text-[11px] text-muted-foreground ml-auto">
              {nodes.length}
            </span>
          </div>

          {nodes.length === 0 ? (
            <div className="rounded-md bg-secondary/20 border border-border/40 px-3 py-2 text-xs text-muted-foreground">
              {t('cniStatus.noNodes', 'No nodes reporting CNI status')}
            </div>
          ) : (
            <div className="space-y-1.5">
              {(displayedNodes ?? []).map(node => (
                <NodeRow
                  key={`${node.cluster}:${node.node}`}
                  node={node}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

export default CniStatus
