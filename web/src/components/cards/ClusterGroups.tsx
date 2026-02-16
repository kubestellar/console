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
  RefreshCw,
  Zap,
  Sparkles,
  Search,
  Tag,
  Filter,
  Database,
} from 'lucide-react'
import { cn } from '../../lib/cn'
import { ClusterBadge } from '../ui/ClusterBadge'
import {
  useClusterGroups,
  type ClusterGroup,
  type ClusterGroupKind,
  type ClusterFilter,
  type ClusterGroupQuery,
} from '../../hooks/useClusterGroups'
import { useClusters } from '../../hooks/useMCP'
import { useCardLoadingState } from './CardDataContext'
import { useDemoMode } from '../../hooks/useDemoMode'
import { useTranslation } from 'react-i18next'

interface ClusterGroupsProps {
  config?: Record<string, unknown>
}

const DEMO_GROUPS: ClusterGroup[] = [
  { name: 'production', kind: 'static', clusters: ['eks-prod-us-east-1', 'openshift-prod', 'do-nyc1-prod'], color: 'green' },
  { name: 'staging', kind: 'static', clusters: ['gke-staging', 'aks-dev-westeu'], color: 'blue' },
  { name: 'edge', kind: 'dynamic', clusters: ['k3s-edge', 'kind-local', 'minikube'], color: 'purple', query: { filters: [{ field: 'nodeCount', operator: 'lte', value: '3' }] } },
]

// ============================================================================
// Constants
// ============================================================================

const GROUP_COLORS = [
  { name: 'blue', bg: 'bg-blue-500/20', border: 'border-blue-500/40', text: 'text-blue-400', dot: 'bg-blue-500' },
  { name: 'green', bg: 'bg-green-500/20', border: 'border-green-500/40', text: 'text-green-400', dot: 'bg-green-500' },
  { name: 'purple', bg: 'bg-purple-500/20', border: 'border-purple-500/40', text: 'text-purple-400', dot: 'bg-purple-500' },
  { name: 'orange', bg: 'bg-orange-500/20', border: 'border-orange-500/40', text: 'text-orange-400', dot: 'bg-orange-500' },
  { name: 'cyan', bg: 'bg-cyan-500/20', border: 'border-cyan-500/40', text: 'text-cyan-400', dot: 'bg-cyan-500' },
  { name: 'rose', bg: 'bg-rose-500/20', border: 'border-rose-500/40', text: 'text-rose-400', dot: 'bg-rose-500' },
]

const FILTER_FIELDS = [
  { field: 'healthy', label: 'Healthy', type: 'bool' as const },
  { field: 'reachable', label: 'Reachable', type: 'bool' as const },
  { field: 'cpuCores', label: 'CPU Cores', type: 'number' as const },
  { field: 'memoryGB', label: 'Memory (GB)', type: 'number' as const },
  { field: 'gpuCount', label: 'GPU Count', type: 'number' as const },
  { field: 'gpuType', label: 'GPU Type', type: 'text' as const },
  { field: 'nodeCount', label: 'Nodes', type: 'number' as const },
  { field: 'podCount', label: 'Pods', type: 'number' as const },
]

const TEXT_OPERATORS = [
  { value: 'eq', label: 'contains' },
  { value: 'neq', label: 'excludes' },
]

const MAX_INLINE_BADGES = 4

const NUM_OPERATORS = [
  { value: 'gt', label: '>' },
  { value: 'gte', label: '>=' },
  { value: 'lt', label: '<' },
  { value: 'lte', label: '<=' },
  { value: 'eq', label: '=' },
]

function getGroupColor(colorName?: string) {
  return GROUP_COLORS.find(c => c.name === colorName) || GROUP_COLORS[0]
}

function formatFilter(f: ClusterFilter): string {
  const fieldDef = FILTER_FIELDS.find(ff => ff.field === f.field)
  const field = fieldDef?.label ?? f.field
  if (fieldDef?.type === 'text') {
    const op = TEXT_OPERATORS.find(o => o.value === f.operator)?.label ?? f.operator
    return `${field} ${op} "${f.value}"`
  }
  const op = NUM_OPERATORS.find(o => o.value === f.operator)?.label ?? f.operator
  return `${field} ${op} ${f.value}`
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const secs = Math.floor(diff / 1000)
  if (secs < 60) return `${secs}s ago`
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  return `${Math.floor(mins / 60)}h ago`
}

