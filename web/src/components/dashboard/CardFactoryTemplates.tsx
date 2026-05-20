import { useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, X, Save } from 'lucide-react'
import { cn } from '../../lib/cn'
import { saveDynamicCard } from '../../lib/dynamic-cards'
import type { DynamicCardColumn, DynamicCardDefinition, DynamicCardDefinition_T1 } from '../../lib/dynamic-cards/types'
import { registerDynamicCardType } from '../cards/cardRegistry'
import { LivePreviewPanel } from './LivePreviewPanel'
import { InlineAIAssist } from './InlineAIAssist'
import { CARD_INLINE_ASSIST_PROMPT } from '../../lib/ai/prompts'
import { generateSampleData } from '../../lib/ai/sampleData'
import { T1_TEMPLATES, type T1Template } from './cardFactoryTemplates'
import { TemplateDropdown } from './cardFactoryPreviews'
import { FieldSuggestChips } from './FieldSuggestChips'
import { validateT1AssistResult, type T1AssistResult } from './cardFactoryAssistTypes'
import { useMemo } from 'react'

// #9061 — Initial sample JSON shown in the Tier 1 "Data (JSON array)" field.
// Exported as a constant so the field's first-focus auto-select can compare
// against the EXACT default string and skip auto-select once the user has
// edited the value (typed/pasted their own content).
export const T1_SAMPLE_DATA_JSON =
  '[\n  { "name": "item-1", "status": "healthy" },\n  { "name": "item-2", "status": "error" }\n]'

interface CardFactoryTemplatesProps {
  onCardCreated?: (cardId: string) => void
  onSaveMessage: (message: string) => void
}

/**
 * Declarative (Tier 1) card creation tab.
 * Displays a split-pane UI with form on the left and live preview on the right.
 */
