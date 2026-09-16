import { useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, X, Save, GripVertical, Eye, EyeOff, Maximize2, Minimize2 } from 'lucide-react'
import { cn } from '../../lib/cn'
import { COLOR_CLASSES } from '../../lib/stats/types'
import { STAT_INLINE_ASSIST_PROMPT } from '../../lib/ai/prompts'
import { InlineAIAssist } from './InlineAIAssist'
import { StatusBadge } from '../ui/StatusBadge'
import { Button } from '../ui/Button'
import type { BlockEditorItem, StatAssistResult } from './statBlockFactoryModal.types'
import {
  AVAILABLE_COLORS,
  POPULAR_ICONS,
  VALUE_FORMATS,
  getIcon,
  getSmartDefault,
  validateStatAssistResult } from './statBlockFactoryModal.utils'
import { StatsPreview } from './StatBlockFactoryPreview'

interface StatBlockFactoryBuilderTabProps {
  title: string
  statsType: string
  blocks: BlockEditorItem[]
  gridCols: number
  hasLabeledBlocks: boolean
  isNaturalLanguageEnabled: boolean
  onTitleChange: (value: string) => void
  onStatsTypeChange: (value: string) => void
  onGridColsChange: (value: number) => void
  onAssistResult: (result: StatAssistResult) => void
  onAddBlock: () => void
  onUpdateBlock: (idx: number, field: keyof BlockEditorItem, value: string) => void
  onRemoveBlock: (idx: number) => void
  onMoveBlock: (idx: number, direction: 'up' | 'down') => void
  onSave: () => void
}

interface BuilderPreviewPaneProps {
  title: string
  blocks: BlockEditorItem[]
}

function BuilderPreviewPane({ title, blocks }: BuilderPreviewPaneProps) {
  const { t } = useTranslation()
  const [previewCollapsed, setPreviewCollapsed] = useState(false)
  const [previewSize, setPreviewSize] = useState<'card' | 'full'>('full')

  if (previewCollapsed) {
    return (
      <div className="flex items-center justify-center border-l border-border/50 bg-secondary/10 w-10 shrink-0">
        <button
          onClick={() => setPreviewCollapsed(false)}
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          title={t('dashboard.preview.showPreview')}
        >
          <Eye className="w-4 h-4" />
        </button>
      </div>
    )
  }

  return (
    <div className="border-l border-border/50 bg-secondary/10 flex flex-col w-[45%] shrink-0">
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

      <div className="flex-1 overflow-y-auto p-3">
        <div
          className="rounded-lg border border-border/50 bg-card/30 p-4 mx-auto transition-all"
          style={previewSize === 'card' ? { maxWidth: '300px' } : undefined}
        >
          <StatsPreview title={title || 'Custom Stats'} blocks={blocks} />
        </div>
      </div>
    </div>
  )
}