// ============================================================================
// Main Component
// ============================================================================

export function ClusterGroups(_props: ClusterGroupsProps) {
  const { t } = useTranslation(['cards', 'common'])
  const { groups: liveGroups, createGroup, updateGroup, deleteGroup, evaluateGroup, isPersisted } = useClusterGroups()
  const { deduplicatedClusters: clusters, isLoading } = useClusters()
  const { isDemoMode: demoMode } = useDemoMode()
  const groups = demoMode ? DEMO_GROUPS : liveGroups
  const [isCreating, setIsCreating] = useState(false)

  // Report loading state to CardWrapper for skeleton/refresh behavior
  useCardLoadingState({
    isLoading,
    hasAnyData: clusters.length > 0 || groups.length > 0,
  })
  const [editingGroup, setEditingGroup] = useState<string | null>(null)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [refreshing, setRefreshing] = useState<Set<string>>(new Set())

  const toggleExpanded = useCallback((name: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }, [])

  const handleRefreshGroup = useCallback(async (name: string) => {
    setRefreshing(prev => new Set(prev).add(name))
    await evaluateGroup(name)
    setRefreshing(prev => {
      const next = new Set(prev)
      next.delete(name)
      return next
    })
  }, [evaluateGroup])

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
          {isPersisted && (
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-medium rounded bg-green-500/20 text-green-400 border border-green-500/30"
              title="Groups are stored as Kubernetes CRs"
            >
              <Database className="w-2.5 h-2.5" />
              CR
            </span>
          )}
        </div>
        {!demoMode && (
          <button
            onClick={() => setIsCreating(true)}
            className="flex items-center gap-1 px-2 py-1 text-xs rounded-md bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-colors"
          >
            <Plus className="w-3 h-3" />
            {t('cards:clusterGroups.newGroup')}
          </button>
        )}
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
          <p className="text-sm text-gray-500">{t('cards:clusterGroups.noGroupsYet')}</p>
          <p className="text-xs text-gray-600 mt-1">
            {t('cards:clusterGroups.createGroupHint')}
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
                isRefreshing={refreshing.has(group.name)}
                clusterHealthMap={new Map(clusters.map(c => [c.name, c.healthy]))}
                onToggle={() => toggleExpanded(group.name)}
                onEdit={() => setEditingGroup(group.name)}
                onDelete={() => deleteGroup(group.name)}
                onRefresh={() => handleRefreshGroup(group.name)}
              />
            )
          ))}
        </div>
      )}

      {/* Help text */}
      <div className="pt-2 border-t border-gray-800">
        <p className="text-[10px] text-gray-600 text-center">
          {t('cards:clusterGroups.dragWorkloadHint')}
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
  isRefreshing: boolean
  clusterHealthMap: Map<string, boolean | undefined>
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
  onRefresh: () => void
}

