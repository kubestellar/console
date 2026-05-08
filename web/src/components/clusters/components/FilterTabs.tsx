import { WifiOff, SortAsc, SortDesc, LayoutGrid, List, Grid3X3, Columns, Plus, Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../../lib/cn'
import { ClusterStats } from './StatsOverview'
import { ClusterLayoutMode } from './ClusterGrid'

export type FilterType = 'all' | 'healthy' | 'unhealthy' | 'unreachable'
export type SortByType = 'name' | 'nodes' | 'pods' | 'health' | 'provider' | 'custom'

interface FilterTabsProps {
  stats: ClusterStats
  filter: FilterType
  onFilterChange: (filter: FilterType) => void
  sortBy: SortByType
  onSortByChange: (sortBy: SortByType) => void
  sortAsc: boolean
  onSortAscChange: (asc: boolean) => void
  layoutMode?: ClusterLayoutMode
  onLayoutModeChange?: (mode: ClusterLayoutMode) => void
  onAddCluster?: () => void
  onCreateClusterWithAI?: () => void
}

const LAYOUT_OPTIONS: { mode: ClusterLayoutMode; icon: typeof LayoutGrid; label: string }[] = [
  { mode: 'grid', icon: LayoutGrid, label: 'Grid (3 columns)' },
  { mode: 'list', icon: List, label: 'List view' },
  { mode: 'compact', icon: Grid3X3, label: 'Compact (small cards)' },
  { mode: 'wide', icon: Columns, label: 'Wide (2 columns)' },
]

const ACTION_BUTTON_CLASSES = cn(
  'flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors',
  'bg-primary text-primary-foreground hover:bg-primary/90',
)

const AI_ACTION_BUTTON_CLASSES = cn(
  'flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors',
  'bg-card/50 border-border text-muted-foreground hover:bg-secondary hover:text-foreground',
)

export function FilterTabs({
  stats,
  filter,
  onFilterChange,
  sortBy,
  onSortByChange,
  sortAsc,
  onSortAscChange,
  layoutMode = 'grid',
  onLayoutModeChange,
  onAddCluster,
  onCreateClusterWithAI,
}: FilterTabsProps) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-wrap gap-2 mb-4">
      <button
        onClick={() => onFilterChange('all')}
        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
          filter === 'all'
            ? 'bg-primary text-primary-foreground'
            : 'bg-card/50 text-muted-foreground hover:text-foreground'
        }`}
      >
        All ({stats.total})
      </button>
      <button
        onClick={() => onFilterChange('healthy')}
        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
          filter === 'healthy'
            ? 'bg-green-500 text-foreground'
            : 'bg-card/50 text-muted-foreground hover:text-foreground'
        }`}
      >
        Healthy ({stats.healthy})
      </button>
      <button
        onClick={() => onFilterChange('unhealthy')}
        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
          filter === 'unhealthy'
            ? 'bg-orange-500 text-foreground'
            : 'bg-card/50 text-muted-foreground hover:text-foreground'
        }`}
      >
        Unhealthy ({stats.unhealthy})
      </button>
      <button
        onClick={() => onFilterChange('unreachable')}
        className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
          filter === 'unreachable'
            ? 'bg-yellow-500 text-foreground'
            : 'bg-card/50 text-muted-foreground hover:text-foreground'
        }`}
        title="Clusters that cannot be contacted - check network connection"
      >
        <WifiOff className="w-3.5 h-3.5" />
        Offline ({stats.unreachable})
      </button>

      {/* Add Cluster, Create with AI, Layout, and Sort */}
      <div className="ml-auto flex items-center gap-3">
        {/* Add Cluster + Create Cluster with AI */}
        {(onAddCluster || onCreateClusterWithAI) && (
          <div className="flex items-center gap-2">
            {onAddCluster && (
              <button
                onClick={onAddCluster}
                className={ACTION_BUTTON_CLASSES}
              >
                <Plus className="w-4 h-4" />
                {t('cluster.addCluster')}
              </button>
            )}
            {onCreateClusterWithAI && (
              <button
                onClick={onCreateClusterWithAI}
                className={AI_ACTION_BUTTON_CLASSES}
              >
                <Sparkles className="w-4 h-4" />
                {t('cluster.createClusterWithAI')}
              </button>
            )}
          </div>
        )}
        {/* Layout mode selector */}
        {onLayoutModeChange && (
          <div className="flex items-center gap-1 border-r border-border pr-3">
            {LAYOUT_OPTIONS.map(({ mode, icon: Icon, label }) => (
              <button
                key={mode}
                onClick={() => onLayoutModeChange(mode)}
                className={`p-1.5 rounded-lg transition-colors ${
                  layoutMode === mode
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-card/50 text-muted-foreground hover:text-foreground hover:bg-secondary'
                }`}
                title={label}
              >
                <Icon className="w-4 h-4" />
              </button>
            ))}
          </div>
        )}

        {/* Sort selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{t('actions.sort')}:</span>
          <select
            value={sortBy}
            onChange={(e) => onSortByChange(e.target.value as SortByType)}
            className="px-2 py-1.5 rounded-lg text-sm bg-card/50 border border-border text-foreground"
            aria-label={t('actions.sort')}
          >
            <option value="custom">{t('common.custom')}</option>
            <option value="name">{t('common.name')}</option>
            <option value="nodes">{t('common.nodes')}</option>
            <option value="pods">{t('common.pods')}</option>
            <option value="health">{t('common.health')}</option>
            <option value="provider">{t('common.provider')}</option>
          </select>
          <button
            onClick={() => onSortAscChange(!sortAsc)}
            className="p-1.5 rounded-lg bg-card/50 border border-border text-muted-foreground hover:text-foreground"
            title={sortAsc ? 'Ascending' : 'Descending'}
            aria-label={sortAsc ? 'Ascending' : 'Descending'}
          >
            {sortAsc ? <SortAsc className="w-4 h-4" /> : <SortDesc className="w-4 h-4" />}
          </button>
        </div>

      </div>
    </div>
  )
}
