import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Eye, Save, AlertTriangle, CheckCircle, Loader2 } from 'lucide-react'
import { cn } from '../../lib/cn'
import { saveDynamicCard, compileCardCode, createCardComponent } from '../../lib/dynamic-cards'
import type { DynamicCardDefinition } from '../../lib/dynamic-cards/types'
import { registerDynamicCardType } from '../cards/cardRegistry'
import { LivePreviewPanel } from './LivePreviewPanel'
import { InlineAIAssist } from './InlineAIAssist'
import { CODE_INLINE_ASSIST_PROMPT } from '../../lib/ai/prompts'
import { T2_TEMPLATES, type T2Template } from './cardFactoryTemplatesT2'
import { TemplateDropdown } from './cardFactoryPreviews'
import { validateT2AssistResult, type T2AssistResult } from './cardFactoryAssistTypes'

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

interface CardFactoryCodeProps {
  onCardCreated?: (cardId: string) => void
  onSaveMessage: (message: string) => void
}

/**
 * Custom Code (Tier 2) card creation tab.
 * Displays a split-pane UI with code editor on the left and live preview on the right.
 */
export function CardFactoryCode({ onCardCreated, onSaveMessage }: CardFactoryCodeProps) {
  const { t } = useTranslation()

  // Code (Tier 2) state
  const [t2Title, setT2Title] = useState('')
  const [t2Description, setT2Description] = useState('')
  const [t2Source, setT2Source] = useState(EXAMPLE_TSX)
  const [t2Width, setT2Width] = useState(6)
  const [compileStatus, setCompileStatus] = useState<'idle' | 'compiling' | 'success' | 'error'>('idle')
  const [compileError, setCompileError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

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
    onSaveMessage(`Card "${def.title}" created!`)
    onCardCreated?.(id)
  }

  // Apply T2 template
  const applyT2Template = (tpl: T2Template) => {
    setT2Title(tpl.title)
    setT2Description(tpl.description)
    setT2Width(tpl.width)
    setT2Source(tpl.source)
    setCompileStatus('idle')
  }

  // Handle inline AI assist result for T2
  const handleT2AssistResult = (result: T2AssistResult) => {
    if (result.title) setT2Title(result.title)
    if (result.description) setT2Description(result.description)
    if (result.width) setT2Width(result.width)
    if (result.sourceCode) { setT2Source(result.sourceCode); setCompileStatus('idle') }
  }

  return (
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
  )
}
