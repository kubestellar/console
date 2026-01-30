import { useState, useCallback } from 'react'
import {
  X, Plus, Code, Layers, Wand2, Eye, Save,
  AlertTriangle, CheckCircle, Loader2, Trash2,
} from 'lucide-react'
import { BaseModal } from '../../lib/modals'
import { cn } from '../../lib/cn'
import { saveDynamicCard, deleteDynamicCard, getAllDynamicCards } from '../../lib/dynamic-cards'
import { compileCardCode, createCardComponent } from '../../lib/dynamic-cards/compiler'
import type {
  DynamicCardDefinition,
  DynamicCardDefinition_T1,
  DynamicCardColumn,
} from '../../lib/dynamic-cards/types'
import { registerDynamicCardType } from '../cards/cardRegistry'

interface CardFactoryModalProps {
  isOpen: boolean
  onClose: () => void
  onCardCreated?: (cardId: string) => void
}

type Tab = 'declarative' | 'code' | 'manage'

const EXAMPLE_TSX = `// Example: Simple counter card
export default function MyCard({ config }) {
  const [count, setCount] = useState(0)

  return (
    <div className="h-full flex flex-col items-center justify-center gap-4">
      <p className="text-2xl font-bold text-foreground">{count}</p>
      <button
        onClick={() => setCount(c => c + 1)}
        className="px-4 py-2 rounded-md bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 transition-colors"
      >
        Increment
      </button>
    </div>
  )
}
`

