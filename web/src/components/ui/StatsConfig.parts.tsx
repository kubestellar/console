import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronRight, Eye, EyeOff, GripVertical, Plus, Search, Trash2 } from 'lucide-react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Button } from './Button'
import { cn } from '../../lib/cn'
import type { DashboardStatsType, StatBlockConfig } from './Stats.types'

const COLOR_CLASSES: Record<string, string> = {
  purple: 'text-purple-400',
  green: 'text-green-400',
  orange: 'text-orange-400',
  yellow: 'text-yellow-400',
  cyan: 'text-cyan-400',
  blue: 'text-blue-400',
  red: 'text-red-400',
  gray: 'text-muted-foreground',
  indigo: 'text-blue-400',
  teal: 'text-cyan-400',
}

const ICON_EMOJIS: Record<string, string> = {
  Server: '🖥️',
  CheckCircle2: '✅',
  XCircle: '❌',
  WifiOff: '📡',
  Box: '📦',
  Cpu: '🔲',
  MemoryStick: '💾',
  HardDrive: '💽',
  Zap: '⚡',
  Layers: '🗂️',
  FolderOpen: '📁',
  AlertCircle: '🔴',
  AlertTriangle: '⚠️',
  AlertOctagon: '🛑',
  Package: '📦',
  Ship: '🚢',
  Settings: '⚙️',
  Clock: '🕐',
  MoreHorizontal: '⋯',
  Database: '🗄️',
  Workflow: '🔄',
  Globe: '🌐',
  Network: '🔗',
  ArrowRightLeft: '↔️',
  CircleDot: '⊙',
  ShieldAlert: '🛡',
  ShieldOff: '⛔',
  User: '👤',
  Info: '💡',
  Percent: '💯',
  ClipboardList: '📋',
  Sparkles: '✨',
  Activity: '📈',
  List: '📜',
  DollarSign: '💵',
  Newspaper: '📰',
  RefreshCw: '🔄',
  ArrowUpCircle: '⬆️',
  FileCode: '📄',
  RotateCcw: '🔄',
  FolderTree: '🌲',
  Shield: '🛡️',
}

export interface DashboardCategoryItem {
  type: DashboardStatsType
  name: string
  icon: string
}

interface SortableStatRowProps {
  block: StatBlockConfig
  onToggleVisibility: (id: string) => void
  onRemove?: (id: string) => void
  isCustom?: boolean
}

export function SortableStatRow({ block, onToggleVisibility, onRemove, isCustom }: SortableStatRowProps) {
  const { t } = useTranslation()
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: block.id })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('flex items-center gap-3 rounded-lg bg-secondary/30 p-3', !block.visible && 'opacity-50')}
    >
      <Button
        variant="ghost"
        size="sm"
        className="cursor-grab p-1 active:cursor-grabbing"
        icon={<GripVertical className="h-4 w-4 text-muted-foreground" />}
        {...attributes}
        {...listeners}
      />
      <div className={cn('h-5 w-5', COLOR_CLASSES[block.color] || 'text-foreground')}>
        <span className="text-sm">{ICON_EMOJIS[block.icon] || '📊'}</span>
      </div>
      <span className="flex-1 text-sm text-foreground">{block.name}</span>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onToggleVisibility(block.id)}
        className={cn('p-1', block.visible ? 'text-green-400' : 'text-muted-foreground')}
        title={block.visible ? 'Hide' : 'Show'}
        icon={block.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
      />
      {isCustom && onRemove && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onRemove(block.id)}
          className="p-1 text-muted-foreground hover:bg-red-500/20 hover:text-red-400"
          title={t('common.remove')}
          icon={<Trash2 className="h-4 w-4" />}
        />
      )}
    </div>
  )
}

interface AvailableStatItemProps {
  block: StatBlockConfig
  onAdd: (block: StatBlockConfig) => void
}

export function AvailableStatItem({ block, onAdd }: AvailableStatItemProps) {
  return (
    <Button
      variant="ghost"
      size="md"
      onClick={() => onAdd(block)}
      className="w-full justify-start rounded-lg pl-8"
      fullWidth
      iconRight={<Plus className="h-4 w-4 text-muted-foreground" />}
    >
      <div className={cn('h-5 w-5', COLOR_CLASSES[block.color] || 'text-foreground')}>
        <span className="text-sm">{ICON_EMOJIS[block.icon] || '📊'}</span>
      </div>
      <span className="flex-1 text-left text-sm text-foreground">{block.name}</span>
    </Button>
  )
}

