import { CheckCircle, AlertTriangle, XCircle, Loader2, Cloud } from 'lucide-react'
import { SkeletonStats, SkeletonList } from '../../ui/Skeleton'
import { useCardData, commonComparators } from '../../../lib/cards/cardHooks'
import { CardSearchInput,CardControlsRow,CardPaginationFooter,CardAIActions } from '../../../lib/cards/CardComponents'
import { useCardLoadingState } from '../CardDataContext'
import { useCrossplaneManagedResources, type CrossplaneManagedResource } from '../../../hooks/mcp/crossplane'

type ManagedResourceView = {
  name: string
  namespace: string
  kind: string
  ready: boolean
  synced: boolean
  error?: string
  creationTimestamp: string
  externalName?: string
  raw: CrossplaneManagedResource
}

function getCondition(
  resource: CrossplaneManagedResource,
  type: string
) {
  return resource.status?.conditions?.find(c => c.type === type)
}

function isReady(resource: CrossplaneManagedResource) {
  return getCondition(resource, 'Ready')?.status === 'True'
}

function isSynced(resource: CrossplaneManagedResource) {
  return getCondition(resource, 'Synced')?.status === 'True'
}

function getError(resource: CrossplaneManagedResource) {
  const ready = getCondition(resource, 'Ready')
  if (ready?.status === 'False') {
    return ready.message || ready.reason
  }
  return undefined
}

type SortByOption = 'status' | 'name' | 'kind' | 'namespace'

const SORT_OPTIONS = [
  { value: 'status' as const, label: 'Status' },
  { value: 'name' as const, label: 'Name' },
  { value: 'kind' as const, label: 'Kind' },
  { value: 'namespace' as const, label: 'Namespace' }
]

