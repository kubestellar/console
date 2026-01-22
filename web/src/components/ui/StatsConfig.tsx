import { useState, useEffect } from 'react'
import { Settings, X, Check, GripVertical, Eye, EyeOff } from 'lucide-react'
import { createPortal } from 'react-dom'
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
  | 'gitops'
  | 'storage'
  | 'network'
  | 'security'
  | 'compliance'
  | 'compute'
  | 'events'
  | 'cost'

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
  { id: 'issues', name: 'Issues', icon: 'ShieldAlert', visible: true, color: 'red' },
  { id: 'critical', name: 'Critical', icon: 'AlertCircle', visible: true, color: 'red' },
  { id: 'high', name: 'High', icon: 'AlertTriangle', visible: true, color: 'orange' },
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
 * Get default stat blocks for a dashboard type
 */
export function getDefaultStatBlocks(dashboardType: DashboardStatsType): StatBlockConfig[] {
  switch (dashboardType) {
    case 'clusters':
      return CLUSTERS_STAT_BLOCKS
    case 'workloads':
      return WORKLOADS_STAT_BLOCKS
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
}

interface SortableItemProps {
  block: StatBlockConfig
  onToggleVisibility: (id: string) => void
}

function SortableItem({ block, onToggleVisibility }: SortableItemProps) {
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
  const [localBlocks, setLocalBlocks] = useState<StatBlockConfig[]>(blocks)

  useEffect(() => {
    if (isOpen) {
      setLocalBlocks(blocks)
    }
  }, [isOpen, blocks])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

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

  const handleSave = () => {
    onSave(localBlocks)
    onClose()
  }

  const handleReset = () => {
    setLocalBlocks(defaultBlocks)
  }

  if (!isOpen) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md mx-4 bg-card border border-border rounded-2xl shadow-2xl overflow-hidden max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-purple-400" />
            <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-secondary rounded transition-colors">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* Instructions */}
        <div className="px-4 pt-4 pb-2">
          <p className="text-xs text-muted-foreground">
            Drag to reorder. Click the eye icon to show/hide stats.
          </p>
        </div>

        {/* Sortable list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
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
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-border">
          <button
            onClick={handleReset}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Reset to Default
          </button>
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
        </div>
      </div>
    </div>,
    document.body
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
