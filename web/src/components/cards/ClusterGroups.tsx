import { useState, useCallback } from 'react'
import { useDroppable } from '@dnd-kit/core'
import {
  Server,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  Layers,
  ChevronDown,
  ChevronRight,
  Loader2,
  Rocket,
} from 'lucide-react'
import { cn } from '../../lib/cn'
import { ClusterBadge } from '../ui/ClusterBadge'
import { useClusterGroups, ClusterGroup } from '../../hooks/useClusterGroups'
import { useClusters } from '../../hooks/useMCP'

interface ClusterGroupsProps {
  config?: Record<string, unknown>
}

// Group color options
const GROUP_COLORS = [
  { name: 'blue', bg: 'bg-blue-500/20', border: 'border-blue-500/40', text: 'text-blue-400', dot: 'bg-blue-500' },
  { name: 'green', bg: 'bg-green-500/20', border: 'border-green-500/40', text: 'text-green-400', dot: 'bg-green-500' },
  { name: 'purple', bg: 'bg-purple-500/20', border: 'border-purple-500/40', text: 'text-purple-400', dot: 'bg-purple-500' },
  { name: 'orange', bg: 'bg-orange-500/20', border: 'border-orange-500/40', text: 'text-orange-400', dot: 'bg-orange-500' },
  { name: 'cyan', bg: 'bg-cyan-500/20', border: 'border-cyan-500/40', text: 'text-cyan-400', dot: 'bg-cyan-500' },
  { name: 'rose', bg: 'bg-rose-500/20', border: 'border-rose-500/40', text: 'text-rose-400', dot: 'bg-rose-500' },
]

function getGroupColor(colorName?: string) {
  return GROUP_COLORS.find(c => c.name === colorName) || GROUP_COLORS[0]
}

export function ClusterGroups(_props: ClusterGroupsProps) {
  const { groups, createGroup, updateGroup, deleteGroup } = useClusterGroups()
  const { deduplicatedClusters: clusters } = useClusters()
  const [isCreating, setIsCreating] = useState(false)
  const [editingGroup, setEditingGroup] = useState<string | null>(null)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  const toggleExpanded = useCallback((name: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }, [])

  const availableClusterNames = clusters.map(c => c.name)

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-blue-400" />
          <span className="text-sm font-medium text-gray-300">
            {groups.length} group{groups.length !== 1 ? 's' : ''}
          </span>
        </div>
        <button
          onClick={() => setIsCreating(true)}
          className="flex items-center gap-1 px-2 py-1 text-xs rounded-md bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-colors"
        >
          <Plus className="w-3 h-3" />
          New Group
        </button>
      </div>

      {/* Create form */}
      {isCreating && (
        <CreateGroupForm
          availableClusters={availableClusterNames}
          clusterHealthMap={new Map(clusters.map(c => [c.name, c.healthy]))}
          onSave={(group) => {
            createGroup(group)
            setIsCreating(false)
          }}
          onCancel={() => setIsCreating(false)}
        />
      )}

      {/* Groups list */}
      {groups.length === 0 && !isCreating ? (
        <div className="text-center py-6">
          <Layers className="w-8 h-8 mx-auto mb-2 text-gray-600" />
          <p className="text-sm text-gray-500">No cluster groups yet</p>
          <p className="text-xs text-gray-600 mt-1">
            Create a group, then drag workloads onto it to deploy
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {groups.map((group) => (
            editingGroup === group.name ? (
              <EditGroupForm
                key={group.name}
                group={group}
                availableClusters={availableClusterNames}
                clusterHealthMap={new Map(clusters.map(c => [c.name, c.healthy]))}
                onSave={(updates) => {
                  updateGroup(group.name, updates)
                  setEditingGroup(null)
                }}
                onCancel={() => setEditingGroup(null)}
              />
            ) : (
              <DroppableGroup
                key={group.name}
                group={group}
                isExpanded={expandedGroups.has(group.name)}
                clusterHealthMap={new Map(clusters.map(c => [c.name, c.healthy]))}
                onToggle={() => toggleExpanded(group.name)}
                onEdit={() => setEditingGroup(group.name)}
                onDelete={() => deleteGroup(group.name)}
              />
            )
          ))}
        </div>
      )}

      {/* Help text */}
      <div className="pt-2 border-t border-gray-800">
        <p className="text-[10px] text-gray-600 text-center">
          Drag a workload from the Workload card onto a group to deploy
        </p>
      </div>
    </div>
  )
}

// ============================================================================
// Droppable Group Row
// ============================================================================

interface DroppableGroupProps {
  group: ClusterGroup
  isExpanded: boolean
  clusterHealthMap: Map<string, boolean>
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
}

