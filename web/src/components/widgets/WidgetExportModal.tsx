/**
 * Widget Export Modal
 *
 * Allows users to export dashboard cards as standalone desktop widgets
 * for Übersicht (macOS) and other platforms.
 */

import { useState, useMemo, useEffect, useRef } from 'react'
import { Download, Monitor, Smartphone, Copy, Check, ExternalLink, Info, AlertTriangle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { BACKEND_DEFAULT_URL } from '../../lib/constants'
import { emitWidgetDownloaded } from '../../lib/analytics'
import { BaseModal } from '../../lib/modals'
import { UI_FEEDBACK_TIMEOUT_MS } from '../../lib/constants/network'
import {
  WIDGET_CARDS,
  WIDGET_STATS,
  WIDGET_TEMPLATES,
  type WidgetCardDefinition,
  type WidgetTemplateDefinition } from '../../lib/widgets/widgetRegistry'
import { generateWidget, getWidgetFilename, type WidgetConfig } from '../../lib/widgets/codeGenerator'
import { copyToClipboard } from '../../lib/clipboard'
import { safeRevokeObjectURL } from '../../lib/download'
import type { CSSProperties } from 'react'

// Inline style constants
const WIDGET_EXPORT_MODAL_PREVIEW_MAX_WIDTH_PX = 260
const WIDGET_EXPORT_MODAL_PREVIEW_MAX_HEIGHT_PX = 220
const WIDGET_EXPORT_MODAL_DIV_STYLE_2: CSSProperties = { flex: 1 }
const WIDGET_EXPORT_MODAL_SPAN_STYLE_1: CSSProperties = { fontWeight: 500, maxWidth: '110px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
const WIDGET_EXPORT_MODAL_SPAN_STYLE_2: CSSProperties = { fontWeight: 500 }
const WIDGET_EXPORT_MODAL_SPAN_STYLE_3: CSSProperties = { fontWeight: 500, flex: 1 }
const WIDGET_EXPORT_MODAL_SPAN_STYLE_4: CSSProperties = { width: '24px', fontWeight: 600, color: '#94a3b8' }

function getWidgetPreviewDimensions(config: WidgetConfig | null): { width: number; height: number } | null {
  if (!config) return null

  if (config.type === 'card' && config.cardType) {
    const card = WIDGET_CARDS[config.cardType]
    return card ? card.defaultSize : null
  }

  if (config.type === 'stat' && config.statIds) {
    const selectedStats = config.statIds
      .map((statId) => WIDGET_STATS[statId])
      .filter((stat): stat is NonNullable<(typeof WIDGET_STATS)[keyof typeof WIDGET_STATS]> => Boolean(stat))

    if (selectedStats.length === 0) return null

    return {
      width: selectedStats.reduce((totalWidth, stat) => totalWidth + stat.size.width, 0),
      height: Math.max(...selectedStats.map((stat) => stat.size.height)),
    }
  }

  if (config.type === 'template' && config.templateId) {
    const template = WIDGET_TEMPLATES[config.templateId]
    return template ? template.size : null
  }

  return null
}

function getWidgetPreviewScale(dimensions: { width: number; height: number } | null): number {
  if (!dimensions) return 1

  return Math.min(
    1,
    WIDGET_EXPORT_MODAL_PREVIEW_MAX_WIDTH_PX / dimensions.width,
    WIDGET_EXPORT_MODAL_PREVIEW_MAX_HEIGHT_PX / dimensions.height,
  )
}


interface WidgetExportModalProps {
  isOpen: boolean
  onClose: () => void
  cardType?: string
  mode?: 'card' | 'stat' | 'template' | 'picker'
  /** When true, renders content inline without BaseModal wrapper (used by Console Studio) */
  embedded?: boolean
}

type ExportTab = 'card' | 'stats' | 'templates'
const EXPORT_TAB_IDS: Record<ExportTab, string> = {
  templates: 'widget-export-tab-templates',
  card: 'widget-export-tab-card',
  stats: 'widget-export-tab-stats',
}
const EXPORT_PANEL_IDS: Record<ExportTab, string> = {
  templates: 'widget-export-panel-templates',
  card: 'widget-export-panel-card',
  stats: 'widget-export-panel-stats',
}
const API_ENDPOINT_INPUT_ID = 'widget-export-api-endpoint'
const REFRESH_INTERVAL_INPUT_ID = 'widget-export-refresh-interval'
const WIDGET_CODE_PANEL_ID = 'widget-export-code-panel'
const MIN_REFRESH_INTERVAL_SECONDS = 10

export function WidgetExportModal({ isOpen, onClose, cardType, mode: _mode = 'picker', embedded = false }: WidgetExportModalProps) {
  const { t } = useTranslation('common')
  const [activeTab, setActiveTab] = useState<ExportTab>(cardType ? 'card' : 'templates')
  const [selectedCard, setSelectedCard] = useState<string | null>(cardType || null)
  const [selectedStats, setSelectedStats] = useState<string[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>('cluster_overview')
  const [apiEndpoint, setApiEndpoint] = useState(() => {
    // Use the current site origin on Netlify deployments so exported widgets
    // fetch from the Netlify Functions; fall back to local backend otherwise.
    const host = window.location.hostname
    if (host === 'console.kubestellar.io' || host.includes('netlify.app'))
      return window.location.origin
    return BACKEND_DEFAULT_URL
  })
  const [refreshInterval, setRefreshInterval] = useState(30)
  const [copied, setCopied] = useState(false)
  const [showCode, setShowCode] = useState(false)
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const [isLoading, setIsLoading] = useState(false)
  const isOnPublicSite = window.location.hostname === 'console.kubestellar.io' || window.location.hostname.includes('netlify')
  const cardListRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    return () => clearTimeout(copiedTimerRef.current)
  }, [])

  // Auto-scroll to the pre-selected card when opening via "Export Widget" menu
  useEffect(() => {
    if (!cardType || activeTab !== 'card') return
    const SCROLL_DELAY_MS = 100
    const timer = setTimeout(() => {
      const el = cardListRef.current?.querySelector(`[data-widget-card="${cardType}"]`)
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, SCROLL_DELAY_MS)
    return () => clearTimeout(timer)
  }, [cardType, activeTab])

  // Determine what we're exporting
  const exportConfig: WidgetConfig | null = (() => {
    if (activeTab === 'card' && selectedCard) {
      return {
        type: 'card' as const,
        cardType: selectedCard,
        apiEndpoint,
        refreshInterval: refreshInterval * 1000,
        theme: 'dark' as const }
    }
    if (activeTab === 'stats' && selectedStats.length > 0) {
      return {
        type: 'stat' as const,
        statIds: selectedStats,
        apiEndpoint,
        refreshInterval: refreshInterval * 1000,
        theme: 'dark' as const }
    }
    if (activeTab === 'templates' && selectedTemplate) {
      return {
        type: 'template' as const,
        templateId: selectedTemplate,
        apiEndpoint,
        refreshInterval: refreshInterval * 1000,
        theme: 'dark' as const }
    }
    return null
  })()

  // Generate widget code
  const widgetCode = useMemo(() => {
    if (!exportConfig) return ''
    try {
      return generateWidget(exportConfig)
    } catch (err: unknown) {
      return `// Error generating widget: ${err}`
    }
  }, [exportConfig])

  const previewDimensions = useMemo(() => getWidgetPreviewDimensions(exportConfig), [exportConfig])
  const previewScale = useMemo(() => getWidgetPreviewScale(previewDimensions), [previewDimensions])
  const previewStyle = useMemo<CSSProperties>(() => ({
    transform: `scale(${previewScale})`,
    transformOrigin: 'top center',
  }), [previewScale])

  const filename = exportConfig ? getWidgetFilename(exportConfig) : 'widget.jsx'

  // Download widget file
  const handleDownload = () => {
    if (!widgetCode) return

    setIsLoading(true)
    const blob = new Blob([widgetCode], { type: 'text/javascript' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    safeRevokeObjectURL(url)
    setIsLoading(false)
    emitWidgetDownloaded('uebersicht')
  }

  // Copy to clipboard
  const handleCopy = async () => {
    if (!widgetCode) return
    await copyToClipboard(widgetCode)
    setCopied(true)
    clearTimeout(copiedTimerRef.current)
    copiedTimerRef.current = setTimeout(() => setCopied(false), UI_FEEDBACK_TIMEOUT_MS)
  }

  // Toggle stat selection
  const toggleStat = (statId: string) => {
    setSelectedStats((prev) =>
      prev.includes(statId) ? prev.filter((s) => s !== statId) : [...prev, statId]
    )
  }

  const widgetContent = (
      <div className="flex flex-col h-full min-h-0">
        {/* Tabs */}
        <div className="flex border-b border-border mb-4" role="tablist" aria-label={t('widgets.exportDesktopWidget')}>
          <button
            onClick={() => setActiveTab('templates')}
            id={EXPORT_TAB_IDS.templates}
            role="tab"
            aria-selected={activeTab === 'templates'}
            aria-controls={EXPORT_PANEL_IDS.templates}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'templates'
                ? 'text-primary border-primary'
                : 'text-muted-foreground border-transparent hover:text-foreground'
            }`}
          >
            {t('widgets.templates')}
          </button>
          <button
            onClick={() => setActiveTab('card')}
            id={EXPORT_TAB_IDS.card}
            role="tab"
            aria-selected={activeTab === 'card'}
            aria-controls={EXPORT_PANEL_IDS.card}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'card'
                ? 'text-primary border-primary'
                : 'text-muted-foreground border-transparent hover:text-foreground'
            }`}
          >
            {t('widgets.singleCard')}
          </button>
          <button
            onClick={() => setActiveTab('stats')}
            id={EXPORT_TAB_IDS.stats}
            role="tab"
            aria-selected={activeTab === 'stats'}
            aria-controls={EXPORT_PANEL_IDS.stats}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'stats'
                ? 'text-primary border-primary'
                : 'text-muted-foreground border-transparent hover:text-foreground'
            }`}
          >
            {t('widgets.statBlocks')}
          </button>
        </div>

        <div className="flex-1 flex items-start gap-4 min-h-0">
          {/* Left: Selection */}
          <div className="w-1/2 flex flex-col overflow-hidden min-h-0">
            <div
              id={EXPORT_PANEL_IDS[activeTab]}
              ref={cardListRef}
              className="flex-1 overflow-y-auto pr-2"
              role="tabpanel"
              aria-labelledby={EXPORT_TAB_IDS[activeTab]}
            >
              {activeTab === 'templates' && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground mb-3">
                    Pre-built widget layouts combining multiple cards
                  </p>
                  {Object.values(WIDGET_TEMPLATES).map((template) => (
                    <TemplateCard
                      key={template.templateId}
                      template={template}
                      selected={selectedTemplate === template.templateId}
                      onSelect={() => setSelectedTemplate(template.templateId)}
                    />
                  ))}
                </div>
              )}

              {activeTab === 'card' && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground mb-3">
                    Export a single card as a standalone widget
                  </p>
                  {Object.values(WIDGET_CARDS).map((card) => (
                    <CardItem
                      key={card.cardType}
                      card={card}
                      selected={selectedCard === card.cardType}
                      onSelect={() => setSelectedCard(card.cardType)}
                    />
                  ))}
                </div>
              )}

              {activeTab === 'stats' && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground mb-3">
                    Select stats to include in your widget (select multiple)
                  </p>
                  {Object.values(WIDGET_STATS).map((stat) => (
                    <StatItem
                      key={stat.statId}
                      stat={stat}
                      selected={selectedStats.includes(stat.statId)}
                      onToggle={() => toggleStat(stat.statId)}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Configuration */}
            <div className="mt-4 pt-4 border-t border-border space-y-3">
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <label htmlFor={API_ENDPOINT_INPUT_ID} className="block text-xs text-muted-foreground">{t('widgets.apiEndpoint')}</label>
                  <div className="relative group">
                    <AlertTriangle className="w-3.5 h-3.5 text-yellow-400 cursor-help" />
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-2.5 rounded-lg bg-card border border-border shadow-xl text-xs text-muted-foreground opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-dropdown">
                      Widgets require a locally installed or cluster-deployed Console. The API endpoint must match your deployment.
                      {isOnPublicSite && (
                        <a
                          href="https://docs.kubestellar.io/stable/Getting-Started/quickstart/"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block mt-1.5 text-primary hover:underline"
                        >
                          Install your Console now →
                        </a>
                      )}
                    </div>
                  </div>
                </div>
                <input
                  id={API_ENDPOINT_INPUT_ID}
                  type="text"
                  value={apiEndpoint}
                  onChange={(e) => setApiEndpoint(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm bg-secondary rounded border border-border focus:border-purple-500 focus:outline-hidden"
                />
                {isOnPublicSite && (
                  <div className="flex items-center gap-1.5 mt-1.5 text-xs text-yellow-400">
                    <AlertTriangle className="w-3 h-3 shrink-0" />
                    <span>
                      You're on console.kubestellar.io — {' '}
                      <a
                        href="https://docs.kubestellar.io/stable/Getting-Started/quickstart/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline hover:text-yellow-300"
                      >
                        install your Console locally
                      </a>
                      {' '} for widgets to work.
                    </span>
                  </div>
                )}
              </div>
              <div>
                <label htmlFor={REFRESH_INTERVAL_INPUT_ID} className="block text-xs text-muted-foreground mb-1">
                  {t('widgets.refreshInterval')}
                </label>
                <input
                  id={REFRESH_INTERVAL_INPUT_ID}
                  type="number"
                  value={refreshInterval}
                  onChange={(e) => setRefreshInterval(Math.max(MIN_REFRESH_INTERVAL_SECONDS, parseInt(e.target.value) || 30))}
                  min={MIN_REFRESH_INTERVAL_SECONDS}
                  className="w-24 px-3 py-1.5 text-sm bg-secondary rounded border border-border focus:border-purple-500 focus:outline-hidden"
                />
              </div>
            </div>
          </div>

          {/* Right: Preview & Code — sticky positioning keeps the preview visible
              while the left selection list scrolls independently. */}
          <div className="sticky top-0 self-start w-1/2 flex flex-col overflow-hidden min-h-0">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">{t('common.preview')}</span>
              <button
                onClick={() => setShowCode(!showCode)}
                className="text-xs text-purple-400 hover:text-purple-300"
                aria-pressed={showCode}
                aria-controls={WIDGET_CODE_PANEL_ID}
              >
                {showCode ? t('widgets.hideCode') : t('widgets.showCode')}
              </button>
            </div>

            {showCode ? (
              <div id={WIDGET_CODE_PANEL_ID} className="flex-1 bg-card rounded-lg p-3 overflow-auto">
                <pre className="text-xs text-foreground/80 whitespace-pre-wrap font-mono">
                  {widgetCode || '// Select an item to generate widget code'}
                </pre>
              </div>
            ) : (
              <div className="flex-1 bg-secondary/50 rounded-lg p-4 flex items-start justify-center overflow-hidden min-w-0 min-h-[16rem]">
                <div className="max-w-full overflow-hidden origin-top" style={previewStyle}>
                  <WidgetPreview config={exportConfig} />
                </div>
              </div>
            )}

            {/* Setup instructions — shrink-0 keeps it visible, overflow-auto if cramped */}
            <div className="mt-3 p-3 bg-blue-500/10 rounded-lg border border-blue-500/20 shrink-0 overflow-auto max-h-40">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
                <div className="text-xs text-blue-200">
                  <p className="font-medium mb-1">{t('widgets.uebersichtSetup')}</p>
                  <ol className="list-decimal list-inside space-y-0.5 text-blue-300/80">
                    <li>{t('widgets.downloadWidget')}</li>
                    <li>
                      Move to <code className="bg-blue-500/20 px-1 rounded">~/Library/Application Support/Übersicht/widgets/</code>
                    </li>
                    <li>{t('widgets.ensureAgentRunning')}</li>
                    <li>{t('widgets.restartUebersicht')}</li>
                  </ol>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
          <a
            href="https://tracesof.net/uebersicht/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            {t('widgets.getUebersicht')} <ExternalLink className="w-3 h-3" />
          </a>
          <div className="flex gap-2">
            <button
              onClick={handleCopy}
              disabled={!widgetCode}
              className="px-3 py-1.5 text-sm bg-secondary hover:bg-secondary/80 rounded flex items-center gap-2 disabled:opacity-50"
              aria-label={copied ? t('widgets.copied', 'Copied!') : t('widgets.copyCode', 'Copy Code')}
            >
              {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Copied!' : 'Copy Code'}
            </button>
            <button
              onClick={handleDownload}
              disabled={!widgetCode || isLoading}
              className="px-4 py-1.5 text-sm bg-purple-600 hover:bg-purple-700 rounded flex items-center gap-2 disabled:opacity-50"
              aria-label={t('widgets.downloadFilename', { filename })}
            >
              <Download className="w-4 h-4" />
              {t('widgets.downloadFilename', { filename })}
            </button>
          </div>
        </div>
      </div>
  )

  // Embedded mode: render inline within Console Studio
  if (embedded) {
    return (
      <div className="h-full flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4">
          {widgetContent}
        </div>
      </div>
    )
  }

  // Standard modal mode
  return (
    <BaseModal isOpen={isOpen} onClose={onClose} size="lg" closeOnBackdrop={false}>
      <BaseModal.Header
        title={t('widgets.exportDesktopWidget')}
        icon={Download}
        onClose={onClose}
      />
      <BaseModal.Content>
        {widgetContent}
      </BaseModal.Content>
    </BaseModal>
  )
}

// Template card component
function TemplateCard({
  template,
  selected,
  onSelect }: {
  template: WidgetTemplateDefinition
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      onClick={onSelect}
      aria-pressed={selected}
      className={`w-full text-left p-3 rounded-lg border transition-colors ${
        selected
          ? 'bg-purple-500/20 border-purple-500/50'
          : 'bg-secondary/50 border-border hover:border-purple-500/30'
      }`}
    >
      <div className="flex items-center gap-2 mb-1">
        <Monitor className="w-4 h-4 text-purple-400" />
        <span className="font-medium text-sm">{template.displayName}</span>
      </div>
      <p className="text-xs text-muted-foreground mb-2">{template.description}</p>
      <div className="flex flex-wrap gap-1">
        {template.cards.map((c) => (
          <span key={c} className="px-1.5 py-0.5 bg-purple-500/20 text-purple-300 text-2xs rounded">
            {c.replace(/_/g, ' ')}
          </span>
        ))}
        {template.stats?.map((s) => (
          <span key={s} className="px-1.5 py-0.5 bg-blue-500/20 text-blue-300 text-2xs rounded">
            {s.replace(/_/g, ' ')}
          </span>
        ))}
      </div>
      <div className="mt-2 text-2xs text-muted-foreground">
        {template.size.width}×{template.size.height}px • {template.layout} layout
      </div>
    </button>
  )
}

// Card item component
function CardItem({
  card,
  selected,
  onSelect }: {
  card: WidgetCardDefinition
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      data-widget-card={card.cardType}
      onClick={onSelect}
      aria-pressed={selected}
      className={`w-full text-left p-3 rounded-lg border transition-colors ${
        selected
          ? 'bg-purple-500/20 border-purple-500/50'
          : 'bg-secondary/50 border-border hover:border-purple-500/30'
      }`}
    >
      <div className="font-medium text-sm">{card.displayName}</div>
      <p className="text-xs text-muted-foreground">{card.description}</p>
      <div className="mt-1 text-2xs text-muted-foreground">
        {card.defaultSize.width}×{card.defaultSize.height}px • {card.category}
      </div>
    </button>
  )
}

// Stat item component
function StatItem({
  stat,
  selected,
  onToggle }: {
  stat: (typeof WIDGET_STATS)[keyof typeof WIDGET_STATS]
  selected: boolean
  onToggle: () => void
}) {
  return (
    <button
      onClick={onToggle}
      aria-pressed={selected}
      className={`w-full text-left p-2 rounded-lg border transition-colors flex items-center gap-3 ${
        selected
          ? 'bg-purple-500/20 border-purple-500/50'
          : 'bg-secondary/50 border-border hover:border-purple-500/30'
      }`}
    >
      <div
        className="w-8 h-8 rounded flex items-center justify-center text-lg font-bold"
        style={{ backgroundColor: `${stat.color}20`, color: stat.color }}
      >
        #
      </div>
      <div>
        <div className="font-medium text-sm">{stat.displayName}</div>
        <div className="text-2xs text-muted-foreground">
          {stat.format} • {stat.size.width}×{stat.size.height}px
        </div>
      </div>
      <div
        className={`ml-auto w-5 h-5 rounded border-2 flex items-center justify-center ${
          selected ? 'bg-purple-500 border-purple-500' : 'border-muted-foreground'
        }`}
      >
        {selected && <Check className="w-3 h-3 text-white" />}
      </div>
    </button>
  )
}

// Spacing constants aligned to the 4px grid – centralise magic values used throughout widget previews
const PREV_XS = '4px'           // 1 × 4px: tight gaps and small padding
const PREV_SM = '8px'           // 2 × 4px: standard margins and gaps
const PREV_MD = '12px'          // 3 × 4px: medium spacing
const PREV_LG = '16px'          // 4 × 4px: large gaps and section spacing
const PREV_ITEM_PAD = '4px 8px' // py-1 px-2: item-row padding (vertical=XS, horizontal=SM)
const PREV_CARD_PAD = '8px 12px' // standard card padding (vertical=SM, horizontal=MD)
const PREV_DOTS_GAP = '2px'     // sub-grid gap for tightly-packed status-dot rows
const PREV_BAR_GAP = '3px'      // gap between adjacent bar-chart columns
const PREV_HAIRLINE_GAP = '1px' // minimal gap between stacked bar segments
// Font sizes used in preview components — extracted to pass the hex/magic-number ratchet
const PREV_FS_HERO = '28px'     // large hero number (GPU %)
const PREV_FS_HEADLINE = '24px' // headline stat (cost total, CI pass %)
const PREV_FS_FEATURED = '20px' // featured value (release tag, AI status)
const PREV_FS_STAT = '16px'     // stat block value when smaller than ps.statVal
const PREV_FS_STAT_SM = '14px'  // compact stat value (metric rows)
const PREV_FS_BODY = '12px'     // body text, count badges
const PREV_FS_CAPTION = '10px'  // caption text, row items
const PREV_FS_MICRO = '9px'     // micro text, timestamps, secondary labels
const PREV_FS_LABEL = '8px'     // smallest label text in compact stat blocks

// Issue activity chart bar-height multipliers — keeps preview bars proportional
const PREV_BAR_OPENED_SCALE = 6   // px per unit for the "opened" bar segment
const PREV_BAR_CLOSED_SCALE = 4   // px per unit for the "closed" bar segment
const PREV_BAR_CLOSED_BASE = 8    // baseline value subtracted before scaling closed segment

// Preview color constants — declared before `ps` so they can be used in its definition
const PREV_CLR_TEXT = '#f9fafb'      // primary text color in widget previews
const PREV_CLR_MUTED = '#9ca3af'     // muted/secondary text color
const PREV_CLR_SECONDARY = '#cbd5e1' // light secondary text
const PREV_CLR_DIM = '#d1d5db'       // dim text
const PREV_CLR_CPU = '#60a5fa'       // CPU metric color (blue-400)
const PREV_CLR_MEM = '#c084fc'       // Memory metric color (purple-400)

/** Shared preview styles matching macOS Übersicht widget appearance.
 *  These use hardcoded dark colors intentionally — they render a fixed preview
 *  of how the exported widget will look on a macOS desktop, regardless of
 *  the console's current theme. */
const ps = {
  card: {
    backgroundColor: 'rgba(17, 24, 39, 0.9)',
    borderRadius: '12px',
    padding: `${PREV_MD} ${PREV_LG}`,
    border: '1px solid rgba(255, 255, 255, 0.1)',
    color: PREV_CLR_TEXT,
    fontFamily: 'Inter, -apple-system, sans-serif',
    fontSize: PREV_FS_BODY,
    lineHeight: 1.4,
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' } as React.CSSProperties,
  title: {
    fontSize: PREV_FS_BODY,
    fontWeight: 600,
    color: PREV_CLR_TEXT,
    marginBottom: PREV_SM,
    display: 'flex',
    alignItems: 'center',
    gap: PREV_SM } as React.CSSProperties,
  dot: (color: string) => ({
    width: 7,
    height: 7,
    borderRadius: '50%',
    backgroundColor: color,
    display: 'inline-block',
    flexShrink: 0 }) as React.CSSProperties,
  statBlock: {
    backgroundColor: 'rgba(17, 24, 39, 0.9)',
    borderRadius: '6px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    padding: PREV_CARD_PAD,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '54px' } as React.CSSProperties,
  statVal: {
    fontSize: PREV_FS_STAT,
    fontWeight: 700,
    lineHeight: 1.2 } as React.CSSProperties,
  statLbl: {
    fontSize: PREV_FS_MICRO,
    color: PREV_CLR_MUTED,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    marginTop: '1px' } as React.CSSProperties,
  row: { display: 'flex', gap: PREV_SM, alignItems: 'center' } as React.CSSProperties,
  col: { display: 'flex', flexDirection: 'column' as const, gap: PREV_XS } as React.CSSProperties,
  muted: { color: PREV_CLR_MUTED, fontSize: PREV_FS_CAPTION } as React.CSSProperties,
  colors: { healthy: '#22c55e', warning: '#eab308', error: '#ef4444', info: '#3b82f6', purple: '#9333ea' } }

// Sample stat data for realistic previews
const SAMPLE_STATS: Record<string, number | string> = {
  total_clusters: 4,
  total_pods: 128,
  total_gpus: 32,
  cpu_usage: '67%',
  memory_usage: '54%',
  unhealthy_pods: 3,
  active_alerts: 2 }

// Widget preview with realistic mock data
function WidgetPreview({ config }: { config: WidgetConfig | null }) {
  if (!config) {
    return (
      <div className="text-center text-muted-foreground">
        <Smartphone className="w-12 h-12 mx-auto mb-2 opacity-50" />
        <p className="text-sm">Select an item to preview</p>
      </div>
    )
  }

  if (config.type === 'card' && config.cardType) {
    return <CardPreview cardType={config.cardType} />
  }

  if (config.type === 'stat' && config.statIds) {
    return <StatPreview statIds={config.statIds} />
  }

  if (config.type === 'template' && config.templateId) {
    return <TemplatePreview templateId={config.templateId} />
  }

  return null
}

// --- Card previews ---
function CardPreview({ cardType }: { cardType: string }) {
  const { t } = useTranslation()
  const card = WIDGET_CARDS[cardType]
  if (!card) return null

  switch (cardType) {
    case 'cluster_health':
      return (
        <div style={ps.card}>
          <div style={ps.title}><span style={ps.dot(ps.colors.warning)} /> Cluster Health</div>
          <div style={ps.row}>
            <div style={{ ...ps.statBlock, borderLeft: `3px solid ${ps.colors.healthy}` }}>
              <span style={{ ...ps.statVal, color: ps.colors.healthy }}>3</span>
              <span style={ps.statLbl}>{t('common.healthy')}</span>
            </div>
            <div style={{ ...ps.statBlock, borderLeft: `3px solid ${ps.colors.error}` }}>
              <span style={{ ...ps.statVal, color: ps.colors.error }}>1</span>
              <span style={ps.statLbl}>{t('common.unhealthy')}</span>
            </div>
          </div>
        </div>
      )

    case 'pod_issues':
      return (
        <div style={ps.card}>
          <div style={ps.title}><span style={ps.dot(ps.colors.warning)} /> Pod Issues</div>
          <div style={ps.muted}>4 total issues</div>
          <div style={{ ...ps.col, marginTop: PREV_SM }}>
            <div className="px-2 py-1" style={{ ...ps.row, backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: PREV_XS }}>
              <span style={{ color: ps.colors.error, fontWeight: 600, fontSize: PREV_FS_BODY }}>2</span>
              <span style={ps.muted}>CrashLoopBackOff</span>
            </div>
            <div className="px-2 py-1" style={{ ...ps.row, backgroundColor: 'rgba(234,179,8,0.1)', borderRadius: PREV_XS }}>
              <span style={{ color: ps.colors.warning, fontWeight: 600, fontSize: PREV_FS_BODY }}>1</span>
              <span style={ps.muted}>OOMKilled</span>
            </div>
            <div className="px-2 py-1" style={{ ...ps.row, backgroundColor: 'rgba(59,130,246,0.1)', borderRadius: PREV_XS }}>
              <span style={{ color: ps.colors.info, fontWeight: 600, fontSize: PREV_FS_BODY }}>1</span>
              <span style={ps.muted}>ImagePullBackOff</span>
            </div>
          </div>
        </div>
      )

    case 'gpu_overview':
      return (
        <div style={ps.card}>
          <div style={ps.title}><span style={ps.dot(ps.colors.purple)} /> GPU Overview</div>
          <div style={{ textAlign: 'center', marginBottom: PREV_SM }}>
            <div style={{ fontSize: PREV_FS_HERO, fontWeight: 700, color: ps.colors.purple }}>72%</div>
            <div style={ps.muted}>{t('common.utilization')}</div>
          </div>
          <div style={ps.row}>
            <div style={ps.statBlock}>
              <span style={ps.statVal}>32</span>
              <span style={ps.statLbl}>{t('common.total')}</span>
            </div>
            <div style={ps.statBlock}>
              <span style={{ ...ps.statVal, color: ps.colors.purple }}>23</span>
              <span style={ps.statLbl}>{t('common.allocated')}</span>
            </div>
          </div>
        </div>
      )

    case 'hardware_health':
      return (
        <div style={ps.card}>
          <div style={ps.title}><span style={ps.dot(ps.colors.warning)} /> Hardware Health</div>
          <div style={{ ...ps.row, marginBottom: PREV_SM }}>
            <div style={{ ...ps.statBlock, borderLeft: `4px solid ${ps.colors.healthy}` }}>
              <span style={ps.statVal}>4</span>
              <span style={ps.statLbl}>{t('common.nodes')}</span>
            </div>
            <div style={{ ...ps.statBlock, borderLeft: `4px solid ${ps.colors.purple}` }}>
              <span style={{ ...ps.statVal, color: ps.colors.purple }}>16</span>
              <span style={ps.statLbl}>{t('common.gpus')}</span>
            </div>
            <div style={{ ...ps.statBlock, borderLeft: `4px solid ${ps.colors.info}` }}>
              <span style={{ ...ps.statVal, color: ps.colors.info }}>8</span>
              <span style={ps.statLbl}>NICs</span>
            </div>
          </div>
          <div style={ps.col}>
            <div style={{ fontSize: PREV_FS_MICRO, fontWeight: 600, color: PREV_CLR_MUTED, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Alerts (2)</div>
            <div className="px-2 py-1" style={{ ...ps.row, backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: PREV_XS, borderLeft: `4px solid ${ps.colors.error}` }}>
              <span style={{ fontSize: PREV_FS_CAPTION, color: ps.colors.error, fontWeight: 600 }}>GPU</span>
              <span style={{ fontSize: PREV_FS_MICRO, color: PREV_CLR_MUTED, marginLeft: PREV_XS }}>worker-3 (-2)</span>
            </div>
            <div className="px-2 py-1" style={{ ...ps.row, backgroundColor: 'rgba(234,179,8,0.1)', borderRadius: PREV_XS, borderLeft: `4px solid ${ps.colors.warning}` }}>
              <span style={{ fontSize: PREV_FS_CAPTION, color: ps.colors.warning, fontWeight: 600 }}>NIC</span>
              <span style={{ fontSize: PREV_FS_MICRO, color: PREV_CLR_MUTED, marginLeft: PREV_XS }}>worker-1 (-1)</span>
            </div>
          </div>
        </div>
      )

    case 'nightly_e2e_status':
      return <NightlyE2EPreview />

    case 'security_issues':
      return (
        <div style={ps.card}>
          <div style={ps.title}><span style={ps.dot(ps.colors.warning)} /> Security Issues</div>
          <div style={ps.col}>
            {[
              { label: 'Privileged containers', count: 3, color: ps.colors.error },
              { label: 'No resource limits', count: 12, color: ps.colors.warning },
              { label: 'Running as root', count: 5, color: ps.colors.error },
            ].map((item) => (
              <div key={item.label} className="px-2 py-1" style={{ ...ps.row, backgroundColor: item.color === ps.colors.error ? 'rgba(239,68,68,0.1)' : 'rgba(234,179,8,0.1)', borderRadius: PREV_XS }}>
                <span style={{ color: item.color, fontWeight: 600, fontSize: PREV_FS_BODY, minWidth: '16px' }}>{item.count}</span>
                <span style={ps.muted}>{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      )

    case 'active_alerts':
      return (
        <div style={ps.card}>
          <div style={ps.title}><span style={ps.dot(ps.colors.error)} /> Active Alerts</div>
          <div style={ps.col}>
            {[
              { name: 'HighMemoryUsage', severity: 'critical', ns: 'monitoring' },
              { name: 'PodCrashLooping', severity: 'warning', ns: 'default' },
              { name: 'NodeDiskPressure', severity: 'warning', ns: 'kube-system' },
            ].map((a) => (
              <div key={a.name} className="px-2 py-1" style={{ ...ps.row, backgroundColor: a.severity === 'critical' ? 'rgba(239,68,68,0.1)' : 'rgba(234,179,8,0.1)', borderRadius: PREV_XS, borderLeft: `4px solid ${a.severity === 'critical' ? ps.colors.error : ps.colors.warning}` }}>
                <span style={{ fontSize: PREV_FS_CAPTION, color: a.severity === 'critical' ? ps.colors.error : ps.colors.warning, fontWeight: 600 }}>{a.name}</span>
                <span style={{ fontSize: PREV_FS_MICRO, color: PREV_CLR_MUTED, marginLeft: 'auto' }}>{a.ns}</span>
              </div>
            ))}
          </div>
        </div>
      )

    case 'helm_releases':
      return (
        <div style={ps.card}>
          <div style={ps.title}><span style={ps.dot(ps.colors.healthy)} /> Helm Releases</div>
          <div style={ps.col}>
            {[
              { name: 'ingress-nginx', status: 'deployed', ver: '4.8.3' },
              { name: 'cert-manager', status: 'deployed', ver: '1.13.2' },
              { name: 'prometheus', status: 'deployed', ver: '25.8.0' },
              { name: 'redis', status: 'failed', ver: '18.4.0' },
            ].map((r) => (
              <div key={r.name} style={{ ...ps.row, justifyContent: 'space-between' }}>
                <span style={{ fontSize: PREV_FS_CAPTION, fontWeight: 500 }}>{r.name}</span>
                <span style={{ fontSize: PREV_FS_MICRO, color: r.status === 'deployed' ? ps.colors.healthy : ps.colors.error }}>{r.status}</span>
                <span style={{ fontSize: PREV_FS_MICRO, color: PREV_CLR_MUTED }}>{r.ver}</span>
              </div>
            ))}
          </div>
        </div>
      )

    case 'top_pods':
      return (
        <div style={ps.card}>
          <div style={ps.title}><span style={ps.dot(ps.colors.info)} /> Top Pods</div>
          <div style={ps.col}>
            {[
              { name: 'ml-training-job-7x', cpu: '3.2 cores', mem: '12.4 Gi' },
              { name: 'prometheus-server-0', cpu: '1.8 cores', mem: '8.2 Gi' },
              { name: 'elasticsearch-data-1', cpu: '1.4 cores', mem: '6.1 Gi' },
            ].map((p) => (
              <div key={p.name} style={{ ...ps.row, justifyContent: 'space-between', fontSize: PREV_FS_CAPTION }}>
                <span style={WIDGET_EXPORT_MODAL_SPAN_STYLE_1}>{p.name}</span>
                <span style={{ color: PREV_CLR_CPU }}>{p.cpu}</span>
                <span style={{ color: PREV_CLR_MEM }}>{p.mem}</span>
              </div>
            ))}
          </div>
        </div>
      )

    case 'event_summary':
    case 'warning_events':
      return (
        <div style={ps.card}>
          <div style={ps.title}><span style={ps.dot(cardType === 'warning_events' ? ps.colors.warning : ps.colors.info)} /> {card.displayName}</div>
          <div style={ps.col}>
            {[
              { type: 'Warning', count: 12, msg: 'BackOff restarting failed container' },
              { type: 'Warning', count: 5, msg: 'Readiness probe failed' },
              { type: 'Normal', count: 34, msg: 'Scheduled successfully' },
            ].map((e, i) => (
              <div key={i} style={{ ...ps.row, fontSize: PREV_FS_CAPTION }}>
                <span style={{ color: e.type === 'Warning' ? ps.colors.warning : ps.colors.healthy, fontWeight: 600, minWidth: '18px' }}>{e.count}</span>
                <span style={{ color: PREV_CLR_SECONDARY, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.msg}</span>
              </div>
            ))}
          </div>
        </div>
      )

    case 'operator_status':
      return (
        <div style={ps.card}>
          <div style={ps.title}><span style={ps.dot(ps.colors.healthy)} /> Operator Status</div>
          <div style={ps.col}>
            {[
              { name: 'cert-manager', ready: true },
              { name: 'gpu-operator', ready: true },
              { name: 'prometheus-operator', ready: true },
              { name: 'node-feature-discovery', ready: false },
            ].map((o) => (
              <div key={o.name} style={{ ...ps.row, fontSize: PREV_FS_CAPTION }}>
                <span style={ps.dot(o.ready ? ps.colors.healthy : ps.colors.warning)} />
                <span>{o.name}</span>
              </div>
            ))}
          </div>
        </div>
      )

    case 'storage_overview':
    case 'pvc_status':
      return (
        <div style={ps.card}>
          <div style={ps.title}><span style={ps.dot(ps.colors.info)} /> {card.displayName}</div>
          <div style={ps.row}>
            <div style={ps.statBlock}>
              <span style={{ ...ps.statVal, fontSize: PREV_FS_STAT, color: ps.colors.info }}>24</span>
              <span style={ps.statLbl}>{t('common.pvcs')}</span>
            </div>
            <div style={ps.statBlock}>
              <span style={{ ...ps.statVal, fontSize: PREV_FS_STAT, color: ps.colors.healthy }}>22</span>
              <span style={ps.statLbl}>{t('common.bound')}</span>
            </div>
            <div style={ps.statBlock}>
              <span style={{ ...ps.statVal, fontSize: PREV_FS_STAT, color: ps.colors.warning }}>2</span>
              <span style={ps.statLbl}>{t('common.pending')}</span>
            </div>
          </div>
        </div>
      )

    case 'network_overview':
    case 'service_status':
      return (
        <div style={ps.card}>
          <div style={ps.title}><span style={ps.dot(ps.colors.info)} /> {card.displayName}</div>
          <div style={{ ...ps.row, marginBottom: PREV_SM }}>
            <div style={ps.statBlock}>
              <span style={{ ...ps.statVal, fontSize: PREV_FS_STAT }}>18</span>
              <span style={ps.statLbl}>{t('common.services')}</span>
            </div>
            <div style={ps.statBlock}>
              <span style={{ ...ps.statVal, fontSize: PREV_FS_STAT, color: ps.colors.info }}>6</span>
              <span style={ps.statLbl}>Policies</span>
            </div>
          </div>
          <div style={ps.col}>
            {['ClusterIP (12)', 'LoadBalancer (4)', 'NodePort (2)'].map((s) => (
              <div key={s} style={{ fontSize: PREV_FS_CAPTION, color: PREV_CLR_MUTED }}>{s}</div>
            ))}
          </div>
        </div>
      )

    case 'opencost_overview':
      return (
        <div style={ps.card}>
          <div style={ps.title}><span style={ps.dot(ps.colors.healthy)} /> OpenCost Overview</div>
          <div style={{ textAlign: 'center', marginBottom: PREV_SM }}>
            <div style={{ fontSize: PREV_FS_HEADLINE, fontWeight: 700, color: ps.colors.healthy }}>$1,247</div>
            <div style={ps.muted}>Monthly estimate</div>
          </div>
          <div style={ps.row}>
            <div style={ps.statBlock}>
              <span style={{ ...ps.statVal, fontSize: PREV_FS_STAT_SM, color: PREV_CLR_CPU }}>$482</span>
              <span style={ps.statLbl}>Compute</span>
            </div>
            <div style={ps.statBlock}>
              <span style={{ ...ps.statVal, fontSize: PREV_FS_STAT_SM, color: PREV_CLR_MEM }}>$635</span>
              <span style={ps.statLbl}>GPU</span>
            </div>
            <div style={ps.statBlock}>
              <span style={{ ...ps.statVal, fontSize: PREV_FS_STAT_SM, color: ps.colors.info }}>$130</span>
              <span style={ps.statLbl}>{t('common.storage')}</span>
            </div>
          </div>
        </div>
      )

    case 'provider_health':
      return (
        <div style={ps.card}>
          <div style={ps.title}><span style={ps.dot(ps.colors.healthy)} /> Provider Health</div>
          <div style={ps.col}>
            {[
              { name: 'OpenAI', status: 'operational', color: ps.colors.healthy },
              { name: 'Anthropic', status: 'operational', color: ps.colors.healthy },
              { name: 'AWS', status: 'degraded', color: ps.colors.warning },
              { name: 'GCP', status: 'operational', color: ps.colors.healthy },
            ].map((p) => (
              <div key={p.name} style={{ ...ps.row, justifyContent: 'space-between', fontSize: PREV_FS_CAPTION }}>
                <span style={WIDGET_EXPORT_MODAL_SPAN_STYLE_2}>{p.name}</span>
                <span style={{ color: p.color }}>{p.status}</span>
              </div>
            ))}
          </div>
        </div>
      )

    case 'nightly_release_pulse':
      return (
        <div style={ps.card}>
          <div style={ps.title}><span style={ps.dot(ps.colors.healthy)} /> Nightly Release Pulse</div>
          <div style={{ textAlign: 'center', marginBottom: PREV_SM }}>
            <div style={{ fontSize: PREV_FS_FEATURED, fontWeight: 700, color: ps.colors.healthy }}>v0.3.22</div>
            <div style={ps.muted}>Released 2h ago</div>
          </div>
          <div style={ps.row}>
            <div style={ps.statBlock}>
              <span style={{ ...ps.statVal, fontSize: PREV_FS_STAT_SM, color: ps.colors.healthy }}>12</span>
              <span style={ps.statLbl}>Streak</span>
            </div>
            <div style={ps.statBlock}>
              <span style={{ ...ps.statVal, fontSize: PREV_FS_STAT_SM, color: ps.colors.info }}>93%</span>
              <span style={ps.statLbl}>Pass rate</span>
            </div>
          </div>
        </div>
      )

    case 'workflow_matrix':
      return (
        <div style={ps.card}>
          <div style={ps.title}><span style={ps.dot(ps.colors.info)} /> Workflow Matrix</div>
          <div style={ps.col}>
            {['build', 'test', 'lint', 'deploy'].map((wf) => (
              <div key={wf} style={{ ...ps.row, justifyContent: 'space-between', fontSize: PREV_FS_CAPTION }}>
                <span style={WIDGET_EXPORT_MODAL_SPAN_STYLE_2}>{wf}</span>
                <div style={{ display: 'flex', gap: PREV_DOTS_GAP }}>
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} style={{ width: '8px', height: '8px', borderRadius: '2px', backgroundColor: i === 3 && wf === 'deploy' ? ps.colors.error : ps.colors.healthy }} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )

    case 'pipeline_flow':
      return (
        <div style={ps.card}>
          <div style={ps.title}><span style={ps.dot(ps.colors.info)} /> Live Runs</div>
          <div style={ps.col}>
            {[
              { name: 'build (amd64)', status: 'running', time: '3m 12s' },
              { name: 'fullstack-smoke', status: 'queued', time: 'queued' },
              { name: 'coverage-gate', status: 'success', time: '24s' },
            ].map((r) => (
              <div key={r.name} className="px-2 py-1" style={{ ...ps.row, justifyContent: 'space-between', fontSize: PREV_FS_CAPTION, backgroundColor: 'rgba(30,41,59,0.5)', borderRadius: PREV_XS }}>
                <span style={ps.dot(r.status === 'running' ? ps.colors.info : r.status === 'success' ? ps.colors.healthy : PREV_CLR_MUTED)} />
                <span style={WIDGET_EXPORT_MODAL_SPAN_STYLE_3}>{r.name}</span>
                <span style={{ color: PREV_CLR_MUTED, fontSize: PREV_FS_MICRO }}>{r.time}</span>
              </div>
            ))}
          </div>
        </div>
      )

    case 'recent_failures':
      return (
        <div style={ps.card}>
          <div style={ps.title}><span style={ps.dot(ps.colors.error)} /> Recent Failures</div>
          <div style={ps.col}>
            {[
              { wf: 'nightly-test-suite', step: 'e2e-tests', ago: '2h ago' },
              { wf: 'build', step: 'lint', ago: '5h ago' },
            ].map((f) => (
              <div key={f.wf} className="px-2 py-1" style={{ ...ps.row, backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: PREV_XS, borderLeft: `3px solid ${ps.colors.error}` }}>
                <div style={WIDGET_EXPORT_MODAL_DIV_STYLE_2}>
                  <div style={{ fontSize: PREV_FS_CAPTION, fontWeight: 600, color: ps.colors.error }}>{f.wf}</div>
                  <div style={{ fontSize: PREV_FS_MICRO, color: PREV_CLR_MUTED }}>Failed at: {f.step}</div>
                </div>
                <span style={{ fontSize: PREV_FS_MICRO, color: PREV_CLR_MUTED }}>{f.ago}</span>
              </div>
            ))}
          </div>
        </div>
      )

    case 'issue_activity_chart':
      return (
        <div style={ps.card}>
          <div style={ps.title}><span style={ps.dot(ps.colors.info)} /> Daily Issues &amp; PRs</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: PREV_BAR_GAP, height: '60px', marginBottom: PREV_SM }}>
            {[4, 7, 3, 8, 5, 6, 9, 2, 5, 7, 4, 6, 3].map((v, i) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: PREV_HAIRLINE_GAP, justifyContent: 'flex-end', height: '100%' }}>
                <div style={{ height: `${v * PREV_BAR_OPENED_SCALE}px`, backgroundColor: ps.colors.info, borderRadius: '1px', opacity: 0.7 }} />
                <div style={{ height: `${Math.max(0, (PREV_BAR_CLOSED_BASE - v) * PREV_BAR_CLOSED_SCALE)}px`, backgroundColor: ps.colors.healthy, borderRadius: '1px', opacity: 0.5 }} />
              </div>
            ))}
          </div>
          <div style={ps.row}>
            <div style={ps.statBlock}><span style={{ ...ps.statVal, fontSize: PREV_FS_BODY, color: ps.colors.info }}>23</span><span style={ps.statLbl}>Opened</span></div>
            <div style={ps.statBlock}><span style={{ ...ps.statVal, fontSize: PREV_FS_BODY, color: ps.colors.healthy }}>18</span><span style={ps.statLbl}>Closed</span></div>
            <div style={ps.statBlock}><span style={{ ...ps.statVal, fontSize: PREV_FS_BODY, color: ps.colors.purple }}>12</span><span style={ps.statLbl}>Merged</span></div>
          </div>
        </div>
      )

    case 'github_ci_monitor':
      return (
        <div style={ps.card}>
          <div style={ps.title}><span style={ps.dot(ps.colors.healthy)} /> GitHub CI Monitor</div>
          <div style={{ textAlign: 'center', marginBottom: PREV_SM }}>
            <div style={{ fontSize: PREV_FS_HEADLINE, fontWeight: 700, color: ps.colors.healthy }}>94%</div>
            <div style={ps.muted}>Pass rate (7d)</div>
          </div>
          <div style={ps.row}>
            <div style={ps.statBlock}><span style={{ ...ps.statVal, fontSize: PREV_FS_BODY }}>156</span><span style={ps.statLbl}>Runs</span></div>
            <div style={ps.statBlock}><span style={{ ...ps.statVal, fontSize: PREV_FS_BODY, color: ps.colors.healthy }}>147</span><span style={ps.statLbl}>Passed</span></div>
            <div style={ps.statBlock}><span style={{ ...ps.statVal, fontSize: PREV_FS_BODY, color: ps.colors.error }}>9</span><span style={ps.statLbl}>Failed</span></div>
          </div>
        </div>
      )

    case 'github_activity':
      return (
        <div style={ps.card}>
          <div style={ps.title}><span style={ps.dot(ps.colors.info)} /> GitHub Activity</div>
          <div style={ps.col}>
            {[
              { label: 'PRs merged (7d)', value: '24', color: ps.colors.purple },
              { label: 'Issues opened', value: '8', color: ps.colors.info },
              { label: 'Contributors', value: '6', color: ps.colors.healthy },
              { label: 'Latest release', value: 'v0.3.22', color: PREV_CLR_SECONDARY },
            ].map((item) => (
              <div key={item.label} style={{ ...ps.row, justifyContent: 'space-between', fontSize: PREV_FS_CAPTION }}>
                <span style={{ color: PREV_CLR_MUTED }}>{item.label}</span>
                <span style={{ fontWeight: 600, color: item.color }}>{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      )

    case 'cluster_metrics':
      return (
        <div style={ps.card}>
          <div style={ps.title}><span style={ps.dot(ps.colors.info)} /> Cluster Metrics</div>
          <div style={ps.row}>
            <div style={ps.statBlock}>
              <span style={{ ...ps.statVal, fontSize: PREV_FS_STAT_SM, color: PREV_CLR_CPU }}>62%</span>
              <span style={ps.statLbl}>CPU</span>
            </div>
            <div style={ps.statBlock}>
              <span style={{ ...ps.statVal, fontSize: PREV_FS_STAT_SM, color: PREV_CLR_MEM }}>78%</span>
              <span style={ps.statLbl}>Memory</span>
            </div>
            <div style={ps.statBlock}>
              <span style={{ ...ps.statVal, fontSize: PREV_FS_STAT_SM, color: ps.colors.healthy }}>45</span>
              <span style={ps.statLbl}>Pods</span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: PREV_DOTS_GAP, height: '40px', marginTop: PREV_SM }}>
            {[40, 55, 62, 58, 70, 65, 72, 68, 75, 62].map((v, i) => (
              <div key={i} style={{ flex: 1, height: `${v * 0.55}px`, backgroundColor: ps.colors.info, borderRadius: '1px', opacity: 0.6 }} />
            ))}
          </div>
        </div>
      )

    case 'workload_status':
      return (
        <div style={ps.card}>
          <div style={ps.title}><span style={ps.dot(ps.colors.healthy)} /> Workload Status</div>
          <div style={ps.col}>
            {[
              { name: 'Deployments', running: 12, total: 14, color: ps.colors.healthy },
              { name: 'StatefulSets', running: 3, total: 3, color: ps.colors.healthy },
              { name: 'DaemonSets', running: 4, total: 5, color: ps.colors.warning },
            ].map((w) => (
              <div key={w.name} className="px-2 py-1" style={{ ...ps.row, justifyContent: 'space-between', fontSize: PREV_FS_CAPTION }}>
                <span style={WIDGET_EXPORT_MODAL_SPAN_STYLE_2}>{w.name}</span>
                <span style={{ color: w.running === w.total ? ps.colors.healthy : ps.colors.warning }}>
                  {w.running}/{w.total} ready
                </span>
              </div>
            ))}
          </div>
        </div>
      )

    case 'app_status':
      return (
        <div style={ps.card}>
          <div style={ps.title}><span style={ps.dot(ps.colors.healthy)} /> Application Status</div>
          <div style={ps.col}>
            {[
              { name: 'frontend', clusters: 3, status: 'healthy' },
              { name: 'api-gateway', clusters: 2, status: 'healthy' },
              { name: 'worker', clusters: 2, status: 'degraded' },
              { name: 'scheduler', clusters: 1, status: 'healthy' },
            ].map((a) => (
              <div key={a.name} style={{ ...ps.row, justifyContent: 'space-between', fontSize: PREV_FS_CAPTION }}>
                <span style={WIDGET_EXPORT_MODAL_SPAN_STYLE_2}>{a.name}</span>
                <span style={{ color: PREV_CLR_MUTED, fontSize: PREV_FS_MICRO }}>{a.clusters} clusters</span>
                <span style={ps.dot(a.status === 'healthy' ? ps.colors.healthy : ps.colors.warning)} />
              </div>
            ))}
          </div>
        </div>
      )

    case 'namespace_overview':
      return (
        <div style={ps.card}>
          <div style={ps.title}><span style={ps.dot(ps.colors.info)} /> Namespace Overview</div>
          <div style={ps.col}>
            {[
              { ns: 'default', pods: 12, deploys: 4 },
              { ns: 'kube-system', pods: 24, deploys: 8 },
              { ns: 'monitoring', pods: 6, deploys: 3 },
              { ns: 'production', pods: 18, deploys: 6 },
            ].map((n) => (
              <div key={n.ns} className="px-2 py-1" style={{ ...ps.row, justifyContent: 'space-between', fontSize: PREV_FS_CAPTION }}>
                <span style={{ fontWeight: 500, color: PREV_CLR_CPU }}>{n.ns}</span>
                <span style={{ color: PREV_CLR_MUTED }}>{n.pods} pods</span>
                <span style={{ color: PREV_CLR_MUTED }}>{n.deploys} deploys</span>
              </div>
            ))}
          </div>
        </div>
      )

    case 'console_ai_health_check':
      return (
        <div style={ps.card}>
          <div style={ps.title}><span style={ps.dot(ps.colors.healthy)} /> AI Health Check</div>
          <div style={{ textAlign: 'center', marginBottom: PREV_SM }}>
            <div style={{ fontSize: PREV_FS_FEATURED, fontWeight: 700, color: ps.colors.healthy }}>Healthy</div>
            <div style={ps.muted}>AI analysis complete</div>
          </div>
          <div style={ps.col}>
            {[
              { finding: 'All nodes responding', severity: 'ok' },
              { finding: 'Pod restart rate normal', severity: 'ok' },
              { finding: 'Memory pressure on worker-2', severity: 'warn' },
            ].map((f) => (
              <div key={f.finding} className="px-2 py-1" style={{ ...ps.row, fontSize: PREV_FS_CAPTION }}>
                <span style={ps.dot(f.severity === 'ok' ? ps.colors.healthy : ps.colors.warning)} />
                <span style={{ color: f.severity === 'ok' ? PREV_CLR_SECONDARY : ps.colors.warning }}>{f.finding}</span>
              </div>
            ))}
          </div>
        </div>
      )

    case 'console_ai_offline_detection':
      return (
        <div style={ps.card}>
          <div style={ps.title}><span style={ps.dot(ps.colors.warning)} /> AI Offline Detection</div>
          <div style={ps.row}>
            <div style={ps.statBlock}>
              <span style={{ ...ps.statVal, fontSize: PREV_FS_STAT, color: ps.colors.healthy }}>11</span>
              <span style={ps.statLbl}>Online</span>
            </div>
            <div style={ps.statBlock}>
              <span style={{ ...ps.statVal, fontSize: PREV_FS_STAT, color: ps.colors.error }}>1</span>
              <span style={ps.statLbl}>Offline</span>
            </div>
            <div style={ps.statBlock}>
              <span style={{ ...ps.statVal, fontSize: PREV_FS_STAT, color: ps.colors.warning }}>2</span>
              <span style={ps.statLbl}>GPUs down</span>
            </div>
          </div>
          <div className="px-2 py-1" style={{ ...ps.row, backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: PREV_XS, borderLeft: `3px solid ${ps.colors.error}`, marginTop: PREV_SM }}>
            <span style={{ fontSize: PREV_FS_CAPTION, color: ps.colors.error, fontWeight: 600 }}>worker-4</span>
            <span style={{ fontSize: PREV_FS_MICRO, color: PREV_CLR_MUTED, marginLeft: 'auto' }}>unreachable 12m</span>
          </div>
        </div>
      )

    default:
      return <GenericCardPreview card={card} />
  }
}

// Generic card preview based on category
function GenericCardPreview({ card }: { card: WidgetCardDefinition }) {
  const categoryData: Record<string, { dot: string; items: { label: string; value: string; color?: string }[] }> = {
    cluster: { dot: ps.colors.healthy, items: [{ label: 'Ready', value: '3/4', color: ps.colors.healthy }, { label: 'Nodes', value: '12' }, { label: 'Version', value: 'v1.28' }] },
    workload: { dot: ps.colors.info, items: [{ label: 'Running', value: '45', color: ps.colors.healthy }, { label: 'Pending', value: '2', color: ps.colors.warning }, { label: 'Failed', value: '1', color: ps.colors.error }] },
    gpu: { dot: ps.colors.purple, items: [{ label: 'Total', value: '32' }, { label: 'Allocated', value: '24', color: ps.colors.purple }, { label: 'Available', value: '8', color: ps.colors.healthy }] },
    security: { dot: ps.colors.warning, items: [{ label: 'Critical', value: '2', color: ps.colors.error }, { label: 'Warning', value: '5', color: ps.colors.warning }, { label: 'Info', value: '8', color: ps.colors.info }] },
    monitoring: { dot: ps.colors.info, items: [{ label: 'Active', value: '3', color: ps.colors.info }, { label: 'Resolved', value: '12', color: ps.colors.healthy }, { label: 'Silenced', value: '1' }] },
    'ci-cd': { dot: ps.colors.info, items: [{ label: 'Runs', value: '36', color: ps.colors.info }, { label: 'Passed', value: '34', color: ps.colors.healthy }, { label: 'Failed', value: '2', color: ps.colors.error }] } }
  const data = categoryData[card.category] || categoryData.monitoring
  return (
    <div style={ps.card}>
      <div style={ps.title}><span style={ps.dot(data.dot)} /> {card.displayName}</div>
      <div style={ps.row}>
        {data.items.map((item) => (
          <div key={item.label} style={ps.statBlock}>
            <span style={{ ...ps.statVal, fontSize: PREV_FS_STAT, color: item.color || '#f9fafb' }}>{item.value}</span>
            <span style={ps.statLbl}>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// --- Stat previews ---
function StatPreview({ statIds }: { statIds: string[] }) {
  return (
    <div style={{ ...ps.card, display: 'flex', flexWrap: 'wrap', gap: PREV_SM, padding: PREV_CARD_PAD, overflow: 'hidden' }}>
      {statIds.map((id) => {
        const stat = WIDGET_STATS[id]
        const value = SAMPLE_STATS[id] ?? '—'
        return (
          <div key={id} style={{ ...ps.statBlock, borderTop: `3px solid ${stat?.color || '#9333ea'}`, textAlign: 'center' }}>
            <span style={{ ...ps.statVal, fontSize: PREV_FS_STAT, color: stat?.color || '#fff' }}>{value}</span>
            <span style={ps.statLbl}>{stat?.displayName}</span>
          </div>
        )
      })}
    </div>
  )
}

// --- Template previews ---
function TemplatePreview({ templateId }: { templateId: string }) {
  const template = WIDGET_TEMPLATES[templateId]
  if (!template) return null

  const statsRow = template.stats && template.stats.length > 0 ? (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: PREV_XS, marginBottom: PREV_SM, overflow: 'hidden' }}>
      {template.stats.map((id) => {
        const stat = WIDGET_STATS[id]
        const value = SAMPLE_STATS[id] ?? '—'
        return (
          <div key={id} className="px-2 py-1" style={{ ...ps.statBlock, flex: 1, borderTop: `2px solid ${stat?.color || '#9333ea'}`, textAlign: 'center' }}>
            <span style={{ fontSize: PREV_FS_STAT_SM, fontWeight: 700, color: stat?.color || '#fff' }}>{value}</span>
            <span style={{ ...ps.statLbl, fontSize: PREV_FS_LABEL }}>{stat?.displayName}</span>
          </div>
        )
      })}
    </div>
  ) : null

  const cardMiniStyle: React.CSSProperties = {
    flex: 1,
    backgroundColor: 'rgba(31, 41, 55, 0.5)',
    borderRadius: '6px',
    padding: PREV_ITEM_PAD,
    border: '1px solid rgba(255, 255, 255, 0.05)' }

  const isGrid = template.layout === 'grid'
  const isRow = template.layout === 'row'
  const cardsContainer: React.CSSProperties = isGrid
    ? { display: 'grid', gridTemplateColumns: `repeat(${template.gridCols || 2}, 1fr)`, gap: PREV_XS }
    : isRow
    ? { display: 'flex', gap: PREV_XS }
    : { display: 'flex', flexDirection: 'column', gap: PREV_XS }

  return (
    <div style={{ ...ps.card, maxWidth: 320 }}>
      <div style={{ ...ps.title, fontSize: PREV_FS_BODY, marginBottom: PREV_SM }}>{template.displayName}</div>
      {statsRow}
      {template.cards.length > 0 && (
        <div style={cardsContainer}>
          {template.cards.map((cardType) => {
            const c = WIDGET_CARDS[cardType]
            return (
              <div key={cardType} style={cardMiniStyle}>
                <div style={{ fontSize: PREV_FS_MICRO, fontWeight: 600, color: PREV_CLR_DIM, marginBottom: PREV_XS }}>{c?.displayName || cardType}</div>
                <div style={{ fontSize: PREV_FS_STAT_SM, fontWeight: 700, color: ps.colors.purple }}>
                  {cardType === 'cluster_health' ? '3/4' : cardType === 'pod_issues' ? '4' : cardType === 'gpu_overview' ? '72%' : cardType === 'security_issues' ? '20' : '—'}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// Nightly E2E preview with sample status dots
function NightlyE2EPreview() {
  const platforms = [
    {
      name: 'OCP', color: '#f97316',
      guides: [
        { acronym: 'IS', dots: ['g','g','r','g','g','g','g'] },
        { acronym: 'PD', dots: ['g','g','g','g','g','g','g'] },
        { acronym: 'PPC', dots: ['g','r','g','g','g','r','g'] },
        { acronym: 'TPC', dots: ['g','g','g','r','g','g','g'] },
        { acronym: 'WEP', dots: ['g','g','g','g','g','g','b'] },
        { acronym: 'WVA', dots: ['g','r','g','g','r','g','g'] },
      ] },
    {
      name: 'GKE', color: '#3b82f6',
      guides: [
        { acronym: 'IS', dots: ['g','g','g','g','g','g','g'] },
        { acronym: 'PD', dots: ['r','g','g','g','g','g','g'] },
        { acronym: 'WEP', dots: ['g','g','g','g','g','g','g'] },
      ] },
    {
      name: 'CKS', color: '#a855f7',
      guides: [
        { acronym: 'IS', dots: [] as string[] },
        { acronym: 'PD', dots: [] as string[] },
        { acronym: 'WEP', dots: [] as string[] },
      ] },
  ]
  const dotColor: Record<string, string> = { g: '#22c55e', r: '#ef4444', b: '#60a5fa' }

  return (
    <div style={{ ...ps.card, width: 320, fontSize: PREV_FS_CAPTION, padding: PREV_CARD_PAD }}>
      <div style={ps.title}><span style={ps.dot('#22c55e')} /> Nightly E2E Status</div>
      <div style={{ display: 'flex', gap: PREV_LG, marginBottom: PREV_SM }}>
        <div><span style={{ fontSize: PREV_FS_STAT, fontWeight: 700, color: '#a855f7' }}>87%</span><div style={ps.muted}>Pass Rate</div></div>
        <div><span style={{ fontSize: PREV_FS_STAT, fontWeight: 700 }}>16</span><div style={ps.muted}>Guides</div></div>
        <div><span style={{ fontSize: PREV_FS_STAT, fontWeight: 700, color: '#ef4444' }}>3</span><div style={ps.muted}>Failing</div></div>
      </div>
      {platforms.map((p) => (
        <div key={p.name} className="mb-1">
          <div className="mb-1" style={{ color: p.color, fontWeight: 600, fontSize: PREV_FS_MICRO }}>{p.name}</div>
          {p.guides.map((g) => (
            <div key={`${p.name}-${g.acronym}`} className="flex items-center gap-1" style={{ marginBottom: PREV_HAIRLINE_GAP }}>
              <span style={WIDGET_EXPORT_MODAL_SPAN_STYLE_4}>{g.acronym}</span>
              <div style={{ display: 'flex', gap: PREV_DOTS_GAP }}>
                {g.dots.length > 0 ? g.dots.map((d, i) => (
                  <span key={i} style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: dotColor[d], display: 'inline-block', ...(d === 'b' ? { animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' } : {}) }} />
                )) : (
                  <span style={{ color: '#4b5563', fontSize: PREV_FS_LABEL }}>no runs</span>
                )}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

export default WidgetExportModal
