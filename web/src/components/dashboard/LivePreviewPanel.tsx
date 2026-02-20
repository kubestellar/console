import { useState, useEffect, useRef, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Eye, EyeOff, Maximize2, Minimize2, AlertTriangle, Loader2, Database } from 'lucide-react'
import { Tier1CardRuntime } from '../cards/DynamicCard'
import { compileCardCode, createCardComponent } from '../../lib/dynamic-cards/compiler'
import { DynamicCardErrorBoundary } from '../cards/DynamicCardErrorBoundary'
import { cn } from '../../lib/cn'
import type { DynamicCardDefinition, DynamicCardDefinition_T1 } from '../../lib/dynamic-cards/types'
import type { CardComponent } from '../cards/cardRegistry'

interface LivePreviewPanelProps {
  tier: 'tier1' | 'tier2'
  t1Config?: {
    layout: 'list' | 'stats' | 'stats-and-list'
    columns: DynamicCardDefinition_T1['columns']
    staticData: Record<string, unknown>[]
    stats?: DynamicCardDefinition_T1['stats']
    searchFields?: string[]
    defaultLimit?: number
  }
  t2Source?: string
  title?: string
  width?: number
}

const DEBOUNCE_TIER1_MS = 300  // Debounce for Tier 1 (declarative) config changes
const DEBOUNCE_TIER2_MS = 800  // Longer debounce for Tier 2 (code) changes to avoid excessive recompilation

export function LivePreviewPanel({ tier, t1Config, t2Source, title, width = 6 }: LivePreviewPanelProps) {
  const { t } = useTranslation()
  const [collapsed, setCollapsed] = useState(false)
  const [sizeMode, setSizeMode] = useState<'card' | 'full'>('card')

  if (collapsed) {
    return (
      <div className="flex items-center justify-center border-l border-border/50 bg-secondary/10 w-10 shrink-0">
        <button
          onClick={() => setCollapsed(false)}
          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          title={t('dashboard.preview.showPreview')}
        >
          <Eye className="w-4 h-4" />
        </button>
      </div>
    )
  }

  const maxWidth = sizeMode === 'card'
    ? `${Math.round((width / 12) * 400)}px`
    : undefined

  return (
    <div className="border-l border-border/50 bg-secondary/10 flex flex-col w-[45%] shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/30">
        <div className="flex items-center gap-1.5">
          <Eye className="w-3 h-3 text-muted-foreground" />
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{t('dashboard.preview.header')}</span>
          <span className="text-[9px] px-1 py-0.5 rounded bg-purple-500/10 text-purple-400/70">
            {t('dashboard.preview.sampleData')}
          </span>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setSizeMode(sizeMode === 'card' ? 'full' : 'card')}
            className="p-1 rounded text-muted-foreground/60 hover:text-foreground transition-colors"
            title={sizeMode === 'card' ? t('dashboard.preview.fullWidth') : t('dashboard.preview.cardWidth')}
          >
            {sizeMode === 'card' ? <Maximize2 className="w-3 h-3" /> : <Minimize2 className="w-3 h-3" />}
          </button>
          <button
            onClick={() => setCollapsed(true)}
            className="p-1 rounded text-muted-foreground/60 hover:text-foreground transition-colors"
            title={t('dashboard.preview.hidePreview')}
          >
            <EyeOff className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto scroll-enhanced p-3">
        <div
          className={cn(
            'rounded-lg border border-border/50 bg-card/30 p-3 mx-auto transition-all',
            sizeMode === 'card' && 'max-w-full',
          )}
          style={maxWidth ? { maxWidth } : undefined}
        >
          {title && (
            <p className="text-xs font-medium text-muted-foreground mb-2 truncate">{title}</p>
          )}
          {tier === 'tier1' ? (
            <T1Preview config={t1Config} />
          ) : (
            <T2Preview source={t2Source} />
          )}
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Tier 1 Preview (debounced)
// ============================================================================

function T1Preview({ config }: { config?: LivePreviewPanelProps['t1Config'] }) {
  const { t } = useTranslation()
  const [debouncedConfig, setDebouncedConfig] = useState(config)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setDebouncedConfig(config), DEBOUNCE_TIER1_MS)
    return () => clearTimeout(timerRef.current)
  }, [config])

  if (!debouncedConfig || !debouncedConfig.columns || debouncedConfig.columns.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-center">
        <Database className="w-6 h-6 text-muted-foreground/30 mb-2" />
        <p className="text-xs text-muted-foreground/50">{t('dashboard.preview.addColumnsToPreview')}</p>
      </div>
    )
  }

  const cardDef: DynamicCardDefinition_T1 = {
    dataSource: 'static',
    staticData: debouncedConfig.staticData || [],
    columns: debouncedConfig.columns,
    layout: debouncedConfig.layout,
    stats: debouncedConfig.stats,
    searchFields: debouncedConfig.searchFields || debouncedConfig.columns.map(c => c.field),
    defaultLimit: debouncedConfig.defaultLimit || 5,
  }

  const ephemeralDef: DynamicCardDefinition = {
    id: '__preview__',
    title: 'Preview',
    tier: 'tier1',
    createdAt: '',
    updatedAt: '',
    cardDefinition: cardDef,
  }

  return (
    <DynamicCardErrorBoundary cardId="__preview__">
      <Tier1CardRuntime definition={ephemeralDef} cardDefinition={cardDef} />
    </DynamicCardErrorBoundary>
  )
}

