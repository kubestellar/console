/**
 * Widget Export Modal
 *
 * Allows users to export dashboard cards as standalone desktop widgets
 * for Übersicht (macOS) and other platforms.
 */

import { useState, useMemo, useEffect, useRef } from 'react'
import { Download, Copy, Check, ExternalLink, Info, AlertTriangle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { BACKEND_DEFAULT_URL } from '../../../lib/constants'
import { emitWidgetDownloaded } from '../../../lib/analytics'
import { BaseModal } from '../../../lib/modals'
import { UI_FEEDBACK_TIMEOUT_MS } from '../../../lib/constants/network'
import { WIDGET_CARDS, WIDGET_STATS, WIDGET_TEMPLATES } from '../../../lib/widgets/widgetRegistry'
import { generateWidget, getWidgetFilename, type WidgetConfig } from '../../../lib/widgets/codeGenerator'
import { copyToClipboard } from '../../../lib/clipboard'
import { safeRevokeObjectURL } from '../../../lib/download'
import type { CSSProperties } from 'react'
import { CardItem, StatItem, TemplateCard } from './WidgetExportModalSelectionItems'
import { WidgetPreview, getWidgetPreviewDimensions, getWidgetPreviewScale } from './WidgetExportModalPreview'

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
          <div className="sticky top-0 self-start w-1/2 flex flex-col overflow-hidden min-h-0 pb-6">
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
        <div className="flex items-center justify-between mt-6 pt-4 border-t border-border shrink-0">
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

export default WidgetExportModal
