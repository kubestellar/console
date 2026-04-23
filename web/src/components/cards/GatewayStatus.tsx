import { useMemo } from 'react'
import { CheckCircle2, Clock, XCircle, AlertCircle, ExternalLink, Globe, ArrowRight, Server } from 'lucide-react'
import { ClusterBadge } from '../ui/ClusterBadge'
import { Skeleton } from '../ui/Skeleton'
import { CardSearchInput, CardControlsRow, CardPaginationFooter, CardAIActions } from '../../lib/cards/CardComponents'
import { useCardData, commonComparators } from '../../lib/cards/cardHooks'
import { K8S_DOCS } from '../../config/externalApis'
import { useCardLoadingState } from './CardDataContext'
import { useTranslation } from 'react-i18next'
import { useGatewayStatus as useGatewayStatusHook } from '../../hooks/useGatewayStatus'
import type { Gateway } from '../../hooks/useGatewayStatus'

// Gateway status types
type GatewayStatusType = 'Programmed' | 'Accepted' | 'Pending' | 'NotAccepted' | 'Unknown'

const getStatusIcon = (status: GatewayStatusType) => {
  switch (status) {
    case 'Programmed':
      return CheckCircle2
    case 'Accepted':
      return CheckCircle2
    case 'Pending':
      return Clock
    case 'NotAccepted':
      return XCircle
    default:
      return Clock
  }
}

