import { GitBranch, FolderGit, Box, Loader2, RefreshCw } from 'lucide-react'
import type { TFunction } from 'i18next'
import { StatusIndicator } from '../charts/StatusIndicator'
import { PortalTooltip } from '../cards/llmd/shared/PortalTooltip'
import { STATUS_TOOLTIPS } from '../shared/TechnicalAcronym'
import { StatusBadge } from '../ui/StatusBadge'
import { cn } from '../../lib/cn'
import type { GitOpsApp } from './useGitOpsFilters'
import type { ClusterInfo } from '../../hooks/mcp/types'

interface GitOpsFilterToolbarProps {
  clusters: ClusterInfo[]
  selectedCluster: string
  statusFilter: string
  onSelectCluster: (value: string) => void
  onSelectStatus: (value: string) => void
  t: TFunction
}

export function GitOpsFilterToolbar({
  clusters,
  selectedCluster,
  statusFilter,
  onSelectCluster,
  onSelectStatus,
  t,
}: GitOpsFilterToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-4 mb-6">
      <select
        value={selectedCluster}
        onChange={(event) => onSelectCluster(event.target.value)}
        className="px-4 py-2 rounded-lg bg-card/50 border border-border text-foreground text-sm"
      >
        <option value="">{t('gitops.allClusters')}</option>
        {(clusters || []).map((cluster) => {
          const clusterName = cluster.context || cluster.name.split('/').pop()
          return (
            <option key={cluster.name} value={clusterName}>
              {clusterName}
            </option>
          )
        })}
      </select>

      <div className="flex gap-2">
        {([
          { value: 'all', label: t('common.all'), activeClass: 'bg-primary text-primary-foreground' },
          { value: 'synced', label: t('gitops.synced'), activeClass: 'bg-green-500 text-white' },
          { value: 'drifted', label: t('gitops.drifted'), activeClass: 'bg-yellow-500 text-white' },
        ] as const).map(({ value, label, activeClass }) => (
          <button
            key={value}
            onClick={() => onSelectStatus(value)}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              statusFilter === value
                ? activeClass
                : 'bg-card/50 text-muted-foreground hover:text-foreground',
            )}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}

interface GitOpsSyncStatusSummaryProps {
  t: TFunction
}

export function GitOpsSyncStatusSummary({ t }: GitOpsSyncStatusSummaryProps) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-sm font-medium text-muted-foreground">{t('gitops.applications')}</span>
      <StatusBadge color="yellow" size="xs">{t('common:common.demo')}</StatusBadge>
    </div>
  )
}

interface GitOpsApplicationRowProps {
  app: GitOpsApp
  t: TFunction
  getTimeAgo: (timestamp: string | undefined) => string
  onSync: (app: GitOpsApp) => void
  syncStatusColor: (status: string) => string
  syncStatusLabel: (status: string) => string
  healthStatusIndicator: (status: string) => 'healthy' | 'warning' | 'error'
}

