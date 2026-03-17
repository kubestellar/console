import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Settings, Check, GripVertical, Eye, EyeOff, Plus, Trash2, Search, ChevronRight, ChevronDown } from 'lucide-react'
import { Button } from './Button'
import { BaseModal } from '../../lib/modals'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  StatBlockConfig,
  DashboardStatsType,
  ALL_STAT_BLOCKS,
  getDefaultStatBlocks,
  getDefaultDisplayMode,
  getStatsStorageKey,
  CLUSTERS_STAT_BLOCKS,
  WORKLOADS_STAT_BLOCKS,
  PODS_STAT_BLOCKS,
  GITOPS_STAT_BLOCKS,
  STORAGE_STAT_BLOCKS,
  NETWORK_STAT_BLOCKS,
  SECURITY_STAT_BLOCKS,
  COMPLIANCE_STAT_BLOCKS,
  DATA_COMPLIANCE_STAT_BLOCKS,
  COMPUTE_STAT_BLOCKS,
  EVENTS_STAT_BLOCKS,
  COST_STAT_BLOCKS,
  ALERTS_STAT_BLOCKS,
  DASHBOARD_STAT_BLOCKS,
  OPERATORS_STAT_BLOCKS,
} from './StatsBlockDefinitions'
import { safeGetJSON, safeSetJSON, safeRemoveItem } from '../../lib/utils/localStorage'

// Re-export for backward compatibility
export type { StatBlockConfig, DashboardStatsType }
export { ALL_STAT_BLOCKS, getDefaultStatBlocks, getStatsStorageKey }

