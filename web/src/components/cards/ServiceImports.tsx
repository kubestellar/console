import { useMemo } from 'react'
import { CheckCircle2, XCircle, AlertCircle, ExternalLink, Globe } from 'lucide-react'
import { ClusterBadge } from '../ui/ClusterBadge'
import { useCardData, commonComparators } from '../../lib/cards/cardHooks'
import { CardSearchInput, CardControlsRow, CardPaginationFooter } from '../../lib/cards/CardComponents'
import { Skeleton } from '../ui/Skeleton'
import { K8S_DOCS } from '../../config/externalApis'
import type { ServiceImport, ServiceImportType } from '../../types/mcs'
import { useCardLoadingState } from './CardDataContext'
import { DynamicCardErrorBoundary } from './DynamicCardErrorBoundary'
import { useTranslation } from 'react-i18next'

// Demo data for MCS ServiceImports
const DEMO_IMPORTS: ServiceImport[] = [
  {
    name: 'api-gateway',
    namespace: 'production',
    cluster: 'us-west-2',
    sourceCluster: 'us-east-1',
    type: 'ClusterSetIP',
    dnsName: 'api-gateway.production.svc.clusterset.local',
    ports: [{ name: 'http', protocol: 'TCP', port: 8080 }],
    endpoints: 3,
    createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    name: 'auth-service',
    namespace: 'production',
    cluster: 'eu-central-1',
    sourceCluster: 'us-east-1',
    type: 'ClusterSetIP',
    dnsName: 'auth-service.production.svc.clusterset.local',
    ports: [{ name: 'grpc', protocol: 'TCP', port: 9090 }],
    endpoints: 2,
    createdAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    name: 'cache-redis',
    namespace: 'infrastructure',
    cluster: 'us-east-1',
    sourceCluster: 'us-west-2',
    type: 'Headless',
    dnsName: 'cache-redis.infrastructure.svc.clusterset.local',
    ports: [{ name: 'redis', protocol: 'TCP', port: 6379 }],
    endpoints: 1,
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    name: 'metrics-collector',
    namespace: 'monitoring',
    cluster: 'ap-southeast-1',
    sourceCluster: 'us-east-1',
    type: 'ClusterSetIP',
    dnsName: 'metrics-collector.monitoring.svc.clusterset.local',
    ports: [{ name: 'metrics', protocol: 'TCP', port: 9100 }],
    endpoints: 4,
    createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    name: 'database-proxy',
    namespace: 'data',
    cluster: 'eu-central-1',
    sourceCluster: 'us-west-2',
    type: 'ClusterSetIP',
    dnsName: 'database-proxy.data.svc.clusterset.local',
    ports: [{ name: 'postgres', protocol: 'TCP', port: 5432 }],
    endpoints: 0,
    createdAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
  },
]

const DEMO_STATS = {
  totalImports: 15,
  withEndpoints: 12,
  noEndpoints: 3,
  clusterSetIP: 13,
  headless: 2,
}