export function GitOpsApplicationRow({
  app,
  t,
  getTimeAgo,
  onSync,
  syncStatusColor,
  syncStatusLabel,
  healthStatusIndicator,
}: GitOpsApplicationRowProps) {
  return (
    <div
      className={cn(
        'glass p-4 rounded-lg border-l-4',
        app.syncStatus === 'synced'
          ? 'border-l-green-500'
          : app.syncStatus === 'checking'
            ? 'border-l-blue-500'
            : app.syncStatus === 'out-of-sync'
              ? 'border-l-yellow-500'
              : 'border-l-gray-500',
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <PortalTooltip content={STATUS_TOOLTIPS[healthStatusIndicator(app.healthStatus)]}>
            <span>
              <StatusIndicator status={healthStatusIndicator(app.healthStatus)} size="lg" />
            </span>
          </PortalTooltip>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-semibold text-foreground">{app.name}</span>
              <span className={cn('text-xs px-2 py-0.5 rounded flex items-center gap-1', syncStatusColor(app.syncStatus))}>
                {app.syncStatus === 'checking' && <Loader2 className="w-3 h-3 animate-spin" />}
                {syncStatusLabel(app.syncStatus)}
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
              <span className="flex items-center gap-1" title={t('gitops.kubernetesNamespace')}>
                <Box className="w-3 h-3" />
                <span>{app.namespace}</span>
              </span>
              {app.cluster && (
                <span className="flex items-center gap-1" title={t('gitops.targetCluster')}>
                  <span className="text-muted-foreground/50">→</span>
                  <span>{app.cluster}</span>
                </span>
              )}
              {!app.cluster && app.clusterAmbiguous && (
                <span className="flex items-center gap-1 text-yellow-400" title={t('gitops.targetCluster')}>
                  <span className="text-muted-foreground/50">→</span>
                  <span>{t('gitops.clusterUnresolved')}</span>
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1" title={t('gitops.gitRepoSource')}>
              <GitBranch className="w-3 h-3 text-purple-400" />
              <span className="font-mono">github.com/{app.repoUrl.replace('https://github.com/', '')}</span>
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground" title={t('gitops.pathInRepo')}>
              <FolderGit className="w-3 h-3 text-blue-400" />
              <span className="font-mono">{app.path}</span>
            </div>
          </div>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <div>{t('gitops.lastSync')}: {getTimeAgo(app.lastSyncTime)}</div>
          <div className="mt-1 capitalize">{app.healthStatus}</div>
        </div>
      </div>

      {app.driftDetails && app.driftDetails.length > 0 && (
        <div className="mt-3 p-3 rounded bg-yellow-500/10 border border-yellow-500/20">
          <div className="text-sm font-medium text-yellow-400 mb-2">{t('gitops.driftDetected')}</div>
          <ul className="text-xs text-muted-foreground space-y-1">
            {app.driftDetails.map((detail, index) => (
              <li key={index} className="flex items-center gap-2">
                <span className="text-yellow-400">•</span>
                {detail}
              </li>
            ))}
          </ul>
          <button
            onClick={() => onSync(app)}
            className="mt-2 px-3 py-1 rounded bg-yellow-500/20 text-yellow-400 text-xs hover:bg-yellow-500/30 transition-colors flex items-center gap-1.5"
          >
            <RefreshCw className="w-3 h-3" />
            {t('gitops.syncNow')}
          </button>
        </div>
      )}
    </div>
  )
}

interface GitOpsApplicationsListProps {
  filteredApps: GitOpsApp[]
  t: TFunction
  getTimeAgo: (timestamp: string | undefined) => string
  onSync: (app: GitOpsApp) => void
  syncStatusColor: (status: string) => string
  syncStatusLabel: (status: string) => string
  healthStatusIndicator: (status: string) => 'healthy' | 'warning' | 'error'
}

export function GitOpsApplicationsList({
  filteredApps,
  t,
  getTimeAgo,
  onSync,
  syncStatusColor,
  syncStatusLabel,
  healthStatusIndicator,
}: GitOpsApplicationsListProps) {
  if ((filteredApps || []).length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-6xl mb-4">🔄</div>
        <div className="text-lg text-foreground">{t('gitops.noApplications')}</div>
        <div className="text-sm text-muted-foreground">{t('gitops.configureHint')}</div>
      </div>
    )
  }

  return (
    <div className="space-y-4 mb-6 border-2 border-yellow-500/30 rounded-lg p-4">
      {filteredApps.map((app, index) => (
        <GitOpsApplicationRow
          key={index}
          app={app}
          t={t}
          getTimeAgo={getTimeAgo}
          onSync={onSync}
          syncStatusColor={syncStatusColor}
          syncStatusLabel={syncStatusLabel}
          healthStatusIndicator={healthStatusIndicator}
        />
      ))}
    </div>
  )
}
