import { useState } from 'react'
import { StatTile } from '../shared/StatTile'
import {
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Globe,
  Server,
  XCircle,
  HelpCircle,
  GitBranch } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Skeleton, SkeletonStats, SkeletonList } from '../../ui/Skeleton'
import { CardSearchInput } from '../../../lib/cards/CardComponents'
import { useKarmadaStatus } from './useKarmadaStatus'
import type { KarmadaMemberCluster, KarmadaClusterStatus, KarmadaBindingStatus, KarmadaResourceBinding } from './demoData'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CLUSTER_STATUS_CONFIG: Record<
  KarmadaClusterStatus,
  { color: string; icon: React.ReactNode }
> = {
  Ready: {
    color: 'text-green-400',
    icon: <CheckCircle className="w-3.5 h-3.5 text-green-400" /> },
  NotReady: {
    color: 'text-red-400',
    icon: <XCircle className="w-3.5 h-3.5 text-red-400" /> },
  Unknown: {
    color: 'text-yellow-400',
    icon: <HelpCircle className="w-3.5 h-3.5 text-yellow-400" /> } }

/** Map ResourceBinding status to a visual severity color */
function bindingStatusColor(status: KarmadaBindingStatus): string {
  switch (status) {
    case 'Bound': return 'text-green-400'
    case 'Scheduled':
    case 'FullySchedulable': return 'text-blue-400'
    case 'Binding': return 'text-yellow-400'
    case 'Failed': return 'text-red-400'
    default: return 'text-muted-foreground'
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function MemberClusterRow({ cluster }: { cluster: KarmadaMemberCluster }) {
  const statusCfg = CLUSTER_STATUS_CONFIG[cluster.status]
  return (
    <div className="rounded-md bg-muted/30 px-3 py-2 space-y-1">
      {/* Row 1: name + status */}
      <div className="flex flex-wrap items-center justify-between gap-y-2 gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {statusCfg.icon}
          <span className="text-xs font-medium truncate">{cluster.name}</span>
        </div>
        <span className={`text-xs shrink-0 ${statusCfg.color}`}>{cluster.status}</span>
      </div>
      {/* Row 2: k8s version + node count */}
      <div className="flex flex-wrap items-center justify-between gap-y-2 text-xs text-muted-foreground">
        <span className="truncate">{cluster.kubernetesVersion}</span>
        <span className="shrink-0 ml-2">
          {cluster.nodeCount} nodes · {cluster.syncedResources} synced
        </span>
      </div>
    </div>
  )
}

function ResourceBindingRow({ binding }: { binding: KarmadaResourceBinding }) {
  const color = bindingStatusColor(binding.status)
  const clusters = (binding.boundClusters || []).join(', ') || '—'
  return (
    <div className="rounded-md bg-muted/30 px-3 py-2 space-y-1">
      <div className="flex flex-wrap items-center justify-between gap-y-2 gap-2">
        <span className="text-xs font-medium truncate">{binding.name}</span>
        <span className={`text-xs shrink-0 ${color}`}>{binding.status}</span>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-y-2 text-xs text-muted-foreground">
        <span className="shrink-0">{binding.resourceKind}</span>
        <span className="truncate ml-2 text-right">{clusters}</span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function KarmadaStatus() {
  const { t } = useTranslation('cards')
  const { data, isRefreshing, error, showSkeleton, showEmptyState } = useKarmadaStatus()
  const [search, setSearch] = useState('')
  /** Toggle between 'clusters' and 'bindings' sub-view */
  const [view, setView] = useState<'clusters' | 'bindings'>('clusters')

  // Guard arrays
  const memberClusters = data.memberClusters || []
  const resourceBindings = data.resourceBindings || []
  const propagationPolicies = data.propagationPolicies || []
  const controllerPods = data.controllerPods || { ready: 0, total: 0 }

  // Derived stats
  const stats = {
    totalClusters: memberClusters.length,
    readyClusters: memberClusters.filter(c => c.status === 'Ready').length,
    failedBindings: resourceBindings.filter(b => b.status === 'Failed').length,
    totalPolicies: propagationPolicies.length + data.clusterPoliciesCount }

  // Filtered lists
  const filteredClusters = (() => {
    if (!search.trim()) return memberClusters
    const q = search.toLowerCase()
    return memberClusters.filter(
      c => c.name.toLowerCase().includes(q) || c.kubernetesVersion.toLowerCase().includes(q),
    )
  })()

  const filteredBindings = (() => {
    if (!search.trim()) return resourceBindings
    const q = search.toLowerCase()
    return resourceBindings.filter(
      b => b.name.toLowerCase().includes(q) ||
        b.resourceKind.toLowerCase().includes(q) ||
        (b.boundClusters || []).some(c => c.toLowerCase().includes(q)),
    )
  })()

  // ── Loading ───────────────────────────────────────────────────────────────
  if (showSkeleton) {
    return (
      <div className="h-full flex flex-col min-h-card gap-4">
        <div className="flex flex-wrap items-center justify-between gap-y-2">
          <Skeleton variant="rounded" width={140} height={28} />
          <Skeleton variant="rounded" width={80} height={20} />
        </div>
        <SkeletonStats className="grid-cols-2 @md:grid-cols-4" />
        <Skeleton variant="rounded" height={32} />
        <SkeletonList items={4} className="flex-1" />
      </div>
    )
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (error && showEmptyState) {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground gap-2">
        <AlertTriangle className="w-6 h-6 text-red-400" />
        <p className="text-sm text-red-400">
          {t('karmada.fetchError', 'Failed to fetch Karmada status')}
        </p>
      </div>
    )
  }

  // ── Not installed ─────────────────────────────────────────────────────────
  if (data.health === 'not-installed') {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground gap-2">
        <Globe className="w-6 h-6 text-muted-foreground/50" />
        <p className="text-sm font-medium">
          {t('karmada.notInstalled', 'Karmada not detected')}
        </p>
        <p className="text-xs text-center max-w-xs">
          {t(
            'karmada.notInstalledHint',
            'No Karmada controller pods found. Deploy Karmada to enable multi-cluster resource propagation.',
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
      {/* ── Header ── */}
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
              ? t('karmada.healthy', 'Healthy')
              : t('karmada.degraded', 'Degraded')}
          </div>
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Server className="w-3 h-3" />
            {controllerPods.ready}/{controllerPods.total}{' '}
            {t('karmada.controllerPods', 'pods')}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
        </div>
      </div>

      {/* ── Stats grid ── */}
      <div className="grid grid-cols-2 @md:grid-cols-4 gap-2">
        <StatTile
          icon={<Globe className="w-4 h-4 text-blue-400" />}
          label={t('karmada.clusters', 'Clusters')}
          value={stats.totalClusters}
          colorClass="text-blue-400"
          borderClass="border-blue-500/20"
        />
        <StatTile
          icon={<CheckCircle className="w-4 h-4 text-green-400" />}
          label={t('karmada.ready', 'Ready')}
          value={stats.readyClusters}
          colorClass="text-green-400"
          borderClass="border-green-500/20"
        />
        <StatTile
          icon={<AlertTriangle className="w-4 h-4 text-red-400" />}
          label={t('karmada.failed', 'Failed')}
          value={stats.failedBindings}
          colorClass="text-red-400"
          borderClass="border-red-500/20"
        />
        <StatTile
          icon={<GitBranch className="w-4 h-4 text-purple-400" />}
          label={t('karmada.policies', 'Policies')}
          value={stats.totalPolicies}
          colorClass="text-purple-400"
          borderClass="border-purple-500/20"
        />
      </div>

      {/* ── View toggle ── */}
      <div className="flex gap-1 bg-muted/20 rounded-lg p-0.5">
        <button
          id="karmada-clusters-tab"
          className={`flex-1 text-xs rounded-md py-1 transition-colors ${
            view === 'clusters'
              ? 'bg-background text-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setView('clusters')}
        >
          {t('karmada.memberClusters', 'Member Clusters')}
        </button>
        <button
          id="karmada-bindings-tab"
          className={`flex-1 text-xs rounded-md py-1 transition-colors ${
            view === 'bindings'
              ? 'bg-background text-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setView('bindings')}
        >
          {t('karmada.resourceBindings', 'Resource Bindings')}
        </button>
      </div>

      {/* ── Search ── */}
      <CardSearchInput
        value={search}
        onChange={setSearch}
        placeholder={
          view === 'clusters'
            ? t('karmada.searchClusters', 'Search clusters…')
            : t('karmada.searchBindings', 'Search bindings…')
        }
      />

      {/* ── List ── */}
      <div className="flex-1 space-y-2 overflow-y-auto">
        {view === 'clusters' ? (
          filteredClusters.length > 0 ? (
            filteredClusters.map(c => (
              <MemberClusterRow key={c.name} cluster={c} />
            ))
          ) : memberClusters.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-1 py-6">
              <Globe className="w-6 h-6 opacity-40" />
              <p className="text-sm">{t('karmada.noMemberClusters', 'Controller running')}</p>
              <p className="text-xs text-center">
                {t('karmada.noMemberClustersHint', 'Join member clusters to propagate resources.')}
              </p>
            </div>
          ) : (
            <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">
              {t('karmada.noSearchResults', 'No clusters match your search.')}
            </div>
          )
        ) : (
          filteredBindings.length > 0 ? (
            filteredBindings.map(b => (
              <ResourceBindingRow key={`${b.namespace}/${b.name}`} binding={b} />
            ))
          ) : resourceBindings.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-1 py-6">
              <GitBranch className="w-6 h-6 opacity-40" />
              <p className="text-sm">{t('karmada.noBindings', 'No resource bindings')}</p>
              <p className="text-xs text-center">
                {t('karmada.noBindingsHint', 'Create PropagationPolicies to propagate resources to member clusters.')}
              </p>
            </div>
          ) : (
            <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">
              {t('karmada.noSearchResults', 'No clusters match your search.')}
            </div>
          )
        )}
      </div>

      {/* ── Footer ── */}
      {(data.overridePoliciesCount > 0 || data.clusterPoliciesCount > 0) && (
        <div className="pt-2 border-t border-border/50 text-xs text-muted-foreground flex gap-3">
          {data.clusterPoliciesCount > 0 && (
            <span>+{data.clusterPoliciesCount} {t('karmada.clusterPolicies', 'ClusterPolicies')}</span>
          )}
          {data.overridePoliciesCount > 0 && (
            <span>+{data.overridePoliciesCount} {t('karmada.overridePolicies', 'OverridePolicies')}</span>
          )}
        </div>
      )}
    </div>
  )
}