const getEndpointStatus = (endpoints: number) => {
  if (endpoints > 0) {
    return { icon: CheckCircle2, color: 'text-green-400', bg: 'bg-green-500/20' }
  }
  return { icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/20' }
}

const getTypeColor = (type: ServiceImportType) => {
  switch (type) {
    case 'ClusterSetIP':
      return 'bg-blue-500/20 text-blue-400'
    case 'Headless':
      return 'bg-purple-500/20 text-purple-400'
    default:
      return 'bg-gray-500/20 text-gray-400'
  }
}

type SortByOption = 'name' | 'type' | 'cluster'

const SORT_OPTIONS_KEYS = [
  { value: 'name' as const, labelKey: 'common.name' },
  { value: 'type' as const, labelKey: 'serviceImports.type' },
  { value: 'cluster' as const, labelKey: 'common.cluster' },
]

const IMPORT_SORT_COMPARATORS: Record<SortByOption, (a: ServiceImport, b: ServiceImport) => number> = {
  name: commonComparators.string<ServiceImport>('name'),
  type: commonComparators.string<ServiceImport>('type'),
  cluster: commonComparators.string<ServiceImport>('cluster'),
}

interface ServiceImportsProps {
  config?: Record<string, unknown>
}

function ServiceImportsInternal({ config: _config }: ServiceImportsProps) {
  const { t } = useTranslation(['cards', 'common'])
  const SORT_OPTIONS = useMemo(() =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    SORT_OPTIONS_KEYS.map(opt => ({ value: opt.value, label: String(t(opt.labelKey as any)) })),
    [t]
  )
  // Demo data - always available, never loading/erroring
  const isLoading = false
  const hasError = false

  // Report loading state to CardWrapper for skeleton/refresh behavior
  useCardLoadingState({
    isLoading,
    hasAnyData: DEMO_IMPORTS.length > 0,
    isDemoData: true,
  })

  const {
    items: filteredImports,
    totalItems,
    currentPage,
    totalPages,
    itemsPerPage,
    goToPage,
    needsPagination,
    setItemsPerPage,
    filters,
    sorting,
  } = useCardData<ServiceImport, SortByOption>(DEMO_IMPORTS, {
    filter: {
      searchFields: ['name', 'namespace', 'cluster', 'sourceCluster', 'dnsName', 'type'],
      clusterField: 'cluster',
      storageKey: 'service-imports',
    },
    sort: {
      defaultField: 'name',
      defaultDirection: 'asc',
      comparators: IMPORT_SORT_COMPARATORS,
    },
    defaultLimit: 5,
  })

  // Show skeleton while loading
  if (isLoading) {
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

  // Show error state if data fetch failed
  if (hasError) {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card p-6">
        <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
        <p className="text-sm text-muted-foreground mb-4">{t('serviceImports.loadFailed')}</p>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 rounded-lg bg-purple-500 hover:bg-purple-600 text-white text-sm"
        >
          {t('common:common.retry')}
        </button>
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
            title={t('serviceImports.mcsApiDocs')}
          >
            <ExternalLink className="w-4 h-4" />
          </a>
          <span className="text-sm font-medium text-muted-foreground">
            {t('serviceImports.nImports', { count: DEMO_STATS.totalImports })}
          </span>
        </div>
        <CardControlsRow
          clusterIndicator={{
            selectedCount: filters.localClusterFilter.length,
            totalCount: filters.availableClusters.length,
          }}
          clusterFilter={{
            availableClusters: filters.availableClusters,
            selectedClusters: filters.localClusterFilter,
            onToggle: filters.toggleClusterFilter,
            onClear: filters.clearClusterFilter,
            isOpen: filters.showClusterFilter,
            setIsOpen: filters.setShowClusterFilter,
            containerRef: filters.clusterFilterRef,
            minClusters: 1,
          }}
          cardControls={{
            limit: itemsPerPage,
            onLimitChange: setItemsPerPage,
            sortBy: sorting.sortBy,
            sortOptions: SORT_OPTIONS,
            onSortChange: (v) => sorting.setSortBy(v as SortByOption),
            sortDirection: sorting.sortDirection,
            onSortDirectionChange: sorting.setSortDirection,
          }}
        />
      </div>

      {/* MCS Integration Notice */}
      <div className="flex items-start gap-2 p-2 mb-3 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-xs">
        <AlertCircle className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-cyan-400 font-medium">{t('serviceImports.mcsTitle')}</p>
          <p className="text-muted-foreground">
            {t('serviceImports.mcsDesc')}{' '}
            <a
              href={K8S_DOCS.mcsApiServiceImport}
              target="_blank"
              rel="noopener noreferrer"
              className="text-purple-400 hover:underline"
            >
              {t('serviceImports.learnMore')}
            </a>
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-center">
          <p className="text-[10px] text-cyan-400">{t('serviceImports.imports')}</p>
          <p className="text-lg font-bold text-foreground">{DEMO_STATS.totalImports}</p>
        </div>
        <div className="p-2 rounded-lg bg-green-500/10 border border-green-500/20 text-center">
          <p className="text-[10px] text-green-400">{t('common:common.healthy')}</p>
          <p className="text-lg font-bold text-foreground">{DEMO_STATS.withEndpoints}</p>
        </div>
        <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-center">
          <p className="text-[10px] text-red-400">{t('serviceImports.noEndpoints')}</p>
          <p className="text-lg font-bold text-foreground">{DEMO_STATS.noEndpoints}</p>
        </div>
      </div>

      {/* Local Search */}
      <CardSearchInput
        value={filters.search}
        onChange={filters.setSearch}
        placeholder={t('serviceImports.searchImports')}
        className="mb-3"
      />

      {/* Imports list */}
      <div className="flex-1 overflow-y-auto space-y-2">
        {filteredImports.map((imp, idx) => {
          const endpointStatus = getEndpointStatus(imp.endpoints)
          const EndpointIcon = endpointStatus.icon
          return (
            <div
              key={`${imp.cluster}-${imp.namespace}-${imp.name}-${idx}`}
              className="p-2.5 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors"
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <EndpointIcon className={`w-4 h-4 ${endpointStatus.color}`} />
                  <span className="text-sm font-medium text-foreground truncate">{imp.name}</span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] ${getTypeColor(imp.type)}`}>
                    {imp.type}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {t('serviceImports.nEndpoints', { count: imp.endpoints })}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs mb-1">
                <ClusterBadge cluster={imp.cluster} />
                <span className="text-muted-foreground">{t('serviceImports.from')}</span>
                <ClusterBadge cluster={imp.sourceCluster || 'unknown'} />
              </div>
              {imp.dnsName && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Globe className="w-3 h-3" />
                  <span className="truncate font-mono" title={imp.dnsName}>{imp.dnsName}</span>
                </div>
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
        itemsPerPage={typeof itemsPerPage === 'number' ? itemsPerPage : filteredImports.length}
        onPageChange={goToPage}
        needsPagination={needsPagination}
      />

      {/* Usage example */}
      <div className="mt-3 pt-3 border-t border-border/50">
        <p className="text-[10px] text-muted-foreground font-medium mb-2">{t('serviceImports.usageExample')}</p>
        <code className="block p-2 rounded bg-secondary text-[10px] text-muted-foreground font-mono overflow-x-auto whitespace-nowrap">
          curl http://&lt;service&gt;.&lt;ns&gt;.svc.clusterset.local
        </code>
      </div>

      {/* Footer links */}
      <div className="flex items-center justify-center gap-3 pt-2 mt-2 border-t border-border/50 text-[10px]">
        <a
          href={K8S_DOCS.mcsApi}
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:text-purple-400 transition-colors"
        >
          {t('serviceImports.mcsApiDocsLink')}
        </a>
        <span className="text-muted-foreground/30">•</span>
        <a
          href={K8S_DOCS.gammaInitiative}
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:text-purple-400 transition-colors"
        >
          {t('serviceImports.gammaInitiative')}
        </a>
      </div>
    </div>
  )
}

export function ServiceImports(props: ServiceImportsProps) {
  return (
    <DynamicCardErrorBoundary cardId="ServiceImports">
      <ServiceImportsInternal {...props} />
    </DynamicCardErrorBoundary>
  )
}
