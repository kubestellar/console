import { useState, useEffect, useRef, startTransition } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Plus, X, Save, Activity, Sparkles,
  CheckCircle, GripVertical, Eye, EyeOff,
  Maximize2, Minimize2 } from 'lucide-react'
import { BaseModal, ConfirmDialog } from '../../lib/modals'
import { cn } from '../../lib/cn'
import {
  saveDynamicStatsDefinition,
  deleteDynamicStatsDefinition,
  getAllDynamicStats } from '../../lib/dynamic-cards'
import type { StatBlockColor } from '../../lib/stats/types'
import { COLOR_CLASSES } from '../../lib/stats/types'
import { AiGenerationPanel } from './AiGenerationPanel'
import { InlineAIAssist } from './InlineAIAssist'
import { STAT_BLOCK_SYSTEM_PROMPT, STAT_INLINE_ASSIST_PROMPT } from '../../lib/ai/prompts'
import { useAIMode } from '../../hooks/useAIMode'
import { StatusBadge } from '../ui/StatusBadge'
import type { StatBlockFactoryModalProps, Tab, BlockEditorItem, StatAssistResult, AiStatBlockResult } from './statBlockFactoryModal.types'
import {
  AVAILABLE_COLORS,
  POPULAR_ICONS,
  VALUE_FORMATS,
  SAVE_MESSAGE_TIMEOUT_MS,
  getIcon,
  getSmartDefault,
  createEmptyBlock,
  createStatBlockId,
  validateStatAssistResult,
  validateStatBlockResult,
  buildStatBlockDefinitions,
  buildStatsDefinition } from './statBlockFactoryModal.utils'
import { StatsPreview } from './StatBlockFactoryPreview'
import { StatBlockManageTab } from './StatBlockManageTab'