interface DashboardCategorySectionProps {
  category: DashboardCategoryItem
  availableBlocks: StatBlockConfig[]
  onAdd: (block: StatBlockConfig) => void
  isExpanded: boolean
  onToggle: () => void
}

export function DashboardCategorySection({
  category,
  availableBlocks,
  onAdd,
  isExpanded,
  onToggle,
}: DashboardCategorySectionProps) {
  if (availableBlocks.length === 0) {
    return null
  }

  return (
    <div className="last:border-b-0 border-b border-border/50">
      <Button
        variant="ghost"
        size="md"
        onClick={onToggle}
        className="w-full justify-start"
        fullWidth
        icon={isExpanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
        iconRight={<span className="text-xs text-muted-foreground">{availableBlocks.length}</span>}
      >
        <span className="text-base">{category.icon}</span>
        <span className="flex-1 text-left text-sm font-medium text-foreground">{category.name}</span>
      </Button>
      {isExpanded && (
        <div className="ml-2 border-l-2 border-purple-500/30">
          {(availableBlocks || []).map(block => (
            <AvailableStatItem key={block.id} block={block} onAdd={onAdd} />
          ))}
        </div>
      )}
    </div>
  )
}

interface AddStatsPanelProps {
  showAddPanel: boolean
  searchQuery: string
  onSearchQueryChange: (query: string) => void
  onHideAddPanel: () => void
  onShowAddPanel: () => void
  hasAvailableStats: boolean
  dashboardCategories: DashboardCategoryItem[]
  availableStatsByCategory: Map<DashboardStatsType, StatBlockConfig[]>
  expandedCategories: Set<string>
  onToggleCategory: (type: string) => void
  onAdd: (block: StatBlockConfig) => void
  searchPlaceholder: string
  doneLabel: string
  addFromDashboardsLabel: string
  noSearchResultsLabel: string
  allStatsAddedLabel: string
}

export function AddStatsPanel({
  showAddPanel,
  searchQuery,
  onSearchQueryChange,
  onHideAddPanel,
  onShowAddPanel,
  hasAvailableStats,
  dashboardCategories,
  availableStatsByCategory,
  expandedCategories,
  onToggleCategory,
  onAdd,
  searchPlaceholder,
  doneLabel,
  addFromDashboardsLabel,
  noSearchResultsLabel,
  allStatsAddedLabel,
}: AddStatsPanelProps) {
  if (!showAddPanel) {
    return (
      <Button
        variant="ghost"
        size="md"
        onClick={onShowAddPanel}
        className="mt-4 w-full border border-dashed border-border hover:border-purple-500/50"
        icon={<Plus className="h-4 w-4" />}
        fullWidth
      >
        {addFromDashboardsLabel}
      </Button>
    )
  }

  return (
    <div className="mt-4 border-t border-border pt-4">
      <div className="mb-3 flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={event => onSearchQueryChange(event.target.value)}
            placeholder={searchPlaceholder}
            className="w-full rounded-lg border border-border bg-secondary/30 py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-purple-500/50"
            autoFocus
          />
        </div>
        <Button variant="ghost" size="sm" onClick={onHideAddPanel}>
          {doneLabel}
        </Button>
      </div>

      <div className="min-h-48 max-h-80 space-y-0 overflow-y-auto rounded-lg border border-border/50">
        {hasAvailableStats ? (
          dashboardCategories.map(category => {
            const categoryBlocks = availableStatsByCategory.get(category.type)
            if (!categoryBlocks || categoryBlocks.length === 0) {
              return null
            }

            return (
              <DashboardCategorySection
                key={category.type}
                category={category}
                availableBlocks={categoryBlocks}
                onAdd={onAdd}
                isExpanded={expandedCategories.has(category.type)}
                onToggle={() => onToggleCategory(category.type)}
              />
            )
          })
        ) : (
          <p className="py-4 text-center text-sm text-muted-foreground">
            {searchQuery ? noSearchResultsLabel : allStatsAddedLabel}
          </p>
        )}
      </div>
    </div>
  )
}
