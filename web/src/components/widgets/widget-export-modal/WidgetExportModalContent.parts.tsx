/**
 * Widget Export Modal
 *
 * Allows users to export dashboard cards as standalone desktop widgets
 * for Übersicht (macOS) and other platforms.
 */

import { Download, Copy, Check, ExternalLink, Info } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  WIDGET_CARDS,
  WIDGET_STATS,
  WIDGET_TEMPLATES
} from '../../../lib/widgets/widgetRegistry'
import {
  CardItem,
  StatItem,
  TemplateCard
} from './WidgetExportModalSelectionItems'
import { WidgetPreview } from './WidgetExportModalPreview'
import { EXPORT_PANEL_IDS, EXPORT_TAB_IDS, WIDGET_CODE_PANEL_ID } from './widgetExportConstants'
import { useWidgetExport } from './useWidgetExport'
import { WidgetExportTabs } from './WidgetExportTabs'
import { WidgetExportConfigSection } from './WidgetExportConfigSection'

interface WidgetExportModalPartsProps {
  cardType?: string
}

export function WidgetExportModalParts({
  cardType
}: WidgetExportModalPartsProps) {
  const { t } = useTranslation('common')
  const {
    activeTab,
    setActiveTab,
    selectedCard,
    setSelectedCard,
    selectedStats,
    selectedTemplate,
    setSelectedTemplate,
    apiEndpoint,
    setApiEndpoint,
    refreshInterval,
    setRefreshInterval,
    copied,
    showCode,
    setShowCode,
    isLoading,
    isOnPublicSite,
    cardListRef,
    handleTabKeyDown,
    exportConfig,
    widgetCode,
    previewStyle,
    filename,
    handleDownload,
    handleCopy,
    toggleStat
  } = useWidgetExport(cardType)

  const widgetContent = (
    <div className="flex flex-col h-full min-h-0">
      <WidgetExportTabs
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onKeyDown={handleTabKeyDown}
      />

      <div className="flex-1 flex items-stretch gap-4 min-h-0">
        {/* Left: Selection */}
        <div className="w-1/2 flex flex-col overflow-hidden min-h-0">
          <div
            id={EXPORT_PANEL_IDS[activeTab]}
            ref={cardListRef}
            data-testid="widget-export-selection-panel"
            className="flex-1 overflow-y-auto pr-2"
            role="tabpanel"
            tabIndex={0}
            aria-labelledby={EXPORT_TAB_IDS[activeTab]}
          >
            {activeTab === 'templates' && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground mb-3">
                  {t('widgets.prebuiltLayouts')}
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
                  {t('widgets.exportSingleCard')}
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
                  {t('widgets.selectStats')}
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

          {/* Configuration section (static below list) */}
          <WidgetExportConfigSection
            apiEndpoint={apiEndpoint}
            onApiEndpointChange={setApiEndpoint}
            refreshInterval={refreshInterval}
            onRefreshIntervalChange={setRefreshInterval}
            isOnPublicSite={isOnPublicSite}
          />
        </div>

        {/* Right: Preview & Code — stay static while only the left selection list scrolls. */}
        <div
          data-testid="widget-export-preview-pane"
          className="w-1/2 flex flex-col overflow-hidden min-h-0 pb-6"
        >
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
            <div
              id={WIDGET_CODE_PANEL_ID}
              className="flex-1 bg-card rounded-lg p-3 overflow-auto"
            >
              <pre className="text-xs text-foreground/80 whitespace-pre-wrap font-mono">
                {widgetCode || '// Select an item to generate widget code'}
              </pre>
            </div>
          ) : (
            <div className="flex-1 bg-secondary/50 rounded-lg p-4 flex items-start justify-center overflow-auto min-w-0 min-h-[16rem]">
              <div
                className="max-w-full overflow-hidden origin-top"
                style={previewStyle}
              >
                <WidgetPreview config={exportConfig} />
              </div>
            </div>
          )}

          {/* Setup instructions (static below preview) */}
          <div className="mt-3 p-3 bg-blue-500/10 rounded-lg border border-blue-500/20 shrink-0 overflow-auto max-h-40">
            <div className="flex items-start gap-2">
              <Info className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
              <div className="text-xs text-blue-200">
                <p className="font-medium mb-1">
                  {t('widgets.uebersichtSetup')}
                </p>
                <ol className="list-decimal list-inside space-y-0.5 text-blue-300/80">
                  <li>{t('widgets.downloadWidget')}</li>
                  <li>
                    Move to{' '}
                    <code className="bg-blue-500/20 px-1 rounded">
                      ~/Library/Application Support/Übersicht/widgets/
                    </code>
                  </li>
                  <li>{t('widgets.ensureAgentRunning')}</li>
                  <li>{t('widgets.restartUebersicht')}</li>
                </ol>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Fixed bottom bar with Übersicht link and action buttons */}
      <div className="mt-4 pt-4 border-t border-border shrink-0">
        <div className="flex items-center justify-between">
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
              aria-label={
                copied
                  ? t('common.copied')
                  : t('widgets.copyCode')
              }
            >
              {copied ? (
                <Check className="w-4 h-4 text-green-400" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
              {copied ? t('common.copied') : t('widgets.copyCode')}
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
    </div>
  )

  return widgetContent
}
