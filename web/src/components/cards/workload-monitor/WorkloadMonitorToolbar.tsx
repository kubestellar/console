import { Search, List, GitBranch } from 'lucide-react'
import { CardControls } from '../../ui/CardControls'
import type { MonitorViewMode, ResourceCategory, ResourceHealthStatus } from '../../../types/workloadMonitor'
import { useTranslation } from 'react-i18next'

interface ToolbarProps {
  search: string
  onSearchChange: (v: string) => void
  viewMode: MonitorViewMode
  onViewModeChange: (v: MonitorViewMode) => void
  categoryFilter: ResourceCategory | 'all'
  onCategoryFilterChange: (v: ResourceCategory | 'all') => void
  statusFilter: ResourceHealthStatus | 'all'
  onStatusFilterChange: (v: ResourceHealthStatus | 'all') => void
  totalItems: number
  issueCount: number
  sortBy: string
  onSortChange: (v: string) => void
  sortDirection: 'asc' | 'desc'
  onSortDirectionChange: (v: 'asc' | 'desc') => void
  limit: number | 'unlimited'
  onLimitChange: (v: number | 'unlimited') => void
}

const SORT_OPTIONS = [
  { value: 'name', label: 'Name' },
  { value: 'kind', label: 'Kind' },
  { value: 'status', label: 'Status' },
  { value: 'category', label: 'Category' },
  { value: 'order', label: 'Apply Order' },
]

export function WorkloadMonitorToolbar({
  search,
  onSearchChange,
  viewMode,
  onViewModeChange,
  categoryFilter,
  onCategoryFilterChange,
  statusFilter,
  onStatusFilterChange,
  totalItems,
  issueCount,
  sortBy,
  onSortChange,
  sortDirection,
  onSortDirectionChange,
  limit,
  onLimitChange,
}: ToolbarProps) {
  const { t } = useTranslation()
  return (
    <div className="space-y-2 mb-3">
      {/* Top row: summary + controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400">
            {totalItems} resources
          </span>
          {issueCount > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">
              {issueCount} issue{issueCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* View mode toggle */}
          <div className="flex rounded-md border border-border overflow-hidden">
            <button
              onClick={() => onViewModeChange('tree')}
              className={`p-1 ${viewMode === 'tree' ? 'bg-purple-500/20 text-purple-400' : 'text-muted-foreground hover:text-foreground'}`}
              title="Tree view"
            >
              <GitBranch className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onViewModeChange('list')}
              className={`p-1 ${viewMode === 'list' ? 'bg-purple-500/20 text-purple-400' : 'text-muted-foreground hover:text-foreground'}`}
              title="List view"
            >
              <List className="w-3.5 h-3.5" />
            </button>
          </div>
          {/* Category filter */}
          <select
            value={categoryFilter}
            onChange={(e) => onCategoryFilterChange(e.target.value as ResourceCategory | 'all')}
            className="px-2 py-1 text-xs rounded-lg bg-secondary border border-border text-foreground"
          >
            <option value="all">All Categories</option>
            <option value="rbac">RBAC</option>
            <option value="config">Config</option>
            <option value="networking">Networking</option>
            <option value="scaling">Scaling</option>
            <option value="storage">{t('common.storage')}</option>
            <option value="crd">CRDs</option>
            <option value="admission">Admission</option>
          </select>
          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={(e) => onStatusFilterChange(e.target.value as ResourceHealthStatus | 'all')}
            className="px-2 py-1 text-xs rounded-lg bg-secondary border border-border text-foreground"
          >
            <option value="all">All Status</option>
            <option value="healthy">{t('common.healthy')}</option>
            <option value="degraded">{t('common.degraded')}</option>
            <option value="unhealthy">{t('common.unhealthy')}</option>
            <option value="missing">Missing</option>
          </select>
          <CardControls
            limit={limit}
            onLimitChange={onLimitChange}
            sortBy={sortBy}
            sortOptions={SORT_OPTIONS}
            onSortChange={onSortChange}
            sortDirection={sortDirection}
            onSortDirectionChange={onSortDirectionChange}
          />
        </div>
      </div>
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={t('common.searchResources')}
          className="w-full pl-8 pr-3 py-1.5 text-xs bg-secondary rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-purple-500/50"
        />
      </div>
    </div>
  )
}
