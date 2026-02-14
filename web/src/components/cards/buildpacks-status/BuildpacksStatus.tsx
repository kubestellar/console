import { useState, useMemo } from 'react'
import { CheckCircle, AlertTriangle, XCircle, Clock, ChevronRight, Server } from 'lucide-react'
import { useClusters, useBuildpackImages, BuildpackImage } from '../../../hooks/useMCP'
import { Skeleton } from '../../ui/Skeleton'
import { ClusterBadge } from '../../ui/ClusterBadge'
import { useCardData, CardSearchInput, CardControlsRow, CardPaginationFooter, CardAIActions } from '../../../lib/cards'
import { useCardLoadingState } from '../CardDataContext'
import { useDrillDownActions } from '../../../hooks/useDrillDown'

interface BuildpacksStatusProps {
  config?: {
    cluster?: string
    namespace?: string
  }
}

export type BuildpackStatus =
  | 'succeeded'
  | 'failed'
  | 'building'
  | 'unknown'

type SortByOption = 'status' | 'name' | 'builder' | 'updated'

const SORT_OPTIONS = [
  { value: 'status' as const, label: 'Status' },
  { value: 'name' as const, label: 'Name' },
  { value: 'builder' as const, label: 'Builder' },
  { value: 'updated' as const, label: 'Updated' },
]

const STATUS_STYLES = {
  succeeded: {
    icon: 'text-green-400',
    badge: 'bg-green-500/20 text-green-400',
  },
  failed: {
    icon: 'text-red-400',
    badge: 'bg-red-500/20 text-red-400',
  },
  building: {
    icon: 'text-blue-400',
    badge: 'bg-blue-500/20 text-blue-400',
  },
  unknown: {
    icon: 'text-orange-400',
    badge: 'bg-orange-500/20 text-orange-400',
  },
}

const STATUS_ORDER: Record<string, number> = {
  failed: 0,
  building: 1,
  unknown: 2,
  succeeded: 3,
}

const formatTime = (timestamp: string | number | Date): string => {
  const time = new Date(timestamp).getTime()
  if (isNaN(time)) return ''

  const diff = Date.now() - time

  if (diff <= 0) return 'just now'

  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour

  if (diff < minute) return 'just now'
  if (diff < hour) return `${Math.floor(diff / minute)}m ago`
  if (diff < day) return `${Math.floor(diff / hour)}h ago`

  return `${Math.floor(diff / day)}d ago`
}

