import { useState, useMemo } from 'react'
import { CheckCircle, XCircle, RefreshCw, Clock, AlertTriangle, ChevronRight, ExternalLink, AlertCircle, Search, Filter, ChevronDown, Server } from 'lucide-react'
import { useClusters } from '../../hooks/useMCP'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { ClusterBadge } from '../ui/ClusterBadge'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { Skeleton } from '../ui/Skeleton'
import { CardControls, SortDirection } from '../ui/CardControls'
import { Pagination, usePagination } from '../ui/Pagination'
import { RefreshButton } from '../ui/RefreshIndicator'
import { useChartFilters } from '../../lib/cards'

interface ArgoCDApplicationsProps {
  config?: {
    cluster?: string
    namespace?: string
  }
}

interface ArgoApplication {
  name: string
  namespace: string
  cluster: string
  syncStatus: 'Synced' | 'OutOfSync' | 'Unknown'
  healthStatus: 'Healthy' | 'Degraded' | 'Progressing' | 'Missing' | 'Unknown'
  source: {
    repoURL: string
    path: string
    targetRevision: string
  }
  lastSynced?: string
}

// Mock ArgoCD applications
function getMockArgoApplications(clusters: string[]): ArgoApplication[] {
  const apps: ArgoApplication[] = []

  clusters.forEach((cluster) => {
    const baseApps = [
      {
        name: 'frontend-app',
        namespace: 'production',
        syncStatus: 'Synced' as const,
        healthStatus: 'Healthy' as const,
        source: {
          repoURL: 'https://github.com/org/frontend',
          path: 'k8s/overlays/production',
          targetRevision: 'main',
        },
        lastSynced: '2 minutes ago',
      },
      {
        name: 'api-gateway',
        namespace: 'production',
        syncStatus: 'OutOfSync' as const,
        healthStatus: 'Healthy' as const,
        source: {
          repoURL: 'https://github.com/org/api-gateway',
          path: 'deploy',
          targetRevision: 'v2.3.0',
        },
        lastSynced: '15 minutes ago',
      },
      {
        name: 'backend-service',
        namespace: 'staging',
        syncStatus: 'Synced' as const,
        healthStatus: 'Progressing' as const,
        source: {
          repoURL: 'https://github.com/org/backend',
          path: 'manifests',
          targetRevision: 'develop',
        },
        lastSynced: '1 minute ago',
      },
      {
        name: 'monitoring-stack',
        namespace: 'monitoring',
        syncStatus: 'OutOfSync' as const,
        healthStatus: 'Degraded' as const,
        source: {
          repoURL: 'https://github.com/org/monitoring',
          path: 'helm/prometheus',
          targetRevision: 'HEAD',
        },
        lastSynced: '30 minutes ago',
      },
    ]

    baseApps.forEach((app, idx) => {
      // Only add some apps to some clusters
      if ((cluster.includes('prod') && idx < 3) ||
          (cluster.includes('staging') && idx > 1) ||
          (!cluster.includes('prod') && !cluster.includes('staging'))) {
        apps.push({ ...app, cluster })
      }
    })
  })

  return apps
}

type SortByOption = 'syncStatus' | 'healthStatus' | 'name' | 'namespace'

const SORT_OPTIONS = [
  { value: 'syncStatus' as const, label: 'Sync Status' },
  { value: 'healthStatus' as const, label: 'Health' },
  { value: 'name' as const, label: 'Name' },
  { value: 'namespace' as const, label: 'Namespace' },
]

const syncStatusConfig = {
  Synced: { icon: CheckCircle, color: 'text-green-400', bg: 'bg-green-500/20' },
  OutOfSync: { icon: RefreshCw, color: 'text-yellow-400', bg: 'bg-yellow-500/20' },
  Unknown: { icon: AlertTriangle, color: 'text-gray-400', bg: 'bg-gray-500/20' },
}

const healthStatusConfig = {
  Healthy: { icon: CheckCircle, color: 'text-green-400' },
  Degraded: { icon: XCircle, color: 'text-red-400' },
  Progressing: { icon: Clock, color: 'text-blue-400' },
  Missing: { icon: AlertTriangle, color: 'text-orange-400' },
  Unknown: { icon: AlertTriangle, color: 'text-gray-400' },
}