const getStatusColors = (status: GatewayStatusType) => {
  switch (status) {
    case 'Programmed':
      return { bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500/20' }
    case 'Accepted':
      return { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/20' }
    case 'Pending':
      return { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/20' }
    case 'NotAccepted':
      return { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/20' }
    default:
      return { bg: 'bg-gray-500/20', text: 'text-muted-foreground', border: 'border-gray-500/20' }
  }
}

type SortByOption = 'name' | 'cluster' | 'status'
type SortTranslationKey = 'common:common.name' | 'common:common.cluster' | 'common:common.status'

const SORT_OPTIONS_KEYS: ReadonlyArray<{ value: SortByOption; labelKey: SortTranslationKey }> = [
  { value: 'name' as const, labelKey: 'common:common.name' },
  { value: 'cluster' as const, labelKey: 'common:common.cluster' },
  { value: 'status' as const, labelKey: 'common:common.status' },
]

const GATEWAY_SORT_COMPARATORS: Record<SortByOption, (a: Gateway, b: Gateway) => number> = {
  name: commonComparators.string<Gateway>('name'),
  cluster: commonComparators.string<Gateway>('cluster'),
  status: commonComparators.string<Gateway>('status') }

interface GatewayStatusProps {
  config?: Record<string, unknown>
}

export function GatewayStatus({ config: _config }: GatewayStatusProps) {
  const { t } = useTranslation(['cards', 'common'])
  const SORT_OPTIONS = SORT_OPTIONS_KEYS.map(opt => ({ value: opt.value, label: String(t(opt.labelKey)) }))

  // Fetch real gateway data with demo fallback
  const { gateways: allGateways, isLoading, isRefreshing, isDemoData, isFailed, consecutiveFailures, refetch } = useGatewayStatusHook()
  const hasError = isFailed

  // Compute stats from real data
  const stats = useMemo(() => {
    const items = allGateways || []
    const programmedCount = items.filter(g => g.status === 'Programmed').length
    const pendingCount = items.filter(g => g.status === 'Pending').length
    const totalRoutes = items.reduce((sum, g) => sum + (g.attachedRoutes || 0), 0)
    return {
      totalGateways: items.length,
      programmedCount,
      pendingCount,
      totalRoutes,
    }
  }, [allGateways])

  // Report loading state to CardWrapper for skeleton/refresh behavior
  useCardLoadingState({
    isLoading,
    isRefreshing,
    hasAnyData: (allGateways || []).length > 0,
    isDemoData,
    isFailed,
    consecutiveFailures })

  const {
    items: paginatedGateways,
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
      clusterFilterRef },
    sorting: {
      sortBy,
      setSortBy,
      sortDirection,
      setSortDirection },
    containerRef,
    containerStyle } = useCardData<Gateway, SortByOption>(allGateways || [], {
    filter: {
      searchFields: ['name', 'namespace', 'cluster', 'gatewayClass', 'status'],
      clusterField: 'cluster',
      storageKey: 'gateway-status' },
    sort: {
      defaultField: 'name',
      defaultDirection: 'asc',
      comparators: GATEWAY_SORT_COMPARATORS },
    defaultLimit: 5 })

  // Show skeleton while loading
  if (isLoading) {
    return (
      <div className="h-full flex flex-col min-h-card">
        <div className="flex flex-wrap items-center justify-between gap-y-2 mb-3">
          <Skeleton variant="text" width={120} height={20} />
          <Skeleton variant="rounded" width={80} height={28} />
        </div>
        <div className="space-y-2">
          <Skeleton variant="rounded" height={60} />
          <Skeleton variant="rounded" height={60} />
          <Skeleton variant="rounded" height={60} />
        </div>
      </div>
    )
  }

  // Show error state if data fetch failed
  if (hasError) {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card p-6">
        <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
        <p className="text-sm text-muted-foreground mb-4">{t('gatewayStatus.loadFailed')}</p>
        <button
          onClick={() => refetch()}
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
      <div className="flex flex-wrap items-center justify-between gap-y-2 mb-2 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">
            {t('gatewayStatus.nGateways', { count: totalItems })}
          </span>
          <a
            href={K8S_DOCS.gatewayApi}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1 hover:bg-secondary rounded transition-colors text-muted-foreground hover:text-purple-400"
            title={t('gatewayStatus.apiDocs')}
          >
            <ExternalLink className="w-4 h-4" />
          </a>
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
            minClusters: 1 }}
          cardControls={{
            limit: itemsPerPage,
            onLimitChange: setItemsPerPage,
            sortBy,
            sortOptions: SORT_OPTIONS,
            onSortChange: (v) => setSortBy(v as SortByOption),
            sortDirection,
            onSortDirectionChange: setSortDirection }}
        />
      </div>

      {/* Search */}
      <CardSearchInput
        value={localSearch}
        onChange={setLocalSearch}
        placeholder={t('common:common.searchGateways')}
        className="mb-3"
      />

      {/* Gateway API Integration Notice — only shown when no real data detected */}
      {isDemoData && (
        <div className="flex items-start gap-2 p-2 mb-3 rounded-lg bg-purple-500/10 border border-purple-500/20 text-xs">
          <AlertCircle className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-purple-400 font-medium">{t('gatewayStatus.gatewayApiTitle')}</p>
            <p className="text-muted-foreground">
              {t('gatewayStatus.gatewayApiDesc')}{' '}
              <a
                href={K8S_DOCS.gatewayApiGettingStarted}
                target="_blank"
                rel="noopener noreferrer"
                className="text-purple-400 hover:underline"
              >
                {t('gatewayStatus.installGuide')}
              </a>
            </p>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 @md:grid-cols-3 gap-2 mb-3">
        <div className="p-2 rounded-lg bg-purple-500/10 border border-purple-500/20 text-center">
          <p className="text-2xs text-purple-400">{t('gatewayStatus.gateways')}</p>
          <p className="text-lg font-bold text-foreground">{stats.totalGateways}</p>
        </div>
        <div className="p-2 rounded-lg bg-green-500/10 border border-green-500/20 text-center">
          <p className="text-2xs text-green-400">{t('gatewayStatus.programmed')}</p>
          <p className="text-lg font-bold text-foreground">{stats.programmedCount}</p>
        </div>
        <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-center">
          <p className="text-2xs text-blue-400">{t('gatewayStatus.routes')}</p>
          <p className="text-lg font-bold text-foreground">{stats.totalRoutes}</p>
        </div>
      </div>

      {/* Gateways list */}
      <div ref={containerRef} className="flex-1 overflow-y-auto space-y-2" style={containerStyle}>
        {paginatedGateways.map((gw, idx) => {
          const Icon = getStatusIcon(gw.status)
          const colors = getStatusColors(gw.status)
          return (
            <div
              key={`${gw.cluster}-${gw.namespace}-${gw.name}-${idx}`}
              className="p-2.5 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors"
            >
              <div className="flex flex-wrap items-center justify-between gap-y-2 mb-1">
                <div className="flex items-center gap-2">
                  <Icon className={`w-4 h-4 ${colors.text}`} />
                  <span className="text-sm font-medium text-foreground truncate">{gw.name}</span>
                  <span className={`px-1.5 py-0.5 rounded text-2xs ${colors.bg} ${colors.text}`}>
                    {gw.status}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {t('gatewayStatus.nRoutes', { count: gw.attachedRoutes })}
                </span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-y-2 text-xs">
                <div className="flex items-center gap-2">
                  <ClusterBadge cluster={gw.cluster} />
                  <span className="text-muted-foreground">{gw.namespace}</span>
                </div>
                <span className="text-muted-foreground/60 text-2xs">{gw.gatewayClass}</span>
              </div>
              {gw.addresses.length > 0 && (
                <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                  <Globe className="w-3 h-3" />
                  <span className="font-mono">{(gw.addresses || []).join(', ')}</span>
                </div>
              )}
              {gw.listeners.length > 0 && (
                <div className="flex items-center gap-2 mt-1 text-2xs text-muted-foreground">
                  <ArrowRight className="w-3 h-3" />
                  {gw.listeners.map((l, i) => (
                    <span key={i} className="px-1.5 py-0.5 rounded bg-secondary">
                      {l.protocol}:{l.port}
                    </span>
                  ))}
                </div>
              )}
              {(gw.status === 'NotAccepted' || gw.status === 'Pending') && (
                <CardAIActions
                  resource={{ kind: 'Gateway', name: gw.name, namespace: gw.namespace, cluster: gw.cluster, status: gw.status }}
                  issues={[{ name: `Gateway ${gw.status}`, message: `Gateway "${gw.name}" (class: ${gw.gatewayClass}) is ${gw.status}` }]}
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

      {/* Quick install command — only shown when no real data detected */}
      {isDemoData && (
        <div className="mt-3 pt-3 border-t border-border/50">
          <p className="text-2xs text-muted-foreground font-medium mb-2">{t('gatewayStatus.quickInstall')}</p>
          <code className="block p-2 rounded bg-secondary text-2xs text-muted-foreground font-mono overflow-x-auto whitespace-nowrap">
            {K8S_DOCS.gatewayApiInstallCommand}
          </code>
        </div>
      )}

      {/* Footer links */}
      <div className="flex items-center justify-center gap-3 pt-2 mt-2 border-t border-border/50 text-2xs">
        <a
          href={K8S_DOCS.gatewayApi}
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:text-purple-400 transition-colors"
        >
          {t('gatewayStatus.apiDocsLink')}
        </a>
        <span className="text-muted-foreground/30">|</span>
        <a
          href={K8S_DOCS.gatewayApiImplementations}
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:text-purple-400 transition-colors"
        >
          {t('gatewayStatus.implementations')}
        </a>
        <span className="text-muted-foreground/30">|</span>
        <a
          href={K8S_DOCS.gammaInitiative}
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:text-purple-400 transition-colors"
        >
          GAMMA
        </a>
      </div>
    </div>
  )
}