export function BuildpacksStatus({ config }: BuildpacksStatusProps) {
  const { isLoading: clustersLoading } = useClusters()

  const {
    images: allImages,
    isLoading,
    isFailed,
    consecutiveFailures,
    error,
    isDemoData,
  } = useBuildpackImages(config?.cluster)

  const { drillToBuildpack } = useDrillDownActions()

  const [selectedNamespace, setSelectedNamespace] = useState(
    config?.namespace || ''
  )

  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: clustersLoading || isLoading,
    hasAnyData: allImages.length > 0,
    isFailed,
    consecutiveFailures,
    isDemoData,
  })

  const allBuilds = allImages

  const namespacedBuilds = useMemo(() => {
    if (!selectedNamespace) return allBuilds
    return allBuilds.filter(b => b.namespace === selectedNamespace)
  }, [allBuilds, selectedNamespace])

  const namespaces = useMemo(
    () => Array.from(new Set(allBuilds.map(b => b.namespace))).sort(),
    [allBuilds]
  )

  const {
    items: builds,
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
  } = useCardData<BuildpackImage, SortByOption>(namespacedBuilds, {
    filter: {
      searchFields: ['name', 'namespace', 'builder', 'image'],
      clusterField: 'cluster',
      statusField: 'status',
      storageKey: 'buildpacks-status',
    },
    sort: {
      defaultField: 'status',
      defaultDirection: 'asc',
      comparators: {
        status: (a, b) => (STATUS_ORDER[a.status] ?? 5) - (STATUS_ORDER[b.status] ?? 5),
        name: (a, b) => a.name.localeCompare(b.name),
        builder: (a, b) => a.builder.localeCompare(b.builder),
        updated: (a, b) =>
          new Date(b.updated).getTime() -
          new Date(a.updated).getTime(),
      },
    },
    defaultLimit: 5,
  })

  const { successCount, failedCount, buildingCount } = useMemo(() => {
    return {
      successCount: namespacedBuilds.filter(b => b.status === 'succeeded').length,
      failedCount: namespacedBuilds.filter(b => b.status === 'failed').length,
      buildingCount: namespacedBuilds.filter(b => b.status === 'building').length,
    }
  }, [namespacedBuilds])

  if (showSkeleton) {
    return (
      <div className="h-full flex flex-col min-h-card">
        <Skeleton variant="rounded" height={60} />
        <Skeleton variant="rounded" height={60} />
        <Skeleton variant="rounded" height={60} />
      </div>
    )
  }

  if (showEmptyState) {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground">
        {error ? (
          <>
            <p className="text-sm text-red-400">{error}</p>
            <p className="text-xs mt-1">Failed to load buildpack images</p>
          </>
        ) : (
          <>
            <p className="text-sm">No Buildpack images</p>
            <p className="text-xs mt-1">
              Create kpack Image resources to track builds
            </p>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-card content-loaded overflow-hidden">
      {/* Controls */}
      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
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

      {/* Namespace Selector */}
      <div className="mb-4">
        <select
          value={selectedNamespace}
          onChange={(e) => setSelectedNamespace(e.target.value)}
          className="w-full px-3 py-1.5 rounded-lg bg-secondary border border-border text-sm text-foreground"
        >
          <option value="">All namespaces</option>
          {namespaces.map(ns => (
            <option key={ns} value={ns}>{ns}</option>
          ))}
        </select>
      </div>

      {/* Scope Badge */}
      <div className="flex items-center gap-2 mb-4">
        {localClusterFilter.length === 1 ? (
          <ClusterBadge cluster={localClusterFilter[0]} />
        ) : localClusterFilter.length > 1 ? (
          <span className="text-xs px-2 py-1 rounded bg-secondary text-muted-foreground">
            {localClusterFilter.length} clusters
          </span>
        ) : (
          <span className="text-xs px-2 py-1 rounded bg-secondary text-muted-foreground">
            All clusters
          </span>
        )}

        {selectedNamespace && (
          <>
            <span className="text-muted-foreground">/</span>
            <span className="text-sm text-foreground">{selectedNamespace}</span>
          </>
        )}
      </div>

      {/* Search */}
      <CardSearchInput
        value={localSearch}
        onChange={setLocalSearch}
        placeholder="Search buildpack images..."
        className="mb-4"
      />

      {/* Summary */}
      <div className="flex gap-2 mb-4">
        <Summary label="Total" value={totalItems} color="blue" />
        <Summary label="Succeeded" value={successCount} color="green" />
        <Summary label="Building" value={buildingCount} color="blue" />
        <Summary label="Failed" value={failedCount} color="red" />
      </div>

      {/* List */}
      <div className="flex-1 space-y-2 overflow-y-auto">
        {builds.map(build => {
          const Icon =
            build.status === 'succeeded'
              ? CheckCircle
              : build.status === 'failed'
              ? XCircle
              : build.status === 'building'
              ? Clock
              : AlertTriangle

          const styles = STATUS_STYLES[build.status]

          return (
            <div key={`${build.cluster}-${build.namespace}-${build.name}`}
              onClick={() =>
                drillToBuildpack(build.cluster || '',
                  build.namespace,
                  build.name,
                  {
                    builder: build.builder,
                    image: build.image,
                    status: build.status,
                    updated: build.updated,
                  }
                )
              }
              className={`p-3 rounded-lg transition-colors cursor-pointer group ${
                build.status === 'failed'
                  ? 'bg-red-500/10 border border-red-500/20'
                  : 'bg-secondary/30'
              } hover:bg-secondary/50`}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <Icon className={`w-4 h-4 ${styles.icon}`} />
                  <span className="text-sm font-medium group-hover:text-purple-400">
                    {build.name}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {build.status !== 'succeeded' && (
                    <CardAIActions
                      resource={{
                        kind: 'BuildpackImage',
                        name: build.name,
                        namespace: build.namespace,
                        cluster: build.cluster,
                        status: build.status,
                      }}
                      issues={[
                        {
                          name: `Image ${build.status}`,
                          message: `Buildpack image ${build.name} is ${build.status}`,
                        },
                      ]}
                    />
                  )}
                  <span className={`text-xs px-1.5 py-0.5 rounded ${styles.badge}`}>
                    {build.status}
                  </span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>

              <div className="flex items-center gap-4 ml-6 text-xs text-muted-foreground">
                {build.cluster && (
                  <ClusterBadge cluster={build.cluster} size="sm" />
                )}
                <span>{build.builder}</span>
                <span className="ml-auto">
                  {formatTime(build.updated)}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      <CardPaginationFooter
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={totalItems}
        itemsPerPage={typeof itemsPerPage === 'number' ? itemsPerPage : 10}
        onPageChange={goToPage}
        needsPagination={needsPagination && itemsPerPage !== 'unlimited'}
      />

      <div className="mt-4 pt-3 border-t border-border/50 text-xs text-muted-foreground">
        {totalItems} image{totalItems !== 1 ? 's' : ''}
        {localClusterFilter.length === 1
          ? (selectedNamespace
              ? ` in ${localClusterFilter[0]}/${selectedNamespace}`
              : ` in ${localClusterFilter[0]}`)
          : ` across ${availableClusters.length} cluster${availableClusters.length !== 1 ? 's' : ''}`}
      </div>
    </div>
  )
}

function Summary({
  label,
  value,
  color,
}: {
  label: string
  value: number
  color: string
}) {
  const COLORS: Record<string, string> = {
    blue: 'bg-blue-500/10 text-blue-400',
    green: 'bg-green-500/10 text-green-400',
    red: 'bg-red-500/10 text-red-400',
  }

  return (
    <div className={`flex-1 p-2 rounded-lg text-center ${COLORS[color]}`}>
      <span className="text-lg font-bold">{value}</span>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  )
}
