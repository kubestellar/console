import { useState, useMemo } from 'react'
import { CheckCircle2, Clock, XCircle, HelpCircle, Search, AlertCircle, ExternalLink, Server, Filter, ChevronDown } from 'lucide-react'
import { ClusterBadge } from '../ui/ClusterBadge'
import { CardControls, SortDirection } from '../ui/CardControls'
import { RefreshButton } from '../ui/RefreshIndicator'
import { useChartFilters } from '../../lib/cards'
import type { ServiceExport, ServiceExportStatus } from '../../types/mcs'

// Demo data for MCS ServiceExports
const DEMO_EXPORTS: ServiceExport[] = [
  {
    name: 'api-gateway',
    namespace: 'production',
    cluster: 'us-east-1',
    serviceName: 'api-gateway',
    status: 'Ready',
    targetClusters: ['us-west-2', 'eu-central-1'],
    createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    name: 'auth-service',
    namespace: 'production',
    cluster: 'us-east-1',
    serviceName: 'auth-service',
    status: 'Ready',
    targetClusters: ['us-west-2', 'eu-central-1', 'ap-southeast-1'],
    createdAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    name: 'cache-redis',
    namespace: 'infrastructure',
    cluster: 'us-west-2',
    serviceName: 'redis-master',
    status: 'Ready',
    targetClusters: ['us-east-1'],
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    name: 'payment-processor',
    namespace: 'payments',
    cluster: 'eu-central-1',
    serviceName: 'payment-processor',
    status: 'Pending',
    message: 'Waiting for endpoints to become ready',
    createdAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
  },
  {
    name: 'legacy-backend',
    namespace: 'legacy',
    cluster: 'on-prem-dc1',
    serviceName: 'backend-v1',
    status: 'Failed',
    message: 'Service not found in cluster',
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  },
]

const DEMO_STATS = {
  totalExports: 12,
  readyCount: 9,
  pendingCount: 2,
  failedCount: 1,
  clustersWithMCS: 4,
  totalClusters: 5,
}

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
      return { bg: 'bg-gray-500/20', text: 'text-gray-400', border: 'border-gray-500/20', iconBg: 'bg-gray-500/20' }
  }
}

type SortByOption = 'name' | 'status' | 'cluster'

const SORT_OPTIONS = [
  { value: 'name' as const, label: 'Name' },
  { value: 'status' as const, label: 'Status' },
  { value: 'cluster' as const, label: 'Cluster' },
]

const statusOrder: Record<string, number> = { Failed: 0, Pending: 1, Ready: 2 }

interface ServiceExportsProps {
  config?: Record<string, unknown>
}

