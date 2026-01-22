import { useState, useMemo } from 'react'
import { Layers, CheckCircle, AlertTriangle, XCircle, RefreshCw, Clock, GitBranch, Search } from 'lucide-react'
import { useClusters } from '../../hooks/useMCP'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { Skeleton } from '../ui/Skeleton'
import { ClusterBadge } from '../ui/ClusterBadge'
import { CardControls, SortDirection } from '../ui/CardControls'
import { Pagination, usePagination } from '../ui/Pagination'
import { RefreshButton } from '../ui/RefreshIndicator'

interface KustomizationStatusProps {
  config?: {
    cluster?: string
    namespace?: string
  }
}

interface Kustomization {
  name: string
  namespace: string
  path: string
  sourceRef: string
  status: 'Ready' | 'NotReady' | 'Progressing' | 'Suspended'
  lastApplied: string
  revision: string
}

type SortByOption = 'status' | 'name' | 'namespace' | 'lastApplied'

const SORT_OPTIONS = [
  { value: 'status' as const, label: 'Status' },
  { value: 'name' as const, label: 'Name' },
  { value: 'namespace' as const, label: 'Namespace' },
  { value: 'lastApplied' as const, label: 'Last Applied' },
]

export function KustomizationStatus({ config }: KustomizationStatusProps) {
  const { clusters: allClusters, isLoading, isRefreshing, refetch, isFailed, consecutiveFailures, lastRefresh } = useClusters()
  const [selectedCluster, setSelectedCluster] = useState<string>(config?.cluster || '')
  const [selectedNamespace, setSelectedNamespace] = useState<string>(config?.namespace || '')
  const [sortBy, setSortBy] = useState<SortByOption>('status')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [limit, setLimit] = useState<number | 'unlimited'>(5)
  const [localSearch, setLocalSearch] = useState('')
  const {
    selectedClusters: globalSelectedClusters,
    isAllClustersSelected,
    customFilter,
  } = useGlobalFilters()

  // Apply global filters
  const clusters = useMemo(() => {
    let result = allClusters

    if (!isAllClustersSelected) {
      result = result.filter(c => globalSelectedClusters.includes(c.name))
    }

    if (customFilter.trim()) {
      const query = customFilter.toLowerCase()
      result = result.filter(c =>
        c.name.toLowerCase().includes(query) ||
        c.context?.toLowerCase().includes(query)
      )
    }

    return result
  }, [allClusters, globalSelectedClusters, isAllClustersSelected, customFilter])

  // Mock kustomization data
  const allKustomizations: Kustomization[] = selectedCluster ? [
    { name: 'infrastructure', namespace: 'flux-system', path: './infrastructure', sourceRef: 'flux-system/flux-repo', status: 'Ready', lastApplied: '2024-01-11T10:30:00Z', revision: 'main@sha1:abc123' },
    { name: 'apps', namespace: 'flux-system', path: './apps', sourceRef: 'flux-system/flux-repo', status: 'Ready', lastApplied: '2024-01-11T10:31:00Z', revision: 'main@sha1:abc123' },
    { name: 'monitoring', namespace: 'flux-system', path: './monitoring', sourceRef: 'flux-system/flux-repo', status: 'Progressing', lastApplied: '2024-01-11T10:32:00Z', revision: 'main@sha1:def456' },
    { name: 'tenants-dev', namespace: 'flux-system', path: './tenants/dev', sourceRef: 'flux-system/tenants-repo', status: 'Ready', lastApplied: '2024-01-10T15:00:00Z', revision: 'main@sha1:789ghi' },
    { name: 'tenants-prod', namespace: 'flux-system', path: './tenants/prod', sourceRef: 'flux-system/tenants-repo', status: 'NotReady', lastApplied: '2024-01-10T15:00:00Z', revision: 'main@sha1:789ghi' },
    { name: 'secrets', namespace: 'flux-system', path: './secrets', sourceRef: 'flux-system/flux-repo', status: 'Suspended', lastApplied: '2024-01-05T09:00:00Z', revision: 'main@sha1:jkl012' },
  ] : []

  // Get unique namespaces
  const namespaces = useMemo(() => {
    const nsSet = new Set(allKustomizations.map(k => k.namespace))
    return Array.from(nsSet).sort()
  }, [allKustomizations])

  // Filter and sort by namespace
  const filteredAndSorted = useMemo(() => {
    let result = selectedNamespace
      ? allKustomizations.filter(k => k.namespace === selectedNamespace)
      : allKustomizations

    // Apply local search filter
    if (localSearch.trim()) {
      const query = localSearch.toLowerCase()
      result = result.filter(k =>
        k.name.toLowerCase().includes(query) ||
        k.namespace.toLowerCase().includes(query) ||
        k.path.toLowerCase().includes(query) ||
        k.sourceRef.toLowerCase().includes(query)
      )
    }

    // Sort
    const statusOrder: Record<string, number> = { NotReady: 0, Progressing: 1, Suspended: 2, Ready: 3 }
    result = [...result].sort((a, b) => {
      let compare = 0
      switch (sortBy) {
        case 'status':
          compare = (statusOrder[a.status] ?? 5) - (statusOrder[b.status] ?? 5)
          break
        case 'name':
          compare = a.name.localeCompare(b.name)
          break
        case 'namespace':
          compare = a.namespace.localeCompare(b.namespace)
          break
        case 'lastApplied':
          compare = new Date(b.lastApplied).getTime() - new Date(a.lastApplied).getTime()
          break
      }
      return sortDirection === 'asc' ? compare : -compare
    })

    return result
  }, [allKustomizations, selectedNamespace, localSearch, sortBy, sortDirection])

  // Use pagination hook
  const effectivePerPage = limit === 'unlimited' ? 1000 : limit
  const {
    paginatedItems: kustomizations,
    currentPage,
    totalPages,
    totalItems,
    itemsPerPage: perPage,
    goToPage,
    needsPagination,
  } = usePagination(filteredAndSorted, effectivePerPage)

  const getStatusIcon = (status: Kustomization['status']) => {
    switch (status) {
      case 'Ready': return CheckCircle
      case 'NotReady': return XCircle
      case 'Progressing': return RefreshCw
      case 'Suspended': return Clock
      default: return AlertTriangle
    }
  }

  const getStatusColor = (status: Kustomization['status']) => {
    switch (status) {
      case 'Ready': return 'green'
      case 'NotReady': return 'red'
      case 'Progressing': return 'blue'
      case 'Suspended': return 'gray'
      default: return 'orange'
    }
  }

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
    return `${Math.floor(diff / 86400000)}d ago`
  }

  const readyCount = filteredAndSorted.filter(k => k.status === 'Ready').length
  const notReadyCount = filteredAndSorted.filter(k => k.status === 'NotReady').length

  if (isLoading) {
    return (
      <div className="h-full flex flex-col min-h-card">
        <div className="flex items-center justify-between mb-4">
          <Skeleton variant="text" width={160} height={20} />
          <Skeleton variant="rounded" width={80} height={28} />
        </div>
        <Skeleton variant="rounded" height={32} className="mb-4" />
        <div className="space-y-2">
          <Skeleton variant="rounded" height={60} />
          <Skeleton variant="rounded" height={60} />
          <Skeleton variant="rounded" height={60} />
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-card content-loaded">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-pink-400" />
          <span className="text-sm font-medium text-muted-foreground">Kustomizations</span>
          {notReadyCount > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">
              {notReadyCount} failing
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <CardControls
            limit={limit}
            onLimitChange={setLimit}
            sortBy={sortBy}
            sortOptions={SORT_OPTIONS}
            onSortChange={setSortBy}
            sortDirection={sortDirection}
            onSortDirectionChange={setSortDirection}
          />
          <RefreshButton
            isRefreshing={isRefreshing}
            isFailed={isFailed}
            consecutiveFailures={consecutiveFailures}
            lastRefresh={lastRefresh}
            onRefresh={refetch}
            size="sm"
          />
        </div>
      </div>

      {/* Selectors */}
      <div className="flex gap-2 mb-4">
        <select
          value={selectedCluster}
          onChange={(e) => {
            setSelectedCluster(e.target.value)
            setSelectedNamespace('')
          }}
          className="flex-1 px-3 py-1.5 rounded-lg bg-secondary border border-border text-sm text-foreground"
        >
          <option value="">Select cluster...</option>
          {clusters.map(c => (
            <option key={c.name} value={c.name}>{c.name}</option>
          ))}
        </select>
        <select
          value={selectedNamespace}
          onChange={(e) => setSelectedNamespace(e.target.value)}
          disabled={!selectedCluster}
          className="flex-1 px-3 py-1.5 rounded-lg bg-secondary border border-border text-sm text-foreground disabled:opacity-50"
        >
          <option value="">All namespaces</option>
          {namespaces.map(ns => (
            <option key={ns} value={ns}>{ns}</option>
          ))}
        </select>
      </div>

      {!selectedCluster ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          Select a cluster to view Kustomizations
        </div>
      ) : (
        <>
          {/* Scope badge */}
          <div className="flex items-center gap-2 mb-4">
            <ClusterBadge cluster={selectedCluster} />
            {selectedNamespace && (
              <>
                <span className="text-muted-foreground">/</span>
                <span className="text-sm text-foreground">{selectedNamespace}</span>
              </>
            )}
          </div>

          {/* Local Search */}
          <div className="relative mb-4">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="text"
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              placeholder="Search kustomizations..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-secondary rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-purple-500/50"
            />
          </div>

          {/* Summary */}
          <div className="flex gap-2 mb-4">
            <div className="flex-1 p-2 rounded-lg bg-pink-500/10 text-center">
              <span className="text-lg font-bold text-pink-400">{kustomizations.length}</span>
              <p className="text-xs text-muted-foreground">Total</p>
            </div>
            <div className="flex-1 p-2 rounded-lg bg-green-500/10 text-center">
              <span className="text-lg font-bold text-green-400">{readyCount}</span>
              <p className="text-xs text-muted-foreground">Ready</p>
            </div>
            <div className="flex-1 p-2 rounded-lg bg-red-500/10 text-center">
              <span className="text-lg font-bold text-red-400">{notReadyCount}</span>
              <p className="text-xs text-muted-foreground">Failing</p>
            </div>
          </div>

          {/* Kustomizations list */}
          <div className="flex-1 space-y-2 overflow-y-auto">
            {kustomizations.map((ks, idx) => {
              const StatusIcon = getStatusIcon(ks.status)
              const color = getStatusColor(ks.status)

              return (
                <div
                  key={idx}
                  className={`p-3 rounded-lg ${ks.status === 'NotReady' ? 'bg-red-500/10 border border-red-500/20' : 'bg-secondary/30'} hover:bg-secondary/50 transition-colors`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <StatusIcon className={`w-4 h-4 text-${color}-400 ${ks.status === 'Progressing' ? 'animate-spin' : ''}`} />
                      <span className="text-sm text-foreground font-medium">{ks.name}</span>
                    </div>
                    <span className={`text-xs px-1.5 py-0.5 rounded bg-${color}-500/20 text-${color}-400`}>
                      {ks.status}
                    </span>
                  </div>
                  <div className="ml-6 text-xs text-muted-foreground space-y-0.5">
                    <div className="flex items-center gap-1">
                      <GitBranch className="w-3 h-3" />
                      <span className="truncate">{ks.path}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="truncate">{ks.revision.split('@')[1]?.slice(0, 12)}</span>
                      <span>{formatTime(ks.lastApplied)}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Pagination */}
          {needsPagination && limit !== 'unlimited' && (
            <div className="pt-2 border-t border-border/50 mt-2">
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={totalItems}
                itemsPerPage={perPage}
                onPageChange={goToPage}
                showItemsPerPage={false}
              />
            </div>
          )}

          {/* Footer */}
          <div className="mt-4 pt-3 border-t border-border/50 text-xs text-muted-foreground">
            Flux Kustomize Controller
          </div>
        </>
      )}
    </div>
  )
}