export function StatBlockFactoryBuilderTab({
  title,
  statsType,
  blocks,
  gridCols,
  hasLabeledBlocks,
  isNaturalLanguageEnabled,
  onTitleChange,
  onStatsTypeChange,
  onGridColsChange,
  onAssistResult,
  onAddBlock,
  onUpdateBlock,
  onRemoveBlock,
  onMoveBlock,
  onSave,
}: StatBlockFactoryBuilderTabProps) {
  const { t } = useTranslation()
  const [editingBlockIcon, setEditingBlockIcon] = useState<number | null>(null)
  const iconTriggerRefs = useRef<Map<number, HTMLButtonElement>>(new Map())

  const handleIconPickerKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const navKeys = ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End']
    if (!navKeys.includes(event.key)) return

    event.preventDefault()
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button'))
    if (items.length === 0) return

    const current = items.indexOf(document.activeElement as HTMLElement)
    const currentIndex = current === -1 ? 0 : current
    const columnCount = 8
    let nextIndex = currentIndex

    if (event.key === 'ArrowRight') nextIndex = Math.min(currentIndex + 1, items.length - 1)
    else if (event.key === 'ArrowLeft') nextIndex = Math.max(currentIndex - 1, 0)
    else if (event.key === 'ArrowDown') nextIndex = Math.min(currentIndex + columnCount, items.length - 1)
    else if (event.key === 'ArrowUp') nextIndex = Math.max(currentIndex - columnCount, 0)
    else if (event.key === 'Home') nextIndex = 0
    else if (event.key === 'End') nextIndex = items.length - 1

    items[nextIndex]?.focus()
  }

  return (
    <div className="flex gap-0 min-h-[400px]">
      <div className="flex-1 min-w-0 overflow-y-auto pr-2 space-y-4">
        <InlineAIAssist<StatAssistResult>
          systemPrompt={STAT_INLINE_ASSIST_PROMPT}
          placeholder="e.g., Stats for Redis cluster: instances, healthy, memory, connections"
          onResult={onAssistResult}
          validateResult={validateStatAssistResult}
        />

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">{t('dashboard.statFactory.titleLabel')}</label>
            <input
              type="text"
              value={title}
              onChange={event => onTitleChange(event.target.value)}
              placeholder={t('dashboard.statFactory.titlePlaceholder')}
              className="w-full text-sm px-3 py-2 rounded-lg bg-secondary text-foreground focus:outline-hidden focus:ring-1 focus:ring-purple-500/50"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">{t('dashboard.statFactory.typeIdLabel')}</label>
            <input
              type="text"
              value={statsType}
              onChange={event => onStatsTypeChange(event.target.value)}
              placeholder={t('dashboard.statFactory.typeIdPlaceholder')}
              className="w-full text-sm px-3 py-2 rounded-lg bg-secondary text-foreground focus:outline-hidden focus:ring-1 focus:ring-purple-500/50"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">{t('dashboard.statFactory.gridColumnsLabel')}</label>
            <select
              value={gridCols}
              onChange={event => onGridColsChange(Number(event.target.value))}
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

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs text-muted-foreground font-medium">
              {t('dashboard.statFactory.statBlocks', { count: blocks.length })}
            </label>
            <Button
              variant="secondary"
              size="sm"
              onClick={onAddBlock}
              className="min-h-11"
              icon={<Plus className="w-3 h-3" />}
            >
              {t('dashboard.statFactory.addBlock')}
            </Button>
          </div>

          <div className="space-y-2 max-h-[35vh] overflow-y-auto">
            {blocks.map((block, idx) => {
              const IconComponent = getIcon(block.icon)
              const smartDefault = getSmartDefault(block.label)
              const showSmartSuggestion = isNaturalLanguageEnabled && smartDefault !== null &&
                (block.icon !== smartDefault.icon || block.color !== smartDefault.color)

              return (
                <div key={block.id + idx} className="rounded-lg bg-card/50 border border-border p-2">
                  <div className="flex items-center gap-2">
                    <div className="flex flex-col items-center gap-0.5">
                      <button
                        onClick={() => onMoveBlock(idx, 'up')}
                        disabled={idx === 0}
                        className="p-0.5 min-h-11 min-w-11 flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-20"
                        title={t('dashboard.statFactory.moveBlockUp')}
                        aria-label={t('dashboard.statFactory.moveBlockUp')}
                      >
                        <GripVertical className="w-3 h-3" />
                      </button>
                    </div>

                    <div
                      className="relative"
                      onKeyDown={event => {
                        if (event.key !== 'Escape' || editingBlockIcon !== idx) return
                        event.preventDefault()
                        event.stopPropagation()
                        setEditingBlockIcon(null)
                        iconTriggerRefs.current.get(idx)?.focus()
                      }}
                    >
                      <button
                        ref={element => {
                          if (element) iconTriggerRefs.current.set(idx, element)
                          else iconTriggerRefs.current.delete(idx)
                        }}
                        onClick={() => setEditingBlockIcon(editingBlockIcon === idx ? null : idx)}
                        aria-expanded={editingBlockIcon === idx}
                        aria-haspopup="menu"
                        aria-controls={`stat-icon-picker-${idx}`}
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
                        <div
                          id={`stat-icon-picker-${idx}`}
                          role="menu"
                          aria-label={t('dashboard.statFactory.changeIcon')}
                          onKeyDown={handleIconPickerKeyDown}
                          className="absolute z-dropdown top-full mt-1 left-0 bg-card border border-border rounded-lg shadow-lg p-2 w-64 max-h-40 overflow-y-auto"
                        >
                          <div className="grid grid-cols-8 gap-1">
                            {POPULAR_ICONS.map(iconName => {
                              const PickerIcon = getIcon(iconName)
                              return (
                                <button
                                  key={iconName}
                                  role="menuitemradio"
                                  aria-checked={block.icon === iconName}
                                  onClick={() => {
                                    onUpdateBlock(idx, 'icon', iconName)
                                    setEditingBlockIcon(null)
                                    iconTriggerRefs.current.get(idx)?.focus()
                                  }}
                                  className={cn(
                                    'p-1.5 rounded hover:bg-secondary transition-colors',
                                    block.icon === iconName && 'bg-purple-500/20',
                                  )}
                                  title={iconName}
                                  aria-label={iconName}
                                >
                                  <PickerIcon className="w-3.5 h-3.5 text-foreground" />
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex gap-0.5">
                      {AVAILABLE_COLORS.map(color => (
                        <button
                          key={color}
                          onClick={() => onUpdateBlock(idx, 'color', color)}
                          className={cn(
                            'w-4 h-4 rounded-full border-2 transition-all',
                            COLOR_CLASSES[color].replace('text-', 'bg-').replace('-400', '-500'),
                            block.color === color ? 'border-white scale-110' : 'border-transparent opacity-60 hover:opacity-100',
                          )}
                          title={color}
                        />
                      ))}
                    </div>

                    <input
                      type="text"
                      value={block.label}
                      onChange={event => onUpdateBlock(idx, 'label', event.target.value)}
                      placeholder={t('dashboard.statFactory.labelPlaceholder')}
                      className="flex-1 text-xs px-2 py-1.5 rounded-lg bg-secondary text-foreground focus:outline-hidden focus:ring-1 focus:ring-purple-500/50"
                    />

                    <input
                      type="text"
                      value={block.field}
                      onChange={event => onUpdateBlock(idx, 'field', event.target.value)}
                      placeholder={t('dashboard.statFactory.dataFieldPlaceholder')}
                      className="w-24 text-xs px-2 py-1.5 rounded-lg bg-secondary text-foreground focus:outline-hidden focus:ring-1 focus:ring-purple-500/50"
                    />

                    <select
                      value={block.format}
                      onChange={event => onUpdateBlock(idx, 'format', event.target.value)}
                      className="w-20 text-xs px-1.5 py-1.5 rounded-lg bg-secondary text-foreground focus:outline-hidden"
                    >
                      {VALUE_FORMATS.map(format => (
                        <option key={format.value} value={format.value}>{format.label}</option>
                      ))}
                    </select>

                    <button
                      onClick={() => onRemoveBlock(idx)}
                      className="p-1 text-muted-foreground hover:text-red-400 transition-colors min-h-11 min-w-11 flex items-center justify-center"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {showSmartSuggestion && smartDefault && (
                    <div className="mt-1.5 ml-7">
                      <button
                        onClick={() => {
                          onUpdateBlock(idx, 'icon', smartDefault.icon)
                          onUpdateBlock(idx, 'color', smartDefault.color)
                        }}
                        className="text-xs text-purple-400/60 hover:text-purple-400 transition-colors"
                      >
                        Suggested: {(() => {
                          const SuggestedIcon = getIcon(smartDefault.icon)
                          return <SuggestedIcon className="w-3 h-3 inline mr-0.5" />
                        })()}
                        {smartDefault.icon} · {smartDefault.color}
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        <button
          onClick={onSave}
          disabled={!hasLabeledBlocks}
          className={cn(
            'w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors',
            hasLabeledBlocks
              ? 'bg-purple-500/20 text-purple-400 hover:bg-purple-500/30'
              : 'bg-secondary text-muted-foreground cursor-not-allowed',
          )}
        >
          <Save className="w-4 h-4" />
          {t('dashboard.statFactory.createStatBlock')}
        </button>
      </div>

      <BuilderPreviewPane title={title} blocks={blocks} />
    </div>
  )
}