export function StatBlockFactoryModal({ isOpen, onClose, onStatsCreated, embedded = false }: StatBlockFactoryModalProps) {
  const { t } = useTranslation()
  const [tab, setTab] = useState<Tab>('builder')
  const { isFeatureEnabled } = useAIMode()

  // Builder state
  const [title, setTitle] = useState('')
  const [statsType, setStatsType] = useState('')
  const [blocks, setBlocks] = useState<BlockEditorItem[]>([
    { ...createEmptyBlock(), label: 'Total', icon: 'Server', color: 'purple', field: 'total' },
    { ...createEmptyBlock(), label: 'Healthy', icon: 'CheckCircle2', color: 'green', field: 'healthy' },
    { ...createEmptyBlock(), label: 'Issues', icon: 'AlertTriangle', color: 'red', field: 'issues' },
  ])
  const [gridCols, setGridCols] = useState<number>(0) // 0 = auto

  // Manage state
  const [existingStats, setExistingStats] = useState(() => getAllDynamicStats())
  const [deleteConfirmType, setDeleteConfirmType] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  // Preview state
  const [previewCollapsed, setPreviewCollapsed] = useState(false)
  const [previewSize, setPreviewSize] = useState<'card' | 'full'>('full')

  // Icon picker state
  const [editingBlockIcon, setEditingBlockIcon] = useState<number | null>(null)

  // Track timeouts for cleanup
  const timeoutsRef = useRef<number[]>([])

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      timeoutsRef.current.forEach(clearTimeout)
      timeoutsRef.current = []
    }
  }, [])

  const handleTabChange = (newTab: Tab) => {
    // Batch state updates to prevent flicker
    startTransition(() => {
      setTab(newTab)
      if (newTab === 'manage') {
        setExistingStats(getAllDynamicStats())
      }
    })
  }

  const addBlock = () => {
    setBlocks(prev => [...prev, createEmptyBlock()])
  }

  const updateBlock = (idx: number, field: keyof BlockEditorItem, value: string) => {
    setBlocks(prev => prev.map((b, i) => i === idx ? { ...b, [field]: value } : b))
  }

  const removeBlock = (idx: number) => {
    setBlocks(prev => prev.filter((_, i) => i !== idx))
  }

  const moveBlock = (idx: number, direction: 'up' | 'down') => {
    setBlocks(prev => {
      const newBlocks = [...prev]
      const targetIdx = direction === 'up' ? idx - 1 : idx + 1
      if (targetIdx < 0 || targetIdx >= newBlocks.length) return prev
      ;[newBlocks[idx], newBlocks[targetIdx]] = [newBlocks[targetIdx], newBlocks[idx]]
      return newBlocks
    })
  }

  const handleSave = () => {
    const type = statsType.trim() || `custom_${Date.now()}`
    if (blocks.filter(b => b.label.trim()).length === 0) {
      // Validation feedback should show immediately
      setSaveMessage('Add at least one stat block.')
      const validationTimeoutId = window.setTimeout(() => setSaveMessage(null), SAVE_MESSAGE_TIMEOUT_MS)
      timeoutsRef.current.push(validationTimeoutId)
      return
    }

    const definition = buildStatsDefinition(type, title, blocks, gridCols)
    saveDynamicStatsDefinition(definition)
    setSaveMessage(`Stats "${definition.title}" created!`)
    onStatsCreated?.(type)

    const saveSuccessTimeoutId = window.setTimeout(() => setSaveMessage(null), SAVE_MESSAGE_TIMEOUT_MS)
    timeoutsRef.current.push(saveSuccessTimeoutId)
  }

  const handleDelete = (type: string) => {
    // Batch state updates to prevent flicker
    deleteDynamicStatsDefinition(type)
    startTransition(() => {
      setExistingStats(getAllDynamicStats())
    })
  }

  // Handle inline AI assist result
  const handleAssistResult = (result: StatAssistResult) => {
    // Batch state updates to prevent flicker
    startTransition(() => {
      if (result.title) setTitle(result.title)
      if (result.blocks && result.blocks.length > 0) {
        setBlocks(result.blocks.map(b => ({
          id: createStatBlockId(),
          label: b.label,
          icon: b.icon || 'Activity',
          color: (AVAILABLE_COLORS.includes(b.color as StatBlockColor) ? b.color : 'purple') as StatBlockColor,
          field: b.field || '',
          format: b.format || '',
          tooltip: b.tooltip || '' })))
      }
    })
  }

  // Smart default suggestions per block
  const smartDefaults = blocks.map(b => getSmartDefault(b.label))

  const applySmartDefault = (idx: number, defaults: { icon: string; color: StatBlockColor }) => {
    setBlocks(prev => prev.map((b, i) => i === idx ? { ...b, icon: defaults.icon, color: defaults.color } : b))
  }

  const tabs = [
    { id: 'builder' as Tab, label: t('dashboard.statFactory.buildTab'), icon: Activity },
    { id: 'ai' as Tab, label: t('dashboard.statFactory.aiGenerateTab'), icon: Sparkles },
    { id: 'manage' as Tab, label: t('dashboard.statFactory.manageTab'), icon: Activity },
  ]

  const statContent = (
    <>
        {/* Save feedback */}
        {saveMessage && (
          <div className="mb-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-green-500/10 border border-green-500/20">
            <CheckCircle className="w-4 h-4 text-green-400 shrink-0" />
            <span className="text-sm text-green-400">{saveMessage}</span>
          </div>
        )}

        {/* Builder tab — split pane */}
        {tab === 'builder' && (
          <div className="flex gap-0 min-h-[400px]">
            {/* Left: Form */}
            <div className="flex-1 min-w-0 overflow-y-auto pr-2 space-y-4">
              {/* AI Assist bar */}
              <InlineAIAssist<StatAssistResult>
                systemPrompt={STAT_INLINE_ASSIST_PROMPT}
                placeholder="e.g., Stats for Redis cluster: instances, healthy, memory, connections"
                onResult={handleAssistResult}
                validateResult={validateStatAssistResult}
              />

              {/* Header fields */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">{t('dashboard.statFactory.titleLabel')}</label>
                  <input
                    type="text"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder={t('dashboard.statFactory.titlePlaceholder')}
                    className="w-full text-sm px-3 py-2 rounded-lg bg-secondary text-foreground focus:outline-hidden focus:ring-1 focus:ring-purple-500/50"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">{t('dashboard.statFactory.typeIdLabel')}</label>
                  <input
                    type="text"
                    value={statsType}
                    onChange={e => setStatsType(e.target.value)}
                    placeholder={t('dashboard.statFactory.typeIdPlaceholder')}
                    className="w-full text-sm px-3 py-2 rounded-lg bg-secondary text-foreground focus:outline-hidden focus:ring-1 focus:ring-purple-500/50"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">{t('dashboard.statFactory.gridColumnsLabel')}</label>
                  <select
                    value={gridCols}
                    onChange={e => setGridCols(Number(e.target.value))}
                    className="w-full text-sm px-3 py-2 rounded-lg bg-secondary text-foreground focus:outline-hidden focus:ring-1 focus:ring-purple-500/50"
                  >
                    <option value={0}>{t('dashboard.statFactory.autoOption')}</option>
                    <option value={2}>2</option>
                    <option value={3}>3</option>
                    <option value={4}>4</option>
                    <option value={5}>5</option>
                    <option value={6}>6</option>
                    <option value={8}>8</option>
                    <option value={10}>10</option>
                  </select>
                </div>
              </div>

              {/* Blocks editor */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs text-muted-foreground font-medium">
                    {t('dashboard.statFactory.statBlocks', { count: blocks.length })}
                  </label>
                  <button
                    onClick={addBlock}
                    className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Plus className="w-3 h-3" />
                    {t('dashboard.statFactory.addBlock')}
                  </button>
                </div>

                <div className="space-y-2 max-h-[35vh] overflow-y-auto">
                  {blocks.map((block, idx) => {
                    const IconComponent = getIcon(block.icon)
                    const smartDefault = smartDefaults[idx]
                    const showSmartSuggestion = isFeatureEnabled('naturalLanguage') && smartDefault &&
                      (block.icon !== smartDefault.icon || block.color !== smartDefault.color)

                    return (
                      <div key={block.id + idx} className="rounded-lg bg-card/50 border border-border p-2">
                        <div className="flex items-center gap-2">
                          {/* Drag handle / order */}
                          <div className="flex flex-col items-center gap-0.5">
                            <button
                              onClick={() => moveBlock(idx, 'up')}
                              disabled={idx === 0}
                              className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-20"
                              title={t('dashboard.statFactory.moveBlockUp')}
                              aria-label={t('dashboard.statFactory.moveBlockUp')}
                            >
                              <GripVertical className="w-3 h-3" />
                            </button>
                          </div>

                          {/* Icon picker */}
                          <div className="relative">
                            <button
                              onClick={() => setEditingBlockIcon(editingBlockIcon === idx ? null : idx)}
                              className={cn(
                                'p-1.5 min-h-11 min-w-11 rounded-lg border transition-colors',
                                editingBlockIcon === idx
                                  ? 'border-purple-500 bg-purple-500/10'
                                  : 'border-border bg-secondary/50 hover:border-purple-500/50',
                              )}
                              title={t('dashboard.statFactory.changeIcon')}
                              aria-label={t('dashboard.statFactory.changeIcon')}
                            >
                              <IconComponent className={cn('w-4 h-4', COLOR_CLASSES[block.color])} />
                            </button>
                            {editingBlockIcon === idx && (
                              <div className="absolute z-dropdown top-full mt-1 left-0 bg-card border border-border rounded-lg shadow-lg p-2 w-64 max-h-40 overflow-y-auto">
                                <div className="grid grid-cols-8 gap-1">
                                  {POPULAR_ICONS.map(iconName => {
                                    const Ic = getIcon(iconName)
                                    return (
                                      <button
                                        key={iconName}
                                        onClick={() => {
                                          updateBlock(idx, 'icon', iconName)
                                          setEditingBlockIcon(null)
                                        }}
                                        className={cn(
                                          'p-1.5 rounded hover:bg-secondary transition-colors',
                                          block.icon === iconName && 'bg-purple-500/20',
                                        )}
                                        title={iconName}
                                      >
                                        <Ic className="w-3.5 h-3.5 text-foreground" />
                                      </button>
                                    )
                                  })}
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Color picker */}
                          <div className="flex gap-0.5">
                            {AVAILABLE_COLORS.map(c => (
                              <button
                                key={c}
                                onClick={() => updateBlock(idx, 'color', c)}
                                className={cn(
                                  'w-4 h-4 rounded-full border-2 transition-all',
                                  COLOR_CLASSES[c].replace('text-', 'bg-').replace('-400', '-500'),
                                  block.color === c ? 'border-white scale-110' : 'border-transparent opacity-60 hover:opacity-100',
                                )}
                                title={c}
                              />
                            ))}
                          </div>

                          {/* Label */}
                          <input
                            type="text"
                            value={block.label}
                            onChange={e => updateBlock(idx, 'label', e.target.value)}
                            placeholder={t('dashboard.statFactory.labelPlaceholder')}
                            className="flex-1 text-xs px-2 py-1.5 rounded-lg bg-secondary text-foreground focus:outline-hidden focus:ring-1 focus:ring-purple-500/50"
                          />

                          {/* Value field */}
                          <input
                            type="text"
                            value={block.field}
                            onChange={e => updateBlock(idx, 'field', e.target.value)}
                            placeholder={t('dashboard.statFactory.dataFieldPlaceholder')}
                            className="w-24 text-xs px-2 py-1.5 rounded-lg bg-secondary text-foreground focus:outline-hidden focus:ring-1 focus:ring-purple-500/50"
                          />

                          {/* Format */}
                          <select
                            value={block.format}
                            onChange={e => updateBlock(idx, 'format', e.target.value)}
                            className="w-20 text-xs px-1.5 py-1.5 rounded-lg bg-secondary text-foreground focus:outline-hidden"
                          >
                            {VALUE_FORMATS.map(f => (
                              <option key={f.value} value={f.value}>{f.label}</option>
                            ))}
                          </select>

                          {/* Remove */}
                          <button
                            onClick={() => removeBlock(idx)}
                            className="p-1 text-muted-foreground hover:text-red-400 transition-colors min-h-11 min-w-11 flex items-center justify-center"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Smart default suggestion */}
                        {showSmartSuggestion && (
                          <div className="mt-1.5 ml-7">
                            <button
                              onClick={() => applySmartDefault(idx, smartDefault)}
                              className="text-xs text-purple-400/60 hover:text-purple-400 transition-colors"
                            >
                              Suggested: {(() => { const SugIcon = getIcon(smartDefault.icon); return <SugIcon className="w-3 h-3 inline mr-0.5" /> })()}
                              {smartDefault.icon} · {smartDefault.color}
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Save button */}
              <button
                onClick={handleSave}
                disabled={blocks.filter(b => b.label.trim()).length === 0}
                className={cn(
                  'w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors',
                  blocks.filter(b => b.label.trim()).length > 0
                    ? 'bg-purple-500/20 text-purple-400 hover:bg-purple-500/30'
                    : 'bg-secondary text-muted-foreground cursor-not-allowed',
                )}
              >
                <Save className="w-4 h-4" />
                {t('dashboard.statFactory.createStatBlock')}
              </button>
            </div>

            {/* Right: Always-on Preview */}
            {previewCollapsed ? (
              <div className="flex items-center justify-center border-l border-border/50 bg-secondary/10 w-10 shrink-0">
                <button
                  onClick={() => setPreviewCollapsed(false)}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                  title={t('dashboard.preview.showPreview')}
                >
                  <Eye className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="border-l border-border/50 bg-secondary/10 flex flex-col w-[45%] shrink-0">
                {/* Preview header */}
                <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/30">
                  <div className="flex items-center gap-1.5">
                    <Eye className="w-3 h-3 text-muted-foreground" />
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('dashboard.preview.header')}</span>
                    <StatusBadge color="purple" size="xs">
                      {t('dashboard.preview.sampleValues')}
                    </StatusBadge>
                  </div>
                  <div className="flex items-center gap-0.5">
                    <button
                      onClick={() => setPreviewSize(previewSize === 'card' ? 'full' : 'card')}
                      className="p-1 rounded text-muted-foreground/60 hover:text-foreground transition-colors min-h-11 min-w-11 flex items-center justify-center"
                      title={previewSize === 'card' ? t('dashboard.preview.fullWidth') : t('dashboard.preview.cardWidth')}
                    >
                      {previewSize === 'card' ? <Maximize2 className="w-3 h-3" /> : <Minimize2 className="w-3 h-3" />}
                    </button>
                    <button
                      onClick={() => setPreviewCollapsed(true)}
                      className="p-1 rounded text-muted-foreground/60 hover:text-foreground transition-colors min-h-11 min-w-11 flex items-center justify-center"
                      title={t('dashboard.preview.hidePreview')}
                    >
                      <EyeOff className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* Preview content */}
                <div className="flex-1 overflow-y-auto p-3">
                  <div
                    className={cn(
                      'rounded-lg border border-border/50 bg-card/30 p-4 mx-auto transition-all',
                    )}
                    style={previewSize === 'card' ? { maxWidth: '300px' } : undefined}
                  >
                    <StatsPreview title={title || 'Custom Stats'} blocks={blocks} />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* AI Generate tab */}
        {tab === 'ai' && (
          <AiGenerationPanel<AiStatBlockResult>
            systemPrompt={STAT_BLOCK_SYSTEM_PROMPT}
            placeholder="Describe the stat blocks you want, e.g., 'Stats for monitoring a Redis cluster: total instances, healthy, memory usage, connections, latency'"
            missionTitle="AI Stat Block Generation"
            validateResult={validateStatBlockResult}
            renderPreview={(result) => (
              <StatsPreview
                title={result.title}
                blocks={result.blocks.map(b => ({
                  id: b.id,
                  label: b.label,
                  icon: b.icon,
                  color: (AVAILABLE_COLORS.includes(b.color as StatBlockColor) ? b.color : 'purple') as StatBlockColor,
                  field: b.field,
                  format: b.format || '',
                  tooltip: b.tooltip || '' }))}
              />
            )}
            onSave={(result) => {
              const type = result.type || `custom_${Date.now()}`
              const statBlocks = buildStatBlockDefinitions(result.blocks.map(b => ({
                id: b.id,
                label: b.label,
                icon: b.icon,
                color: (AVAILABLE_COLORS.includes(b.color as StatBlockColor) ? b.color : 'purple') as StatBlockColor,
                field: b.field,
                format: b.format || '',
                tooltip: b.tooltip || '' })))

              const definition = {
                type,
                title: result.title || 'AI-Generated Stats',
                blocks: statBlocks,
                defaultCollapsed: false }

              saveDynamicStatsDefinition(definition)
              // Execute parent callback and show success message immediately
              onStatsCreated?.(type)
              setSaveMessage(`Stats "${definition.title}" created with AI!`)
              const aiCreateTimeoutId = window.setTimeout(() => setSaveMessage(null), SAVE_MESSAGE_TIMEOUT_MS)
              timeoutsRef.current.push(aiCreateTimeoutId)
            }}
            saveLabel="Create Stat Block"
          />
        )}

        {/* Manage tab */}
        {tab === 'manage' && (
          <StatBlockManageTab
            existingStats={existingStats}
            onDeleteRequest={setDeleteConfirmType}
          />
        )}
    </>
  )

  const statConfirmDialog = (
    <ConfirmDialog
      isOpen={deleteConfirmType !== null}
      onClose={() => setDeleteConfirmType(null)}
      onConfirm={() => {
        if (deleteConfirmType) {
          handleDelete(deleteConfirmType)
          setDeleteConfirmType(null)
        }
      }}
      title={t('dashboard.statFactory.deleteStatBlock')}
      message={t('dashboard.delete.warning')}
      confirmLabel={t('actions.delete')}
      cancelLabel={t('actions.cancel')}
      variant="danger"
    />
  )

  // Embedded mode: render inline within Console Studio
  if (embedded) {
    return (
      <div className="h-full flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4">
          {/* Tabs inside scrollable content — matches Card Factory layout */}
          <div className="flex items-center gap-1 border-b border-border pb-2 mb-4">
            {tabs.map(tb => (
              <button key={tb.id} onClick={() => handleTabChange(tb.id)}
                className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${tab === tb.id ? 'bg-purple-500/20 text-purple-400' : 'text-muted-foreground hover:text-foreground hover:bg-secondary'}`}>
                {tb.label}
              </button>
            ))}
          </div>
          {statContent}
        </div>
        {statConfirmDialog}
      </div>
    )
  }

  // Standard modal mode
  return (
    <BaseModal isOpen={isOpen} onClose={onClose} size="xl" closeOnBackdrop={false}>
      <BaseModal.Header title={t('dashboard.statFactory.title')} icon={Activity} onClose={onClose} showBack={false} />
      <BaseModal.Tabs tabs={tabs} activeTab={tab} onTabChange={(t) => handleTabChange(t as Tab)} />
      <BaseModal.Content className="max-h-[70vh]">
        {statContent}
      </BaseModal.Content>
      {statConfirmDialog}
    </BaseModal>
  )
}