export function CrossplaneManagedResources() {
  const {
  resources: rawResources,
  isLoading,
  isRefreshing,
  error,
  consecutiveFailures,
  isFailed,
  lastRefresh,
  isDemoData,
  } = useCrossplaneManagedResources()

  const viewResources: ManagedResourceView[] = rawResources.map(r => ({
    name: r.metadata.name,
    namespace: r.metadata.namespace,
    kind: r.kind,
    ready: isReady(r),
    synced: isSynced(r),
    error: getError(r),
    creationTimestamp: r.metadata.creationTimestamp,
    externalName: r.metadata.annotations?.['crossplane.io/external-name'],
    raw: r
  }))

  const {
    items,
    totalItems,
    currentPage,
    totalPages,
    itemsPerPage,
    goToPage,
    needsPagination,
    setItemsPerPage,
    filters: { search, setSearch },
    sorting: { sortBy, setSortBy, sortDirection, setSortDirection }
  } = useCardData<ManagedResourceView, SortByOption>(viewResources, {
    filter: {
      searchFields: ['name', 'kind', 'namespace'],
      storageKey: 'crossplane-managed'
    },
    sort: {
      defaultField: 'status',
      defaultDirection: 'asc',
      comparators: {
        status: (a, b) => Number(b.ready) - Number(a.ready),
        name: commonComparators.string<ManagedResourceView>('name'),
        kind: commonComparators.string<ManagedResourceView>('kind'),
        namespace: commonComparators.string<ManagedResourceView>('namespace')
      }
    },
    defaultLimit: 5
  })

  const hasCompletedInitialFetch = lastRefresh !== null
  const hasData = rawResources.length > 0
  const { showSkeleton, showEmptyState } = useCardLoadingState({
  isLoading: isLoading || !hasCompletedInitialFetch,
  hasAnyData: hasData,
  isFailed,
  consecutiveFailures,
  isDemoData,
  })

  const readyCount = rawResources.filter(isReady).length
  const notReadyCount = rawResources.filter(r => !isReady(r) && !getError(r)).length
  const errorCount = rawResources.filter(r => !!getError(r)).length
  const syncedCount = rawResources.filter(isSynced).length

  if (showSkeleton) {
    return (
      <div className="h-full flex flex-col min-h-card">
        <SkeletonStats className="mb-4" />
        <SkeletonList items={4} className="flex-1" />
      </div>
    )
  }

  if (showEmptyState) {
    return (
      <div className="h-full flex items-center justify-center min-h-card text-muted-foreground">
        {error ? (
          <p className="text-sm text-red-400">{error}</p>
        ) : (
          <p className="text-sm">No managed resources found</p>
        )}
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-card content-loaded">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400">
          {rawResources.length} managed resources
        </span>
        {isRefreshing && (
          <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
        )}
        <CardControlsRow
          cardControls={{
            limit: itemsPerPage,
            onLimitChange: setItemsPerPage,
            sortBy,
            sortOptions: SORT_OPTIONS,
            onSortChange: (v) => setSortBy(v as SortByOption),
            sortDirection,
            onSortDirectionChange: setSortDirection
          }}
        />
      </div>
      <CardSearchInput
        value={search}
        onChange={setSearch}
        placeholder="Search managed resources..."
        className="mb-4"
      />
      {/* Stats */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        <StatBox label="Ready" value={readyCount} color="green" />
        <StatBox label="Not Ready" value={notReadyCount} color="orange" />
        <StatBox label="Error" value={errorCount} color="red" />
        <StatBox label="Synced" value={syncedCount} color="blue" />
      </div>
      {/* List */}
      <div className="flex-1 space-y-2 overflow-y-auto">
        {items.map(resource => {
          const ready = resource.ready
          const error = resource.error
          const synced = resource.synced
          const statusIcon = error ? (
            <XCircle className="w-3.5 h-3.5 text-red-400" />
          ) : ready ? (
            <CheckCircle className="w-3.5 h-3.5 text-green-400" />
          ) : (
            <AlertTriangle className="w-3.5 h-3.5 text-orange-400" />
          )
          const externalName = resource.externalName
          return (
            <div
              key={`${resource.namespace}/${resource.name}`}
              className="group flex items-center justify-between p-2 rounded-lg border border-border/30 bg-secondary/30 transition-all hover:bg-secondary/50 hover:border-border/50"
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {statusIcon}
                <Cloud className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-sm text-foreground truncate">
                  {resource.name}
                </span>
                <span className="text-xs text-muted-foreground">
                  {resource.kind}
                </span>
                <span className="text-xs text-muted-foreground">
                  ({resource.namespace})
                </span>
                {externalName && (
                  <span className="text-xs text-purple-400 truncate">
                    {externalName}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
                <span>
                  {new Date(resource.creationTimestamp).toLocaleDateString()}
                </span>

                {error && (
                  <CardAIActions
                    resource={{
                      kind: resource.kind,
                      name: resource.name,
                      status: 'Error'
                    }}
                    issues={[
                      {
                        name: 'Reconcile Error',
                        message: error
                      }
                    ]}
                  />
                )}

                {!synced && !error && (
                  <Loader2 className="w-3 h-3 animate-spin text-blue-400" />
                )}
              </div>
            </div>
          )
        })}
      </div>
      <CardPaginationFooter
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={totalItems}
        itemsPerPage={
          typeof itemsPerPage === 'number' ? itemsPerPage : totalItems
        }
        onPageChange={goToPage}
        needsPagination={needsPagination}
      />
    </div>
  )
}

const COLOR_CLASSES = {
  green: { bg: 'bg-green-500/10', border: 'border-green-500/20', text: 'text-green-400' },
  orange: { bg: 'bg-orange-500/10', border: 'border-orange-500/20', text: 'text-orange-400' },
  red: { bg: 'bg-red-500/10', border: 'border-red-500/20', text: 'text-red-400' },
  blue: { bg: 'bg-blue-500/10', border: 'border-blue-500/20', text: 'text-blue-400' }
} as const

function StatBox({
  label,
  value,
  color
}: {
  label: string
  value: number
  color: 'green' | 'orange' | 'red' | 'blue'
}) {
  const classes = COLOR_CLASSES[color]
  return (
    <div className={`p-3 rounded-lg ${classes.bg} border ${classes.border}`}>
      <span className={`text-xs ${classes.text}`}>{label}</span>
      <div className="text-2xl font-bold text-foreground">{value}</div>
    </div>
  )
}