function DroppableGroup({ group, isExpanded, isRefreshing, clusterHealthMap, onToggle, onEdit, onDelete, onRefresh }: DroppableGroupProps) {
  const { t } = useTranslation(['cards', 'common'])
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
  const isDynamic = group.kind === 'dynamic'

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

        {/* Group name + dynamic badge */}
        <span className={cn('text-sm font-medium flex-1 flex items-center gap-1.5', color.text)}>
          {group.name}
          {isDynamic && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[9px] font-medium rounded-full bg-purple-500/20 text-purple-400 border border-purple-500/30">
              <Zap className="w-2.5 h-2.5" />
              {t('cards:clusterGroups.dynamic')}
            </span>
          )}
        </span>

        {/* Compact cluster badges */}
        <div className="flex items-center gap-1">
          {group.clusters.slice(0, MAX_INLINE_BADGES).map(cluster => (
            <div
              key={cluster}
              className={cn(
                'w-2 h-2 rounded-full border border-gray-700',
                clusterHealthMap.get(cluster) === false ? 'bg-red-500' : 'bg-green-500'
              )}
              title={`${cluster} — ${clusterHealthMap.get(cluster) === false ? t('common:common.unhealthy').toLowerCase() : t('common:common.healthy').toLowerCase()}`}
            />
          ))}
          {group.clusters.length > MAX_INLINE_BADGES && (
            <span className="text-[9px] text-gray-500">
              +{group.clusters.length - MAX_INLINE_BADGES}
            </span>
          )}
        </div>

        {/* Cluster count + health */}
        <span className="text-[10px] text-gray-500">
          {healthyCount}/{group.clusters.length} {t('common:common.healthy').toLowerCase()}
        </span>

        {/* Dynamic: refresh button */}
        {isDynamic && (
          <button
            onClick={(e) => { e.stopPropagation(); onRefresh() }}
            disabled={isRefreshing}
            className="p-1 rounded hover:bg-white/10 text-purple-400 hover:text-purple-300 transition-colors"
            title={group.lastEvaluated ? `Last evaluated: ${relativeTime(group.lastEvaluated)}` : 'Evaluate query'}
          >
            <RefreshCw className={cn('w-3 h-3', isRefreshing && 'animate-spin')} />
          </button>
        )}

        {/* Drop indicator */}
        {isOver && (
          <Rocket className="w-4 h-4 text-blue-400 animate-pulse" />
        )}

        {/* Actions */}
        <div className="flex items-center gap-1">
          <button
            onClick={onEdit}
            className="p-1 rounded hover:bg-white/10 text-gray-500 hover:text-gray-300 transition-colors"
            title={t('cards:clusterGroups.editGroup')}
          >
            <Edit2 className="w-3 h-3" />
          </button>
          <button
            onClick={onDelete}
            className="p-1 rounded hover:bg-red-500/20 text-gray-500 hover:text-red-400 transition-colors"
            title={t('cards:clusterGroups.deleteGroup')}
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Expanded: cluster list + query info for dynamic groups */}
      {isExpanded && (
        <div className="px-3 pb-2 pt-1 border-t border-gray-800/50 space-y-2">
          {/* Dynamic: show query summary */}
          {isDynamic && group.query && (
            <div className="text-[10px] text-gray-500 space-y-0.5">
              {group.query.labelSelector && (
                <div className="flex items-center gap-1">
                  <Tag className="w-2.5 h-2.5" />
                  <span className="font-mono">{group.query.labelSelector}</span>
                </div>
              )}
              {group.query.filters?.map((f, i) => (
                <div key={i} className="flex items-center gap-1">
                  <Filter className="w-2.5 h-2.5" />
                  <span>{formatFilter(f)}</span>
                </div>
              ))}
              {group.lastEvaluated && (
                <div className="text-gray-600">Evaluated {relativeTime(group.lastEvaluated)}</div>
              )}
            </div>
          )}

          {/* Cluster badges */}
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
            {group.clusters.length === 0 && (
              <span className="text-xs text-gray-600 italic">{t('cards:clusterGroups.noClustersMatch')}</span>
            )}
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
  clusterHealthMap: Map<string, boolean | undefined>
  onSave: (group: ClusterGroup) => void
  onCancel: () => void
}

function CreateGroupForm({ availableClusters, clusterHealthMap, onSave, onCancel }: CreateGroupFormProps) {
  const { t } = useTranslation(['cards', 'common'])
  const { previewQuery, generateAIQuery } = useClusterGroups()
  const [name, setName] = useState('')
  const [selectedColor, setSelectedColor] = useState('blue')
  const [kind, setKind] = useState<ClusterGroupKind>('static')

  // Static mode state
  const [selectedClusters, setSelectedClusters] = useState<Set<string>>(new Set())

  // Dynamic mode state
  const [dynamicTab, setDynamicTab] = useState<'builder' | 'ai'>('builder')
  const [labelSelector, setLabelSelector] = useState('')
  const [filters, setFilters] = useState<ClusterFilter[]>([])
  const [previewClusters, setPreviewClusters] = useState<string[] | null>(null)
  const [isPreviewing, setIsPreviewing] = useState(false)

  // AI state
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)

  const toggleCluster = (cluster: string) => {
    setSelectedClusters(prev => {
      const next = new Set(prev)
      if (next.has(cluster)) next.delete(cluster)
      else next.add(cluster)
      return next
    })
  }

  const buildQuery = (): ClusterGroupQuery => ({
    labelSelector: labelSelector.trim() || undefined,
    filters: filters.length > 0 ? filters : undefined,
  })

  const handlePreview = async () => {
    setIsPreviewing(true)
    const result = await previewQuery(buildQuery())
    setPreviewClusters(result.clusters)
    setIsPreviewing(false)
  }

  const handleAIGenerate = async () => {
    if (!aiPrompt.trim()) return
    setAiLoading(true)
    setAiError(null)
    const result = await generateAIQuery(aiPrompt.trim())
    if (result.error) {
      setAiError(result.error)
    } else if (result.query) {
      setLabelSelector(result.query.labelSelector ?? '')
      setFilters(result.query.filters ?? [])
      if (result.suggestedName && !name) {
        setName(result.suggestedName)
      }
      setDynamicTab('builder')
      // Auto-preview
      setIsPreviewing(true)
      const preview = await previewQuery(result.query)
      setPreviewClusters(preview.clusters)
      setIsPreviewing(false)
    }
    setAiLoading(false)
  }

  const addFilter = () => {
    setFilters(prev => [...prev, { field: 'healthy', operator: 'eq', value: 'true' }])
  }

  const removeFilter = (index: number) => {
    setFilters(prev => prev.filter((_, i) => i !== index))
  }

  const updateFilter = (index: number, updates: Partial<ClusterFilter>) => {
    setFilters(prev => prev.map((f, i) => i === index ? { ...f, ...updates } : f))
  }

  const canSave = name.trim() && (
    kind === 'static'
      ? selectedClusters.size > 0
      : (labelSelector.trim() || filters.length > 0)
  )

  const handleSave = () => {
    if (!canSave) return
    if (kind === 'static') {
      onSave({
        name: name.trim(),
        kind: 'static',
        clusters: Array.from(selectedClusters),
        color: selectedColor,
      })
    } else {
      onSave({
        name: name.trim(),
        kind: 'dynamic',
        clusters: previewClusters ?? [],
        color: selectedColor,
        query: buildQuery(),
        lastEvaluated: previewClusters ? new Date().toISOString() : undefined,
      })
    }
  }

  return (
    <div className="rounded-lg border border-blue-500/40 bg-blue-500/5 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-blue-400">{t('cards:clusterGroups.newClusterGroup')}</span>
        <button onClick={onCancel} className="p-2 hover:bg-white/10 rounded min-h-11 min-w-11 flex items-center justify-center">
          <X className="w-3.5 h-3.5 text-gray-500" />
        </button>
      </div>

      {/* Name input */}
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={t('cards:clusterGroups.groupNamePlaceholder')}
        className="w-full px-2.5 py-1.5 text-sm rounded-md bg-gray-900/50 border border-gray-700 text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-blue-500"
        autoFocus
      />

      {/* Color picker */}
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-gray-500 mr-1">{t('cards:clusterGroups.color')}:</span>
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

      {/* Static / Dynamic toggle */}
      <div className="flex rounded-md overflow-hidden border border-gray-700">
        <button
          onClick={() => setKind('static')}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors',
            kind === 'static'
              ? 'bg-blue-500/20 text-blue-400'
              : 'bg-gray-900/30 text-gray-500 hover:text-gray-400'
          )}
        >
          <Server className="w-3 h-3" />
          {t('cards:clusterGroups.static')}
        </button>
        <button
          onClick={() => setKind('dynamic')}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors',
            kind === 'dynamic'
              ? 'bg-purple-500/20 text-purple-400'
              : 'bg-gray-900/30 text-gray-500 hover:text-gray-400'
          )}
        >
          <Zap className="w-3 h-3" />
          {t('cards:clusterGroups.dynamic')}
        </button>
      </div>

      {/* Static mode: cluster picker */}
      {kind === 'static' && (
        <StaticClusterPicker
          availableClusters={availableClusters}
          clusterHealthMap={clusterHealthMap}
          selectedClusters={selectedClusters}
          onToggle={toggleCluster}
          accentColor="blue"
        />
      )}

      {/* Dynamic mode: query builder or AI */}
      {kind === 'dynamic' && (
        <div className="space-y-2">
          {/* Builder / AI tabs */}
          <div className="flex gap-1">
            <button
              onClick={() => setDynamicTab('builder')}
              className={cn(
                'flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded transition-colors',
                dynamicTab === 'builder'
                  ? 'bg-purple-500/20 text-purple-400'
                  : 'text-gray-500 hover:text-gray-400'
              )}
            >
              <Search className="w-2.5 h-2.5" />
              {t('cards:clusterGroups.queryBuilder')}
            </button>
            <button
              onClick={() => setDynamicTab('ai')}
              className={cn(
                'flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded transition-colors',
                dynamicTab === 'ai'
                  ? 'bg-purple-500/20 text-purple-400'
                  : 'text-gray-500 hover:text-gray-400'
              )}
            >
              <Sparkles className="w-2.5 h-2.5" />
              {t('cards:clusterGroups.aiAssistant')}
            </button>
          </div>

          {dynamicTab === 'builder' ? (
            <QueryBuilder
              labelSelector={labelSelector}
              onLabelSelectorChange={setLabelSelector}
              filters={filters}
              onAddFilter={addFilter}
              onRemoveFilter={removeFilter}
              onUpdateFilter={updateFilter}
            />
          ) : (
            <AIAssistant
              prompt={aiPrompt}
              onPromptChange={setAiPrompt}
              onGenerate={handleAIGenerate}
              loading={aiLoading}
              error={aiError}
            />
          )}

          {/* Preview button + results */}
          <div className="space-y-1.5">
            <button
              onClick={handlePreview}
              disabled={isPreviewing || (!labelSelector.trim() && filters.length === 0)}
              className={cn(
                'w-full flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded-md transition-colors',
                (!labelSelector.trim() && filters.length === 0)
                  ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
                  : 'bg-purple-500/20 text-purple-400 hover:bg-purple-500/30'
              )}
            >
              {isPreviewing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
              {t('cards:clusterGroups.previewMatches')}
            </button>
            {previewClusters !== null && (
              <div className="text-[10px] text-gray-400">
                {previewClusters.length} cluster{previewClusters.length !== 1 ? 's' : ''} match:
                <span className="ml-1 text-purple-400">
                  {previewClusters.length > 0 ? previewClusters.join(', ') : 'none'}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Save button */}
      <button
        onClick={handleSave}
        disabled={!canSave}
        className={cn(
          'w-full py-1.5 text-xs font-medium rounded-md transition-colors',
          canSave
            ? kind === 'dynamic'
              ? 'bg-purple-500 text-white hover:bg-purple-600'
              : 'bg-blue-500 text-white hover:bg-blue-600'
            : 'bg-gray-800 text-gray-600 cursor-not-allowed'
        )}
      >
        {kind === 'dynamic' ? t('cards:clusterGroups.createDynamicGroup') : t('cards:clusterGroups.createGroup')}
      </button>
    </div>
  )
}

// ============================================================================
// Shared: Static Cluster Picker
// ============================================================================

function StaticClusterPicker({
  availableClusters,
  clusterHealthMap,
  selectedClusters,
  onToggle,
  accentColor,
}: {
  availableClusters: string[]
  clusterHealthMap: Map<string, boolean | undefined>
  selectedClusters: Set<string>
  onToggle: (cluster: string) => void
  accentColor: 'blue' | 'yellow'
}) {
  const { t } = useTranslation(['cards', 'common'])
  const accent = accentColor === 'blue'
    ? { selected: 'bg-blue-500/20 text-blue-300', check: 'border-blue-500 bg-blue-500' }
    : { selected: 'bg-yellow-500/20 text-yellow-300', check: 'border-yellow-500 bg-yellow-500' }

  return (
    <div>
      <span className="text-[10px] text-gray-500 block mb-1.5">
        {t('cards:clusterGroups.selectClusters')} ({selectedClusters.size} {t('common:common.selected').toLowerCase()})
      </span>
      <div className="max-h-32 overflow-y-auto space-y-1">
        {availableClusters.length === 0 ? (
          <div className="flex items-center gap-2 py-2 text-xs text-gray-500">
            <Loader2 className="w-3 h-3 animate-spin" />
            {t('cards:clusterGroups.loadingClusters')}
          </div>
        ) : (
          availableClusters.map(cluster => {
            const healthy = clusterHealthMap.get(cluster)
            const isSelected = selectedClusters.has(cluster)
            return (
              <button
                key={cluster}
                onClick={() => onToggle(cluster)}
                className={cn(
                  'flex items-center gap-2 w-full px-2 py-1 rounded text-left text-xs transition-colors',
                  isSelected ? accent.selected : 'hover:bg-gray-800/50 text-gray-400'
                )}
              >
                <div className={cn(
                  'w-3.5 h-3.5 rounded border flex items-center justify-center',
                  isSelected ? accent.check : 'border-gray-600'
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
  )
}

// ============================================================================
// Query Builder
// ============================================================================

function QueryBuilder({
  labelSelector,
  onLabelSelectorChange,
  filters,
  onAddFilter,
  onRemoveFilter,
  onUpdateFilter,
}: {
  labelSelector: string
  onLabelSelectorChange: (v: string) => void
  filters: ClusterFilter[]
  onAddFilter: () => void
  onRemoveFilter: (i: number) => void
  onUpdateFilter: (i: number, updates: Partial<ClusterFilter>) => void
}) {
  const { t } = useTranslation(['cards', 'common'])
  return (
    <div className="space-y-2">
      {/* Label selector */}
      <div>
        <label className="flex items-center gap-1 text-[10px] text-gray-500 mb-1">
          <Tag className="w-2.5 h-2.5" />
          {t('cards:clusterGroups.labelSelector')}
        </label>
        <input
          type="text"
          value={labelSelector}
          onChange={(e) => onLabelSelectorChange(e.target.value)}
          placeholder="e.g. topology.kubernetes.io/zone in (us-east-1a)"
          className="w-full px-2 py-1.5 text-xs font-mono rounded-md bg-gray-900/50 border border-gray-700 text-gray-300 placeholder:text-gray-600 focus:outline-none focus:border-purple-500"
        />
      </div>

      {/* Resource filters */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="flex items-center gap-1 text-[10px] text-gray-500">
            <Filter className="w-2.5 h-2.5" />
            {t('cards:clusterGroups.resourceFilters')}
          </label>
          <button
            onClick={onAddFilter}
            className="flex items-center gap-0.5 text-[10px] text-purple-400 hover:text-purple-300"
          >
            <Plus className="w-2.5 h-2.5" />
            {t('common:common.add')}
          </button>
        </div>
        <div className="space-y-1.5">
          {filters.map((f, i) => {
            const fieldDef = FILTER_FIELDS.find(ff => ff.field === f.field)
            const fieldType = fieldDef?.type ?? 'number'
            return (
              <div key={i} className="flex items-center gap-1.5">
                {/* Field */}
                <select
                  value={f.field}
                  onChange={(e) => {
                    const newField = FILTER_FIELDS.find(ff => ff.field === e.target.value)
                    if (newField?.type === 'bool') {
                      onUpdateFilter(i, { field: e.target.value, operator: 'eq', value: 'true' })
                    } else if (newField?.type === 'text') {
                      onUpdateFilter(i, { field: e.target.value, operator: 'eq', value: '' })
                    } else {
                      onUpdateFilter(i, { field: e.target.value, operator: 'gte', value: '1' })
                    }
                  }}
                  className="flex-1 px-1.5 py-1 text-[10px] rounded bg-gray-900/50 border border-gray-700 text-gray-300 focus:outline-none focus:border-purple-500"
                >
                  {FILTER_FIELDS.map(ff => (
                    <option key={ff.field} value={ff.field}>{ff.label}</option>
                  ))}
                </select>

                {fieldType === 'bool' ? (
                  // Bool: just a toggle
                  <select
                    value={f.value}
                    onChange={(e) => onUpdateFilter(i, { value: e.target.value })}
                    className="w-16 px-1.5 py-1 text-[10px] rounded bg-gray-900/50 border border-gray-700 text-gray-300 focus:outline-none focus:border-purple-500"
                  >
                    <option value="true">true</option>
                    <option value="false">false</option>
                  </select>
                ) : fieldType === 'text' ? (
                  <>
                    {/* Text operator */}
                    <select
                      value={f.operator}
                      onChange={(e) => onUpdateFilter(i, { operator: e.target.value })}
                      className="w-16 px-1 py-1 text-[10px] rounded bg-gray-900/50 border border-gray-700 text-gray-300 focus:outline-none focus:border-purple-500"
                    >
                      {TEXT_OPERATORS.map(op => (
                        <option key={op.value} value={op.value}>{op.label}</option>
                      ))}
                    </select>
                    {/* Text value */}
                    <input
                      type="text"
                      value={f.value}
                      onChange={(e) => onUpdateFilter(i, { value: e.target.value })}
                      placeholder="e.g. A100"
                      className="w-20 px-1.5 py-1 text-[10px] rounded bg-gray-900/50 border border-gray-700 text-gray-300 placeholder:text-gray-600 focus:outline-none focus:border-purple-500"
                    />
                  </>
                ) : (
                  <>
                    {/* Numeric operator */}
                    <select
                      value={f.operator}
                      onChange={(e) => onUpdateFilter(i, { operator: e.target.value })}
                      className="w-12 px-1 py-1 text-[10px] rounded bg-gray-900/50 border border-gray-700 text-gray-300 focus:outline-none focus:border-purple-500"
                    >
                      {NUM_OPERATORS.map(op => (
                        <option key={op.value} value={op.value}>{op.label}</option>
                      ))}
                    </select>
                    {/* Numeric value */}
                    <input
                      type="number"
                      value={f.value}
                      onChange={(e) => onUpdateFilter(i, { value: e.target.value })}
                      className="w-14 px-1.5 py-1 text-[10px] rounded bg-gray-900/50 border border-gray-700 text-gray-300 focus:outline-none focus:border-purple-500"
                    />
                  </>
                )}

                {/* Remove */}
                <button
                  onClick={() => onRemoveFilter(i)}
                  className="p-0.5 rounded hover:bg-red-500/20 text-gray-500 hover:text-red-400"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )
          })}
          {filters.length === 0 && (
            <p className="text-[10px] text-gray-600 italic">{t('cards:clusterGroups.noFilters')}</p>
          )}
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// AI Assistant
// ============================================================================

function AIAssistant({
  prompt,
  onPromptChange,
  onGenerate,
  loading,
  error,
}: {
  prompt: string
  onPromptChange: (v: string) => void
  onGenerate: () => void
  loading: boolean
  error: string | null
}) {
  const { t } = useTranslation(['cards', 'common'])
  return (
    <div className="space-y-2">
      <label className="flex items-center gap-1 text-[10px] text-gray-500">
        <Sparkles className="w-2.5 h-2.5" />
        {t('cards:clusterGroups.describeClusters')}
      </label>
      <textarea
        value={prompt}
        onChange={(e) => onPromptChange(e.target.value)}
        placeholder='e.g. "Healthy clusters with at least 4 CPU cores"'
        rows={2}
        className="w-full px-2.5 py-1.5 text-xs rounded-md bg-gray-900/50 border border-gray-700 text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-purple-500 resize-none"
      />
      <button
        onClick={onGenerate}
        disabled={loading || !prompt.trim()}
        className={cn(
          'w-full flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded-md transition-colors',
          loading || !prompt.trim()
            ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
            : 'bg-purple-500/20 text-purple-400 hover:bg-purple-500/30'
        )}
      >
        {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
        {loading ? t('common:common.generating') : t('cards:clusterGroups.generateQuery')}
      </button>
      {error && (
        <p className="text-[10px] text-red-400">{error}</p>
      )}
    </div>
  )
}

// ============================================================================
// Edit Group Form
// ============================================================================

interface EditGroupFormProps {
  group: ClusterGroup
  availableClusters: string[]
  clusterHealthMap: Map<string, boolean | undefined>
  onSave: (updates: Partial<ClusterGroup>) => void
  onCancel: () => void
}

function EditGroupForm({ group, availableClusters, clusterHealthMap, onSave, onCancel }: EditGroupFormProps) {
  const { t } = useTranslation(['cards', 'common'])
  const { previewQuery } = useClusterGroups()
  const [selectedClusters, setSelectedClusters] = useState<Set<string>>(new Set(group.clusters))
  const [selectedColor, setSelectedColor] = useState(group.color || 'blue')
  const [kind, setKind] = useState<ClusterGroupKind>(group.kind || 'static')
  const [labelSelector, setLabelSelector] = useState(group.query?.labelSelector ?? '')
  const [filters, setFilters] = useState<ClusterFilter[]>(group.query?.filters ?? [])
  const [previewClusters, setPreviewClusters] = useState<string[] | null>(null)
  const [isPreviewing, setIsPreviewing] = useState(false)

  const toggleCluster = (cluster: string) => {
    setSelectedClusters(prev => {
      const next = new Set(prev)
      if (next.has(cluster)) next.delete(cluster)
      else next.add(cluster)
      return next
    })
  }

  const buildQuery = (): ClusterGroupQuery => ({
    labelSelector: labelSelector.trim() || undefined,
    filters: filters.length > 0 ? filters : undefined,
  })

  const handlePreview = async () => {
    setIsPreviewing(true)
    const result = await previewQuery(buildQuery())
    setPreviewClusters(result.clusters)
    setIsPreviewing(false)
  }

  const addFilter = () => setFilters(prev => [...prev, { field: 'healthy', operator: 'eq', value: 'true' }])
  const removeFilter = (i: number) => setFilters(prev => prev.filter((_, idx) => idx !== i))
  const updateFilter = (i: number, updates: Partial<ClusterFilter>) => {
    setFilters(prev => prev.map((f, idx) => idx === i ? { ...f, ...updates } : f))
  }

  const handleSave = () => {
    if (kind === 'static') {
      if (selectedClusters.size === 0) return
      onSave({
        kind: 'static',
        clusters: Array.from(selectedClusters),
        color: selectedColor,
        query: undefined,
      })
    } else {
      onSave({
        kind: 'dynamic',
        clusters: previewClusters ?? group.clusters,
        color: selectedColor,
        query: buildQuery(),
        lastEvaluated: previewClusters ? new Date().toISOString() : group.lastEvaluated,
      })
    }
  }

  return (
    <div className="rounded-lg border border-yellow-500/40 bg-yellow-500/5 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-yellow-400">{t('common:common.edit')}: {group.name}</span>
        <button onClick={onCancel} className="p-2 hover:bg-white/10 rounded min-h-11 min-w-11 flex items-center justify-center">
          <X className="w-3.5 h-3.5 text-gray-500" />
        </button>
      </div>

      {/* Color picker */}
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-gray-500 mr-1">{t('cards:clusterGroups.color')}:</span>
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

      {/* Static / Dynamic toggle */}
      <div className="flex rounded-md overflow-hidden border border-gray-700">
        <button
          onClick={() => setKind('static')}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors',
            kind === 'static'
              ? 'bg-yellow-500/20 text-yellow-400'
              : 'bg-gray-900/30 text-gray-500 hover:text-gray-400'
          )}
        >
          <Server className="w-3 h-3" />
          {t('cards:clusterGroups.static')}
        </button>
        <button
          onClick={() => setKind('dynamic')}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors',
            kind === 'dynamic'
              ? 'bg-purple-500/20 text-purple-400'
              : 'bg-gray-900/30 text-gray-500 hover:text-gray-400'
          )}
        >
          <Zap className="w-3 h-3" />
          {t('cards:clusterGroups.dynamic')}
        </button>
      </div>

      {/* Static: cluster picker */}
      {kind === 'static' && (
        <StaticClusterPicker
          availableClusters={availableClusters}
          clusterHealthMap={clusterHealthMap}
          selectedClusters={selectedClusters}
          onToggle={toggleCluster}
          accentColor="yellow"
        />
      )}

      {/* Dynamic: query builder */}
      {kind === 'dynamic' && (
        <div className="space-y-2">
          <QueryBuilder
            labelSelector={labelSelector}
            onLabelSelectorChange={setLabelSelector}
            filters={filters}
            onAddFilter={addFilter}
            onRemoveFilter={removeFilter}
            onUpdateFilter={updateFilter}
          />
          <button
            onClick={handlePreview}
            disabled={isPreviewing || (!labelSelector.trim() && filters.length === 0)}
            className={cn(
              'w-full flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded-md transition-colors',
              (!labelSelector.trim() && filters.length === 0)
                ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
                : 'bg-purple-500/20 text-purple-400 hover:bg-purple-500/30'
            )}
          >
            {isPreviewing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
            Preview Matches
          </button>
          {previewClusters !== null && (
            <div className="text-[10px] text-gray-400">
              {previewClusters.length} cluster{previewClusters.length !== 1 ? 's' : ''} match:
              <span className="ml-1 text-purple-400">
                {previewClusters.length > 0 ? previewClusters.join(', ') : 'none'}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Save / Cancel */}
      <div className="flex gap-2">
        <button
          onClick={onCancel}
          className="flex-1 py-1.5 text-xs font-medium rounded-md bg-gray-800 text-gray-400 hover:bg-gray-700 transition-colors"
        >
          {t('common:common.cancel')}
        </button>
        <button
          onClick={handleSave}
          className="flex-1 py-1.5 text-xs font-medium rounded-md bg-yellow-500 text-black hover:bg-yellow-400 transition-colors"
        >
          {t('common:common.save')}
        </button>
      </div>
    </div>
  )
}
