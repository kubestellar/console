import { useState, useEffect, useMemo } from 'react'
import { Settings, Check, GripVertical, Eye, EyeOff, Plus, Trash2, Search } from 'lucide-react'
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

/**
 * Configuration for a single stat block
 */
export interface StatBlockConfig {
  id: string
  name: string
  icon: string
  visible: boolean
  color: string
}

/**
 * All available stat block definitions for each dashboard type
 */
export type DashboardStatsType =
  | 'clusters'
  | 'workloads'
  | 'pods'
  | 'gitops'
  | 'storage'
  | 'network'
  | 'security'
  | 'compliance'
  | 'compute'
  | 'events'
  | 'cost'
  | 'alerts'
  | 'dashboard'
  | 'operators'

/**
 * Default stat blocks for the Clusters dashboard
 */
export const CLUSTERS_STAT_BLOCKS: StatBlockConfig[] = [
  { id: 'clusters', name: 'Clusters', icon: 'Server', visible: true, color: 'purple' },
  { id: 'healthy', name: 'Healthy', icon: 'CheckCircle2', visible: true, color: 'green' },
  { id: 'unhealthy', name: 'Unhealthy', icon: 'XCircle', visible: true, color: 'orange' },
  { id: 'unreachable', name: 'Offline', icon: 'WifiOff', visible: true, color: 'yellow' },
  { id: 'nodes', name: 'Nodes', icon: 'Box', visible: true, color: 'cyan' },
  { id: 'cpus', name: 'CPUs', icon: 'Cpu', visible: true, color: 'blue' },
  { id: 'memory', name: 'Memory', icon: 'MemoryStick', visible: true, color: 'green' },
  { id: 'storage', name: 'Storage', icon: 'HardDrive', visible: true, color: 'purple' },
  { id: 'gpus', name: 'GPUs', icon: 'Zap', visible: true, color: 'yellow' },
  { id: 'pods', name: 'Pods', icon: 'Layers', visible: true, color: 'purple' },
]

/**
 * Default stat blocks for the Workloads dashboard
 */
export const WORKLOADS_STAT_BLOCKS: StatBlockConfig[] = [
  { id: 'namespaces', name: 'Namespaces', icon: 'FolderOpen', visible: true, color: 'purple' },
  { id: 'critical', name: 'Critical', icon: 'AlertCircle', visible: true, color: 'red' },
  { id: 'warning', name: 'Warning', icon: 'AlertTriangle', visible: true, color: 'yellow' },
  { id: 'healthy', name: 'Healthy', icon: 'CheckCircle2', visible: true, color: 'green' },
  { id: 'deployments', name: 'Deployments', icon: 'Layers', visible: true, color: 'blue' },
  { id: 'pod_issues', name: 'Pod Issues', icon: 'AlertOctagon', visible: true, color: 'orange' },
  { id: 'deployment_issues', name: 'Deploy Issues', icon: 'XCircle', visible: true, color: 'red' },
]

/**
 * Default stat blocks for the Pods dashboard
 */
export const PODS_STAT_BLOCKS: StatBlockConfig[] = [
  { id: 'total_pods', name: 'Total Pods', icon: 'Box', visible: true, color: 'purple' },
  { id: 'healthy', name: 'Healthy', icon: 'CheckCircle2', visible: true, color: 'green' },
  { id: 'issues', name: 'Issues', icon: 'AlertCircle', visible: true, color: 'red' },
  { id: 'pending', name: 'Pending', icon: 'Clock', visible: true, color: 'yellow' },
  { id: 'restarts', name: 'High Restarts', icon: 'RotateCcw', visible: true, color: 'orange' },
  { id: 'clusters', name: 'Clusters', icon: 'Server', visible: true, color: 'cyan' },
]

/**
 * Default stat blocks for the GitOps dashboard
 */
export const GITOPS_STAT_BLOCKS: StatBlockConfig[] = [
  { id: 'total', name: 'Total', icon: 'Package', visible: true, color: 'purple' },
  { id: 'helm', name: 'Helm', icon: 'Ship', visible: true, color: 'blue' },
  { id: 'kustomize', name: 'Kustomize', icon: 'Layers', visible: true, color: 'cyan' },
  { id: 'operators', name: 'Operators', icon: 'Settings', visible: true, color: 'purple' },
  { id: 'deployed', name: 'Deployed', icon: 'CheckCircle2', visible: true, color: 'green' },
  { id: 'failed', name: 'Failed', icon: 'XCircle', visible: true, color: 'red' },
  { id: 'pending', name: 'Pending', icon: 'Clock', visible: true, color: 'blue' },
  { id: 'other', name: 'Other', icon: 'MoreHorizontal', visible: true, color: 'gray' },
]

