import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import {
  Plus, X, Save, Trash2, Activity, Sparkles,
  CheckCircle, GripVertical, Eye, EyeOff,
  Maximize2, Minimize2,
} from 'lucide-react'
// NOTE: Wildcard import is required for dynamic icon resolution
// Users select from POPULAR_ICONS list and icons are rendered dynamically via getIcon()
// which resolves icon names at runtime using Icons[name]
import * as Icons from 'lucide-react'
import { LucideIcon } from 'lucide-react'
import { BaseModal } from '../../lib/modals'
import { cn } from '../../lib/cn'
import {
  saveDynamicStatsDefinition,
  deleteDynamicStatsDefinition,
  getAllDynamicStats,
} from '../../lib/dynamic-cards'
import type { StatsDefinition, StatBlockDefinition, StatBlockColor, StatBlockValueSource } from '../../lib/stats/types'
import { COLOR_CLASSES } from '../../lib/stats/types'
import { AiGenerationPanel } from './AiGenerationPanel'
import { InlineAIAssist } from './InlineAIAssist'
import { STAT_BLOCK_SYSTEM_PROMPT, STAT_INLINE_ASSIST_PROMPT } from '../../lib/ai/prompts'
import { useAIMode } from '../../hooks/useAIMode'

// Demo/preview constants
const DEMO_STAT_VALUE = 42 // Placeholder value shown in stat block previews

interface StatBlockFactoryModalProps {
  isOpen: boolean
  onClose: () => void
  onStatsCreated?: (type: string) => void
}

type Tab = 'builder' | 'ai' | 'manage'

const AVAILABLE_COLORS: StatBlockColor[] = [
  'purple', 'blue', 'green', 'yellow', 'orange', 'red', 'cyan', 'gray', 'indigo',
]

const POPULAR_ICONS = [
  'Server', 'Database', 'Cpu', 'MemoryStick', 'HardDrive', 'Zap',
  'CheckCircle2', 'XCircle', 'AlertTriangle', 'Activity', 'BarChart3',
  'Layers', 'Box', 'Shield', 'Lock', 'Globe', 'Cloud', 'GitBranch',
  'Terminal', 'Code', 'Wifi', 'WifiOff', 'Clock', 'Users',
  'Gauge', 'TrendingUp', 'TrendingDown', 'ArrowUpRight', 'Flame',
]

const VALUE_FORMATS = [
  { value: '', label: 'None' },
  { value: 'number', label: 'Number (K/M)' },
  { value: 'percent', label: 'Percent' },
  { value: 'bytes', label: 'Bytes' },
  { value: 'currency', label: 'Currency' },
  { value: 'duration', label: 'Duration' },
]

interface BlockEditorItem {
  id: string
  label: string
  icon: string
  color: StatBlockColor
  field: string
  format: string
  tooltip: string
}

function getIcon(name: string): LucideIcon {
  return (Icons as unknown as Record<string, LucideIcon>)[name] || Icons.HelpCircle
}

function createEmptyBlock(): BlockEditorItem {
  return {
    id: `stat_${Date.now()}`,
    label: '',
    icon: 'Activity',
    color: 'purple',
    field: '',
    format: '',
    tooltip: '',
  }
}

// ============================================================================
// Smart Defaults — suggest icon and color based on label
// ============================================================================

interface SmartDefault {
  icon: string
  color: StatBlockColor
}

const SMART_DEFAULTS: { pattern: RegExp; defaults: SmartDefault }[] = [
  { pattern: /^(healthy|running|active|up|online|success)$/i, defaults: { icon: 'CheckCircle2', color: 'green' } },
  { pattern: /^(error|failed|down|offline|critical)$/i, defaults: { icon: 'XCircle', color: 'red' } },
  { pattern: /^(warning|pending|degraded|issue|alert)$/i, defaults: { icon: 'AlertTriangle', color: 'yellow' } },
  { pattern: /^(total|count|all|sum|instances?)$/i, defaults: { icon: 'Server', color: 'purple' } },
  { pattern: /^cpu/i, defaults: { icon: 'Cpu', color: 'blue' } },
  { pattern: /^mem/i, defaults: { icon: 'MemoryStick', color: 'cyan' } },
  { pattern: /^(disk|storage)/i, defaults: { icon: 'HardDrive', color: 'orange' } },
  { pattern: /^(network|traffic|bandwidth)/i, defaults: { icon: 'Wifi', color: 'indigo' } },
  { pattern: /^(latency|response|time)/i, defaults: { icon: 'Clock', color: 'yellow' } },
  { pattern: /^(user|session)/i, defaults: { icon: 'Users', color: 'blue' } },
  { pattern: /^(security|auth|permission)/i, defaults: { icon: 'Shield', color: 'red' } },
  { pattern: /^(deploy|release|version)/i, defaults: { icon: 'GitBranch', color: 'purple' } },
  { pattern: /^(node|cluster|server)/i, defaults: { icon: 'Server', color: 'blue' } },
  { pattern: /^(pod|container)/i, defaults: { icon: 'Box', color: 'cyan' } },
  { pattern: /^(namespace|scope)/i, defaults: { icon: 'Layers', color: 'indigo' } },
]

