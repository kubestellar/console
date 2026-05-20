import { memo, type CSSProperties, type RefObject } from 'react'

// Split helper component; parent card owns useCardLoadingState.
import { ChevronRight, Gauge, Pencil, Plus, Trash2, Zap } from 'lucide-react'
import { type ResourceQuota } from '../../hooks/useMCP'
import { Skeleton } from '../ui/Skeleton'
import { ClusterBadge } from '../ui/ClusterBadge'
import { StatusBadge } from '../ui/StatusBadge'
import { CardSearchInput, CardPaginationFooter } from '../../lib/cards/CardComponents'
import {
  getColor,
  getIcon,
  formatLimits,
  USAGE_TEXT_CLASSES,
  USAGE_BAR_CLASSES,
} from './NamespaceQuotas.utils'
import type { QuotaUsage, LimitRangeItem, TabKey, QuotaDeleteTarget } from './NamespaceQuotas.types'

interface PaginationState {
  currentPage: number
  totalPages: number
  totalItems: number
  itemsPerPage: number
  goToPage: (page: number) => void
  needsPagination: boolean
}

interface NamespaceQuotasListProps {
  searchValue: string
  onSearchChange: (value: string) => void
  selectedCluster: string
  selectedNamespace: string
  activeTab: TabKey
  onTabChange: (tab: TabKey) => void
  tabs: Array<{ key: TabKey; label: string; count: number }>
  paginatedQuotas: QuotaUsage[]
  paginatedLimits: LimitRangeItem[]
  uniqueQuotas: ResourceQuota[]
  isFetchingData: boolean
  onEditQuota: (quota: ResourceQuota) => void
  onDeleteQuota: (target: QuotaDeleteTarget) => void
  onCreateQuota: () => void
  activePagination: PaginationState
  containerRef: RefObject<HTMLDivElement | null>
  containerStyle?: CSSProperties
}