/**
 * Default stat blocks for the Storage dashboard
 */
export const STORAGE_STAT_BLOCKS: StatBlockConfig[] = [
  { id: 'ephemeral', name: 'Ephemeral', icon: 'HardDrive', visible: true, color: 'purple' },
  { id: 'pvcs', name: 'PVCs', icon: 'Database', visible: true, color: 'blue' },
  { id: 'bound', name: 'Bound', icon: 'CheckCircle2', visible: true, color: 'green' },
  { id: 'pending', name: 'Pending', icon: 'Clock', visible: true, color: 'yellow' },
  { id: 'storage_classes', name: 'Storage Classes', icon: 'Layers', visible: true, color: 'cyan' },
]

/**
 * Default stat blocks for the Network dashboard
 */
export const NETWORK_STAT_BLOCKS: StatBlockConfig[] = [
  { id: 'services', name: 'Services', icon: 'Workflow', visible: true, color: 'blue' },
  { id: 'loadbalancers', name: 'LoadBalancers', icon: 'Globe', visible: true, color: 'green' },
  { id: 'nodeport', name: 'NodePort', icon: 'Network', visible: true, color: 'yellow' },
  { id: 'clusterip', name: 'ClusterIP', icon: 'Box', visible: true, color: 'cyan' },
  { id: 'ingresses', name: 'Ingresses', icon: 'ArrowRightLeft', visible: true, color: 'purple' },
  { id: 'endpoints', name: 'Endpoints', icon: 'CircleDot', visible: true, color: 'gray' },
]

/**
 * Default stat blocks for the Security dashboard
 */
export const SECURITY_STAT_BLOCKS: StatBlockConfig[] = [
  { id: 'issues', name: 'Issues', icon: 'ShieldAlert', visible: true, color: 'purple' },
  { id: 'critical', name: 'Critical', icon: 'AlertCircle', visible: true, color: 'red' },
  { id: 'high', name: 'High', icon: 'AlertTriangle', visible: true, color: 'red' },
  { id: 'medium', name: 'Medium', icon: 'AlertTriangle', visible: true, color: 'yellow' },
  { id: 'low', name: 'Low', icon: 'Info', visible: true, color: 'blue' },
  { id: 'privileged', name: 'Privileged', icon: 'ShieldOff', visible: true, color: 'red' },
  { id: 'root', name: 'Running as Root', icon: 'User', visible: true, color: 'orange' },
]

/**
 * Default stat blocks for the Compliance dashboard
 */
export const COMPLIANCE_STAT_BLOCKS: StatBlockConfig[] = [
  { id: 'score', name: 'Score', icon: 'Percent', visible: true, color: 'purple' },
  { id: 'total_checks', name: 'Total Checks', icon: 'ClipboardList', visible: true, color: 'blue' },
  { id: 'passing', name: 'Passing', icon: 'CheckCircle2', visible: true, color: 'green' },
  { id: 'failing', name: 'Failing', icon: 'XCircle', visible: true, color: 'red' },
  { id: 'warning', name: 'Warning', icon: 'AlertTriangle', visible: true, color: 'yellow' },
  { id: 'critical_findings', name: 'Critical', icon: 'AlertCircle', visible: true, color: 'red' },
]

/**
 * Default stat blocks for the Compute dashboard
 */
export const COMPUTE_STAT_BLOCKS: StatBlockConfig[] = [
  { id: 'nodes', name: 'Nodes', icon: 'Server', visible: true, color: 'purple' },
  { id: 'cpus', name: 'CPUs', icon: 'Cpu', visible: true, color: 'blue' },
  { id: 'memory', name: 'Memory', icon: 'MemoryStick', visible: true, color: 'green' },
  { id: 'gpus', name: 'GPUs', icon: 'Zap', visible: true, color: 'yellow' },
  { id: 'tpus', name: 'TPUs', icon: 'Sparkles', visible: true, color: 'orange' },
  { id: 'pods', name: 'Pods', icon: 'Layers', visible: true, color: 'cyan' },
  { id: 'cpu_util', name: 'CPU Util', icon: 'Activity', visible: true, color: 'blue' },
  { id: 'memory_util', name: 'Memory Util', icon: 'Activity', visible: true, color: 'green' },
]

