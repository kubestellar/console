import { useState, useMemo } from 'react'
import { useDroppable } from '@dnd-kit/core'
import {
  Plus,
  Trash2,
  Edit2,
  Layers,
  ChevronDown,
  ChevronRight,
  Rocket,
  Zap,
  Tag,
  Filter,
  Database } from 'lucide-react'
import { cn } from '../../lib/cn'
import { ClusterBadge } from '../ui/ClusterBadge'
import {
  useClusterGroups,
  type ClusterGroup,
  type ClusterGroupKind } from '../../hooks/useClusterGroups'
import { useClusters } from '../../hooks/useMCP'
import { useCardLoadingState } from './CardDataContext'
import { useDemoMode } from '../../hooks/useDemoMode'
import { useTranslation } from 'react-i18next'
import { StatusBadge } from '../ui/StatusBadge'
import { ConfirmDialog } from '../../lib/modals'
import { useFederationAwareness, getProviderLabel } from '../../hooks/useFederation'
import { useToast } from '../ui/Toast'
import { formatTimeAgo } from '../../lib/formatters'
import { MAX_INLINE_BADGES, getGroupColor, formatFilter } from './ClusterGroups.constants'
import { CreateGroupForm, EditGroupForm } from './ClusterGroupsForms'

interface ClusterGroupsProps {
  config?: Record<string, unknown>
}

const DEMO_GROUPS: ClusterGroup[] = [
  { name: 'all-healthy-clusters', kind: 'dynamic', clusters: ['eks-prod-us-east-1', 'openshift-prod', 'do-nyc1-prod', 'gke-staging', 'aks-dev-westeu', 'k3s-edge', 'kind-local', 'minikube'], color: 'green', builtIn: true, query: { filters: [{ field: 'healthy', operator: 'eq', value: 'true' }] } },
  { name: 'production', kind: 'static', clusters: ['eks-prod-us-east-1', 'openshift-prod', 'do-nyc1-prod'], color: 'green' },
  { name: 'staging', kind: 'static', clusters: ['gke-staging', 'aks-dev-westeu'], color: 'blue' },
  { name: 'edge', kind: 'dynamic', clusters: ['k3s-edge', 'kind-local', 'minikube'], color: 'purple', query: { filters: [{ field: 'nodeCount', operator: 'lte', value: '3' }] } },
]

// ============================================================================
// Main Component
// ============================================================================

export function ClusterGroups(_props: ClusterGroupsProps) {
  const { t } = useTranslation(['cards', 'common'])
  const { showToast } = useToast()
  const { groups: liveGroups, createGroup, updateGroup, deleteGroup, isPersisted } = useClusterGroups()
  const { deduplicatedClusters: clusters, isLoading, isRefreshing, isFailed, consecutiveFailures } = useClusters()
  const { isDemoMode: demoMode } = useDemoMode()
  const federation = useFederationAwareness()

  // Build the built-in "all-healthy-clusters" group from current cluster state for live mode
  const builtInGroup: ClusterGroup = {
    name: 'all-healthy-clusters',
    kind: 'dynamic',
    clusters: clusters.filter(c => c.healthy).map(c => c.name),
    color: 'green',
    builtIn: true,
    query: { filters: [{ field: 'healthy', operator: 'eq', value: 'true' }] } }

  const federationGroups: ClusterGroup[] = (federation.groups || []).map(fg => ({
    name: `${getProviderLabel(fg.provider)}:${fg.hubContext}:${fg.name}`,
    kind: 'dynamic' as ClusterGroupKind,
    clusters: fg.members || [],
    color: fg.kind === 'set' ? 'cyan' : fg.kind === 'peer' ? 'purple' : 'blue',
    builtIn: true,
    icon: fg.kind,
  }))

  const groups = demoMode ? DEMO_GROUPS : [builtInGroup, ...federationGroups, ...liveGroups]
  const [isCreating, setIsCreating] = useState(false)
  // Track which group is pending delete confirmation (#5197)
  const [deleteConfirmName, setDeleteConfirmName] = useState<string | null>(null)

  // Report loading state to CardWrapper for skeleton/refresh behavior
  const hasData = clusters.length > 0 || groups.length > 0
  useCardLoadingState({
    isLoading: isLoading && !hasData,
    isRefreshing,
    hasAnyData: hasData,
    isDemoData: demoMode,
    isFailed,
    consecutiveFailures })
  const [editingGroup, setEditingGroup] = useState<string | null>(null)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  const clusterHealthMap = useMemo(
    () => new Map(clusters.map(c => [c.name, c.healthy])),
    [clusters],
  )

  const toggleExpanded = (name: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const availableClusterNames = clusters.map(c => c.name)

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-y-2">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-blue-400" />
          <span className="text-sm font-medium text-foreground">
            {t('cards:clusterGroups.groupCount', { count: groups.length })}
          </span>
          {isPersisted && (
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-medium rounded bg-green-500/20 text-green-400 border border-green-500/30"
              title={t('cards:clusterGroups.storedAsCRs')}
            >
              <Database className="w-2.5 h-2.5" />
              {t('cards:clusterGroups.crBadge')}
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
          clusterHealthMap={clusterHealthMap}
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
          <Layers className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{t('cards:clusterGroups.noGroupsYet')}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {t('cards:clusterGroups.createGroupHint')}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {groups.map((group) => (
            editingGroup === group.name && !group.builtIn ? (
              <EditGroupForm
                key={group.name}
                group={group}
                availableClusters={availableClusterNames}
                clusterHealthMap={clusterHealthMap}
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
                clusterHealthMap={clusterHealthMap}
                onToggle={() => toggleExpanded(group.name)}
                onEdit={() => setEditingGroup(group.name)}
                onDelete={() => setDeleteConfirmName(group.name)}
              />
            )
          ))}
        </div>
      )}

      {/* Help text */}
      <div className="pt-2 border-t border-border">
        <p className="text-2xs text-muted-foreground text-center">
          {t('cards:clusterGroups.dragWorkloadHint')}
        </p>
      </div>

      {/* Delete confirmation dialog (#5197) */}
      <ConfirmDialog
        isOpen={deleteConfirmName !== null}
        onClose={() => setDeleteConfirmName(null)}
        onConfirm={() => {
          if (deleteConfirmName) {
            deleteGroup(deleteConfirmName)
            showToast(t('cards:clusterGroups.deleteSuccess', { defaultValue: 'Cluster group deleted' }), 'success')
            setDeleteConfirmName(null)
          }
        }}
        title={t('cards:clusterGroups.deleteGroup')}
        message={t('cards:clusterGroups.deleteConfirmMessage', {
          defaultValue: 'Are you sure you want to delete this cluster group? This action cannot be undone.',
        })}
        confirmLabel={t('common:actions.delete', { defaultValue: 'Delete' })}
        variant="danger"
      />
    </div>
  )
}

