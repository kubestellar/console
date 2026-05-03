import { useState, useEffect, useRef, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  X, Plus, Code, Layers, Wand2, Eye, Save, Sparkles,
  AlertTriangle, CheckCircle, Loader2 } from 'lucide-react'
import { BaseModal, ConfirmDialog } from '../../lib/modals'
import { cn } from '../../lib/cn'
import { saveDynamicCard, deleteDynamicCard, getAllDynamicCards } from '../../lib/dynamic-cards'
import { compileCardCode, createCardComponent } from '../../lib/dynamic-cards/compiler'
import type {
  DynamicCardDefinition,
  DynamicCardDefinition_T1,
  DynamicCardColumn } from '../../lib/dynamic-cards/types'
import { registerDynamicCardType } from '../cards/cardRegistry'
import { LivePreviewPanel } from './LivePreviewPanel'
import { InlineAIAssist } from './InlineAIAssist'
import { CARD_INLINE_ASSIST_PROMPT, CODE_INLINE_ASSIST_PROMPT } from '../../lib/ai/prompts'
import { generateSampleData } from '../../lib/ai/sampleData'
import { T1_TEMPLATES, type T1Template } from './cardFactoryTemplates'
import { T2_TEMPLATES, type T2Template } from './cardFactoryTemplatesT2'
import { TemplateDropdown } from './cardFactoryPreviews'
import { FieldSuggestChips } from './FieldSuggestChips'
import { AiCardTab } from './cardFactoryAiTab'
import { ManageCardsTab } from './cardFactoryManageTab'
import {
  validateT1AssistResult,
  validateT2AssistResult,
  type T1AssistResult,
  type T2AssistResult } from './cardFactoryAssistTypes'

interface CardFactoryModalProps {
  isOpen: boolean
  onClose: () => void
  onCardCreated?: (cardId: string) => void
  /** When true, renders content inline without BaseModal wrapper (used by Console Studio) */
  embedded?: boolean
}

type Tab = 'declarative' | 'code' | 'ai' | 'manage'

const SAVE_MESSAGE_TIMEOUT_MS = 3000 // Duration to display save/error messages before auto-clearing

// #9061 — Initial sample JSON shown in the Tier 1 "Data (JSON array)" field.
// Exported as a constant so the field's first-focus auto-select can compare
// against the EXACT default string and skip auto-select once the user has
// edited the value (typed/pasted their own content).
const T1_SAMPLE_DATA_JSON =
  '[\n  { "name": "item-1", "status": "healthy" },\n  { "name": "item-2", "status": "error" }\n]'

const EXAMPLE_TSX = `// Example: Simple counter card
export default function MyCard({ config }) {
  const [count, setCount] = useState(0)

  return (
    <div className="h-full flex flex-col items-center justify-center gap-4">
      <p className="text-2xl font-bold text-foreground">{count}</p>
      <button
        onClick={() => setCount(c => c + 1)}
        className="px-4 py-2 rounded-lg bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 transition-colors"
      >
        Increment
      </button>
    </div>
  )
}
`


// ============================================================================
// Main Component
// ============================================================================

