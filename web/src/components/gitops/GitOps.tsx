import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { useClusters, useHelmReleases, useOperatorSubscriptions } from '../../hooks/useMCP'
import { useToast } from '../ui/Toast'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { SyncDialog } from './SyncDialog'
import { MS_PER_MINUTE } from '../../lib/constants/time'
import { StatBlockValue } from '../ui/StatsOverview'
import { DashboardPage } from '../../lib/dashboards/DashboardPage'
import { getDefaultCards } from '../../config/dashboards'
import { RotatingTip } from '../ui/RotatingTip'
import {
  GitOpsFilterToolbar,
  GitOpsSyncStatusSummary,
  GitOpsApplicationsList,
} from './GitOps.parts'
import { useGitOpsFilters } from './useGitOpsFilters'

const GITOPS_STORAGE_KEY = 'kubestellar-gitops-dashboard-cards'
const DEFAULT_GITOPS_CARDS = getDefaultCards('gitops')

function getTimeAgo(timestamp: string | undefined, t: TFunction): string {
  if (!timestamp) return t('gitops.unknown')
  const now = new Date()
  const then = new Date(timestamp)
  const diffMs = now.getTime() - then.getTime()
  const diffMins = Math.floor(diffMs / MS_PER_MINUTE)
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours > 0) return t('gitops.hoursAgo', { count: diffHours })
  if (diffMins > 0) return t('gitops.minutesAgo', { count: diffMins })
  return t('gitops.justNow')
}

function syncStatusColor(status: string) {
  switch (status) {
    case 'synced': return 'text-green-400 bg-green-500/20'
    case 'out-of-sync': return 'text-yellow-400 bg-yellow-500/20'
    case 'checking': return 'text-blue-400 bg-blue-500/20'
    case 'error': return 'text-red-400 bg-red-500/20'
    default: return 'text-muted-foreground bg-card'
  }
}

function healthStatusIndicator(status: string): 'healthy' | 'warning' | 'error' {
  switch (status) {
    case 'healthy': return 'healthy'
    case 'progressing': return 'warning'
    case 'unknown': return 'warning'
    default: return 'error'
  }
}

export function GitOps() {
  const { t } = useTranslation(['common', 'cards'])
  const { clusters, deduplicatedClusters, isRefreshing: dataRefreshing, refetch } = useClusters()
  const { releases: helmReleases } = useHelmReleases()
  const { subscriptions: operatorSubs } = useOperatorSubscriptions()
  const { drillToAllHelm, drillToAllOperators } = useDrillDownActions()
  const { showToast } = useToast()

  const {
    filteredApps,
    stats,
    selectedCluster,
    setSelectedCluster,
    statusFilter,
    setStatusFilter,
    syncDialogApp,
    setSyncDialogApp,
    lastUpdated,
    handleRefresh,
    handleSyncComplete,
  } = useGitOpsFilters({
    deduplicatedClusters,
    refetch,
    showToast,
  })

  const cachedHelmCount = useRef(0)

  useEffect(() => {
    if (helmReleases.length > 0) cachedHelmCount.current = helmReleases.length
  }, [helmReleases.length])

  const helmCount = helmReleases.length > 0 ? helmReleases.length : cachedHelmCount.current

  const syncStatusLabel = (status: string) => {
    switch (status) {
      case 'synced': return t('gitops.synced')
      case 'out-of-sync': return t('gitops.outOfSync')
      case 'checking': return t('gitops.checking')
      case 'error': return t('gitops.driftCheckFailed')
      default: return t('gitops.unknown')
    }
  }

  const getStatValue = (blockId: string): StatBlockValue => {
    switch (blockId) {
      case 'total': return { value: stats.total, sublabel: t('gitops.appsConfigured'), onClick: () => drillToAllHelm(), isClickable: stats.total > 0 }
      case 'helm': return { value: helmCount, sublabel: t('gitops.helmReleases'), onClick: () => drillToAllHelm(), isClickable: helmCount > 0 }
      case 'kustomize': return { value: 0, sublabel: t('gitops.kustomizeApps'), isClickable: false }
      case 'operators': return { value: operatorSubs.length, sublabel: t('gitops.operators'), onClick: () => drillToAllOperators(), isClickable: operatorSubs.length > 0 }
      case 'deployed': return { value: stats.synced, sublabel: t('gitops.synced'), onClick: () => drillToAllHelm('synced'), isClickable: stats.synced > 0 }
      case 'failed': return { value: stats.drifted, sublabel: t('gitops.drifted'), onClick: () => drillToAllHelm('drifted'), isClickable: stats.drifted > 0 }
      case 'pending': return { value: stats.checking, sublabel: t('gitops.checking'), isClickable: false }
      case 'other': return { value: stats.healthy, sublabel: t('gitops.healthy'), onClick: () => drillToAllHelm('healthy'), isClickable: stats.healthy > 0 }
      default: return { value: 0 }
    }
  }

  const filtersAndAppsList = (
    <>
      <GitOpsFilterToolbar
        clusters={clusters}
        selectedCluster={selectedCluster}
        statusFilter={statusFilter}
        onSelectCluster={setSelectedCluster}
        onSelectStatus={value => setStatusFilter(value as typeof statusFilter)}
        t={t}
      />

      <GitOpsSyncStatusSummary t={t} />

      <GitOpsApplicationsList
        filteredApps={filteredApps}
        t={t}
        getTimeAgo={(timestamp) => getTimeAgo(timestamp, t)}
        onSync={setSyncDialogApp}
        syncStatusColor={syncStatusColor}
        syncStatusLabel={syncStatusLabel}
        healthStatusIndicator={healthStatusIndicator}
      />
    </>
  )

  return (
    <>
      <DashboardPage
        title={t('gitops.title')}
        subtitle={t('gitops.subtitle')}
        icon="GitBranch"
        rightExtra={<RotatingTip page="gitops" />}
        storageKey={GITOPS_STORAGE_KEY}
        defaultCards={DEFAULT_GITOPS_CARDS}
        statsType="gitops"
        getStatValue={getStatValue}
        onRefresh={handleRefresh}
        isLoading={false}
        isRefreshing={dataRefreshing}
        lastUpdated={lastUpdated}
        hasData={stats.total > 0}
        beforeCards={filtersAndAppsList}
        emptyState={{
          title: t('gitops.dashboardTitle'),
          description: t('gitops.dashboardDescription'),
        }}
        isDemoData={true}
      >
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
      </DashboardPage>

      {syncDialogApp && (
        <SyncDialog
          isOpen={!!syncDialogApp}
          onClose={() => setSyncDialogApp(null)}
          appName={syncDialogApp.name}
          namespace={syncDialogApp.namespace}
          cluster={syncDialogApp.cluster}
          repoUrl={syncDialogApp.repoUrl}
          path={syncDialogApp.path}
          onSyncComplete={handleSyncComplete}
        />
      )}
    </>
  )
}
