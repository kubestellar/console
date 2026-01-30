import { CheckCircle2, Clock, XCircle, HelpCircle, AlertCircle, ExternalLink, Server } from 'lucide-react'
import { ClusterBadge } from '../ui/ClusterBadge'
import {
  useCardData,
  commonComparators,
  CardSearchInput, CardControlsRow, CardPaginationFooter,
} from '../../lib/cards'
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

const EXPORT_SORT_COMPARATORS = {
  name: commonComparators.string<ServiceExport>('name'),
  status: (a: ServiceExport, b: ServiceExport) => (statusOrder[a.status] || 3) - (statusOrder[b.status] || 3),
  cluster: commonComparators.string<ServiceExport>('cluster'),
}

interface ServiceExportsProps {
  config?: Record<string, unknown>
}

export function ServiceExports({ config: _config }: ServiceExportsProps) {
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
  } = useCardData<ServiceExport, SortByOption>(DEMO_EXPORTS, {
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
      <CardSearchInput
        value={localSearch}
        onChange={setLocalSearch}
        placeholder="Search exports..."
        className="mb-3"
      />

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
