import { useState, useEffect } from 'react'
import { Settings, Check, GripVertical, Eye, EyeOff } from 'lucide-react'
import { BaseModal } from '../../../lib/modals'
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

export interface StatBlockConfig {
  id: string
  name: string
  icon: string
  visible: boolean
  color: string
}

// Default stat blocks available in the overview
export const DEFAULT_STAT_BLOCKS: StatBlockConfig[] = [
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

  const colorClasses: Record<string, string> = {
    purple: 'text-purple-400',
    green: 'text-green-400',
    orange: 'text-orange-400',
    yellow: 'text-yellow-400',
    cyan: 'text-cyan-400',
    blue: 'text-blue-400',
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
        <span className="text-sm">{block.icon === 'Server' ? '🖥️' :
          block.icon === 'CheckCircle2' ? '✅' :
          block.icon === 'XCircle' ? '❌' :
          block.icon === 'WifiOff' ? '📡' :
          block.icon === 'Box' ? '📦' :
          block.icon === 'Cpu' ? '🔲' :
          block.icon === 'MemoryStick' ? '💾' :
          block.icon === 'HardDrive' ? '💽' :
          block.icon === 'Zap' ? '⚡' :
          block.icon === 'Layers' ? '🗂️' : '📊'}</span>
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
}

export function StatsConfigModal({ isOpen, onClose, blocks, onSave }: StatsConfigModalProps) {
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
    setLocalBlocks(DEFAULT_STAT_BLOCKS)
  }

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} size="md">
      <BaseModal.Header
        title="Configure Stats"
        description="Drag to reorder. Click the eye icon to show/hide stats."
        icon={Settings}
        onClose={onClose}
        showBack={false}
      />

      <BaseModal.Content className="max-h-[50vh]">
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
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>
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

// Hook to manage stats configuration
export function useStatsConfig(storageKey: string = 'cluster-stats-config') {
  const [blocks, setBlocks] = useState<StatBlockConfig[]>(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved) {
        const parsed = JSON.parse(saved) as StatBlockConfig[]
        // Merge with defaults to handle new blocks added in updates
        const savedIds = new Set(parsed.map(b => b.id))
        const merged = [...parsed]
        DEFAULT_STAT_BLOCKS.forEach(defaultBlock => {
          if (!savedIds.has(defaultBlock.id)) {
            merged.push(defaultBlock)
          }
        })
        return merged
      }
    } catch {
      // Ignore parse errors
    }
    return DEFAULT_STAT_BLOCKS
  })

  const saveBlocks = (newBlocks: StatBlockConfig[]) => {
    setBlocks(newBlocks)
    try {
      localStorage.setItem(storageKey, JSON.stringify(newBlocks))
    } catch {
      // Ignore storage errors
    }
  }

  const visibleBlocks = blocks.filter(b => b.visible)

  return { blocks, saveBlocks, visibleBlocks }
}