export function CardFactoryModal({ isOpen, onClose, onCardCreated }: CardFactoryModalProps) {
  const [tab, setTab] = useState<Tab>('declarative')

  // Declarative (Tier 1) state
  const [t1Title, setT1Title] = useState('')
  const [t1Description, setT1Description] = useState('')
  const [t1Layout, setT1Layout] = useState<'list' | 'stats' | 'stats-and-list'>('list')
  const [t1Columns, setT1Columns] = useState<DynamicCardColumn[]>([
    { field: 'name', label: 'Name' },
    { field: 'status', label: 'Status', format: 'badge', badgeColors: { healthy: 'bg-green-500/20 text-green-400', error: 'bg-red-500/20 text-red-400' } },
  ])
  const [t1DataJson, setT1DataJson] = useState('[\n  { "name": "item-1", "status": "healthy" },\n  { "name": "item-2", "status": "error" }\n]')
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
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  // Refresh existing cards list when switching to manage tab
  const handleTabChange = useCallback((newTab: Tab) => {
    setTab(newTab)
    if (newTab === 'manage') {
      setExistingCards(getAllDynamicCards())
    }
  }, [])

  // Compile Tier 2 code for preview
  const handleCompile = useCallback(async () => {
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
  }, [t2Source])

  // Save Tier 1 card
  const handleSaveT1 = useCallback(() => {
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
      defaultLimit: 5,
    }

    const def: DynamicCardDefinition = {
      id,
      title: t1Title.trim(),
      tier: 'tier1',
      description: t1Description.trim() || undefined,
      defaultWidth: t1Width,
      createdAt: now,
      updatedAt: now,
      cardDefinition: cardDef,
    }

    saveDynamicCard(def)
    registerDynamicCardType(id, t1Width)
    setSaving(false)
    setSaveMessage(`Card "${def.title}" created!`)
    onCardCreated?.(id)

    // Reset
    setTimeout(() => setSaveMessage(null), 3000)
  }, [t1Title, t1Description, t1DataJson, t1Columns, t1Layout, t1Width, onCardCreated])

  // Save Tier 2 card
  const handleSaveT2 = useCallback(async () => {
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
      compiledCode: compileResult.code!,
    }

    saveDynamicCard(def)
    registerDynamicCardType(id, t2Width)
    setSaving(false)
    setSaveMessage(`Card "${def.title}" created!`)
    onCardCreated?.(id)

    setTimeout(() => setSaveMessage(null), 3000)
  }, [t2Title, t2Description, t2Source, t2Width, onCardCreated])

  // Delete a card
  const handleDelete = useCallback((id: string) => {
    deleteDynamicCard(id)
    setExistingCards(getAllDynamicCards())
  }, [])

  // Add column (Tier 1)
  const addColumn = useCallback(() => {
    setT1Columns(prev => [...prev, { field: '', label: '' }])
  }, [])

  const updateColumn = useCallback((idx: number, field: keyof DynamicCardColumn, value: string) => {
    setT1Columns(prev => prev.map((col, i) => i === idx ? { ...col, [field]: value } : col))
  }, [])

  const removeColumn = useCallback((idx: number) => {
    setT1Columns(prev => prev.filter((_, i) => i !== idx))
  }, [])

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      size="xl"
    >
      <BaseModal.Header title="Card Factory" icon={Wand2} onClose={onClose} showBack={false} />
      <BaseModal.Content className="max-h-[70vh]">
      <div className="flex flex-col">
        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-border pb-2 mb-4">
          {[
            { id: 'declarative' as Tab, label: 'Declarative', icon: Layers },
            { id: 'code' as Tab, label: 'Custom Code', icon: Code },
            { id: 'manage' as Tab, label: 'Manage', icon: Wand2 },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => handleTabChange(t.id)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors',
                tab === t.id
                  ? 'bg-purple-500/20 text-purple-400'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary',
              )}
            >
              <t.icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          ))}
        </div>

        {/* Save feedback */}
        {saveMessage && (
          <div className="mb-3 flex items-center gap-2 px-3 py-2 rounded-md bg-green-500/10 border border-green-500/20">
            <CheckCircle className="w-4 h-4 text-green-400 shrink-0" />
            <span className="text-sm text-green-400">{saveMessage}</span>
          </div>
        )}

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto">
          {/* Declarative (Tier 1) */}
          {tab === 'declarative' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Title *</label>
                  <input
                    type="text"
                    value={t1Title}
                    onChange={e => setT1Title(e.target.value)}
                    placeholder="My Custom Card"
                    className="w-full text-sm px-3 py-2 rounded-md bg-secondary/50 border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-purple-500/50"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Width (columns)</label>
                  <select
                    value={t1Width}
                    onChange={e => setT1Width(Number(e.target.value))}
                    className="w-full text-sm px-3 py-2 rounded-md bg-secondary/50 border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-purple-500/50"
                  >
                    <option value={3}>Small (3)</option>
                    <option value={4}>Medium (4)</option>
                    <option value={6}>Large (6)</option>
                    <option value={8}>Wide (8)</option>
                    <option value={12}>Full (12)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs text-muted-foreground block mb-1">Description</label>
                <input
                  type="text"
                  value={t1Description}
                  onChange={e => setT1Description(e.target.value)}
                  placeholder="What does this card show?"
                  className="w-full text-sm px-3 py-2 rounded-md bg-secondary/50 border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-purple-500/50"
                />
              </div>

              <div>
                <label className="text-xs text-muted-foreground block mb-1">Layout</label>
                <div className="flex gap-2">
                  {(['list', 'stats', 'stats-and-list'] as const).map(l => (
                    <button
                      key={l}
                      onClick={() => setT1Layout(l)}
                      className={cn(
                        'px-3 py-1.5 rounded-md text-xs transition-colors',
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
                  <label className="text-xs text-muted-foreground">Columns</label>
                  <button
                    onClick={addColumn}
                    className="flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Plus className="w-3 h-3" />
                    Add
                  </button>
                </div>
                <div className="space-y-2">
                  {t1Columns.map((col, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={col.field}
                        onChange={e => updateColumn(idx, 'field', e.target.value)}
                        placeholder="field"
                        className="flex-1 text-xs px-2 py-1.5 rounded-md bg-secondary/50 border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-purple-500/50"
                      />
                      <input
                        type="text"
                        value={col.label}
                        onChange={e => updateColumn(idx, 'label', e.target.value)}
                        placeholder="Label"
                        className="flex-1 text-xs px-2 py-1.5 rounded-md bg-secondary/50 border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-purple-500/50"
                      />
                      <select
                        value={col.format || 'text'}
                        onChange={e => updateColumn(idx, 'format', e.target.value)}
                        className="w-20 text-xs px-2 py-1.5 rounded-md bg-secondary/50 border border-border text-foreground focus:outline-none"
                      >
                        <option value="text">Text</option>
                        <option value="badge">Badge</option>
                        <option value="number">Number</option>
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
              </div>

              {/* Static data JSON */}
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Data (JSON array)</label>
                <textarea
                  value={t1DataJson}
                  onChange={e => setT1DataJson(e.target.value)}
                  rows={6}
                  className="w-full text-xs px-3 py-2 rounded-md bg-secondary/50 border border-border text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-purple-500/50"
                />
              </div>

              {/* Save button */}
              <button
                onClick={handleSaveT1}
                disabled={!t1Title.trim()}
                className={cn(
                  'w-full flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-colors',
                  t1Title.trim()
                    ? 'bg-purple-500/20 text-purple-400 hover:bg-purple-500/30'
                    : 'bg-secondary text-muted-foreground cursor-not-allowed',
                )}
              >
                <Save className="w-4 h-4" />
                Create Card
              </button>
            </div>
          )}

          {/* Code (Tier 2) */}
          {tab === 'code' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Title *</label>
                  <input
                    type="text"
                    value={t2Title}
                    onChange={e => setT2Title(e.target.value)}
                    placeholder="My Custom Card"
                    className="w-full text-sm px-3 py-2 rounded-md bg-secondary/50 border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-purple-500/50"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Width (columns)</label>
                  <select
                    value={t2Width}
                    onChange={e => setT2Width(Number(e.target.value))}
                    className="w-full text-sm px-3 py-2 rounded-md bg-secondary/50 border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-purple-500/50"
                  >
                    <option value={3}>Small (3)</option>
                    <option value={4}>Medium (4)</option>
                    <option value={6}>Large (6)</option>
                    <option value={8}>Wide (8)</option>
                    <option value={12}>Full (12)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs text-muted-foreground block mb-1">Description</label>
                <input
                  type="text"
                  value={t2Description}
                  onChange={e => setT2Description(e.target.value)}
                  placeholder="What does this card do?"
                  className="w-full text-sm px-3 py-2 rounded-md bg-secondary/50 border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-purple-500/50"
                />
              </div>

              {/* Code editor */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs text-muted-foreground">TSX Source Code</label>
                  <button
                    onClick={handleCompile}
                    className="flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Eye className="w-3 h-3" />
                    Validate
                  </button>
                </div>
                <textarea
                  value={t2Source}
                  onChange={e => { setT2Source(e.target.value); setCompileStatus('idle') }}
                  rows={16}
                  className="w-full text-xs px-3 py-2 rounded-md bg-secondary/50 border border-border text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-purple-500/50 leading-relaxed"
                  spellCheck={false}
                />

                {/* Compile status */}
                {compileStatus === 'compiling' && (
                  <div className="mt-2 flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 text-purple-400 animate-spin" />
                    <span className="text-xs text-muted-foreground">Compiling...</span>
                  </div>
                )}
                {compileStatus === 'success' && (
                  <div className="mt-2 flex items-center gap-2">
                    <CheckCircle className="w-3.5 h-3.5 text-green-400" />
                    <span className="text-xs text-green-400">Compilation successful!</span>
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
              <div className="rounded-md bg-secondary/30 border border-border/50 p-3">
                <p className="text-xs font-medium text-muted-foreground mb-1">Available in scope:</p>
                <p className="text-[10px] text-muted-foreground leading-relaxed">
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
                  'w-full flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-colors',
                  t2Title.trim() && !saving
                    ? 'bg-purple-500/20 text-purple-400 hover:bg-purple-500/30'
                    : 'bg-secondary text-muted-foreground cursor-not-allowed',
                )}
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {saving ? 'Compiling & Saving...' : 'Create Card'}
              </button>
            </div>
          )}

          {/* Manage */}
          {tab === 'manage' && (
            <div className="space-y-3">
              {existingCards.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Wand2 className="w-8 h-8 text-muted-foreground/40 mb-2" />
                  <p className="text-sm text-muted-foreground">No custom cards created yet.</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">
                    Use the Declarative or Code tab to create your first card.
                  </p>
                </div>
              ) : (
                existingCards.map(card => (
                  <div key={card.id} className="rounded-md bg-card/50 border border-border p-3 flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground">{card.title}</span>
                        <span className={cn(
                          'text-[10px] px-1.5 py-0.5 rounded',
                          card.tier === 'tier1' ? 'bg-blue-500/20 text-blue-400' : 'bg-purple-500/20 text-purple-400',
                        )}>
                          {card.tier === 'tier1' ? 'Declarative' : 'Custom Code'}
                        </span>
                      </div>
                      {card.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">{card.description}</p>
                      )}
                      <p className="text-[10px] text-muted-foreground/70 mt-1">
                        ID: {card.id} · Created: {new Date(card.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <button
                      onClick={() => handleDelete(card.id)}
                      className="p-1.5 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-400 transition-colors shrink-0"
                      title="Delete card"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
      </BaseModal.Content>
    </BaseModal>
  )
}
