import { Cpu, Server } from 'lucide-react'
import { useKagentCRDModels } from '../../../hooks/mcp/kagent_crds'
import { useCardLoadingState } from '../CardDataContext'
import { CardSearchInput, CardControlsRow, CardPaginationFooter } from '../../../lib/cards/CardComponents'
import { useCardData, commonComparators } from '../../../lib/cards/cardHooks'
import { Skeleton } from '../../ui/Skeleton'
import { useTranslation } from 'react-i18next'

interface KagentModelProvidersProps {
  config?: { cluster?: string }
}

function StatusBadge({ status }: { status: string }) {
  const classes =
    status === 'Ready'
      ? 'bg-green-500/15 text-green-400 border-green-500/20'
      : status === 'Pending'
        ? 'bg-yellow-500/15 text-yellow-400 border-yellow-500/20'
        : status === 'Failed'
          ? 'bg-red-500/15 text-red-400 border-red-500/20'
          : 'bg-gray-500/15 text-muted-foreground border-gray-500/20'
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 text-2xs font-medium rounded border ${classes}`}>
      {status}
    </span>
  )
}

function KindBadge({ kind }: { kind: string }) {
  const classes = kind === 'ModelConfig'
    ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
    : 'bg-purple-500/10 text-purple-400 border-purple-500/20'
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 text-2xs font-medium rounded border ${classes}`}>
      {kind === 'ModelProviderConfig' ? 'Provider' : 'Model'}
    </span>
  )
}

const PROVIDER_COLORS: Record<string, string> = {
  Anthropic: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  OpenAI: 'bg-green-500/10 text-green-400 border-green-500/20',
  Gemini: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  Ollama: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
  AzureOpenAI: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
}

function ProviderBadge({ provider }: { provider: string }) {
  const classes = PROVIDER_COLORS[provider] || 'bg-gray-500/10 text-gray-400 border-gray-500/20'
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 text-2xs font-medium rounded border ${classes}`}>
      {provider}
    </span>
  )
}

type SortField = 'name' | 'provider' | 'kind' | 'status' | 'cluster'

export function KagentModelProviders({ config }: KagentModelProvidersProps) {
  const { t: _t } = useTranslation()
  const {
    data: models,
    isLoading,
    isDemoFallback,
    consecutiveFailures,
  } = useKagentCRDModels({ cluster: config?.cluster })

  const hasAnyData = models.length > 0
  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: isLoading && !hasAnyData,
    hasAnyData,
    isFailed: consecutiveFailures >= 3,
    consecutiveFailures,
    isDemoData: isDemoFallback,
  })

  const {
    items: paginatedItems,
    filters,
    currentPage,
    totalPages,
    totalItems,
    goToPage,
    needsPagination,
    itemsPerPage,
    containerRef,
    containerStyle,
  } = useCardData(models, {
    filter: {
      searchFields: ['name', 'namespace', 'kind', 'provider', 'model', 'cluster'],
      clusterField: 'cluster',
    },
    sort: {
      defaultField: 'name' as SortField,
      defaultDirection: 'asc',
      comparators: {
        name: commonComparators.string('name'),
        provider: commonComparators.string('provider'),
        kind: commonComparators.string('kind'),
        status: (a, b) => {
          const order: Record<string, number> = { Failed: 0, Pending: 1, Ready: 2 }
          return (order[a.status] ?? 99) - (order[b.status] ?? 99)
        },
        cluster: commonComparators.string('cluster'),
      } as Record<SortField, (a: typeof models[number], b: typeof models[number]) => number>,
    },
    defaultLimit: 10,
  })

  if (showSkeleton) {
    return (
      <div className="space-y-2 p-1">
        {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-10 rounded-lg" />)}
      </div>
    )
  }

  if (showEmptyState) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <Cpu className="w-10 h-10 text-muted-foreground/30 mb-3" />
        <div className="text-sm font-medium text-muted-foreground">No Model Configs</div>
        <div className="text-xs text-muted-foreground/60 mt-1">Deploy ModelConfig or ModelProviderConfig CRDs</div>
      </div>
    )
  }

  return (
    <div className="space-y-2 p-1">
      <CardControlsRow
        extra={
          <CardSearchInput value={filters.search} onChange={filters.setSearch} placeholder="Search models..." />
        }
      />

      <div ref={containerRef} className="space-y-1" style={containerStyle}>
        {paginatedItems.map(model => (
          <div
            key={`${model.cluster}-${model.namespace}-${model.name}`}
            className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-secondary transition-colors"
          >
            <Cpu className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium truncate">{model.name}</div>
              <div className="text-xs text-muted-foreground/60 flex items-center gap-1">
                <Server className="w-2.5 h-2.5" />
                {model.cluster} / {model.namespace}
              </div>
            </div>
            <KindBadge kind={model.kind} />
            <ProviderBadge provider={model.provider} />
            <span className="text-xs text-muted-foreground truncate max-w-[100px]">
              {model.kind === 'ModelProviderConfig' && model.modelCount > 0
                ? `${model.modelCount} models`
                : model.model || ''}
            </span>
            <StatusBadge status={model.status} />
          </div>
        ))}
      </div>

      <CardPaginationFooter
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={totalItems}
        itemsPerPage={typeof itemsPerPage === 'number' ? itemsPerPage : totalItems}
        onPageChange={goToPage}
        needsPagination={needsPagination}
      />
    </div>
  )
}