export const NamespaceQuotasList = memo(function NamespaceQuotasList({
  searchValue,
  onSearchChange,
  selectedCluster,
  selectedNamespace,
  activeTab,
  onTabChange,
  tabs,
  paginatedQuotas,
  paginatedLimits,
  uniqueQuotas,
  isFetchingData,
  onEditQuota,
  onDeleteQuota,
  onCreateQuota,
  activePagination,
  containerRef,
  containerStyle,
}: NamespaceQuotasListProps) {
  return (
    <>
      {/* Local Search */}
      <CardSearchInput
        value={searchValue}
        onChange={onSearchChange}
        placeholder="Search quotas..."
        className="mb-4"
      />

      {/* Scope badge */}
      <div className="flex items-center gap-2 mb-4 min-w-0 overflow-hidden">
        {selectedCluster === 'all' ? (
          <StatusBadge color="blue" size="md" className="shrink-0">All Clusters</StatusBadge>
        ) : (
          <div className="shrink-0"><ClusterBadge cluster={selectedCluster} /></div>
        )}
        <span className="text-muted-foreground shrink-0">/</span>
        {selectedNamespace === 'all' ? (
          <StatusBadge color="purple" size="md" className="shrink-0">All Namespaces</StatusBadge>
        ) : (
          <span className="text-sm text-foreground truncate min-w-0">{selectedNamespace}</span>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 p-1 rounded-lg bg-secondary/30">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => onTabChange(tab.key)}
            className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded text-xs transition-colors ${
              activeTab === tab.key
                ? 'bg-yellow-500/20 text-yellow-400'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <span>{tab.label}</span>
            <span className="text-xs opacity-60">({tab.count})</span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div ref={containerRef} className="flex-1 space-y-3 overflow-y-auto" style={containerStyle}>
        {isFetchingData && activePagination.totalItems === 0 ? (
          <>
            <Skeleton variant="rounded" height={70} />
            <Skeleton variant="rounded" height={70} />
            <Skeleton variant="rounded" height={70} />
          </>
        ) : activePagination.totalItems === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground text-sm py-8">
            <p>No {activeTab === 'quotas' ? 'resource quotas' : 'limit ranges'} found</p>
            {activeTab === 'quotas' && (
              <button
                onClick={onCreateQuota}
                className="mt-3 flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg bg-blue-500/20 text-blue-400 hover:bg-blue-500/30"
              >
                <Plus className="w-4 h-4" />
                Create GPU Quota
              </button>
            )}
          </div>
        ) : activeTab === 'quotas' ? (
          paginatedQuotas.map((quota, idx) => {
            const color = getColor(quota.percent)
            const Icon = getIcon(quota.resource)
            const showScope = selectedCluster === 'all' || selectedNamespace === 'all'
            const fullQuota = uniqueQuotas.find(
              q => q.cluster === quota.cluster && q.namespace === quota.namespace && q.name === quota.quotaName
            )
            return (
              <div
                key={`${quota.cluster}-${quota.namespace}-${quota.resource}-${idx}`}
                className={`p-3 rounded-lg bg-secondary/30 ${isFetchingData ? 'opacity-50' : ''}`}
              >
                {showScope && (
                  <div className="flex flex-wrap items-center justify-between gap-y-2 mb-2 gap-2">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground min-w-0 overflow-hidden">
                      {quota.cluster && <span className="shrink-0"><ClusterBadge cluster={quota.cluster} size="sm" /></span>}
                      {quota.namespace && (
                        <span className="flex items-center gap-1 truncate">
                          <span>/</span>
                          <span className="truncate">{quota.namespace}</span>
                        </span>
                      )}
                      {quota.quotaName && (
                        <span className="flex items-center gap-1 truncate">
                          <span>/</span>
                          <span className="text-yellow-400 truncate">{quota.quotaName}</span>
                        </span>
                      )}
                    </div>
                    {fullQuota && (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => onEditQuota(fullQuota)}
                          className="p-1 hover:bg-secondary rounded text-muted-foreground hover:text-blue-400"
                          title="Edit quota"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => onDeleteQuota({ cluster: fullQuota.cluster ?? '', namespace: fullQuota.namespace, name: fullQuota.name })}
                          className="p-1 hover:bg-secondary rounded text-muted-foreground hover:text-red-400"
                          title="Delete quota"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                )}
                <div className="flex flex-wrap items-center justify-between gap-y-2 mb-2">
                  <div className="flex items-center gap-2">
                    <Icon className={`w-4 h-4 ${USAGE_TEXT_CLASSES[color]}`} />
                    <span className="text-sm text-foreground">{quota.resource}</span>
                    {quota.rawResource.includes('gpu') && (
                      <Zap className="w-3 h-3 text-purple-400" />
                    )}
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {quota.used} / {quota.limit}
                  </span>
                </div>
                <div className="h-2 bg-secondary rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${USAGE_BAR_CLASSES[color]}`}
                    style={{ width: `${Math.min(quota.percent, 100)}%` }}
                  />
                </div>
                <div className="flex justify-end mt-1">
                  <span className={`text-xs ${USAGE_TEXT_CLASSES[color]}`}>{quota.percent.toFixed(0)}%</span>
                </div>
              </div>
            )
          })
        ) : (
          paginatedLimits.map((item, idx) => {
            const showScope = selectedCluster === 'all' || selectedNamespace === 'all'
            return (
              <div
                key={`${item.cluster}-${item.namespace}-${item.name}-${item.type}-${idx}`}
                className={`p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors ${isFetchingData ? 'opacity-50' : ''}`}
              >
                {showScope && (
                  <div className="flex items-center gap-1 mb-2 text-xs text-muted-foreground min-w-0 overflow-hidden">
                    {item.cluster && <span className="shrink-0"><ClusterBadge cluster={item.cluster} size="sm" /></span>}
                    {item.namespace && (
                      <span className="flex items-center gap-1 truncate">
                        <span>/</span>
                        <span className="truncate">{item.namespace}</span>
                      </span>
                    )}
                  </div>
                )}
                <div className="flex flex-wrap items-center justify-between gap-y-2">
                  <div className="flex items-center gap-2">
                    <Gauge className="w-4 h-4 text-blue-400" />
                    <span className="text-sm text-foreground">{item.name}</span>
                    <StatusBadge color="blue">{item.type}</StatusBadge>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="mt-2 ml-6 text-xs text-muted-foreground space-y-1">
                  {item.limits.default && <div>Default: {formatLimits(item.limits.default)}</div>}
                  {item.limits.defaultRequest && <div>Default Request: {formatLimits(item.limits.defaultRequest)}</div>}
                  {item.limits.max && <div>Max: {formatLimits(item.limits.max)}</div>}
                  {item.limits.min && <div>Min: {formatLimits(item.limits.min)}</div>}
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Pagination */}
      <CardPaginationFooter
        currentPage={activePagination.currentPage}
        totalPages={activePagination.totalPages}
        totalItems={activePagination.totalItems}
        itemsPerPage={activePagination.itemsPerPage}
        onPageChange={activePagination.goToPage}
        needsPagination={activePagination.needsPagination}
      />

      {/* Footer legend */}
      <div className="mt-4 pt-3 border-t border-border/50 text-xs text-muted-foreground">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span>&lt;70%</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-orange-500" />
            <span>70-90%</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-red-500" />
            <span>&gt;90%</span>
          </div>
        </div>
      </div>
    </>
  )
})
