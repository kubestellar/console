import { useMemo } from 'react'
import { Layers, AlertCircle, RefreshCw } from 'lucide-react'
import { Skeleton } from '../../ui/Skeleton'
import { RefreshIndicator } from '../../ui/RefreshIndicator'
import { StatusBadge } from '../../ui/StatusBadge'
import { useCardData } from '../../../lib/cards/cardHooks'
import { CardPaginationFooter, CardControlsRow, CardSearchInput } from '../../../lib/cards/CardComponents'
import { useCachedLLMdModels, useCachedGPUNodes } from '../../../hooks/useCachedData'
import { useLLMdClusters } from './shared'
import { useClusters } from '../../../hooks/useMCP'
import type { LLMdModel } from '../../../hooks/useLLMd'
import { useCardLoadingState } from '../CardDataContext'
import { useTranslation } from 'react-i18next'

type SortByOption = 'name' | 'namespace' | 'cluster' | 'status'

const SORT_OPTIONS = [
  { value: 'name' as const, label: 'Name' },
  { value: 'namespace' as const, label: 'Namespace' },
  { value: 'cluster' as const, label: 'Cluster' },
  { value: 'status' as const, label: 'Status' },
]

interface LLMModelsProps {
  config?: Record<string, unknown>
}

export function LLMModels({ config: _config }: LLMModelsProps) {
  const { t } = useTranslation(['cards', 'common'])
  // Dynamically discover LLM-d clusters instead of using static list
  const { deduplicatedClusters } = useClusters()
  const { nodes: gpuNodes } = useCachedGPUNodes()
  const gpuClusterNames = useMemo(() => new Set(gpuNodes.map(n => n.cluster)), [gpuNodes])
  const llmdClusters = useLLMdClusters(deduplicatedClusters, gpuClusterNames)

  const { models, isLoading, isRefreshing, lastRefresh, isDemoFallback } = useCachedLLMdModels(llmdClusters)

  // Report loading state to CardWrapper for skeleton/refresh behavior
  useCardLoadingState({
    isLoading,
    isRefreshing,
    hasAnyData: models.length > 0,
    isDemoData: isDemoFallback,
  })

  const {
    items: paginatedItems,
    totalItems,
    currentPage,
    totalPages,
    itemsPerPage,
    goToPage,
    needsPagination,
    setItemsPerPage,
    filters,
    sorting,
    containerRef,
    containerStyle,
  } = useCardData<LLMdModel, SortByOption>(models, {
    filter: {
      searchFields: ['name', 'namespace', 'cluster'] as (keyof LLMdModel)[],
      clusterField: 'cluster' as keyof LLMdModel,
      storageKey: 'llm-models',
    },
    sort: {
      defaultField: 'name',
      defaultDirection: 'asc',
      comparators: {
        name: (a, b) => a.name.localeCompare(b.name),
        namespace: (a, b) => a.namespace.localeCompare(b.namespace),
        cluster: (a, b) => a.cluster.localeCompare(b.cluster),
        status: (a, b) => a.status.localeCompare(b.status),
      },
    },
    defaultLimit: 5,
  })

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'loaded':
        return <StatusBadge color="green">Loaded</StatusBadge>
      case 'downloading':
        return <StatusBadge color="blue" icon={<RefreshCw className="w-2.5 h-2.5 animate-spin" />}>Downloading</StatusBadge>
      case 'stopped':
        return <StatusBadge color="gray">Stopped</StatusBadge>
      case 'error':
        return <StatusBadge color="red">{t('common:common.error')}</StatusBadge>
      default:
        return <StatusBadge color="gray">{status}</StatusBadge>
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton variant="text" width={120} height={20} />
        <Skeleton variant="rounded" height={40} />
        <Skeleton variant="rounded" height={40} />
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-card">
      {/* Header controls */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <RefreshIndicator
            isRefreshing={isRefreshing}
            lastUpdated={lastRefresh ? new Date(lastRefresh) : null}
            size="sm"
            showLabel={true}
            staleThresholdMinutes={5}
          />
          <StatusBadge color="cyan">
            {models.filter(m => m.status === 'loaded').length} loaded
          </StatusBadge>
        </div>
        <CardControlsRow
          clusterIndicator={
            filters.localClusterFilter.length > 0
              ? { selectedCount: filters.localClusterFilter.length, totalCount: filters.availableClusters.length }
              : undefined
          }
          clusterFilter={
            filters.availableClusters.length >= 1
              ? {
                  availableClusters: filters.availableClusters,
                  selectedClusters: filters.localClusterFilter,
                  onToggle: filters.toggleClusterFilter,
                  onClear: filters.clearClusterFilter,
                  isOpen: filters.showClusterFilter,
                  setIsOpen: filters.setShowClusterFilter,
                  containerRef: filters.clusterFilterRef,
                  minClusters: 1,
                }
              : undefined
          }
          cardControls={{
            limit: itemsPerPage,
            onLimitChange: setItemsPerPage,
            sortBy: sorting.sortBy,
            sortOptions: SORT_OPTIONS,
            onSortChange: (v) => sorting.setSortBy(v as SortByOption),
            sortDirection: sorting.sortDirection,
            onSortDirectionChange: sorting.setSortDirection,
          }}
          className="mb-0"
        />
      </div>

      {/* Search */}
      <CardSearchInput
        value={filters.search}
        onChange={filters.setSearch}
        placeholder="Search models..."
        className="mb-3"
      />

      {/* Integration notice */}
      <div className="flex items-start gap-2 p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-xs mb-4">
        <AlertCircle className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-cyan-400 font-medium">{t('cards:llmModels.inferencePoolDetection')}</p>
          <p className="text-muted-foreground">
            Scans for InferencePool resources on llm-d clusters.
          </p>
        </div>
      </div>

      {/* Model list */}
      <div ref={containerRef} className="flex-1 overflow-y-auto" style={containerStyle}>
        {paginatedItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
            <Layers className="w-8 h-8 mb-2 opacity-50" />
            <p className="text-sm">{t('cards:llmModels.noInferencePools')}</p>
            <p className="text-xs">Scanning {llmdClusters.length} cluster{llmdClusters.length !== 1 ? 's' : ''}</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground border-b border-border/50">
                <th className="text-left py-2">Model</th>
                <th className="text-left py-2">{t('common:common.namespace')}</th>
                <th className="text-left py-2">{t('common:common.cluster')}</th>
                <th className="text-right py-2">{t('common:common.status')}</th>
              </tr>
            </thead>
            <tbody>
              {paginatedItems.map((model) => (
                <tr key={model.id} className="border-b border-border/30 hover:bg-secondary/30">
                  <td className="py-2 font-medium text-foreground truncate max-w-[150px]" title={model.name}>{model.name}</td>
                  <td className="py-2 text-muted-foreground">{model.namespace}</td>
                  <td className="py-2 text-muted-foreground">{model.cluster}</td>
                  <td className="py-2 text-right">{getStatusBadge(model.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      <CardPaginationFooter
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={totalItems}
        itemsPerPage={typeof itemsPerPage === 'number' ? itemsPerPage : 100}
        onPageChange={goToPage}
        needsPagination={needsPagination}
      />
    </div>
  )
}