function DroppableGroup({ group, isExpanded, clusterHealthMap, onToggle, onEdit, onDelete }: DroppableGroupProps) {
  const { isOver, setNodeRef } = useDroppable({
    id: `cluster-group-${group.name}`,
    data: {
      type: 'cluster-group',
      groupName: group.name,
      clusters: group.clusters,
    },
  })

  const color = getGroupColor(group.color)
  const healthyCount = group.clusters.filter(c => clusterHealthMap.get(c) !== false).length

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'rounded-lg border transition-all',
        isOver
          ? 'border-blue-500 bg-blue-500/10 scale-[1.02] shadow-lg shadow-blue-500/20'
          : `${color.border} ${color.bg} hover:border-opacity-60`,
      )}
    >
      <div className="flex items-center gap-2 px-3 py-2">
        {/* Expand toggle */}
        <button
          onClick={onToggle}
          className="text-gray-500 hover:text-gray-300 transition-colors"
        >
          {isExpanded
            ? <ChevronDown className="w-3.5 h-3.5" />
            : <ChevronRight className="w-3.5 h-3.5" />
          }
        </button>

        {/* Color dot */}
        <div className={cn('w-2 h-2 rounded-full', color.dot)} />

        {/* Group name */}
        <span className={cn('text-sm font-medium flex-1', color.text)}>
          {group.name}
        </span>

        {/* Cluster count + health */}
        <span className="text-[10px] text-gray-500">
          {healthyCount}/{group.clusters.length} healthy
        </span>

        {/* Drop indicator */}
        {isOver && (
          <Rocket className="w-4 h-4 text-blue-400 animate-pulse" />
        )}

        {/* Actions */}
        <div className="flex items-center gap-1">
          <button
            onClick={onEdit}
            className="p-1 rounded hover:bg-white/10 text-gray-500 hover:text-gray-300 transition-colors"
            title="Edit group"
          >
            <Edit2 className="w-3 h-3" />
          </button>
          <button
            onClick={onDelete}
            className="p-1 rounded hover:bg-red-500/20 text-gray-500 hover:text-red-400 transition-colors"
            title="Delete group"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Expanded cluster list */}
      {isExpanded && (
        <div className="px-3 pb-2 pt-1 border-t border-gray-800/50">
          <div className="flex flex-wrap gap-1.5">
            {group.clusters.map(cluster => {
              const healthy = clusterHealthMap.get(cluster)
              return (
                <div key={cluster} className="flex items-center gap-1">
                  <div className={cn(
                    'w-1.5 h-1.5 rounded-full',
                    healthy === false ? 'bg-red-500' : 'bg-green-500'
                  )} />
                  <ClusterBadge cluster={cluster} size="sm" />
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Create Group Form
// ============================================================================

interface CreateGroupFormProps {
  availableClusters: string[]
  clusterHealthMap: Map<string, boolean>
  onSave: (group: ClusterGroup) => void
  onCancel: () => void
}

function CreateGroupForm({ availableClusters, clusterHealthMap, onSave, onCancel }: CreateGroupFormProps) {
  const [name, setName] = useState('')
  const [selectedClusters, setSelectedClusters] = useState<Set<string>>(new Set())
  const [selectedColor, setSelectedColor] = useState('blue')

  const toggleCluster = (cluster: string) => {
    setSelectedClusters(prev => {
      const next = new Set(prev)
      if (next.has(cluster)) next.delete(cluster)
      else next.add(cluster)
      return next
    })
  }

  const handleSave = () => {
    if (!name.trim() || selectedClusters.size === 0) return
    onSave({
      name: name.trim(),
      clusters: Array.from(selectedClusters),
      color: selectedColor,
    })
  }

  return (
    <div className="rounded-lg border border-blue-500/40 bg-blue-500/5 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-blue-400">New Cluster Group</span>
        <button onClick={onCancel} className="p-1 hover:bg-white/10 rounded">
          <X className="w-3.5 h-3.5 text-gray-500" />
        </button>
      </div>

      {/* Name input */}
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Group name..."
        className="w-full px-2.5 py-1.5 text-sm rounded-md bg-gray-900/50 border border-gray-700 text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-blue-500"
        autoFocus
      />

      {/* Color picker */}
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-gray-500 mr-1">Color:</span>
        {GROUP_COLORS.map(c => (
          <button
            key={c.name}
            onClick={() => setSelectedColor(c.name)}
            className={cn(
              'w-4 h-4 rounded-full transition-all',
              c.dot,
              selectedColor === c.name ? 'ring-2 ring-white/50 scale-110' : 'opacity-50 hover:opacity-80'
            )}
          />
        ))}
      </div>

      {/* Cluster selection */}
      <div>
        <span className="text-[10px] text-gray-500 block mb-1.5">
          Select clusters ({selectedClusters.size} selected)
        </span>
        <div className="max-h-32 overflow-y-auto space-y-1">
          {availableClusters.length === 0 ? (
            <div className="flex items-center gap-2 py-2 text-xs text-gray-500">
              <Loader2 className="w-3 h-3 animate-spin" />
              Loading clusters...
            </div>
          ) : (
            availableClusters.map(cluster => {
              const healthy = clusterHealthMap.get(cluster)
              const isSelected = selectedClusters.has(cluster)
              return (
                <button
                  key={cluster}
                  onClick={() => toggleCluster(cluster)}
                  className={cn(
                    'flex items-center gap-2 w-full px-2 py-1 rounded text-left text-xs transition-colors',
                    isSelected
                      ? 'bg-blue-500/20 text-blue-300'
                      : 'hover:bg-gray-800/50 text-gray-400'
                  )}
                >
                  <div className={cn(
                    'w-3.5 h-3.5 rounded border flex items-center justify-center',
                    isSelected ? 'border-blue-500 bg-blue-500' : 'border-gray-600'
                  )}>
                    {isSelected && <Check className="w-2.5 h-2.5 text-white" />}
                  </div>
                  <div className={cn(
                    'w-1.5 h-1.5 rounded-full',
                    healthy === false ? 'bg-red-500' : 'bg-green-500'
                  )} />
                  <Server className="w-3 h-3" />
                  <span className="truncate">{cluster}</span>
                </button>
              )
            })
          )}
        </div>
      </div>

      {/* Save button */}
      <button
        onClick={handleSave}
        disabled={!name.trim() || selectedClusters.size === 0}
        className={cn(
          'w-full py-1.5 text-xs font-medium rounded-md transition-colors',
          name.trim() && selectedClusters.size > 0
            ? 'bg-blue-500 text-white hover:bg-blue-600'
            : 'bg-gray-800 text-gray-600 cursor-not-allowed'
        )}
      >
        Create Group
      </button>
    </div>
  )
}

// ============================================================================
// Edit Group Form
// ============================================================================

interface EditGroupFormProps {
  group: ClusterGroup
  availableClusters: string[]
  clusterHealthMap: Map<string, boolean>
  onSave: (updates: Partial<ClusterGroup>) => void
  onCancel: () => void
}

function EditGroupForm({ group, availableClusters, clusterHealthMap, onSave, onCancel }: EditGroupFormProps) {
  const [selectedClusters, setSelectedClusters] = useState<Set<string>>(new Set(group.clusters))
  const [selectedColor, setSelectedColor] = useState(group.color || 'blue')

  const toggleCluster = (cluster: string) => {
    setSelectedClusters(prev => {
      const next = new Set(prev)
      if (next.has(cluster)) next.delete(cluster)
      else next.add(cluster)
      return next
    })
  }

  const handleSave = () => {
    if (selectedClusters.size === 0) return
    onSave({
      clusters: Array.from(selectedClusters),
      color: selectedColor,
    })
  }

  return (
    <div className="rounded-lg border border-yellow-500/40 bg-yellow-500/5 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-yellow-400">Edit: {group.name}</span>
        <button onClick={onCancel} className="p-1 hover:bg-white/10 rounded">
          <X className="w-3.5 h-3.5 text-gray-500" />
        </button>
      </div>

      {/* Color picker */}
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-gray-500 mr-1">Color:</span>
        {GROUP_COLORS.map(c => (
          <button
            key={c.name}
            onClick={() => setSelectedColor(c.name)}
            className={cn(
              'w-4 h-4 rounded-full transition-all',
              c.dot,
              selectedColor === c.name ? 'ring-2 ring-white/50 scale-110' : 'opacity-50 hover:opacity-80'
            )}
          />
        ))}
      </div>

      {/* Cluster selection */}
      <div>
        <span className="text-[10px] text-gray-500 block mb-1.5">
          Clusters ({selectedClusters.size} selected)
        </span>
        <div className="max-h-32 overflow-y-auto space-y-1">
          {availableClusters.map(cluster => {
            const healthy = clusterHealthMap.get(cluster)
            const isSelected = selectedClusters.has(cluster)
            return (
              <button
                key={cluster}
                onClick={() => toggleCluster(cluster)}
                className={cn(
                  'flex items-center gap-2 w-full px-2 py-1 rounded text-left text-xs transition-colors',
                  isSelected
                    ? 'bg-yellow-500/20 text-yellow-300'
                    : 'hover:bg-gray-800/50 text-gray-400'
                )}
              >
                <div className={cn(
                  'w-3.5 h-3.5 rounded border flex items-center justify-center',
                  isSelected ? 'border-yellow-500 bg-yellow-500' : 'border-gray-600'
                )}>
                  {isSelected && <Check className="w-2.5 h-2.5 text-white" />}
                </div>
                <div className={cn(
                  'w-1.5 h-1.5 rounded-full',
                  healthy === false ? 'bg-red-500' : 'bg-green-500'
                )} />
                <Server className="w-3 h-3" />
                <span className="truncate">{cluster}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Save button */}
      <div className="flex gap-2">
        <button
          onClick={onCancel}
          className="flex-1 py-1.5 text-xs font-medium rounded-md bg-gray-800 text-gray-400 hover:bg-gray-700 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={selectedClusters.size === 0}
          className={cn(
            'flex-1 py-1.5 text-xs font-medium rounded-md transition-colors',
            selectedClusters.size > 0
              ? 'bg-yellow-500 text-black hover:bg-yellow-400'
              : 'bg-gray-800 text-gray-600 cursor-not-allowed'
          )}
        >
          Save
        </button>
      </div>
    </div>
  )
}
