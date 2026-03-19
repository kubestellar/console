import { useMemo } from 'react'
import { CheckCircle2, Clock, XCircle, HelpCircle, AlertCircle, ExternalLink, Server } from 'lucide-react'
import { ClusterBadge } from '../ui/ClusterBadge'
import { CardSearchInput, CardControlsRow, CardPaginationFooter, CardAIActions } from '../../lib/cards/CardComponents'
import { useCardData, commonComparators } from '../../lib/cards/cardHooks'
import { Skeleton } from '../ui/Skeleton'
import { K8S_DOCS } from '../../config/externalApis'
import type { ServiceExport, ServiceExportStatus } from '../../types/mcs'
import { useCardLoadingState } from './CardDataContext'
import { useTranslation } from 'react-i18next'
import { useServiceExports } from '../../hooks/useServiceExports'

const getStatusIcon = (status: ServiceExportStatus) => {
  switch (status) {
    case 'Ready':
      return CheckCircle2
    case 'Pending':
      return Clock
    case 'Failed':
      return XCircle
    default:
      return HelpCircle
  }
}

const getStatusColors = (status: ServiceExportStatus) => {
  switch (status) {
    case 'Ready':
      return { bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500/20', iconBg: 'bg-green-500/20' }
    case 'Pending':
      return { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/20', iconBg: 'bg-yellow-500/20' }
    case 'Failed':
      return { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/20', iconBg: 'bg-red-500/20' }
    default:
      return { bg: 'bg-gray-500/20 dark:bg-gray-400/20', text: 'text-muted-foreground', border: 'border-gray-500/20', iconBg: 'bg-gray-500/20 dark:bg-gray-400/20' }
  }
}

type SortByOption = 'name' | 'status' | 'cluster'

const SORT_OPTIONS_KEYS = [
  { value: 'name' as const, labelKey: 'common:common.name' as const },
  { value: 'status' as const, labelKey: 'common:common.status' as const },
  { value: 'cluster' as const, labelKey: 'common:common.cluster' as const },
]

const statusOrder: Record<string, number> = { Failed: 0, Pending: 1, Ready: 2 }

const EXPORT_SORT_COMPARATORS = {
  name: commonComparators.string<ServiceExport>('name'),
  status: (a: ServiceExport, b: ServiceExport) => (statusOrder[a.status] || 3) - (statusOrder[b.status] || 3),
  cluster: commonComparators.string<ServiceExport>('cluster'),
}

interface ServiceExportsProps {
  config?: Record<string, unknown>
}

export function ServiceExports({ config: _config }: ServiceExportsProps) {
  const { t } = useTranslation(['cards', 'common'])
  const { exports: allExports, isLoading, isDemoData } = useServiceExports()
  const SORT_OPTIONS = useMemo(() =>
    SORT_OPTIONS_KEYS.map(opt => ({ value: opt.value, label: String(t(opt.labelKey)) })),
    [t]
  )

  // Report loading state to CardWrapper for skeleton/refresh behavior
  const { showSkeleton } = useCardLoadingState({
    isLoading,
    hasAnyData: allExports.length > 0,
    isDemoData,
  })

  const {
    items: filteredExports,
    totalItems,
    currentPage,
    totalPages,
    itemsPerPage,
    goToPage,
    needsPagination,
    setItemsPerPage,
    filters: {
      search: localSearch,
      setSearch: setLocalSearch,
      localClusterFilter,
      toggleClusterFilter,
      clearClusterFilter,
      availableClusters,
      showClusterFilter,
      setShowClusterFilter,
      clusterFilterRef,
    },
    sorting: {
      sortBy,
      setSortBy,
      sortDirection,
      setSortDirection,
    },
    containerRef,
    containerStyle,
  } = useCardData<ServiceExport, SortByOption>(allExports, {
    filter: {
      searchFields: ['name', 'namespace', 'cluster', 'serviceName', 'status'],
      clusterField: 'cluster',
      storageKey: 'service-exports',
    },
    sort: {
      defaultField: 'status',
      defaultDirection: 'asc',
      comparators: EXPORT_SORT_COMPARATORS,
    },
    defaultLimit: 5,
  })

  // Compute stats from the data
  const readyCount = allExports.filter(e => e.status === 'Ready').length
  const pendingCount = allExports.filter(e => e.status === 'Pending').length

  // Show skeleton while loading
  if (showSkeleton) {
    return (
      <div className="h-full flex flex-col min-h-card">
        <div className="flex items-center justify-between mb-3">
          <Skeleton variant="text" width={120} height={20} />
          <Skeleton variant="rounded" width={80} height={28} />
        </div>
        <div className="space-y-2">
          <Skeleton variant="rounded" height={50} />
          <Skeleton variant="rounded" height={50} />
          <Skeleton variant="rounded" height={50} />
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-card">
      {/* Header with controls */}
      <div className="flex items-center justify-between mb-2 flex-shrink-0">
        <div className="flex items-center gap-2">
          <a
            href={K8S_DOCS.mcsApi}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1 hover:bg-secondary rounded transition-colors text-muted-foreground hover:text-purple-400"
            title={t('serviceExports.mcsApiDocs')}
          >
            <ExternalLink className="w-4 h-4" />
          </a>
          <span className="text-sm font-medium text-muted-foreground">
            {t('serviceExports.nExports', { count: totalItems })}
          </span>
          {localClusterFilter.length > 0 && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground bg-secondary/50 px-1.5 py-0.5 rounded">
              <Server className="w-3 h-3" />
              {localClusterFilter.length}/{availableClusters.length}
            </span>
          )}
        </div>
        <CardControlsRow
          clusterFilter={{
            availableClusters,
            selectedClusters: localClusterFilter,
            onToggle: toggleClusterFilter,
            onClear: clearClusterFilter,
            isOpen: showClusterFilter,
            setIsOpen: setShowClusterFilter,
            containerRef: clusterFilterRef,
            minClusters: 1,
          }}
          cardControls={{
            limit: itemsPerPage,
            onLimitChange: setItemsPerPage,
            sortBy,
            sortOptions: SORT_OPTIONS,
            onSortChange: (v) => setSortBy(v as SortByOption),
            sortDirection,
            onSortDirectionChange: setSortDirection,
          }}
        />
      </div>

      {/* MCS Integration Notice */}
      <div className="flex items-start gap-2 p-2 mb-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs">
        <AlertCircle className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-blue-400 font-medium">{t('serviceExports.mcsTitle')}</p>
          <p className="text-muted-foreground">
            {t('serviceExports.mcsDesc')}{' '}
            <a
              href={K8S_DOCS.mcsApiInstall}
              target="_blank"
              rel="noopener noreferrer"
              className="text-purple-400 hover:underline"
            >
              {t('serviceExports.installGuide')}
            </a>
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-center">
          <p className="text-2xs text-blue-400">{t('serviceExports.exports')}</p>
          <p className="text-lg font-bold text-foreground">{totalItems}</p>
        </div>
        <div className="p-2 rounded-lg bg-green-500/10 border border-green-500/20 text-center">
          <p className="text-2xs text-green-400">{t('common:common.ready')}</p>
          <p className="text-lg font-bold text-foreground">{readyCount}</p>
        </div>
        <div className="p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-center">
          <p className="text-2xs text-yellow-400">{t('common:common.pending')}</p>
          <p className="text-lg font-bold text-foreground">{pendingCount}</p>
        </div>
      </div>

      {/* Local Search */}
      <CardSearchInput
        value={localSearch}
        onChange={setLocalSearch}
        placeholder={t('serviceExports.searchExports')}
        className="mb-3"
      />

      {/* Exports list */}
      <div ref={containerRef} className="flex-1 overflow-y-auto space-y-2" style={containerStyle}>
        {filteredExports.map((exp, idx) => {
          const Icon = getStatusIcon(exp.status)
          const colors = getStatusColors(exp.status)
          return (
            <div
              key={`${exp.cluster}-${exp.namespace}-${exp.name}-${idx}`}
              className={`p-2.5 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors`}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <Icon className={`w-4 h-4 ${colors.text}`} />
                  <span className="text-sm font-medium text-foreground truncate">{exp.name}</span>
                  <span className={`px-1.5 py-0.5 rounded text-2xs ${colors.bg} ${colors.text}`}>
                    {exp.status}
                  </span>
                </div>
                {exp.targetClusters && exp.targetClusters.length > 0 && (
                  <span className="text-xs text-muted-foreground" title={(exp.targetClusters || []).join(', ')}>
                    → {t('common:common.nClusters', { count: exp.targetClusters.length })}
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <ClusterBadge cluster={exp.cluster} />
                  <span className="text-muted-foreground">{exp.namespace}</span>
                </div>
                {exp.message && (
                  <span className="text-muted-foreground truncate max-w-[150px]" title={exp.message}>
                    {exp.message}
                  </span>
                )}
              </div>
              {(exp.status === 'Pending' || exp.status === 'Failed') && (
                <CardAIActions
                  resource={{ kind: 'ServiceExport', name: exp.name, namespace: exp.namespace, cluster: exp.cluster, status: exp.status }}
                  issues={[{ name: `Export ${exp.status}`, message: exp.message || `ServiceExport "${exp.name}" is ${exp.status}` }]}
                  className="mt-1"
                />
              )}
            </div>
          )
        })}
      </div>

      {/* Pagination */}
      <CardPaginationFooter
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={totalItems}
        itemsPerPage={typeof itemsPerPage === 'number' ? itemsPerPage : 10}
        onPageChange={goToPage}
        needsPagination={needsPagination && itemsPerPage !== 'unlimited'}
      />

      {/* Quick install command */}
      <div className="mt-3 pt-3 border-t border-border/50">
        <p className="text-2xs text-muted-foreground font-medium mb-2">{t('serviceExports.quickInstall')}</p>
        <code className="block p-2 rounded bg-secondary text-2xs text-muted-foreground font-mono overflow-x-auto whitespace-nowrap">
          {K8S_DOCS.mcsApiInstallCommand}
        </code>
      </div>

      {/* Footer links */}
      <div className="flex items-center justify-center gap-3 pt-2 mt-2 border-t border-border/50 text-2xs">
        <a
          href={K8S_DOCS.mcsApi}
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:text-purple-400 transition-colors"
        >
          {t('serviceExports.mcsApiDocsLink')}
        </a>
        <span className="text-muted-foreground/30">•</span>
        <a
          href={K8S_DOCS.gammaInitiative}
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:text-purple-400 transition-colors"
        >
          {t('serviceExports.gammaInitiative')}
        </a>
      </div>
    </div>
  )
}