// ============================================================================
// Droppable Group Row
// ============================================================================

interface DroppableGroupProps {
  group: ClusterGroup
  isExpanded: boolean
  clusterHealthMap: Map<string, boolean | undefined>
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
}

function DroppableGroup({ group, isExpanded, clusterHealthMap, onToggle, onEdit, onDelete }: DroppableGroupProps) {
  const { t } = useTranslation(['cards', 'common'])
  const { isOver, setNodeRef } = useDroppable({
    id: `cluster-group-${group.name}`,
    data: {
      type: 'cluster-group',
      groupName: group.name,
      clusters: group.clusters } })

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
          type="button"
          onClick={onToggle}
          className="text-muted-foreground hover:text-foreground transition-colors"
          title={`${isExpanded ? t('common:common.collapse', 'Collapse') : t('common:common.expand', 'Expand')} ${group.name}`}
          aria-label={`${isExpanded ? t('common:common.collapse', 'Collapse') : t('common:common.expand', 'Expand')} ${group.name}`}
        >
          {isExpanded
            ? <ChevronDown className="w-3.5 h-3.5" />
            : <ChevronRight className="w-3.5 h-3.5" />
          }
        </button>

        {/* Color dot */}
        <div className={cn('w-2 h-2 rounded-full', color.dot)} />

        {/* Group name + dynamic badge */}
        <span className={cn('text-sm font-medium flex-1 min-w-0 flex items-center gap-1.5', color.text)}>
          <span className="truncate">{group.name}</span>
          {isDynamic && (
            <StatusBadge color="purple" size="xs" variant="outline" rounded="full" icon={<Zap className="w-2.5 h-2.5" />}>
              {t('cards:clusterGroups.dynamic')}
            </StatusBadge>
          )}
        </span>

        {/* Compact cluster badges */}
        <div className="flex items-center gap-1 shrink-0">
          {group.clusters.slice(0, MAX_INLINE_BADGES).map(cluster => (
            <div
              key={cluster}
              className={cn(
                'w-2 h-2 rounded-full border border-border',
                clusterHealthMap.get(cluster) === false ? 'bg-red-500' : 'bg-green-500'
              )}
              title={`${cluster} — ${clusterHealthMap.get(cluster) === false ? t('common:common.unhealthy').toLowerCase() : t('common:common.healthy').toLowerCase()}`}
            />
          ))}
          {group.clusters.length > MAX_INLINE_BADGES && (
            <span className="text-[9px] text-muted-foreground">
              +{group.clusters.length - MAX_INLINE_BADGES}
            </span>
          )}
        </div>

        {/* Cluster count + health */}
        <span className="text-2xs text-muted-foreground whitespace-nowrap shrink-0">
          {healthyCount}/{group.clusters.length} {t('common:common.healthy').toLowerCase()}
        </span>

        {/* Drop indicator */}
        {isOver && (
          <Rocket className="w-4 h-4 text-blue-400 animate-pulse" />
        )}

        {/* Actions */}
        {!group.builtIn && (
        <div className="flex items-center gap-1">
          <button
            onClick={onEdit}
            className="p-1 rounded hover:bg-gray-900/10 dark:hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors"
            title={t('cards:clusterGroups.editGroup')}
            aria-label={t('cards:clusterGroups.editGroup')}
          >
            <Edit2 className="w-3 h-3" />
          </button>
          <button
            onClick={onDelete}
            className="p-1 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-400 transition-colors"
            title={t('cards:clusterGroups.deleteGroup')}
            aria-label={t('cards:clusterGroups.deleteGroup')}
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
        )}
      </div>

      {/* Expanded: cluster list + query info for dynamic groups */}
      {isExpanded && (
        <div className="px-3 pb-2 pt-1 border-t border-border/50 space-y-2">
          {/* Dynamic: show query summary */}
          {isDynamic && group.query && (
            <div className="text-2xs text-muted-foreground space-y-0.5">
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
                <div className="text-muted-foreground">{t('cards:clusterGroups.evaluated', { time: formatTimeAgo(group.lastEvaluated) })}</div>
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
              <span className="text-xs text-muted-foreground italic">{t('cards:clusterGroups.noClustersMatch')}</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}



export default ClusterGroups