export function CardFactoryModal({ isOpen, onClose, onCardCreated, embedded = false }: CardFactoryModalProps) {
  const { t } = useTranslation()
  const [tab, setTab] = useState<Tab>('declarative')

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

  // Code (Tier 2) state
  const [t2Title, setT2Title] = useState('')
  const [t2Description, setT2Description] = useState('')
  const [t2Source, setT2Source] = useState(EXAMPLE_TSX)
  const [t2Width, setT2Width] = useState(6)
  const [compileStatus, setCompileStatus] = useState<'idle' | 'compiling' | 'success' | 'error'>('idle')
  const [compileError, setCompileError] = useState<string | null>(null)

  // Manage state
  const [existingCards, setExistingCards] = useState<DynamicCardDefinition[]>([])
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  // Track timeouts for cleanup
  const timeoutsRef = useRef<number[]>([])

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      timeoutsRef.current.forEach(clearTimeout)
      timeoutsRef.current = []
    }
  }, [])

  // Refresh existing cards list when switching to manage tab
  const handleTabChange = (newTab: Tab) => {
    setTab(newTab)
    if (newTab === 'manage') {
      setExistingCards(getAllDynamicCards())
    }
  }

  // Compile Tier 2 code for preview
  const handleCompile = async () => {
    setCompileStatus('compiling')
    setCompileError(null)

    const result = await compileCardCode(t2Source)
    if (result.error) {
      setCompileStatus('error')
      setCompileError(result.error)
      return
    }

    const componentResult = createCardComponent(result.code!)
    if (componentResult.error) {
      setCompileStatus('error')
      setCompileError(componentResult.error)
      return
    }

    setCompileStatus('success')
  }

  // Save Tier 1 card
  const handleSaveT1 = () => {
    if (!t1Title.trim()) return

    let staticData: Record<string, unknown>[] = []
    try {
      staticData = JSON.parse(t1DataJson)
    } catch {
      setSaveMessage('Invalid JSON data.')
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
    setSaving(false)
    setSaveMessage(`Card "${def.title}" created!`)
    onCardCreated?.(id)

    // Reset
    const saveMessageTimeoutId = window.setTimeout(() => setSaveMessage(null), SAVE_MESSAGE_TIMEOUT_MS)
    timeoutsRef.current.push(saveMessageTimeoutId)
  }

  // Save Tier 2 card
  const handleSaveT2 = async () => {
    if (!t2Title.trim()) return

    setSaving(true)
    const compileResult = await compileCardCode(t2Source)

    if (compileResult.error) {
      setCompileStatus('error')
      setCompileError(compileResult.error)
      setSaving(false)
      return
    }

    const id = `dynamic_${Date.now()}`
    const now = new Date().toISOString()

    const def: DynamicCardDefinition = {
      id,
      title: t2Title.trim(),
      tier: 'tier2',
      description: t2Description.trim() || undefined,
      defaultWidth: t2Width,
      createdAt: now,
      updatedAt: now,
      sourceCode: t2Source,
      compiledCode: compileResult.code! }

    saveDynamicCard(def)
    registerDynamicCardType(id, t2Width)
    setSaving(false)
    setSaveMessage(`Card "${def.title}" created!`)
    onCardCreated?.(id)

    const tier2SaveTimeoutId = window.setTimeout(() => setSaveMessage(null), SAVE_MESSAGE_TIMEOUT_MS)
    timeoutsRef.current.push(tier2SaveTimeoutId)
  }

  // Delete a card
  const handleDelete = (id: string) => {
    deleteDynamicCard(id)
    setExistingCards(getAllDynamicCards())
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

  // Apply T2 template
  const applyT2Template = (tpl: T2Template) => {
    setT2Title(tpl.title)
    setT2Description(tpl.description)
    setT2Width(tpl.width)
    setT2Source(tpl.source)
    setCompileStatus('idle')
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

  // Handle inline AI assist result for T2
  const handleT2AssistResult = (result: T2AssistResult) => {
    if (result.title) setT2Title(result.title)
    if (result.description) setT2Description(result.description)
    if (result.width) setT2Width(result.width)
    if (result.sourceCode) { setT2Source(result.sourceCode); setCompileStatus('idle') }
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

  // Shared content for both modal and embedded modes
  const factoryContent = (
      <div className="flex flex-col">
        {/* Tabs */}
        <div
          role="tablist"
          className="flex items-center gap-1 border-b border-border pb-2 mb-4"
          onKeyDown={(e) => {
            const tabIds: Tab[] = ['declarative', 'code', 'ai', 'manage']
            const idx = tabIds.indexOf(tab)
            if (e.key === 'ArrowRight') handleTabChange(tabIds[Math.min(idx + 1, tabIds.length - 1)])
            else if (e.key === 'ArrowLeft') handleTabChange(tabIds[Math.max(idx - 1, 0)])
          }}
        >
          {[
            { id: 'declarative' as Tab, label: t('dashboard.cardFactory.declarativeTab'), icon: Layers },
            { id: 'code' as Tab, label: t('dashboard.cardFactory.customCodeTab'), icon: Code },
            { id: 'ai' as Tab, label: t('dashboard.cardFactory.aiCreateTab'), icon: Sparkles },
            { id: 'manage' as Tab, label: t('dashboard.cardFactory.manageTab'), icon: Wand2 },
          ].map(t => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              tabIndex={tab === t.id ? 0 : -1}
              onClick={() => handleTabChange(t.id)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                tab === t.id
                  ? 'bg-purple-500/20 text-purple-400'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary',
              )}
            >
              {/* Icon removed for cleaner look */}
              {t.label}
            </button>
          ))}
        </div>

        {/* Save feedback */}
        {saveMessage && (
          <div className="mb-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-green-500/10 border border-green-500/20">
            <CheckCircle className="w-4 h-4 text-green-400 shrink-0" />
            <span className="text-sm text-green-400">{saveMessage}</span>
          </div>
        )}

        {/* Tab content */}
        <div className="flex-1">
          {/* Declarative (Tier 1) — split pane */}
          {tab === 'declarative' && (
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
          )}

          {/* Code (Tier 2) — split pane */}
          {tab === 'code' && (
            <div className="flex gap-0 min-h-[400px]">
              {/* Left: Form */}
              <div className="flex-1 min-w-0 overflow-y-auto pr-2 space-y-4">
                {/* AI Assist bar */}
                <InlineAIAssist<T2AssistResult>
                  systemPrompt={CODE_INLINE_ASSIST_PROMPT}
                  placeholder="e.g., Animated donut chart showing cluster health"
                  onResult={handleT2AssistResult}
                  validateResult={validateT2AssistResult}
                />

                {/* Template dropdown */}
                <TemplateDropdown
                  templates={T2_TEMPLATES}
                  onSelect={applyT2Template}
                  label={t('dashboard.cardFactory.codeTemplates')}
                />

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">{t('dashboard.cardFactory.titleRequired')}</label>
                    <input
                      type="text"
                      value={t2Title}
                      onChange={e => setT2Title(e.target.value)}
                      placeholder={t('dashboard.cardFactory.titlePlaceholder')}
                      className="w-full text-sm px-3 py-2 rounded-lg bg-secondary text-foreground focus:outline-hidden focus:ring-1 focus:ring-inset focus:ring-purple-500/50"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">{t('dashboard.cardFactory.widthLabel')}</label>
                    <select
                      value={t2Width}
                      onChange={e => setT2Width(Number(e.target.value))}
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
                    value={t2Description}
                    onChange={e => setT2Description(e.target.value)}
                    placeholder={t('dashboard.cardFactory.codeDescPlaceholder')}
                    className="w-full text-sm px-3 py-2 rounded-lg bg-secondary text-foreground focus:outline-hidden focus:ring-1 focus:ring-inset focus:ring-purple-500/50"
                  />
                </div>

                {/* Code editor */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs text-muted-foreground">{t('dashboard.cardFactory.tsxSourceCode')}</label>
                    <button
                      onClick={handleCompile}
                      className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Eye className="w-3 h-3" />
                      {t('dashboard.cardFactory.validate')}
                    </button>
                  </div>
                  <textarea
                    value={t2Source}
                    onChange={e => { setT2Source(e.target.value); setCompileStatus('idle') }}
                    rows={14}
                    className="w-full text-xs px-3 py-2 rounded-lg bg-secondary text-foreground font-mono focus:outline-hidden focus:ring-1 focus:ring-inset focus:ring-purple-500/50 leading-relaxed"
                    spellCheck={false}
                  />

                  {/* Compile status */}
                  {compileStatus === 'compiling' && (
                    <div className="mt-2 flex items-center gap-2">
                      <Loader2 className="w-3.5 h-3.5 text-purple-400 animate-spin" />
                      <span className="text-xs text-muted-foreground">{t('dashboard.cardFactory.compiling')}</span>
                    </div>
                  )}
                  {compileStatus === 'success' && (
                    <div className="mt-2 flex items-center gap-2">
                      <CheckCircle className="w-3.5 h-3.5 text-green-400" />
                      <span className="text-xs text-green-400">{t('dashboard.cardFactory.compilationSuccess')}</span>
                    </div>
                  )}
                  {compileStatus === 'error' && compileError && (
                    <div className="mt-2 flex items-start gap-2">
                      <AlertTriangle className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />
                      <span className="text-xs text-red-400 font-mono break-all">{compileError}</span>
                    </div>
                  )}
                </div>

                {/* Available APIs info */}
                <div className="rounded-lg bg-secondary/30 border border-border/50 p-3">
                  <p className="text-xs font-medium text-muted-foreground mb-1">{t('dashboard.cardFactory.availableInScope')}</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    React, useState, useEffect, useMemo, useCallback, useRef, useReducer,
                    cn, useCardData, commonComparators, Skeleton, Pagination,
                    and all lucide-react icons.
                  </p>
                </div>

                {/* Save button */}
                <button
                  onClick={handleSaveT2}
                  disabled={!t2Title.trim() || saving}
                  className={cn(
                    'w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors',
                    t2Title.trim() && !saving
                      ? 'bg-purple-500/20 text-purple-400 hover:bg-purple-500/30'
                      : 'bg-secondary text-muted-foreground cursor-not-allowed',
                  )}
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {saving ? t('dashboard.cardFactory.compilingAndSaving') : t('dashboard.cardFactory.createCard')}
                </button>
              </div>

              {/* Right: Live Preview */}
              <LivePreviewPanel
                tier="tier2"
                t2Source={t2Source}
                title={t2Title || t('dashboard.cardFactory.untitledCard')}
                width={t2Width}
              />
            </div>
          )}

          {/* AI Create */}
          {tab === 'ai' && (
            <AiCardTab
              onCardCreated={(id) => {
                setSaveMessage('Card created with AI!')
                onCardCreated?.(id)
                const aiCreateTimeoutId = window.setTimeout(() => setSaveMessage(null), SAVE_MESSAGE_TIMEOUT_MS)
                timeoutsRef.current.push(aiCreateTimeoutId)
              }}
            />
          )}

          {/* Manage */}
          {tab === 'manage' && (
            <ManageCardsTab
              existingCards={existingCards}
              onDeleteRequest={setDeleteConfirmId}
            />
          )}
        </div>
      </div>
  )

  const confirmDialog = (
    <ConfirmDialog
      isOpen={deleteConfirmId !== null}
      onClose={() => setDeleteConfirmId(null)}
      onConfirm={() => {
        if (deleteConfirmId) {
          handleDelete(deleteConfirmId)
          setDeleteConfirmId(null)
        }
      }}
      title={t('dashboard.cardFactory.deleteCard')}
      message={t('dashboard.delete.warning')}
      confirmLabel={t('actions.delete')}
      cancelLabel={t('actions.cancel')}
      variant="danger"
    />
  )

  // Embedded mode: render content inline within Console Studio
  if (embedded) {
    return (
      <div className="h-full flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4">
          {factoryContent}
        </div>
        {confirmDialog}
      </div>
    )
  }

  // Standard modal mode
  return (
    <BaseModal isOpen={isOpen} onClose={onClose} size="xl" closeOnBackdrop={false}>
      <BaseModal.Header title={t('dashboard.cardFactory.title')} icon={Wand2} onClose={onClose} showBack={false} />
      <BaseModal.Content className="max-h-[70vh]">
        {factoryContent}
      </BaseModal.Content>
      {confirmDialog}
    </BaseModal>
  )
}