// ============================================================================
// Tier 2 Preview (debounced compilation)
// ============================================================================

function T2Preview({ source }: { source?: string }) {
  const { t } = useTranslation()
  const [debouncedSource, setDebouncedSource] = useState(source)
  const [compiling, setCompiling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [CardComponent, setCardComponent] = useState<CardComponent | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  // Debounce source changes
  useEffect(() => {
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setDebouncedSource(source), DEBOUNCE_TIER2_MS)
    return () => clearTimeout(timerRef.current)
  }, [source])

  // Compile when debounced source updates
  const compiledKey = useMemo(() => debouncedSource, [debouncedSource])

  useEffect(() => {
    if (!compiledKey) {
      setCardComponent(null)
      setError(null)
      return
    }

    let cancelled = false
    setCompiling(true)
    setError(null)

    compileCardCode(compiledKey).then(result => {
      if (cancelled) return
      if (result.error) {
        setError(result.error)
        setCompiling(false)
        setCardComponent(null)
        return
      }
      const componentResult = createCardComponent(result.code!)
      if (cancelled) return
      if (componentResult.error) {
        setError(componentResult.error)
        setCompiling(false)
        setCardComponent(null)
        return
      }
      setCardComponent(() => componentResult.component)
      setCompiling(false)
    })

    return () => { cancelled = true }
  }, [compiledKey])

  if (!source) {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-center">
        <Database className="w-6 h-6 text-muted-foreground/30 mb-2" />
        <p className="text-xs text-muted-foreground/50">{t('dashboard.preview.writeCodeToPreview')}</p>
      </div>
    )
  }

  if (compiling) {
    return (
      <div className="flex items-center justify-center py-6 gap-2">
        <Loader2 className="w-4 h-4 text-purple-400 animate-spin" />
        <span className="text-xs text-muted-foreground">{t('dashboard.preview.compiling')}</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-4 px-2 text-center">
        <AlertTriangle className="w-5 h-5 text-red-400 mb-1.5" />
        <p className="text-[10px] text-red-400 font-mono break-all max-h-20 overflow-y-auto">{error}</p>
      </div>
    )
  }

  if (!CardComponent) {
    return (
      <div className="flex items-center justify-center py-6">
        <p className="text-xs text-muted-foreground/50">{t('dashboard.preview.noComponentProduced')}</p>
      </div>
    )
  }

  return (
    <DynamicCardErrorBoundary cardId="__preview_t2__">
      <div className="min-h-[120px]">
        <CardComponent config={{}} />
      </div>
    </DynamicCardErrorBoundary>
  )
}
