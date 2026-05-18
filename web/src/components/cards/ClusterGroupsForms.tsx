import { useState } from 'react'
import {
  Server,
  Plus,
  Check,
  X,
  Zap,
  Sparkles,
  Search,
  Tag,
  Filter } from 'lucide-react'
import { cn } from '../../lib/cn'
import {
  useClusterGroups,
  type ClusterGroup,
  type ClusterGroupKind,
  type ClusterFilter,
  type ClusterGroupQuery } from '../../hooks/useClusterGroups'
import { useTranslation } from 'react-i18next'
import {
  GROUP_COLORS,
  FILTER_FIELDS,
  TEXT_OPERATORS,
  NUM_OPERATORS,
} from './ClusterGroups.constants'

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
    filters: filters.length > 0 ? filters : undefined })

  const handlePreview = async () => {
    setIsPreviewing(true)
    try {
      const result = await previewQuery(buildQuery())
      setPreviewClusters(result.clusters)
    } catch {
      setPreviewClusters([])
    } finally {
      setIsPreviewing(false)
    }
  }

  const handleAIGenerate = async () => {
    if (!aiPrompt.trim()) return
    setAiLoading(true)
    setAiError(null)
    try {
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
        try {
          const preview = await previewQuery(result.query)
          setPreviewClusters(preview.clusters)
        } catch {
          setPreviewClusters([])
        } finally {
          setIsPreviewing(false)
        }
      }
    } catch {
      setAiError('Failed to generate query')
    } finally {
      setAiLoading(false)
    }
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
        color: selectedColor })
    } else {
      onSave({
        name: name.trim(),
        kind: 'dynamic',
        clusters: previewClusters ?? [],
        color: selectedColor,
        query: buildQuery(),
        lastEvaluated: previewClusters ? new Date().toISOString() : undefined })
    }
  }

  return (
    <div className="rounded-lg border border-blue-500/40 bg-blue-500/5 p-3 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-y-2">
        <span className="text-xs font-medium text-blue-400">{t('cards:clusterGroups.newClusterGroup')}</span>
        <button onClick={onCancel} aria-label={t('common:common.cancel')} className="p-2 hover:bg-gray-900/10 dark:hover:bg-white/10 rounded min-h-11 min-w-11 flex items-center justify-center">
          <X className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
      </div>

      {/* Name input */}
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={t('cards:clusterGroups.groupNamePlaceholder')}
        className="w-full px-2.5 py-1.5 text-sm rounded-md bg-gray-900/50 border border-border text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:border-blue-500"
        autoFocus
      />

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
              ? 'bg-blue-500/20 text-blue-400'
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
                'flex items-center gap-1 px-2 py-1 text-2xs font-medium rounded transition-colors',
                dynamicTab === 'builder'
                  ? 'bg-purple-500/20 text-purple-400'
                  : 'text-muted-foreground hover:text-muted-foreground'
              )}
            >
              <Search className="w-2.5 h-2.5" />
              {t('cards:clusterGroups.queryBuilder')}
            </button>
            <button
              onClick={() => setDynamicTab('ai')}
              className={cn(
                'flex items-center gap-1 px-2 py-1 text-2xs font-medium rounded transition-colors',
                dynamicTab === 'ai'
                  ? 'bg-purple-500/20 text-purple-400'
                  : 'text-muted-foreground hover:text-muted-foreground'
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
            : 'bg-secondary text-muted-foreground cursor-not-allowed'
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

export { CreateGroupForm, EditGroupForm, StaticClusterPicker, QueryBuilder, AIAssistant }
