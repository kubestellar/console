import { useState } from 'react'
import { Server, X, Zap, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn'
import {
  useClusterGroups,
  type ClusterGroup,
  type ClusterGroupKind,
  type ClusterFilter,
  type ClusterGroupQuery,
} from '../../hooks/useClusterGroups'
import { GROUP_COLORS } from './ClusterGroups.constants'
import { CreateGroupForm } from './ClusterGroupsCreateForm'
import { StaticClusterPicker, QueryBuilder } from '../shared/ClusterGroupsFormFields'

// Form sub-components for ClusterGroups card.
// demoData-exempt: demo data and loading state are handled by the parent ClusterGroups card.

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
    filters: filters.length > 0 ? filters : undefined })

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
        query: undefined })
    } else {
      onSave({
        kind: 'dynamic',
        clusters: previewClusters ?? group.clusters,
        color: selectedColor,
        query: buildQuery(),
        lastEvaluated: previewClusters ? new Date().toISOString() : group.lastEvaluated })
    }
  }

  return (
    <div className="rounded-lg border border-yellow-500/40 bg-yellow-500/5 p-3 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-y-2">
        <span className="text-xs font-medium text-yellow-400">{t('common:common.edit')}: {group.name}</span>
        <button onClick={onCancel} aria-label={t('common:common.cancel')} className="p-2 hover:bg-gray-900/10 dark:hover:bg-white/10 rounded min-h-11 min-w-11 flex items-center justify-center">
          <X className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
      </div>

      {/* Color picker */}
      <div className="flex items-center gap-1.5">
        <span className="text-2xs text-muted-foreground mr-1">{t('cards:clusterGroups.color')}:</span>
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
      <div className="flex rounded-md overflow-hidden border border-border">
        <button
          onClick={() => setKind('static')}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors',
            kind === 'static'
              ? 'bg-yellow-500/20 text-yellow-400'
              : 'bg-gray-900/30 text-muted-foreground hover:text-muted-foreground'
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
              : 'bg-gray-900/30 text-muted-foreground hover:text-muted-foreground'
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
                ? 'bg-secondary text-muted-foreground cursor-not-allowed'
                : 'bg-purple-500/20 text-purple-400 hover:bg-purple-500/30'
            )}
          >
            {isPreviewing ? <span className="refresh-dots inline-flex items-center gap-0.5 text-purple-400"><span className="w-1 h-1 rounded-full bg-current" /><span className="w-1 h-1 rounded-full bg-current" /><span className="w-1 h-1 rounded-full bg-current" /></span> : <Search className="w-3 h-3" />}
            {t('cards:clusterGroups.previewMatches')}
          </button>
          {previewClusters !== null && (
            <div className="text-2xs text-muted-foreground">
              {t('cards:clusterGroups.matchCount', { count: previewClusters.length })}
              <span className="ml-1 text-purple-400">
                {previewClusters.length > 0 ? previewClusters.join(', ') : t('cards:clusterGroups.none')}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Save / Cancel */}
      <div className="flex gap-2">
        <button
          onClick={onCancel}
          className="flex-1 py-1.5 text-xs font-medium rounded-md bg-secondary text-muted-foreground hover:bg-secondary/80 transition-colors"
        >
          {t('common:common.cancel')}
        </button>
        <button
          onClick={handleSave}
          className="flex-1 py-1.5 text-xs font-medium rounded-md bg-yellow-500 text-black dark:text-gray-900 hover:bg-yellow-400 transition-colors"
        >
          {t('common:common.save')}
        </button>
      </div>
    </div>
  )
}

export { CreateGroupForm, EditGroupForm }
export { StaticClusterPicker, QueryBuilder, AIAssistant } from '../shared/ClusterGroupsFormFields'
