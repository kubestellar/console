import { Filter, Search, Server } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { DrillDownViewType } from '../../../../hooks/useDrillDown'

interface MultiClusterFiltersProps {
  searchQuery: string
  setSearchQuery: (value: string) => void
  statusFilter: string
  setStatusFilter: (value: string) => void
  clusterFilter: string
  setClusterFilter: (value: string) => void
  uniqueStatuses: string[]
  uniqueClusters: string[]
  viewType: DrillDownViewType
}

export function MultiClusterFilters({
  searchQuery,
  setSearchQuery,
  statusFilter,
  setStatusFilter,
  clusterFilter,
  setClusterFilter,
  uniqueStatuses,
  uniqueClusters,
  viewType,
}: MultiClusterFiltersProps) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="relative flex-1 min-w-[200px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          placeholder={t('common.search')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2 bg-card/50 border border-border rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-primary/50"
        />
      </div>

      <div className="flex items-center gap-2">
        <Filter className="w-4 h-4 text-muted-foreground" />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-card/50 border border-border rounded-lg px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-primary/50"
        >
          {uniqueStatuses.map((status) => (
            <option key={status} value={status}>
              {status === 'all' ? 'All Statuses' : status}
            </option>
          ))}
        </select>
      </div>

      {viewType !== 'all-clusters' && uniqueClusters.length > 2 && (
        <div className="flex items-center gap-2">
          <Server className="w-4 h-4 text-muted-foreground" />
          <select
            value={clusterFilter}
            onChange={(e) => setClusterFilter(e.target.value)}
            className="bg-card/50 border border-border rounded-lg px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-primary/50"
          >
            {uniqueClusters.map((cluster) => (
              <option key={cluster} value={cluster}>
                {cluster === 'all' ? 'All Clusters' : cluster.split('/').pop()}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  )
}