export function ArgoCDApplications({ config }: ArgoCDApplicationsProps) {
  const { clusters, isLoading, isRefreshing, refetch, isFailed, consecutiveFailures, lastRefresh } = useClusters()
  const { selectedClusters, isAllClustersSelected } = useGlobalFilters()
  const { drillToArgoApp } = useDrillDownActions()

  // Local cluster filter
  const {
    localClusterFilter,
    toggleClusterFilter,
    clearClusterFilter,
    availableClusters,
    showClusterFilter,
    setShowClusterFilter,
    clusterFilterRef,
  } = useChartFilters({
    storageKey: 'argocd-applications',
  })

  const [selectedFilter, setSelectedFilter] = useState<'all' | 'outOfSync' | 'unhealthy'>('all')
  const [sortBy, setSortBy] = useState<SortByOption>('syncStatus')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [limit, setLimit] = useState<number | 'unlimited'>(5)
  const [localSearch, setLocalSearch] = useState('')

  const filteredClusters = useMemo(() => {
    let clusterNames = isAllClustersSelected ? clusters.map(c => c.name) : selectedClusters
    // Apply local cluster filter
    if (localClusterFilter.length > 0) {
      clusterNames = clusterNames.filter(c => localClusterFilter.includes(c))
    }
    return clusterNames
  }, [clusters, selectedClusters, isAllClustersSelected, localClusterFilter])

  const filteredAndSorted = useMemo(() => {
    const allApps = getMockArgoApplications(filteredClusters)

    // Filter by config
    let filtered = allApps
    if (config?.cluster) {
      filtered = filtered.filter(a => a.cluster === config.cluster)
    }
    if (config?.namespace) {
      filtered = filtered.filter(a => a.namespace === config.namespace)
    }

    // Filter by status
    if (selectedFilter === 'outOfSync') {
      filtered = filtered.filter(a => a.syncStatus === 'OutOfSync')
    } else if (selectedFilter === 'unhealthy') {
      filtered = filtered.filter(a => a.healthStatus !== 'Healthy')
    }

    // Apply local search filter
    if (localSearch.trim()) {
      const query = localSearch.toLowerCase()
      filtered = filtered.filter(a =>
        a.name.toLowerCase().includes(query) ||
        a.namespace.toLowerCase().includes(query) ||
        a.cluster.toLowerCase().includes(query) ||
        a.source.repoURL.toLowerCase().includes(query)
      )
    }

    // Sort
    const syncOrder: Record<string, number> = { OutOfSync: 0, Unknown: 1, Synced: 2 }
    const healthOrder: Record<string, number> = { Degraded: 0, Missing: 1, Progressing: 2, Unknown: 3, Healthy: 4 }
    const sorted = [...filtered].sort((a, b) => {
      let compare = 0
      switch (sortBy) {
        case 'syncStatus':
          compare = (syncOrder[a.syncStatus] ?? 5) - (syncOrder[b.syncStatus] ?? 5)
          break
        case 'healthStatus':
          compare = (healthOrder[a.healthStatus] ?? 5) - (healthOrder[b.healthStatus] ?? 5)
          break
        case 'name':
          compare = a.name.localeCompare(b.name)
          break
        case 'namespace':
          compare = a.namespace.localeCompare(b.namespace)
          break
      }
      return sortDirection === 'asc' ? compare : -compare
    })

    return sorted
  }, [filteredClusters, config, selectedFilter, sortBy, sortDirection, localSearch])

  // Use pagination hook
  const effectivePerPage = limit === 'unlimited' ? 1000 : limit
  const {
    paginatedItems: applications,
    currentPage,
    totalPages,
    totalItems,
    itemsPerPage: perPage,
    goToPage,
    needsPagination,
  } = usePagination(filteredAndSorted, effectivePerPage)

  const stats = useMemo(() => ({
    synced: filteredAndSorted.filter(a => a.syncStatus === 'Synced').length,
    outOfSync: filteredAndSorted.filter(a => a.syncStatus === 'OutOfSync').length,
    healthy: filteredAndSorted.filter(a => a.healthStatus === 'Healthy').length,
    unhealthy: filteredAndSorted.filter(a => a.healthStatus !== 'Healthy').length,
  }), [filteredAndSorted])

  const showSkeleton = isLoading && filteredAndSorted.length === 0

  if (showSkeleton) {
    return (
      <div className="h-full flex flex-col min-h-card">
        <div className="flex items-center justify-between mb-4">
          <Skeleton variant="text" width={150} height={20} />
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

  return (
    <div className="h-full flex flex-col min-h-card content-loaded">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400">
            {totalItems} apps
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Cluster count indicator */}
          {localClusterFilter.length > 0 && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground bg-secondary/50 px-1.5 py-0.5 rounded">
              <Server className="w-3 h-3" />
              {localClusterFilter.length}/{availableClusters.length}
            </span>
          )}

          {/* Cluster filter dropdown */}
          {availableClusters.length >= 1 && (
            <div ref={clusterFilterRef} className="relative">
              <button
                onClick={() => setShowClusterFilter(!showClusterFilter)}
                className={`flex items-center gap-1 px-2 py-1 text-xs rounded-lg border transition-colors ${
                  localClusterFilter.length > 0
                    ? 'bg-purple-500/20 border-purple-500/30 text-purple-400'
                    : 'bg-secondary border-border text-muted-foreground hover:text-foreground'
                }`}
                title="Filter by cluster"
              >
                <Filter className="w-3 h-3" />
                <ChevronDown className="w-3 h-3" />
              </button>

              {showClusterFilter && (
                <div className="absolute top-full right-0 mt-1 w-48 max-h-48 overflow-y-auto rounded-lg bg-card border border-border shadow-lg z-50">
                  <div className="p-1">
                    <button
                      onClick={clearClusterFilter}
                      className={`w-full px-2 py-1.5 text-xs text-left rounded transition-colors ${
                        localClusterFilter.length === 0 ? 'bg-purple-500/20 text-purple-400' : 'hover:bg-secondary text-foreground'
                      }`}
                    >
                      All clusters
                    </button>
                    {availableClusters.map(cluster => (
                      <button
                        key={cluster.name}
                        onClick={() => toggleClusterFilter(cluster.name)}
                        className={`w-full px-2 py-1.5 text-xs text-left rounded transition-colors ${
                          localClusterFilter.includes(cluster.name) ? 'bg-purple-500/20 text-purple-400' : 'hover:bg-secondary text-foreground'
                        }`}
                      >
                        {cluster.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <a
            href="https://argo-cd.readthedocs.io/"
            target="_blank"
            rel="noopener noreferrer"
            className="p-1 hover:bg-secondary rounded transition-colors text-muted-foreground hover:text-purple-400"
            title="ArgoCD Documentation"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
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

      {/* Integration notice */}
      <div className="flex items-start gap-2 p-2 mb-3 rounded-lg bg-orange-500/10 border border-orange-500/20 text-xs">
        <AlertCircle className="w-4 h-4 text-orange-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-orange-400 font-medium">ArgoCD Integration</p>
          <p className="text-muted-foreground">
            Install ArgoCD to manage GitOps workflows.{' '}
            <a href="https://argo-cd.readthedocs.io/en/stable/getting_started/" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:underline">
              Install guide →
            </a>
          </p>
        </div>
      </div>

      {/* Local Search */}
      <div className="relative mb-3">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <input
          type="text"
          value={localSearch}
          onChange={(e) => setLocalSearch(e.target.value)}
          placeholder="Search applications..."
          className="w-full pl-8 pr-3 py-1.5 text-xs bg-secondary rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-purple-500/50"
        />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-2 mb-3">
        <div className="text-center p-2 rounded-lg bg-green-500/10 cursor-pointer hover:bg-green-500/20"
             onClick={() => setSelectedFilter('all')}>
          <p className="text-lg font-bold text-green-400">{stats.synced}</p>
          <p className="text-xs text-muted-foreground">Synced</p>
        </div>
        <div className="text-center p-2 rounded-lg bg-yellow-500/10 cursor-pointer hover:bg-yellow-500/20"
             onClick={() => setSelectedFilter('outOfSync')}>
          <p className="text-lg font-bold text-yellow-400">{stats.outOfSync}</p>
          <p className="text-xs text-muted-foreground">Out of Sync</p>
        </div>
        <div className="text-center p-2 rounded-lg bg-green-500/10 cursor-pointer hover:bg-green-500/20"
             onClick={() => setSelectedFilter('all')}>
          <p className="text-lg font-bold text-green-400">{stats.healthy}</p>
          <p className="text-xs text-muted-foreground">Healthy</p>
        </div>
        <div className="text-center p-2 rounded-lg bg-red-500/10 cursor-pointer hover:bg-red-500/20"
             onClick={() => setSelectedFilter('unhealthy')}>
          <p className="text-lg font-bold text-red-400">{stats.unhealthy}</p>
          <p className="text-xs text-muted-foreground">Unhealthy</p>
        </div>
      </div>

      {/* Filter indicator */}
      {selectedFilter !== 'all' && (
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs text-muted-foreground">Showing:</span>
          <button
            onClick={() => setSelectedFilter('all')}
            className="text-xs px-2 py-0.5 rounded bg-purple-500/20 text-purple-400 flex items-center gap-1"
          >
            {selectedFilter === 'outOfSync' ? 'Out of Sync' : 'Unhealthy'}
            <XCircle className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Applications list */}
      <div className="flex-1 space-y-2 overflow-y-auto">
        {applications.map((app, idx) => {
          const syncConfig = syncStatusConfig[app.syncStatus]
          const healthConfig = healthStatusConfig[app.healthStatus]
          const SyncIcon = syncConfig.icon
          const HealthIcon = healthConfig.icon

          return (
            <div
              key={`${app.cluster}-${app.namespace}-${app.name}-${idx}`}
              onClick={() => drillToArgoApp(app.cluster, app.namespace, app.name, {
                syncStatus: app.syncStatus,
                healthStatus: app.healthStatus,
                source: app.source,
                lastSynced: app.lastSynced,
              })}
              className="p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 cursor-pointer transition-colors group"
              title={`Click to view ${app.name} details`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{app.name}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${syncConfig.bg} ${syncConfig.color}`}>
                    <SyncIcon className="w-3 h-3 inline mr-1" />
                    {app.syncStatus}
                  </span>
                  <HealthIcon className={`w-4 h-4 ${healthConfig.color}`} aria-label={app.healthStatus} />
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <ClusterBadge cluster={app.cluster} size="sm" />
                  <span>/{app.namespace}</span>
                </div>
                <span>{app.lastSynced}</span>
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
    </div>
  )
}
