/* eslint-disable react-refresh/only-export-components */
import type { TFunction } from 'i18next'
import { RefreshCw, GitBranch, FolderGit, Box, Loader2 } from 'lucide-react'
import { StatusIndicator } from '../charts/StatusIndicator'
import { PortalTooltip } from '../cards/llmd/shared/PortalTooltip'
import { STATUS_TOOLTIPS } from '../shared/TechnicalAcronym'
import { StatusBadge } from '../ui/StatusBadge'
import type { GitOpsApp } from './GitOps.types'

interface GitOpsFiltersProps {
  clusters: Array<{ name: string; context?: string }>
  selectedCluster: string
  statusFilter: string
  onClusterChange: (cluster: string) => void
  onStatusFilterChange: (filter: string) => void
  t: TFunction
}

export function GitOpsFilters({ clusters, selectedCluster, statusFilter, onClusterChange, onStatusFilterChange, t }: GitOpsFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-4 mb-6">
      <select
        value={selectedCluster}
        onChange={(e) => onClusterChange(e.target.value)}
        className="px-4 py-2 rounded-lg bg-card/50 border border-border text-foreground text-sm"
      >
        <option value="">{t('gitops.allClusters')}</option>
        {clusters.map((cluster) => (
          <option key={cluster.name} value={cluster.context || cluster.name.split('/').pop()}>
            {cluster.context || cluster.name.split('/').pop()}
          </option>
        ))}
      </select>

      <div className="flex gap-2">
        {([
          { value: 'all', label: t('common.all'), activeClass: 'bg-primary text-primary-foreground' },
          { value: 'synced', label: t('gitops.synced'), activeClass: 'bg-green-500 text-white' },
          { value: 'drifted', label: t('gitops.drifted'), activeClass: 'bg-yellow-500 text-white' },
        ] as const).map(({ value, label, activeClass }) => (
          <button key={value} onClick={() => onStatusFilterChange(value)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              statusFilter === value ? activeClass : 'bg-card/50 text-muted-foreground hover:text-foreground'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}

interface GitOpsAppRowProps {
  app: GitOpsApp
  syncStatusColor: (status: string) => string
  syncStatusLabel: (status: string) => string
  healthStatusIndicator: (status: string) => 'healthy' | 'warning' | 'error'
  onSync: (app: GitOpsApp) => void
  t: TFunction
}

export function GitOpsAppRow({ app, syncStatusColor, syncStatusLabel, healthStatusIndicator, onSync, t }: GitOpsAppRowProps) {
  return (
    <div
      className={`glass p-4 rounded-lg border-l-4 ${
        app.syncStatus === 'synced' ? 'border-l-green-500' :
        app.syncStatus === 'checking' ? 'border-l-blue-500' :
        app.syncStatus === 'out-of-sync' ? 'border-l-yellow-500' : 'border-l-gray-500'
      }`}
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
              <span className={`text-xs px-2 py-0.5 rounded flex items-center gap-1 ${syncStatusColor(app.syncStatus)}`}>
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
          <div>{t('gitops.lastSync')}: {app.lastSyncTimeAgo}</div>
          <div className="mt-1 capitalize">{app.healthStatus}</div>
        </div>
      </div>

      {app.driftDetails && app.driftDetails.length > 0 && (
        <div className="mt-3 p-3 rounded bg-yellow-500/10 border border-yellow-500/20">
          <div className="text-sm font-medium text-yellow-400 mb-2">{t('gitops.driftDetected')}</div>
          <ul className="text-xs text-muted-foreground space-y-1">
            {app.driftDetails.map((detail, j) => (
              <li key={j} className="flex items-center gap-2">
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

interface GitOpsAppsListProps {
  filteredApps: GitOpsApp[]
  syncStatusColor: (status: string) => string
  syncStatusLabel: (status: string) => string
  healthStatusIndicator: (status: string) => 'healthy' | 'warning' | 'error'
  onSync: (app: GitOpsApp) => void
  t: TFunction
}

export function GitOpsAppsList({ filteredApps, syncStatusColor, syncStatusLabel, healthStatusIndicator, onSync, t }: GitOpsAppsListProps) {
  if (filteredApps.length === 0) {
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
      {filteredApps.map((app, i) => (
        <GitOpsAppRow
          key={i}
          app={app}
          syncStatusColor={syncStatusColor}
          syncStatusLabel={syncStatusLabel}
          healthStatusIndicator={healthStatusIndicator}
          onSync={onSync}
          t={t}
        />
      ))}
    </div>
  )
}

interface GitOpsFiltersAndListProps {
  clusters: Array<{ name: string; context?: string }>
  selectedCluster: string
  statusFilter: string
  filteredApps: GitOpsApp[]
  syncStatusColor: (status: string) => string
  syncStatusLabel: (status: string) => string
  healthStatusIndicator: (status: string) => 'healthy' | 'warning' | 'error'
  onClusterChange: (cluster: string) => void
  onStatusFilterChange: (filter: string) => void
  onSync: (app: GitOpsApp) => void
  t: TFunction
}

export function GitOpsFiltersAndList({ clusters, selectedCluster, statusFilter, filteredApps, syncStatusColor, syncStatusLabel, healthStatusIndicator, onClusterChange, onStatusFilterChange, onSync, t }: GitOpsFiltersAndListProps) {
  return (
    <>
      <GitOpsFilters
        clusters={clusters}
        selectedCluster={selectedCluster}
        statusFilter={statusFilter}
        onClusterChange={onClusterChange}
        onStatusFilterChange={onStatusFilterChange}
        t={t}
      />
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm font-medium text-muted-foreground">{t('gitops.applications')}</span>
        <StatusBadge color="yellow" size="xs">{t('common:common.demo')}</StatusBadge>
      </div>
      <GitOpsAppsList
        filteredApps={filteredApps}
        syncStatusColor={syncStatusColor}
        syncStatusLabel={syncStatusLabel}
        healthStatusIndicator={healthStatusIndicator}
        onSync={onSync}
        t={t}
      />
    </>
  )
}

interface GitOpsIntegrationInfoProps {
  t: TFunction
}

export function GitOpsIntegrationInfo({ t }: GitOpsIntegrationInfoProps) {
  return (
    <div className="mt-8 p-4 rounded-lg bg-card/30 border border-border">
      <h3 className="text-lg font-semibold text-foreground mb-3">{t('gitops.integrationTitle')}</h3>
      <p className="text-sm text-muted-foreground mb-3">
        {t('gitops.integrationDescription')}
      </p>
      <div className="flex gap-2">
        {([
          { key: 'argocd', label: t('gitops.configureArgoCD') },
          { key: 'flux', label: t('gitops.configureFlux') },
        ] as const).map(({ key, label }) => (
          <button key={key} className="px-4 py-2 rounded-lg bg-card/50 border border-border text-sm text-foreground hover:bg-card transition-colors">
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
