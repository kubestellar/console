import { CheckCircle2, XCircle, AlertCircle, ExternalLink, Globe } from 'lucide-react'
import { ClusterBadge } from '../ui/ClusterBadge'
import { useCardData, commonComparators } from '../../lib/cards/cardHooks'
import { CardSearchInput, CardControlsRow, CardPaginationFooter } from '../../lib/cards/CardComponents'
import type { ServiceImport, ServiceImportType } from '../../types/mcs'

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

const SORT_OPTIONS = [
  { value: 'name' as const, label: 'Name' },
  { value: 'type' as const, label: 'Type' },
  { value: 'cluster' as const, label: 'Cluster' },
]

const IMPORT_SORT_COMPARATORS: Record<SortByOption, (a: ServiceImport, b: ServiceImport) => number> = {
  name: commonComparators.string<ServiceImport>('name'),
  type: commonComparators.string<ServiceImport>('type'),
  cluster: commonComparators.string<ServiceImport>('cluster'),
}

interface ServiceImportsProps {
  config?: Record<string, unknown>
}

export function ServiceImports({ config: _config }: ServiceImportsProps) {
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
            {DEMO_STATS.totalImports} imports
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
          <p className="text-cyan-400 font-medium">Multi-Cluster Services (MCS)</p>
          <p className="text-muted-foreground">
            ServiceImports are auto-created when services are exported from other clusters.{' '}
            <a
              href="https://github.com/kubernetes-sigs/mcs-api#serviceimport"
              target="_blank"
              rel="noopener noreferrer"
              className="text-purple-400 hover:underline"
            >
              Learn more →
            </a>
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-center">
          <p className="text-[10px] text-cyan-400">Imports</p>
          <p className="text-lg font-bold text-foreground">{DEMO_STATS.totalImports}</p>
        </div>
        <div className="p-2 rounded-lg bg-green-500/10 border border-green-500/20 text-center">
          <p className="text-[10px] text-green-400">Healthy</p>
          <p className="text-lg font-bold text-foreground">{DEMO_STATS.withEndpoints}</p>
        </div>
        <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-center">
          <p className="text-[10px] text-red-400">No Endpoints</p>
          <p className="text-lg font-bold text-foreground">{DEMO_STATS.noEndpoints}</p>
        </div>
      </div>

      {/* Local Search */}
      <CardSearchInput
        value={filters.search}
        onChange={filters.setSearch}
        placeholder="Search imports..."
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
                  {imp.endpoints} endpoint{imp.endpoints !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs mb-1">
                <ClusterBadge cluster={imp.cluster} />
                <span className="text-muted-foreground">← from</span>
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
        <p className="text-[10px] text-muted-foreground font-medium mb-2">Usage Example</p>
        <code className="block p-2 rounded bg-secondary text-[10px] text-muted-foreground font-mono overflow-x-auto whitespace-nowrap">
          curl http://&lt;service&gt;.&lt;ns&gt;.svc.clusterset.local
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
