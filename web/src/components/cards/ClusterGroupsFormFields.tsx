import { Server, Plus, Check, X, Sparkles, Tag, Filter } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn'
import type { ClusterFilter } from '../../hooks/useClusterGroups'
import { FILTER_FIELDS, TEXT_OPERATORS, NUM_OPERATORS } from './ClusterGroups.constants'

// Shared form field sub-components for the ClusterGroups card forms.
// demoData-exempt: demo data and loading state are handled by the parent ClusterGroups card.

// ============================================================================
// Shared: Static Cluster Picker
// ============================================================================

function StaticClusterPicker({
  availableClusters,
  clusterHealthMap,
  selectedClusters,
  onToggle,
  accentColor }: {
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
      <span className="text-2xs text-muted-foreground block mb-1.5">
        {t('cards:clusterGroups.selectClusters')} ({selectedClusters.size} {t('common:common.selected').toLowerCase()})
      </span>
      <div className="max-h-32 overflow-y-auto space-y-1">
        {availableClusters.length === 0 ? (
          <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
            <span className="refresh-dots inline-flex items-center gap-0.5 text-muted-foreground"><span className="w-1 h-1 rounded-full bg-current" /><span className="w-1 h-1 rounded-full bg-current" /><span className="w-1 h-1 rounded-full bg-current" /></span>
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
                  isSelected ? accent.selected : 'hover:bg-secondary/50 text-muted-foreground'
                )}
              >
                <div className={cn(
                  'w-3.5 h-3.5 rounded border flex items-center justify-center',
                  isSelected ? accent.check : 'border-border'
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
  onUpdateFilter }: {
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
        <label className="flex items-center gap-1 text-2xs text-muted-foreground mb-1">
          <Tag className="w-2.5 h-2.5" />
          {t('cards:clusterGroups.labelSelector')}
        </label>
        <input
          type="text"
          value={labelSelector}
          onChange={(e) => onLabelSelectorChange(e.target.value)}
          placeholder="e.g. topology.kubernetes.io/zone in (us-east-1a)"
          className="w-full px-2 py-1.5 text-xs font-mono rounded-md bg-gray-900/50 border border-border text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:border-purple-500"
        />
      </div>

      {/* Resource filters */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-y-2 mb-1">
          <label className="flex items-center gap-1 text-2xs text-muted-foreground">
            <Filter className="w-2.5 h-2.5" />
            {t('cards:clusterGroups.resourceFilters')}
          </label>
          <button
            onClick={onAddFilter}
            className="flex items-center gap-0.5 text-2xs text-purple-400 hover:text-purple-300"
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
                  className="flex-1 px-1.5 py-1 text-2xs rounded bg-gray-900/50 border border-border text-foreground focus:outline-hidden focus:border-purple-500"
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
                    className="w-16 px-1.5 py-1 text-2xs rounded bg-gray-900/50 border border-border text-foreground focus:outline-hidden focus:border-purple-500"
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
                      className="w-16 px-1 py-1 text-2xs rounded bg-gray-900/50 border border-border text-foreground focus:outline-hidden focus:border-purple-500"
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
                      className="w-20 px-1.5 py-1 text-2xs rounded bg-gray-900/50 border border-border text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:border-purple-500"
                    />
                  </>
                ) : (
                  <>
                    {/* Numeric operator */}
                    <select
                      value={f.operator}
                      onChange={(e) => onUpdateFilter(i, { operator: e.target.value })}
                      className="w-12 px-1 py-1 text-2xs rounded bg-gray-900/50 border border-border text-foreground focus:outline-hidden focus:border-purple-500"
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
                      className="w-14 px-1.5 py-1 text-2xs rounded bg-gray-900/50 border border-border text-foreground focus:outline-hidden focus:border-purple-500"
                    />
                  </>
                )}

                {/* Remove */}
                <button
                  onClick={() => onRemoveFilter(i)}
                  aria-label={t('cards:clusterGroups.removeFilter', 'Remove filter')}
                  className="p-0.5 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-400"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )
          })}
          {filters.length === 0 && (
            <p className="text-2xs text-muted-foreground italic">{t('cards:clusterGroups.noFilters')}</p>
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
  error }: {
  prompt: string
  onPromptChange: (v: string) => void
  onGenerate: () => void
  loading: boolean
  error: string | null
}) {
  const { t } = useTranslation(['cards', 'common'])
  return (
    <div className="space-y-2">
      <label className="flex items-center gap-1 text-2xs text-muted-foreground">
        <Sparkles className="w-2.5 h-2.5" />
        {t('cards:clusterGroups.describeClusters')}
      </label>
      <textarea
        value={prompt}
        onChange={(e) => onPromptChange(e.target.value)}
        placeholder='e.g. "Healthy clusters with at least 4 CPU cores"'
        rows={2}
        className="w-full px-2.5 py-1.5 text-xs rounded-md bg-gray-900/50 border border-border text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:border-purple-500 resize-none"
      />
      <button
        onClick={onGenerate}
        disabled={loading || !prompt.trim()}
        className={cn(
          'w-full flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded-md transition-colors',
          loading || !prompt.trim()
            ? 'bg-secondary text-muted-foreground cursor-not-allowed'
            : 'bg-purple-500/20 text-purple-400 hover:bg-purple-500/30'
        )}
      >
        {loading ? <span className="refresh-dots inline-flex items-center gap-0.5 text-purple-400"><span className="w-1 h-1 rounded-full bg-current" /><span className="w-1 h-1 rounded-full bg-current" /><span className="w-1 h-1 rounded-full bg-current" /></span> : <Sparkles className="w-3 h-3" />}
        {loading ? t('common:common.generating') : t('cards:clusterGroups.generateQuery')}
      </button>
      {error && (
        <p className="text-2xs text-red-400">{error}</p>
      )}
    </div>
  )
}

export { StaticClusterPicker, QueryBuilder, AIAssistant }