// Color classes for rendering
const colorClasses: Record<string, string> = {
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

// Icon emoji mapping for the config modal
const iconEmojis: Record<string, string> = {
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
  ShieldAlert: '🛡️',
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

interface SortableItemProps {
  block: StatBlockConfig
  onToggleVisibility: (id: string) => void
  onRemove?: (id: string) => void
  isCustom?: boolean
}

function SortableItem({ block, onToggleVisibility, onRemove, isCustom }: SortableItemProps) {
  const { t } = useTranslation()
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: block.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 p-3 rounded-lg bg-secondary/30 ${
        block.visible ? '' : 'opacity-50'
      }`}
    >
      <Button
        variant="ghost"
        size="sm"
        className="cursor-grab active:cursor-grabbing p-1"
        icon={<GripVertical className="w-4 h-4 text-muted-foreground" />}
        {...attributes}
        {...listeners}
      />
      <div className={`w-5 h-5 ${colorClasses[block.color] || 'text-foreground'}`}>
        <span className="text-sm">{iconEmojis[block.icon] || '📊'}</span>
      </div>
      <span className="flex-1 text-sm text-foreground">{block.name}</span>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onToggleVisibility(block.id)}
        className={`p-1 ${
          block.visible
            ? 'text-green-400'
            : 'text-muted-foreground'
        }`}
        title={block.visible ? 'Hide' : 'Show'}
        icon={block.visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
      />
      {isCustom && onRemove && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onRemove(block.id)}
          className="p-1 hover:bg-red-500/20 text-muted-foreground hover:text-red-400"
          title={t('common.remove')}
          icon={<Trash2 className="w-4 h-4" />}
        />
      )}
    </div>
  )
}

/**
 * Dashboard categories with display names and icons
 */
const DASHBOARD_CATEGORIES: { type: DashboardStatsType; name: string; icon: string }[] = [
  { type: 'clusters', name: 'Clusters', icon: '🖥️' },
  { type: 'workloads', name: 'Workloads', icon: '📦' },
  { type: 'pods', name: 'Pods', icon: '🗂️' },
  { type: 'compute', name: 'Compute', icon: '🔲' },
  { type: 'gitops', name: 'GitOps', icon: '🚢' },
  { type: 'storage', name: 'Storage', icon: '💽' },
  { type: 'network', name: 'Network', icon: '🌐' },
  { type: 'security', name: 'Security', icon: '🛡️' },
  { type: 'compliance', name: 'Security Posture', icon: '🔒' },
  { type: 'data-compliance', name: 'Data Compliance', icon: '📋' },
  { type: 'events', name: 'Events', icon: '📜' },
  { type: 'cost', name: 'Cost', icon: '💵' },
  { type: 'alerts', name: 'Alerts', icon: '🔴' },
  { type: 'operators', name: 'Operators', icon: '⚙️' },
  { type: 'dashboard', name: 'Main Dashboard', icon: '📊' },
  { type: 'ci-cd', name: 'CI/CD', icon: '🔄' },
]

/**
 * Get stat blocks for a specific dashboard type
 */
function getStatBlocksForDashboard(dashboardType: DashboardStatsType): StatBlockConfig[] {
  switch (dashboardType) {
    case 'clusters': return CLUSTERS_STAT_BLOCKS
    case 'workloads': return WORKLOADS_STAT_BLOCKS
    case 'pods': return PODS_STAT_BLOCKS
    case 'gitops': return GITOPS_STAT_BLOCKS
    case 'storage': return STORAGE_STAT_BLOCKS
    case 'network': return NETWORK_STAT_BLOCKS
    case 'security': return SECURITY_STAT_BLOCKS
    case 'compliance': return COMPLIANCE_STAT_BLOCKS
    case 'data-compliance': return DATA_COMPLIANCE_STAT_BLOCKS
    case 'compute': return COMPUTE_STAT_BLOCKS
    case 'events': return EVENTS_STAT_BLOCKS
    case 'cost': return COST_STAT_BLOCKS
    case 'alerts': return ALERTS_STAT_BLOCKS
    case 'dashboard': return DASHBOARD_STAT_BLOCKS
    case 'operators': return OPERATORS_STAT_BLOCKS
    case 'ci-cd': return GITOPS_STAT_BLOCKS
    default: return []
  }
}

interface AvailableStatItemProps {
  block: StatBlockConfig
  onAdd: (block: StatBlockConfig) => void
}

function AvailableStatItem({ block, onAdd }: AvailableStatItemProps) {
  return (
    <Button
      variant="ghost"
      size="md"
      onClick={() => onAdd(block)}
      className="w-full justify-start pl-8 rounded-lg"
      fullWidth
      iconRight={<Plus className="w-4 h-4 text-muted-foreground" />}
    >
      <div className={`w-5 h-5 ${colorClasses[block.color] || 'text-foreground'}`}>
        <span className="text-sm">{iconEmojis[block.icon] || '📊'}</span>
      </div>
      <span className="flex-1 text-sm text-foreground text-left">{block.name}</span>
    </Button>
  )
}

interface DashboardCategoryProps {
  category: { type: DashboardStatsType; name: string; icon: string }
  availableBlocks: StatBlockConfig[]
  onAdd: (block: StatBlockConfig) => void
  isExpanded: boolean
  onToggle: () => void
}

function DashboardCategory({ category, availableBlocks, onAdd, isExpanded, onToggle }: DashboardCategoryProps) {
  if (availableBlocks.length === 0) return null

  return (
    <div className="border-b border-border/50 last:border-b-0">
      <Button
        variant="ghost"
        size="md"
        onClick={onToggle}
        className="w-full justify-start"
        fullWidth
        icon={isExpanded ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        )}
        iconRight={<span className="text-xs text-muted-foreground">{availableBlocks.length}</span>}
      >
        <span className="text-base">{category.icon}</span>
        <span className="flex-1 text-sm font-medium text-foreground text-left">{category.name}</span>
      </Button>
      {isExpanded && (
        <div className="border-l-2 border-purple-500/30 ml-2">
          {availableBlocks.map(block => (
            <AvailableStatItem key={block.id} block={block} onAdd={onAdd} />
          ))}
        </div>
      )}
    </div>
  )
}

interface StatsConfigModalProps {
  isOpen: boolean
  onClose: () => void
  blocks: StatBlockConfig[]
  onSave: (blocks: StatBlockConfig[]) => void
  defaultBlocks: StatBlockConfig[]
  title?: string
}

export function StatsConfigModal({
  isOpen,
  onClose,
  blocks,
  onSave,
  defaultBlocks,
  title = 'Configure Stats',
}: StatsConfigModalProps) {
  const { t: _t } = useTranslation()
  const [localBlocks, setLocalBlocks] = useState<StatBlockConfig[]>(blocks)
  const [showAddPanel, setShowAddPanel] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (isOpen) {
      setLocalBlocks(blocks)
      setShowAddPanel(false)
      setSearchQuery('')
      setExpandedCategories(new Set())
    }
  }, [isOpen, blocks])

  const toggleCategory = (type: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev)
      if (next.has(type)) {
        next.delete(type)
      } else {
        next.add(type)
      }
      return next
    })
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  // Get IDs of blocks in the current dashboard defaults
  const defaultBlockIds = useMemo(() => new Set(defaultBlocks.map(b => b.id)), [defaultBlocks])

  // Get current block IDs to filter out already-added stats
  const currentBlockIds = useMemo(() => new Set(localBlocks.map(b => b.id)), [localBlocks])

  // Get available stats per dashboard category, filtered by search
  const availableStatsByCategory = useMemo(() => {
    const query = searchQuery.toLowerCase().trim()
    const result: Map<DashboardStatsType, StatBlockConfig[]> = new Map()

    for (const category of DASHBOARD_CATEGORIES) {
      const blocks = getStatBlocksForDashboard(category.type)
        .filter(block => !currentBlockIds.has(block.id))
        .filter(block =>
          !query ||
          block.name.toLowerCase().includes(query) ||
          block.id.toLowerCase().includes(query) ||
          category.name.toLowerCase().includes(query)
        )
      if (blocks.length > 0) {
        result.set(category.type, blocks)
      }
    }
    return result
  }, [currentBlockIds, searchQuery])

  // Check if any stats are available
  const hasAvailableStats = availableStatsByCategory.size > 0

  // Auto-expand categories when searching
  useEffect(() => {
    if (searchQuery.trim()) {
      // Expand all categories that have matching results
      setExpandedCategories(new Set(availableStatsByCategory.keys()))
    }
  }, [searchQuery, availableStatsByCategory])

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      setLocalBlocks(prev => {
        const oldIndex = prev.findIndex(b => b.id === active.id)
        const newIndex = prev.findIndex(b => b.id === over.id)
        return arrayMove(prev, oldIndex, newIndex)
      })
    }
  }

  const toggleVisibility = (id: string) => {
    setLocalBlocks(prev =>
      prev.map(b => b.id === id ? { ...b, visible: !b.visible } : b)
    )
  }

  const handleAddStat = (block: StatBlockConfig) => {
    setLocalBlocks(prev => [...prev, { ...block, visible: true }])
  }

  const handleRemoveStat = (id: string) => {
    setLocalBlocks(prev => prev.filter(b => b.id !== id))
  }

  const handleSave = () => {
    onSave(localBlocks)
    onClose()
  }

  const handleReset = () => {
    setLocalBlocks(defaultBlocks)
  }

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} size="lg" closeOnBackdrop={false}>
      <BaseModal.Header
        title={title}
        description="Drag to reorder. Click the eye icon to show/hide stats."
        icon={Settings}
        onClose={onClose}
        showBack={false}
      />

      <BaseModal.Content className="max-h-[65vh]">
        {/* Current Stats */}
        <div className="space-y-2">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={localBlocks.map(b => b.id)} strategy={verticalListSortingStrategy}>
              {localBlocks.map(block => (
                <SortableItem
                  key={block.id}
                  block={block}
                  onToggleVisibility={toggleVisibility}
                  onRemove={handleRemoveStat}
                  isCustom={!defaultBlockIds.has(block.id)}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>

        {/* Add Stats Panel */}
        {showAddPanel ? (
          <div className="mt-4 pt-4 border-t border-border">
            <div className="flex items-center gap-2 mb-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search all available stats..."
                  className="w-full pl-9 pr-3 py-2 bg-secondary/30 border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-purple-500/50"
                  autoFocus
                />
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAddPanel(false)}
              >
                Done
              </Button>
            </div>
            <div className="space-y-0 min-h-48 max-h-80 overflow-y-auto border border-border/50 rounded-lg">
              {hasAvailableStats ? (
                DASHBOARD_CATEGORIES.map(category => {
                  const categoryBlocks = availableStatsByCategory.get(category.type)
                  if (!categoryBlocks || categoryBlocks.length === 0) return null
                  return (
                    <DashboardCategory
                      key={category.type}
                      category={category}
                      availableBlocks={categoryBlocks}
                      onAdd={handleAddStat}
                      isExpanded={expandedCategories.has(category.type)}
                      onToggle={() => toggleCategory(category.type)}
                    />
                  )
                })
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  {searchQuery ? 'No stats match your search' : 'All stats are already added'}
                </p>
              )}
            </div>
          </div>
        ) : (
          <Button
            variant="ghost"
            size="md"
            onClick={() => setShowAddPanel(true)}
            className="mt-4 w-full border border-dashed border-border hover:border-purple-500/50"
            icon={<Plus className="w-4 h-4" />}
            fullWidth
          >
            Add stat from other dashboards
          </Button>
        )}
      </BaseModal.Content>

      <BaseModal.Footer>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleReset}
        >
          Reset to Default
        </Button>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="md"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            variant="accent"
            size="md"
            onClick={handleSave}
            icon={<Check className="w-4 h-4" />}
          >
            Save
          </Button>
        </div>
      </BaseModal.Footer>
    </BaseModal>
  )
}

/**
 * Hook to manage stats configuration for any dashboard
 */
export function useStatsConfig(
  dashboardType: DashboardStatsType,
  storageKey?: string
) {
  const defaultBlocks = getDefaultStatBlocks(dashboardType)
  const key = storageKey || getStatsStorageKey(dashboardType)

  // Apply default display modes from STAT_DISPLAY_MODE_DEFAULTS to blocks
  // that don't have an explicit displayMode set
  const applyDefaultModes = (blockList: StatBlockConfig[]): StatBlockConfig[] =>
    blockList.map(b => ({
      ...b,
      displayMode: b.displayMode ?? getDefaultDisplayMode(dashboardType, b.id),
    }))

  const [blocks, setBlocks] = useState<StatBlockConfig[]>(() => {
    const saved = safeGetJSON<StatBlockConfig[]>(key)
    if (saved) {
      // Remove stale saved blocks whose IDs no longer exist in any definition
      const validIds = new Set(ALL_STAT_BLOCKS.map(b => b.id))
      const cleaned = saved.filter(b => validIds.has(b.id))
      // Merge with defaults to handle new blocks added in updates
      const savedIds = new Set(cleaned.map(b => b.id))
      const merged = [...cleaned]
      defaultBlocks.forEach(defaultBlock => {
        if (!savedIds.has(defaultBlock.id)) {
          merged.push(defaultBlock)
        }
      })
      return applyDefaultModes(merged)
    }
    return applyDefaultModes(defaultBlocks)
  })

  const saveBlocks = (newBlocks: StatBlockConfig[]) => {
    setBlocks(newBlocks)
    safeSetJSON(key, newBlocks)
  }

  const resetBlocks = () => {
    setBlocks(defaultBlocks)
    safeRemoveItem(key)
  }

  const visibleBlocks = blocks.filter(b => b.visible)

  return {
    blocks,
    saveBlocks,
    resetBlocks,
    visibleBlocks,
    defaultBlocks,
  }
}