/**
 * Default stat blocks for the Events dashboard
 */
export const EVENTS_STAT_BLOCKS: StatBlockConfig[] = [
  { id: 'total', name: 'Total', icon: 'List', visible: true, color: 'purple' },
  { id: 'warnings', name: 'Warnings', icon: 'AlertTriangle', visible: true, color: 'yellow' },
  { id: 'normal', name: 'Normal', icon: 'Info', visible: true, color: 'blue' },
  { id: 'recent', name: 'Recent (1h)', icon: 'Clock', visible: true, color: 'cyan' },
  { id: 'errors', name: 'Errors', icon: 'XCircle', visible: true, color: 'red' },
]

/**
 * Default stat blocks for the Cost dashboard
 */
export const COST_STAT_BLOCKS: StatBlockConfig[] = [
  { id: 'total_cost', name: 'Total Cost', icon: 'DollarSign', visible: true, color: 'green' },
  { id: 'cpu_cost', name: 'CPU Cost', icon: 'Cpu', visible: true, color: 'blue' },
  { id: 'memory_cost', name: 'Memory Cost', icon: 'MemoryStick', visible: true, color: 'purple' },
  { id: 'storage_cost', name: 'Storage Cost', icon: 'HardDrive', visible: true, color: 'cyan' },
  { id: 'network_cost', name: 'Network Cost', icon: 'Globe', visible: true, color: 'yellow' },
  { id: 'gpu_cost', name: 'GPU Cost', icon: 'Zap', visible: true, color: 'orange' },
]

/**
 * Default stat blocks for the Alerts dashboard
 */
export const ALERTS_STAT_BLOCKS: StatBlockConfig[] = [
  { id: 'firing', name: 'Firing', icon: 'AlertCircle', visible: true, color: 'red' },
  { id: 'pending', name: 'Pending', icon: 'Clock', visible: true, color: 'yellow' },
  { id: 'resolved', name: 'Resolved', icon: 'CheckCircle2', visible: true, color: 'green' },
  { id: 'rules_enabled', name: 'Rules Enabled', icon: 'Shield', visible: true, color: 'blue' },
  { id: 'rules_disabled', name: 'Rules Disabled', icon: 'ShieldOff', visible: true, color: 'gray' },
]

/**
 * Default stat blocks for the main Dashboard
 */
export const DASHBOARD_STAT_BLOCKS: StatBlockConfig[] = [
  { id: 'clusters', name: 'Clusters', icon: 'Server', visible: true, color: 'blue' },
  { id: 'healthy', name: 'Healthy', icon: 'CheckCircle2', visible: true, color: 'green' },
  { id: 'warnings', name: 'Warnings', icon: 'AlertTriangle', visible: true, color: 'yellow' },
  { id: 'errors', name: 'Errors', icon: 'XCircle', visible: true, color: 'red' },
  { id: 'namespaces', name: 'Namespaces', icon: 'FolderTree', visible: true, color: 'purple' },
  { id: 'pods', name: 'Pods', icon: 'Box', visible: true, color: 'cyan' },
]

/**
 * Default stat blocks for the Operators dashboard
 */
export const OPERATORS_STAT_BLOCKS: StatBlockConfig[] = [
  { id: 'operators', name: 'Total', icon: 'Package', visible: true, color: 'purple' },
  { id: 'installed', name: 'Installed', icon: 'CheckCircle2', visible: true, color: 'green' },
  { id: 'installing', name: 'Installing', icon: 'RefreshCw', visible: true, color: 'blue' },
  { id: 'failing', name: 'Failing', icon: 'XCircle', visible: true, color: 'red' },
  { id: 'upgrades', name: 'Upgrades', icon: 'ArrowUpCircle', visible: true, color: 'orange' },
  { id: 'subscriptions', name: 'Subscriptions', icon: 'Newspaper', visible: true, color: 'indigo' },
  { id: 'crds', name: 'CRDs', icon: 'FileCode', visible: true, color: 'cyan' },
  { id: 'clusters', name: 'Clusters', icon: 'Server', visible: true, color: 'blue' },
]