function getSmartDefault(label: string): SmartDefault | null {
  const trimmed = label.trim()
  if (!trimmed) return null
  for (const { pattern, defaults } of SMART_DEFAULTS) {
    if (pattern.test(trimmed)) return defaults
  }
  return null
}

// ============================================================================
// Inline AI assist result type
// ============================================================================

interface StatAssistResult {
  title?: string
  blocks?: {
    label: string
    icon: string
    color: string
    field: string
    format?: string
    tooltip?: string
  }[]
}

function validateStatAssistResult(data: unknown): { valid: true; result: StatAssistResult } | { valid: false; error: string } {
  const obj = data as Record<string, unknown>
  if (!obj.blocks && !obj.title) return { valid: false, error: 'Response must include title or blocks' }
  return { valid: true, result: obj as StatAssistResult }
}

// ============================================================================
// Live preview of stat blocks matching the StatsRuntime look
// ============================================================================

function StatsPreview({ title, blocks }: { title: string; blocks: BlockEditorItem[] }) {
  const visibleBlocks = blocks.filter(b => b.label.trim())
  if (visibleBlocks.length === 0) {
    return (
      <div className="flex items-center justify-center py-6 text-muted-foreground/40">
        <Activity className="w-6 h-6 mr-2" />
        <span className="text-sm">Add blocks to see preview</span>
      </div>
    )
  }

  const gridCols =
    visibleBlocks.length <= 4 ? 'grid-cols-2 md:grid-cols-4' :
    visibleBlocks.length <= 6 ? 'grid-cols-3 md:grid-cols-6' :
    'grid-cols-4 lg:grid-cols-8'

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Activity className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-medium text-muted-foreground">{title || 'Stats Overview'}</span>
      </div>
      <div className={`grid ${gridCols} gap-4`}>
        {visibleBlocks.map(block => {
          const IconComponent = getIcon(block.icon)
          const colorClass = COLOR_CLASSES[block.color] || 'text-foreground'
          return (
            <div key={block.id} className="glass p-4 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <IconComponent className={`w-5 h-5 shrink-0 ${colorClass}`} />
                <span className="text-sm text-muted-foreground truncate">{block.label}</span>
              </div>
              <div className="text-3xl font-bold text-foreground">{DEMO_STAT_VALUE}</div>
              {block.field && (
                <div className="text-xs text-muted-foreground">{block.field}</div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// AI generation result schema
interface AiStatBlockResult {
  title: string
  type: string
  blocks: {
    id: string
    label: string
    icon: string
    color: string
    field: string
    format: string
    tooltip: string
  }[]
}

const VALID_COLORS = new Set(AVAILABLE_COLORS)

function validateStatBlockResult(
  data: unknown,
): { valid: true; result: AiStatBlockResult } | { valid: false; error: string } {
  const obj = data as Record<string, unknown>
  if (!obj.title || typeof obj.title !== 'string') {
    return { valid: false, error: 'Missing or invalid "title"' }
  }
  if (!obj.blocks || !Array.isArray(obj.blocks) || obj.blocks.length === 0) {
    return { valid: false, error: 'Missing or empty "blocks" array' }
  }

  // Auto-correct invalid colors to 'purple'
  for (const block of obj.blocks as Record<string, unknown>[]) {
    if (!block.color || !VALID_COLORS.has(block.color as StatBlockColor)) {
      block.color = 'purple'
    }
  }

  return { valid: true, result: obj as unknown as AiStatBlockResult }
}

// ============================================================================
// Main Component
// ============================================================================

export function StatBlockFactoryModal({ isOpen, onClose, onStatsCreated }: StatBlockFactoryModalProps) {
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
  const [existingStats, setExistingStats] = useState<StatsDefinition[]>([])
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

  const handleTabChange = useCallback((newTab: Tab) => {
    setTab(newTab)
    if (newTab === 'manage') {
      setExistingStats(getAllDynamicStats())
    }
  }, [])

  const addBlock = useCallback(() => {
    setBlocks(prev => [...prev, createEmptyBlock()])
  }, [])

  const updateBlock = useCallback((idx: number, field: keyof BlockEditorItem, value: string) => {
    setBlocks(prev => prev.map((b, i) => {
      if (i !== idx) return b
      const updated = { ...b, [field]: value }
      // Auto-generate id from label
      if (field === 'label' && !b.id.startsWith('stat_custom_')) {
        updated.id = value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || b.id
      }
      return updated
    }))
  }, [])

  const removeBlock = useCallback((idx: number) => {
    setBlocks(prev => prev.filter((_, i) => i !== idx))
  }, [])

  const moveBlock = useCallback((idx: number, direction: 'up' | 'down') => {
    setBlocks(prev => {
      const newBlocks = [...prev]
      const targetIdx = direction === 'up' ? idx - 1 : idx + 1
      if (targetIdx < 0 || targetIdx >= newBlocks.length) return prev
      ;[newBlocks[idx], newBlocks[targetIdx]] = [newBlocks[targetIdx], newBlocks[idx]]
      return newBlocks
    })
  }, [])

  const handleSave = useCallback(() => {
    const type = statsType.trim() || `custom_${Date.now()}`
    if (blocks.filter(b => b.label.trim()).length === 0) {
      setSaveMessage('Add at least one stat block.')
      const validationTimeoutId = setTimeout(() => setSaveMessage(null), 3000)
      timeoutsRef.current.push(validationTimeoutId)
      return
    }

    const statBlocks: StatBlockDefinition[] = blocks
      .filter(b => b.label.trim())
      .map((b, idx) => ({
        id: b.id || `block_${idx}`,
        label: b.label,
        icon: b.icon,
        color: b.color,
        visible: true,
        order: idx,
        valueSource: b.field ? {
          field: b.field,
          format: (b.format || undefined) as StatBlockValueSource['format'],
        } : undefined,
        tooltip: b.tooltip || undefined,
      }))

    const definition: StatsDefinition = {
      type,
      title: title.trim() || 'Custom Stats',
      blocks: statBlocks,
      defaultCollapsed: false,
      grid: gridCols > 0 ? { columns: gridCols } : undefined,
    }

    saveDynamicStatsDefinition(definition)
    setSaveMessage(`Stats "${definition.title}" created!`)
    onStatsCreated?.(type)

    const saveSuccessTimeoutId = setTimeout(() => setSaveMessage(null), 3000)
    timeoutsRef.current.push(saveSuccessTimeoutId)
  }, [statsType, blocks, title, gridCols, onStatsCreated])

  const handleDelete = useCallback((type: string) => {
    deleteDynamicStatsDefinition(type)
    setExistingStats(getAllDynamicStats())
  }, [])

  // Handle inline AI assist result
  const handleAssistResult = useCallback((result: StatAssistResult) => {
    if (result.title) setTitle(result.title)
    if (result.blocks && result.blocks.length > 0) {
      setBlocks(result.blocks.map(b => ({
        id: b.label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || `stat_${Date.now()}`,
        label: b.label,
        icon: b.icon || 'Activity',
        color: (AVAILABLE_COLORS.includes(b.color as StatBlockColor) ? b.color : 'purple') as StatBlockColor,
        field: b.field || '',
        format: b.format || '',
        tooltip: b.tooltip || '',
      })))
    }
  }, [])

  // Smart default suggestions per block
  const smartDefaults = useMemo(
    () => blocks.map(b => getSmartDefault(b.label)),
    [blocks]
  )

  const applySmartDefault = useCallback((idx: number, defaults: SmartDefault) => {
    setBlocks(prev => prev.map((b, i) => i === idx ? { ...b, icon: defaults.icon, color: defaults.color } : b))
  }, [])

  const tabs = [
    { id: 'builder' as Tab, label: 'Build', icon: Activity },
    { id: 'ai' as Tab, label: 'AI Generate', icon: Sparkles },
    { id: 'manage' as Tab, label: 'Manage', icon: Activity },
  ]

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} size="xl" closeOnBackdrop={false}>
      <BaseModal.Header title="Stat Block Factory" icon={Activity} onClose={onClose} showBack={false} />

      <BaseModal.Tabs
        tabs={tabs}
        activeTab={tab}
        onTabChange={(t) => handleTabChange(t as Tab)}
      />

      <BaseModal.Content className="max-h-[70vh]">
        {/* Save feedback */}
        {saveMessage && (
          <div className="mb-3 flex items-center gap-2 px-3 py-2 rounded-md bg-green-500/10 border border-green-500/20">
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
                  <label className="text-xs text-muted-foreground block mb-1">Title</label>
                  <input
                    type="text"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder="My Stats"
                    className="w-full text-sm px-3 py-2 rounded-md bg-secondary/50 border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-purple-500/50"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Type ID</label>
                  <input
                    type="text"
                    value={statsType}
                    onChange={e => setStatsType(e.target.value)}
                    placeholder="auto-generated"
                    className="w-full text-sm px-3 py-2 rounded-md bg-secondary/50 border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-purple-500/50"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Grid Columns</label>
                  <select
                    value={gridCols}
                    onChange={e => setGridCols(Number(e.target.value))}
                    className="w-full text-sm px-3 py-2 rounded-md bg-secondary/50 border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-purple-500/50"
                  >
                    <option value={0}>Auto</option>
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
                    Stat Blocks ({blocks.length})
                  </label>
                  <button
                    onClick={addBlock}
                    className="flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Plus className="w-3 h-3" />
                    Add Block
                  </button>
                </div>

                <div className="space-y-2 max-h-[35vh] overflow-y-auto">
                  {blocks.map((block, idx) => {
                    const IconComponent = getIcon(block.icon)
                    const smartDefault = smartDefaults[idx]
                    const showSmartSuggestion = isFeatureEnabled('naturalLanguage') && smartDefault &&
                      (block.icon !== smartDefault.icon || block.color !== smartDefault.color)

                    return (
                      <div key={block.id + idx} className="rounded-md bg-card/50 border border-border p-2">
                        <div className="flex items-center gap-2">
                          {/* Drag handle / order */}
                          <div className="flex flex-col items-center gap-0.5">
                            <button
                              onClick={() => moveBlock(idx, 'up')}
                              disabled={idx === 0}
                              className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-20"
                            >
                              <GripVertical className="w-3 h-3" />
                            </button>
                          </div>

                          {/* Icon picker */}
                          <div className="relative">
                            <button
                              onClick={() => setEditingBlockIcon(editingBlockIcon === idx ? null : idx)}
                              className={cn(
                                'p-1.5 rounded-md border transition-colors',
                                editingBlockIcon === idx
                                  ? 'border-purple-500 bg-purple-500/10'
                                  : 'border-border bg-secondary/50 hover:border-purple-500/50',
                              )}
                              title="Change icon"
                            >
                              <IconComponent className={cn('w-4 h-4', COLOR_CLASSES[block.color])} />
                            </button>
                            {editingBlockIcon === idx && (
                              <div className="absolute z-50 top-full mt-1 left-0 bg-card border border-border rounded-lg shadow-lg p-2 w-64 max-h-40 overflow-y-auto">
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
                            placeholder="Label"
                            className="flex-1 text-xs px-2 py-1.5 rounded-md bg-secondary/50 border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-purple-500/50"
                          />

                          {/* Value field */}
                          <input
                            type="text"
                            value={block.field}
                            onChange={e => updateBlock(idx, 'field', e.target.value)}
                            placeholder="data field"
                            className="w-24 text-xs px-2 py-1.5 rounded-md bg-secondary/50 border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-purple-500/50"
                          />

                          {/* Format */}
                          <select
                            value={block.format}
                            onChange={e => updateBlock(idx, 'format', e.target.value)}
                            className="w-20 text-xs px-1.5 py-1.5 rounded-md bg-secondary/50 border border-border text-foreground focus:outline-none"
                          >
                            {VALUE_FORMATS.map(f => (
                              <option key={f.value} value={f.value}>{f.label}</option>
                            ))}
                          </select>

                          {/* Remove */}
                          <button
                            onClick={() => removeBlock(idx)}
                            className="p-1 text-muted-foreground hover:text-red-400 transition-colors"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Smart default suggestion */}
                        {showSmartSuggestion && (
                          <div className="mt-1.5 ml-7">
                            <button
                              onClick={() => applySmartDefault(idx, smartDefault)}
                              className="text-[10px] text-purple-400/60 hover:text-purple-400 transition-colors"
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
                  'w-full flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-colors',
                  blocks.filter(b => b.label.trim()).length > 0
                    ? 'bg-purple-500/20 text-purple-400 hover:bg-purple-500/30'
                    : 'bg-secondary text-muted-foreground cursor-not-allowed',
                )}
              >
                <Save className="w-4 h-4" />
                Create Stat Block
              </button>
            </div>

            {/* Right: Always-on Preview */}
            {previewCollapsed ? (
              <div className="flex items-center justify-center border-l border-border/50 bg-secondary/10 w-10 shrink-0">
                <button
                  onClick={() => setPreviewCollapsed(false)}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                  title="Show preview"
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
                    <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Preview</span>
                    <span className="text-[9px] px-1 py-0.5 rounded bg-purple-500/10 text-purple-400/70">
                      Sample values
                    </span>
                  </div>
                  <div className="flex items-center gap-0.5">
                    <button
                      onClick={() => setPreviewSize(previewSize === 'card' ? 'full' : 'card')}
                      className="p-1 rounded text-muted-foreground/60 hover:text-foreground transition-colors"
                      title={previewSize === 'card' ? 'Full width' : 'Card width'}
                    >
                      {previewSize === 'card' ? <Maximize2 className="w-3 h-3" /> : <Minimize2 className="w-3 h-3" />}
                    </button>
                    <button
                      onClick={() => setPreviewCollapsed(true)}
                      className="p-1 rounded text-muted-foreground/60 hover:text-foreground transition-colors"
                      title="Hide preview"
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
                  tooltip: b.tooltip || '',
                }))}
              />
            )}
            onSave={(result) => {
              const type = result.type || `custom_${Date.now()}`
              const statBlocks: StatBlockDefinition[] = result.blocks.map((b, idx) => ({
                id: b.id || `block_${idx}`,
                label: b.label,
                icon: b.icon,
                color: (AVAILABLE_COLORS.includes(b.color as StatBlockColor) ? b.color : 'purple') as StatBlockColor,
                visible: true,
                order: idx,
                valueSource: b.field ? {
                  field: b.field,
                  format: (b.format || undefined) as StatBlockValueSource['format'],
                } : undefined,
                tooltip: b.tooltip || undefined,
              }))

              const definition: StatsDefinition = {
                type,
                title: result.title || 'AI-Generated Stats',
                blocks: statBlocks,
                defaultCollapsed: false,
              }

              saveDynamicStatsDefinition(definition)
              setSaveMessage(`Stats "${definition.title}" created with AI!`)
              onStatsCreated?.(type)
              const aiCreateTimeoutId = setTimeout(() => setSaveMessage(null), 3000)
              timeoutsRef.current.push(aiCreateTimeoutId)
            }}
            saveLabel="Create Stat Block"
          />
        )}

        {/* Manage tab */}
        {tab === 'manage' && (
          <div className="space-y-3">
            {existingStats.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Activity className="w-8 h-8 text-muted-foreground/40 mb-2" />
                <p className="text-sm text-muted-foreground">No custom stat blocks created yet.</p>
                <p className="text-xs text-muted-foreground/70 mt-1">
                  Use the Build tab to create your first stat block section.
                </p>
              </div>
            ) : (
              existingStats.map(stats => (
                <div key={stats.type} className="rounded-md bg-card/50 border border-border p-3 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Activity className="w-4 h-4 text-purple-400 shrink-0" />
                      <span className="text-sm font-medium text-foreground">{stats.title || stats.type}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400">
                        {stats.blocks.length} blocks
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Type: {stats.type}
                    </p>
                    <div className="flex gap-1 mt-1.5 flex-wrap">
                      {stats.blocks.slice(0, 8).map(block => {
                        const BlockIcon = getIcon(block.icon)
                        return (
                          <span
                            key={block.id}
                            className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-secondary/50 text-muted-foreground"
                          >
                            <BlockIcon className={cn('w-3 h-3', COLOR_CLASSES[block.color])} />
                            {block.label}
                          </span>
                        )
                      })}
                      {stats.blocks.length > 8 && (
                        <span className="text-[10px] px-1.5 py-0.5 text-muted-foreground">
                          +{stats.blocks.length - 8} more
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(stats.type)}
                    className="p-1.5 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-400 transition-colors shrink-0"
                    title="Delete stat block"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </BaseModal.Content>
    </BaseModal>
  )
}