export function CardFactoryTemplates({ onCardCreated, onSaveMessage }: CardFactoryTemplatesProps) {
  const { t } = useTranslation()

  // Declarative (Tier 1) state
  const [t1Title, setT1Title] = useState('')
  const [t1Description, setT1Description] = useState('')
  const [t1Layout, setT1Layout] = useState<'list' | 'stats' | 'stats-and-list'>('list')
  const [t1Columns, setT1Columns] = useState<DynamicCardColumn[]>([
    { field: 'name', label: 'Name' },
    // #9881 — Use design-system default shade (bg-*-500/10 + text-*-400) so generated cards match built-in cards.
    { field: 'status', label: 'Status', format: 'badge', badgeColors: { healthy: 'bg-green-500/10 text-green-400', error: 'bg-red-500/10 text-red-400' } },
  ])
  const [t1DataJson, setT1DataJson] = useState(T1_SAMPLE_DATA_JSON)
  // #9061 — Track whether the user has already focused the JSON textarea
  // at least once. On the FIRST focus we auto-select the pre-filled sample
  // so that typing replaces it cleanly instead of appending to the sample
  // (which produced invalid concatenated JSON like `[sample][new]`).
  const t1DataJsonFirstFocusRef = useRef(true)
  const [t1Width, setT1Width] = useState(6)

  // Save Tier 1 card
  const handleSaveT1 = () => {
    if (!t1Title.trim()) return

    let staticData: Record<string, unknown>[] = []
    try {
      staticData = JSON.parse(t1DataJson)
    } catch {
      onSaveMessage('Invalid JSON data.')
      return
    }

    const id = `dynamic_${Date.now()}`
    const now = new Date().toISOString()

    const cardDef: DynamicCardDefinition_T1 = {
      dataSource: 'static',
      staticData,
      columns: t1Columns,
      layout: t1Layout,
      searchFields: t1Columns.map(c => c.field),
      defaultLimit: 5 }

    const def: DynamicCardDefinition = {
      id,
      title: t1Title.trim(),
      tier: 'tier1',
      description: t1Description.trim() || undefined,
      defaultWidth: t1Width,
      createdAt: now,
      updatedAt: now,
      cardDefinition: cardDef }

    saveDynamicCard(def)
    registerDynamicCardType(id, t1Width)
    onSaveMessage(`Card "${def.title}" created!`)
    onCardCreated?.(id)
  }

  // Add column (Tier 1)
  const addColumn = () => {
    setT1Columns(prev => [...prev, { field: '', label: '' }])
  }

  const addColumnDef = (col: DynamicCardColumn) => {
    setT1Columns(prev => [...prev, col])
  }

  const updateColumn = (idx: number, field: keyof DynamicCardColumn, value: string) => {
    setT1Columns(prev => prev.map((col, i) => i === idx ? { ...col, [field]: value } : col))
  }

  const removeColumn = (idx: number) => {
    setT1Columns(prev => prev.filter((_, i) => i !== idx))
  }

  // Apply T1 template
  const applyT1Template = (tpl: T1Template) => {
    setT1Title(tpl.title)
    setT1Description(tpl.description)
    setT1Layout(tpl.layout)
    setT1Width(tpl.width)
    setT1Columns(tpl.columns)
    setT1DataJson(JSON.stringify(tpl.data, null, 2))
  }

  // Handle inline AI assist result for T1
  const handleT1AssistResult = (result: T1AssistResult) => {
    if (result.title) setT1Title(result.title)
    if (result.description) setT1Description(result.description)
    if (result.layout) setT1Layout(result.layout)
    if (result.width) setT1Width(result.width)
    if (result.columns) setT1Columns(result.columns)
    if (result.data) setT1DataJson(JSON.stringify(result.data, null, 2))
  }

  // Compute T1 preview data (use sample data if user data is empty/invalid)
  const t1PreviewData = useMemo(() => {
    try {
      const parsed = JSON.parse(t1DataJson)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    } catch { /* use sample */ }
    return generateSampleData(t1Columns)
  }, [t1DataJson, t1Columns])

  // Existing field set for chip filtering
  const existingFieldSet = new Set(t1Columns.map(c => c.field))

  return (
    <div className="flex gap-0 min-h-[400px]">
      {/* Left: Form */}
      <div className="flex-1 min-w-0 overflow-y-auto pr-2 space-y-4">
        {/* AI Assist bar */}
        <InlineAIAssist<T1AssistResult>
          systemPrompt={CARD_INLINE_ASSIST_PROMPT}
          placeholder="e.g., Show pod health as a table with name, namespace, status"
          onResult={handleT1AssistResult}
          validateResult={validateT1AssistResult}
        />

        {/* Template dropdown */}
        <TemplateDropdown
          templates={T1_TEMPLATES}
          onSelect={applyT1Template}
          label={t('dashboard.cardFactory.declarativeTemplates')}
        />

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">{t('dashboard.cardFactory.titleRequired')}</label>
            <input
              type="text"
              value={t1Title}
              onChange={e => setT1Title(e.target.value)}
              placeholder={t('dashboard.cardFactory.titlePlaceholder')}
              className="w-full text-sm px-3 py-2 rounded-lg bg-secondary text-foreground focus:outline-hidden focus:ring-1 focus:ring-inset focus:ring-purple-500/50"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">{t('dashboard.cardFactory.widthLabel')}</label>
            <select
              value={t1Width}
              onChange={e => setT1Width(Number(e.target.value))}
              className="w-full text-sm px-3 py-2 rounded-lg bg-secondary text-foreground focus:outline-hidden focus:ring-1 focus:ring-inset focus:ring-purple-500/50"
            >
              <option value={3}>{t('dashboard.cardFactory.widthSmall')}</option>
              <option value={4}>{t('dashboard.cardFactory.widthMedium')}</option>
              <option value={6}>{t('dashboard.cardFactory.widthLarge')}</option>
              <option value={8}>{t('dashboard.cardFactory.widthWide')}</option>
              <option value={12}>{t('dashboard.cardFactory.widthFull')}</option>
            </select>
          </div>
        </div>

        <div>
          <label className="text-xs text-muted-foreground block mb-1">{t('dashboard.cardFactory.descriptionLabel')}</label>
          <input
            type="text"
            value={t1Description}
            onChange={e => setT1Description(e.target.value)}
            placeholder={t('dashboard.cardFactory.descPlaceholder')}
            className="w-full text-sm px-3 py-2 rounded-lg bg-secondary text-foreground focus:outline-hidden focus:ring-1 focus:ring-inset focus:ring-purple-500/50"
          />
        </div>

        <div>
          <label className="text-xs text-muted-foreground block mb-1">{t('dashboard.cardFactory.layoutLabel')}</label>
          <div className="flex gap-2">
            {(['list', 'stats', 'stats-and-list'] as const).map(l => (
              <button
                key={l}
                onClick={() => setT1Layout(l)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs transition-colors',
                  t1Layout === l
                    ? 'bg-purple-500/20 text-purple-400'
                    : 'bg-secondary text-muted-foreground hover:text-foreground',
                )}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        {/* Columns */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs text-muted-foreground">{t('dashboard.cardFactory.columnsLabel')}</label>
            <button
              onClick={addColumn}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-secondary text-muted-foreground hover:text-foreground transition-colors"
            >
              <Plus className="w-3 h-3" />
              {t('dashboard.cardFactory.addColumn')}
            </button>
          </div>
          <div className="space-y-2">
            {t1Columns.map((col, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <input
                  type="text"
                  value={col.field}
                  onChange={e => updateColumn(idx, 'field', e.target.value)}
                  placeholder={t('dashboard.cardFactory.fieldPlaceholder')}
                  className="flex-1 text-xs px-2 py-1.5 rounded-lg bg-secondary text-foreground focus:outline-hidden focus:ring-1 focus:ring-inset focus:ring-purple-500/50"
                />
                <input
                  type="text"
                  value={col.label}
                  onChange={e => updateColumn(idx, 'label', e.target.value)}
                  placeholder={t('dashboard.cardFactory.labelPlaceholder')}
                  className="flex-1 text-xs px-2 py-1.5 rounded-lg bg-secondary text-foreground focus:outline-hidden focus:ring-1 focus:ring-inset focus:ring-purple-500/50"
                />
                <select
                  value={col.format || 'text'}
                  onChange={e => updateColumn(idx, 'format', e.target.value)}
                  className="w-20 text-xs px-2 py-1.5 rounded-lg bg-secondary text-foreground focus:outline-hidden"
                >
                  <option value="text">{t('cardFactory.formatText')}</option>
                  <option value="badge">{t('cardFactory.formatBadge')}</option>
                  <option value="number">{t('cardFactory.formatNumber')}</option>
                </select>
                <button
                  onClick={() => removeColumn(idx)}
                  className="p-1 text-muted-foreground hover:text-red-400 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
          {/* Field auto-suggest chips */}
          <div className="mt-2">
            <FieldSuggestChips
              dataJson={t1DataJson}
              existingFields={existingFieldSet}
              onAddColumn={addColumnDef}
            />
          </div>
        </div>

        {/* Static data JSON */}
        <div>
          <label className="text-xs text-muted-foreground block mb-1">{t('dashboard.cardFactory.dataLabel')}</label>
          <textarea
            value={t1DataJson}
            onChange={e => {
              // After the first user edit, stop treating the field as "pristine
              // sample" so a re-focus after editing never re-selects their work.
              t1DataJsonFirstFocusRef.current = false
              setT1DataJson(e.target.value)
            }}
            onFocus={e => {
              // #9061 — On first focus, if the field still contains the
              // pristine sample JSON, select it all so typing replaces
              // the sample instead of appending to it.
              if (
                t1DataJsonFirstFocusRef.current &&
                t1DataJson === T1_SAMPLE_DATA_JSON
              ) {
                t1DataJsonFirstFocusRef.current = false
                e.currentTarget.select()
              }
            }}
            rows={6}
            placeholder={T1_SAMPLE_DATA_JSON}
            className="w-full text-xs px-3 py-2 rounded-lg bg-secondary text-foreground font-mono focus:outline-hidden focus:ring-1 focus:ring-inset focus:ring-purple-500/50"
          />
        </div>

        {/* Save button */}
        <button
          onClick={handleSaveT1}
          disabled={!t1Title.trim()}
          className={cn(
            'w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors',
            t1Title.trim()
              ? 'bg-purple-500/20 text-purple-400 hover:bg-purple-500/30'
              : 'bg-secondary text-muted-foreground cursor-not-allowed',
          )}
        >
          <Save className="w-4 h-4" />
          {t('dashboard.cardFactory.createCard')}
        </button>
      </div>

      {/* Right: Live Preview */}
      <LivePreviewPanel
        tier="tier1"
        t1Config={{
          layout: t1Layout,
          columns: t1Columns,
          staticData: t1PreviewData }}
        title={t1Title || t('dashboard.cardFactory.untitledCard')}
        width={t1Width}
      />
    </div>
  )
}