/**
 * Master list of ALL available stat blocks across all dashboards.
 * Users can add any of these to any dashboard.
 */
export const ALL_STAT_BLOCKS: StatBlockConfig[] = (() => {
  const allBlocks = [
    ...CLUSTERS_STAT_BLOCKS,
    ...WORKLOADS_STAT_BLOCKS,
    ...PODS_STAT_BLOCKS,
    ...GITOPS_STAT_BLOCKS,
    ...STORAGE_STAT_BLOCKS,
    ...NETWORK_STAT_BLOCKS,
    ...SECURITY_STAT_BLOCKS,
    ...COMPLIANCE_STAT_BLOCKS,
    ...COMPUTE_STAT_BLOCKS,
    ...EVENTS_STAT_BLOCKS,
    ...COST_STAT_BLOCKS,
    ...ALERTS_STAT_BLOCKS,
    ...DASHBOARD_STAT_BLOCKS,
    ...OPERATORS_STAT_BLOCKS,
  ]
  // Deduplicate by id, keeping the first occurrence
  const seen = new Set<string>()
  return allBlocks.filter(block => {
    if (seen.has(block.id)) return false
    seen.add(block.id)
    return true
  })
})()

/**
 * Get default stat blocks for a dashboard type
 */
export function getDefaultStatBlocks(dashboardType: DashboardStatsType): StatBlockConfig[] {
  switch (dashboardType) {
    case 'clusters':
      return CLUSTERS_STAT_BLOCKS
    case 'workloads':
      return WORKLOADS_STAT_BLOCKS
    case 'pods':
      return PODS_STAT_BLOCKS
    case 'gitops':
      return GITOPS_STAT_BLOCKS
    case 'storage':
      return STORAGE_STAT_BLOCKS
    case 'network':
      return NETWORK_STAT_BLOCKS
    case 'security':
      return SECURITY_STAT_BLOCKS
    case 'compliance':
      return COMPLIANCE_STAT_BLOCKS
    case 'compute':
      return COMPUTE_STAT_BLOCKS
    case 'events':
      return EVENTS_STAT_BLOCKS
    case 'cost':
      return COST_STAT_BLOCKS
    case 'alerts':
      return ALERTS_STAT_BLOCKS
    case 'dashboard':
      return DASHBOARD_STAT_BLOCKS
    case 'operators':
      return OPERATORS_STAT_BLOCKS
    default:
      return []
  }
}

/**
 * Get storage key for a dashboard's stats config
 */
export function getStatsStorageKey(dashboardType: DashboardStatsType): string {
  return `kubestellar-${dashboardType}-stats-config`
}

// Color classes for rendering
const colorClasses: Record<string, string> = {
  purple: 'text-purple-400',
  green: 'text-green-400',
  orange: 'text-orange-400',
  yellow: 'text-yellow-400',
  cyan: 'text-cyan-400',
  blue: 'text-blue-400',
  red: 'text-red-400',
  gray: 'text-gray-400',
  indigo: 'text-indigo-400',
  teal: 'text-teal-400',
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
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing p-1 hover:bg-secondary rounded"
      >
        <GripVertical className="w-4 h-4 text-muted-foreground" />
      </button>
      <div className={`w-5 h-5 ${colorClasses[block.color] || 'text-foreground'}`}>
        <span className="text-sm">{iconEmojis[block.icon] || '📊'}</span>
      </div>
      <span className="flex-1 text-sm text-foreground">{block.name}</span>
      <button
        onClick={() => onToggleVisibility(block.id)}
        className={`p-1 rounded transition-colors ${
          block.visible
            ? 'hover:bg-secondary text-green-400'
            : 'hover:bg-secondary text-muted-foreground'
        }`}
        title={block.visible ? 'Hide' : 'Show'}
      >
        {block.visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
      </button>
      {isCustom && onRemove && (
        <button
          onClick={() => onRemove(block.id)}
          className="p-1 rounded transition-colors hover:bg-red-500/20 text-muted-foreground hover:text-red-400"
          title="Remove"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      )}
    </div>
  )
}