export function ServiceExports({ config: _config }: ServiceExportsProps) {
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [localSearch, setLocalSearch] = useState('')
  const [limit, setLimit] = useState<number | 'unlimited'>(5)
  const [sortBy, setSortBy] = useState<SortByOption>('status')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')

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
    storageKey: 'service-exports',
  })

  // Filter exports by local search and cluster filter
  const filteredExports = useMemo(() => {
    let result = DEMO_EXPORTS

    // Apply local cluster filter
    if (localClusterFilter.length > 0) {
      result = result.filter(exp => localClusterFilter.includes(exp.cluster))
    }

    // Apply search filter
    if (localSearch.trim()) {
      const query = localSearch.toLowerCase()
      result = result.filter(exp =>
        exp.name.toLowerCase().includes(query) ||
        exp.namespace.toLowerCase().includes(query) ||
        exp.cluster.toLowerCase().includes(query) ||
        exp.serviceName?.toLowerCase().includes(query) ||
        exp.status.toLowerCase().includes(query)
      )
    }

    // Sort
    const sorted = [...result].sort((a, b) => {
      let cmp = 0
      if (sortBy === 'status') cmp = (statusOrder[a.status] || 3) - (statusOrder[b.status] || 3)
      else if (sortBy === 'name') cmp = a.name.localeCompare(b.name)
      else if (sortBy === 'cluster') cmp = a.cluster.localeCompare(b.cluster)
      return sortDirection === 'asc' ? cmp : -cmp
    })

    // Apply limit
    if (limit !== 'unlimited') {
      return sorted.slice(0, limit)
    }
    return sorted
  }, [localSearch, localClusterFilter, sortBy, sortDirection, limit])

  const handleRefresh = async () => {
    setIsRefreshing(true)
    await new Promise(r => setTimeout(r, 1000))
    setIsRefreshing(false)
  }

  return (
    <div className="h-full flex flex-col min-h-card">
      {/* Header with controls */}
      <div className="flex items-center justify-between mb-2 flex-shrink-0">
        <div className="flex items-center gap-2">
          <a
            href="https://github.com/kubernetes-sigs/mcs-api"
            target="_blank"
            rel="noopener noreferrer"
            className="p-1 hover:bg-secondary rounded transition-colors text-muted-foreground hover:text-purple-400"
            title="MCS API Documentation"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
          <span className="text-sm font-medium text-muted-foreground">
            {DEMO_STATS.totalExports} exports
          </span>
          {localClusterFilter.length > 0 && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground bg-secondary/50 px-1.5 py-0.5 rounded">
              <Server className="w-3 h-3" />
              {localClusterFilter.length}/{availableClusters.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
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
            onRefresh={handleRefresh}
            size="sm"
          />
        </div>
      </div>

      {/* MCS Integration Notice */}
      <div className="flex items-start gap-2 p-2 mb-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs">
        <AlertCircle className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-blue-400 font-medium">Multi-Cluster Services (MCS)</p>
          <p className="text-muted-foreground">
            MCS API enables cross-cluster service discovery using ServiceExport/ServiceImport CRDs.{' '}
            <a
              href="https://github.com/kubernetes-sigs/mcs-api#installing-the-crds"
              target="_blank"
              rel="noopener noreferrer"
              className="text-purple-400 hover:underline"
            >
              Install guide →
            </a>
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-center">
          <p className="text-[10px] text-blue-400">Exports</p>
          <p className="text-lg font-bold text-foreground">{DEMO_STATS.totalExports}</p>
        </div>
        <div className="p-2 rounded-lg bg-green-500/10 border border-green-500/20 text-center">
          <p className="text-[10px] text-green-400">Ready</p>
          <p className="text-lg font-bold text-foreground">{DEMO_STATS.readyCount}</p>
        </div>
        <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-center">
          <p className="text-[10px] text-amber-400">Pending</p>
          <p className="text-lg font-bold text-foreground">{DEMO_STATS.pendingCount}</p>
        </div>
      </div>

      {/* Local Search */}
      <div className="relative mb-3">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <input
          type="text"
          value={localSearch}
          onChange={(e) => setLocalSearch(e.target.value)}
          placeholder="Search exports..."
          className="w-full pl-8 pr-3 py-1.5 text-xs bg-secondary rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-purple-500/50"
        />
      </div>

      {/* Exports list */}
      <div className="flex-1 overflow-y-auto space-y-2">
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
                  <span className={`px-1.5 py-0.5 rounded text-[10px] ${colors.bg} ${colors.text}`}>
                    {exp.status}
                  </span>
                </div>
                {exp.targetClusters && exp.targetClusters.length > 0 && (
                  <span className="text-xs text-muted-foreground" title={exp.targetClusters.join(', ')}>
                    → {exp.targetClusters.length} clusters
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
            </div>
          )
        })}
      </div>

      {/* Quick install command */}
      <div className="mt-3 pt-3 border-t border-border/50">
        <p className="text-[10px] text-muted-foreground font-medium mb-2">Quick Install</p>
        <code className="block p-2 rounded bg-secondary text-[10px] text-muted-foreground font-mono overflow-x-auto whitespace-nowrap">
          kubectl apply -f https://github.com/kubernetes-sigs/mcs-api/releases/latest/download/mcs-api-crds.yaml
        </code>
      </div>

      {/* Footer links */}
      <div className="flex items-center justify-center gap-3 pt-2 mt-2 border-t border-border/50 text-[10px]">
        <a
          href="https://github.com/kubernetes-sigs/mcs-api"
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:text-purple-400 transition-colors"
        >
          MCS API Docs
        </a>
        <span className="text-muted-foreground/30">•</span>
        <a
          href="https://gateway-api.sigs.k8s.io/concepts/gamma/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:text-purple-400 transition-colors"
        >
          GAMMA Initiative
        </a>
      </div>
    </div>
  )
}