interface AvailableStatItemProps {
  block: StatBlockConfig
  onAdd: (block: StatBlockConfig) => void
}

function AvailableStatItem({ block, onAdd }: AvailableStatItemProps) {
  return (
    <button
      onClick={() => onAdd(block)}
      className="flex items-center gap-3 p-2 rounded-lg bg-secondary/20 hover:bg-secondary/40 transition-colors w-full text-left"
    >
      <div className={`w-5 h-5 ${colorClasses[block.color] || 'text-foreground'}`}>
        <span className="text-sm">{iconEmojis[block.icon] || '📊'}</span>
      </div>
      <span className="flex-1 text-sm text-foreground">{block.name}</span>
      <Plus className="w-4 h-4 text-muted-foreground" />
    </button>
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
  const [localBlocks, setLocalBlocks] = useState<StatBlockConfig[]>(blocks)
  const [showAddPanel, setShowAddPanel] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    if (isOpen) {
      setLocalBlocks(blocks)
      setShowAddPanel(false)
      setSearchQuery('')
    }
  }, [isOpen, blocks])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  // Get IDs of blocks in the current dashboard defaults
  const defaultBlockIds = useMemo(() => new Set(defaultBlocks.map(b => b.id)), [defaultBlocks])

  // Get available stats not already in the current list
  const availableStats = useMemo(() => {
    const currentIds = new Set(localBlocks.map(b => b.id))
    return ALL_STAT_BLOCKS.filter(block => !currentIds.has(block.id))
  }, [localBlocks])

  // Filter available stats by search query
  const filteredAvailableStats = useMemo(() => {
    if (!searchQuery.trim()) return availableStats
    const query = searchQuery.toLowerCase()
    return availableStats.filter(block =>
      block.name.toLowerCase().includes(query) ||
      block.id.toLowerCase().includes(query)
    )
  }, [availableStats, searchQuery])

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
    <BaseModal isOpen={isOpen} onClose={onClose} size="md">
      <BaseModal.Header
        title={title}
        description="Drag to reorder. Click the eye icon to show/hide stats."
        icon={Settings}
        onClose={onClose}
        showBack={false}
      />

      <BaseModal.Content className="max-h-[50vh]">
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
              <button
                onClick={() => setShowAddPanel(false)}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Done
              </button>
            </div>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {filteredAvailableStats.length > 0 ? (
                filteredAvailableStats.map(block => (
                  <AvailableStatItem
                    key={block.id}
                    block={block}
                    onAdd={handleAddStat}
                  />
                ))
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  {searchQuery ? 'No stats match your search' : 'All stats are already added'}
                </p>
              )}
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowAddPanel(true)}
            className="mt-4 w-full flex items-center justify-center gap-2 py-2 border border-dashed border-border rounded-lg text-sm text-muted-foreground hover:text-foreground hover:border-purple-500/50 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add stat from other dashboards
          </button>
        )}
      </BaseModal.Content>

      <BaseModal.Footer>
        <button
          onClick={handleReset}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Reset to Default
        </button>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-2 px-4 py-2 bg-purple-500/20 text-purple-400 rounded-lg hover:bg-purple-500/30 transition-colors"
          >
            <Check className="w-4 h-4" />
            Save
          </button>
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

  const [blocks, setBlocks] = useState<StatBlockConfig[]>(() => {
    try {
      const saved = localStorage.getItem(key)
      if (saved) {
        const parsed = JSON.parse(saved) as StatBlockConfig[]
        // Merge with defaults to handle new blocks added in updates
        const savedIds = new Set(parsed.map(b => b.id))
        const merged = [...parsed]
        defaultBlocks.forEach(defaultBlock => {
          if (!savedIds.has(defaultBlock.id)) {
            merged.push(defaultBlock)
          }
        })
        return merged
      }
    } catch {
      // Ignore parse errors
    }
    return defaultBlocks
  })

  const saveBlocks = (newBlocks: StatBlockConfig[]) => {
    setBlocks(newBlocks)
    try {
      localStorage.setItem(key, JSON.stringify(newBlocks))
    } catch {
      // Ignore storage errors
    }
  }

  const resetBlocks = () => {
    setBlocks(defaultBlocks)
    try {
      localStorage.removeItem(key)
    } catch {
      // Ignore storage errors
    }
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
