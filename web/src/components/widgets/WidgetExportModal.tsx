/**
 * Widget Export Modal
 *
 * Allows users to export dashboard cards as standalone desktop widgets
 * for Übersicht (macOS) and other platforms.
 */

import { useState, useMemo } from 'react'
import { Download, Monitor, Smartphone, Copy, Check, ExternalLink, Info } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { BaseModal } from '../../lib/modals'
import {
  WIDGET_CARDS,
  WIDGET_STATS,
  WIDGET_TEMPLATES,
  type WidgetCardDefinition,
  type WidgetTemplateDefinition,
} from '../../lib/widgets/widgetRegistry'
import { generateWidget, getWidgetFilename, type WidgetConfig } from '../../lib/widgets/codeGenerator'

interface WidgetExportModalProps {
  isOpen: boolean
  onClose: () => void
  cardType?: string
  mode?: 'card' | 'stat' | 'template' | 'picker'
}

type ExportTab = 'card' | 'stats' | 'templates'

export function WidgetExportModal({ isOpen, onClose, cardType, mode: _mode = 'picker' }: WidgetExportModalProps) {
  const { t } = useTranslation('common')
  const [activeTab, setActiveTab] = useState<ExportTab>(cardType ? 'card' : 'templates')
  const [selectedCard, setSelectedCard] = useState<string | null>(cardType || null)
  const [selectedStats, setSelectedStats] = useState<string[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null)
  const [apiEndpoint, setApiEndpoint] = useState('http://localhost:8080')
  const [refreshInterval, setRefreshInterval] = useState(30)
  const [copied, setCopied] = useState(false)
  const [showCode, setShowCode] = useState(false)

  // Determine what we're exporting
  const exportConfig = useMemo((): WidgetConfig | null => {
    if (activeTab === 'card' && selectedCard) {
      return {
        type: 'card',
        cardType: selectedCard,
        apiEndpoint,
        refreshInterval: refreshInterval * 1000,
        theme: 'dark',
      }
    }
    if (activeTab === 'stats' && selectedStats.length > 0) {
      return {
        type: 'stat',
        statIds: selectedStats,
        apiEndpoint,
        refreshInterval: refreshInterval * 1000,
        theme: 'dark',
      }
    }
    if (activeTab === 'templates' && selectedTemplate) {
      return {
        type: 'template',
        templateId: selectedTemplate,
        apiEndpoint,
        refreshInterval: refreshInterval * 1000,
        theme: 'dark',
      }
    }
    return null
  }, [activeTab, selectedCard, selectedStats, selectedTemplate, apiEndpoint, refreshInterval])

  // Generate widget code
  const widgetCode = useMemo(() => {
    if (!exportConfig) return ''
    try {
      return generateWidget(exportConfig)
    } catch (err) {
      return `// Error generating widget: ${err}`
    }
  }, [exportConfig])

  const filename = exportConfig ? getWidgetFilename(exportConfig) : 'widget.jsx'

  // Download widget file
  const handleDownload = () => {
    if (!widgetCode) return

    const blob = new Blob([widgetCode], { type: 'text/javascript' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // Copy to clipboard
  const handleCopy = async () => {
    if (!widgetCode) return
    await navigator.clipboard.writeText(widgetCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Toggle stat selection
  const toggleStat = (statId: string) => {
    setSelectedStats((prev) =>
      prev.includes(statId) ? prev.filter((s) => s !== statId) : [...prev, statId]
    )
  }

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} size="lg">
      <BaseModal.Header
        title="Export Desktop Widget"
        icon={Download}
        onClose={onClose}
      />
      <BaseModal.Content>
      <div className="flex flex-col h-[550px]">
        {/* Tabs */}
        <div className="flex border-b border-border mb-4">
          <button
            onClick={() => setActiveTab('templates')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'templates'
                ? 'text-purple-400 border-purple-400'
                : 'text-muted-foreground border-transparent hover:text-foreground'
            }`}
          >
            Templates
          </button>
          <button
            onClick={() => setActiveTab('card')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'card'
                ? 'text-purple-400 border-purple-400'
                : 'text-muted-foreground border-transparent hover:text-foreground'
            }`}
          >
            Single Card
          </button>
          <button
            onClick={() => setActiveTab('stats')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'stats'
                ? 'text-purple-400 border-purple-400'
                : 'text-muted-foreground border-transparent hover:text-foreground'
            }`}
          >
            Stat Blocks
          </button>
        </div>

        <div className="flex-1 flex gap-4 overflow-hidden">
          {/* Left: Selection */}
          <div className="w-1/2 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto pr-2">
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
                <label className="block text-xs text-muted-foreground mb-1">API Endpoint</label>
                <input
                  type="text"
                  value={apiEndpoint}
                  onChange={(e) => setApiEndpoint(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm bg-secondary rounded border border-border focus:border-purple-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">
                  Refresh Interval (seconds)
                </label>
                <input
                  type="number"
                  value={refreshInterval}
                  onChange={(e) => setRefreshInterval(Math.max(10, parseInt(e.target.value) || 30))}
                  min={10}
                  className="w-24 px-3 py-1.5 text-sm bg-secondary rounded border border-border focus:border-purple-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Right: Preview & Code */}
          <div className="w-1/2 flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Preview</span>
              <button
                onClick={() => setShowCode(!showCode)}
                className="text-xs text-purple-400 hover:text-purple-300"
              >
                {showCode ? 'Hide Code' : 'Show Code'}
              </button>
            </div>

            {showCode ? (
              <div className="flex-1 bg-gray-900 rounded-lg p-3 overflow-auto">
                <pre className="text-xs text-gray-300 whitespace-pre-wrap font-mono">
                  {widgetCode || '// Select an item to generate widget code'}
                </pre>
              </div>
            ) : (
              <div className="flex-1 bg-gray-900/50 rounded-lg p-4 flex items-center justify-center">
                <WidgetPreview config={exportConfig} />
              </div>
            )}

            {/* Setup instructions */}
            <div className="mt-3 p-3 bg-blue-500/10 rounded-lg border border-blue-500/20">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
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
            Get Übersicht <ExternalLink className="w-3 h-3" />
          </a>
          <div className="flex gap-2">
            <button
              onClick={handleCopy}
              disabled={!widgetCode}
              className="px-3 py-1.5 text-sm bg-secondary hover:bg-secondary/80 rounded flex items-center gap-2 disabled:opacity-50"
            >
              {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Copied!' : 'Copy Code'}
            </button>
            <button
              onClick={handleDownload}
              disabled={!widgetCode}
              className="px-4 py-1.5 text-sm bg-purple-600 hover:bg-purple-700 rounded flex items-center gap-2 disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              Download {filename}
            </button>
          </div>
        </div>
      </div>
      </BaseModal.Content>
    </BaseModal>
  )
}

// Template card component
function TemplateCard({
  template,
  selected,
  onSelect,
}: {
  template: WidgetTemplateDefinition
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      onClick={onSelect}
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
          <span key={c} className="px-1.5 py-0.5 bg-purple-500/20 text-purple-300 text-[10px] rounded">
            {c.replace(/_/g, ' ')}
          </span>
        ))}
        {template.stats?.map((s) => (
          <span key={s} className="px-1.5 py-0.5 bg-blue-500/20 text-blue-300 text-[10px] rounded">
            {s.replace(/_/g, ' ')}
          </span>
        ))}
      </div>
      <div className="mt-2 text-[10px] text-muted-foreground">
        {template.size.width}×{template.size.height}px • {template.layout} layout
      </div>
    </button>
  )
}

// Card item component
function CardItem({
  card,
  selected,
  onSelect,
}: {
  card: WidgetCardDefinition
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      onClick={onSelect}
      className={`w-full text-left p-3 rounded-lg border transition-colors ${
        selected
          ? 'bg-purple-500/20 border-purple-500/50'
          : 'bg-secondary/50 border-border hover:border-purple-500/30'
      }`}
    >
      <div className="font-medium text-sm">{card.displayName}</div>
      <p className="text-xs text-muted-foreground">{card.description}</p>
      <div className="mt-1 text-[10px] text-muted-foreground">
        {card.defaultSize.width}×{card.defaultSize.height}px • {card.category}
      </div>
    </button>
  )
}

// Stat item component
function StatItem({
  stat,
  selected,
  onToggle,
}: {
  stat: (typeof WIDGET_STATS)[keyof typeof WIDGET_STATS]
  selected: boolean
  onToggle: () => void
}) {
  return (
    <button
      onClick={onToggle}
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
        <div className="text-[10px] text-muted-foreground">
          {stat.format} • {stat.size.width}×{stat.size.height}px
        </div>
      </div>
      <div
        className={`ml-auto w-5 h-5 rounded border-2 flex items-center justify-center ${
          selected ? 'bg-purple-500 border-purple-500' : 'border-gray-500'
        }`}
      >
        {selected && <Check className="w-3 h-3 text-white" />}
      </div>
    </button>
  )
}

// --- Shared preview styles matching Übersicht widget appearance ---
const ps = {
  card: {
    backgroundColor: 'rgba(17, 24, 39, 0.9)',
    borderRadius: '12px',
    padding: '12px 14px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    color: '#f9fafb',
    fontFamily: 'Inter, -apple-system, sans-serif',
    fontSize: '11px',
    lineHeight: 1.4,
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
  } as React.CSSProperties,
  title: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#f9fafb',
    marginBottom: '8px',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  } as React.CSSProperties,
  dot: (color: string) => ({
    width: 7,
    height: 7,
    borderRadius: '50%',
    backgroundColor: color,
    display: 'inline-block',
    flexShrink: 0,
  }) as React.CSSProperties,
  statBlock: {
    backgroundColor: 'rgba(17, 24, 39, 0.9)',
    borderRadius: '6px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    padding: '6px 10px',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '54px',
  } as React.CSSProperties,
  statVal: {
    fontSize: '18px',
    fontWeight: 700,
    lineHeight: 1.2,
  } as React.CSSProperties,
  statLbl: {
    fontSize: '9px',
    color: '#9ca3af',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    marginTop: '1px',
  } as React.CSSProperties,
  row: { display: 'flex', gap: '6px', alignItems: 'center' } as React.CSSProperties,
  col: { display: 'flex', flexDirection: 'column' as const, gap: '4px' } as React.CSSProperties,
  muted: { color: '#9ca3af', fontSize: '10px' } as React.CSSProperties,
  colors: { healthy: '#22c55e', warning: '#eab308', error: '#ef4444', info: '#3b82f6', purple: '#9333ea' },
}

// Sample stat data for realistic previews
const SAMPLE_STATS: Record<string, number | string> = {
  total_clusters: 4,
  total_pods: 128,
  total_gpus: 32,
  cpu_usage: '67%',
  memory_usage: '54%',
  unhealthy_pods: 3,
  active_alerts: 2,
}

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
              <span style={ps.statLbl}>Healthy</span>
            </div>
            <div style={{ ...ps.statBlock, borderLeft: `3px solid ${ps.colors.error}` }}>
              <span style={{ ...ps.statVal, color: ps.colors.error }}>1</span>
              <span style={ps.statLbl}>Unhealthy</span>
            </div>
          </div>
        </div>
      )

    case 'pod_issues':
      return (
        <div style={ps.card}>
          <div style={ps.title}><span style={ps.dot(ps.colors.warning)} /> Pod Issues</div>
          <div style={ps.muted}>4 total issues</div>
          <div style={{ ...ps.col, marginTop: '6px' }}>
            <div style={{ ...ps.row, padding: '3px 6px', backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: '4px' }}>
              <span style={{ color: ps.colors.error, fontWeight: 600, fontSize: '12px' }}>2</span>
              <span style={ps.muted}>CrashLoopBackOff</span>
            </div>
            <div style={{ ...ps.row, padding: '3px 6px', backgroundColor: 'rgba(234,179,8,0.1)', borderRadius: '4px' }}>
              <span style={{ color: ps.colors.warning, fontWeight: 600, fontSize: '12px' }}>1</span>
              <span style={ps.muted}>OOMKilled</span>
            </div>
            <div style={{ ...ps.row, padding: '3px 6px', backgroundColor: 'rgba(59,130,246,0.1)', borderRadius: '4px' }}>
              <span style={{ color: ps.colors.info, fontWeight: 600, fontSize: '12px' }}>1</span>
              <span style={ps.muted}>ImagePullBackOff</span>
            </div>
          </div>
        </div>
      )

    case 'gpu_overview':
      return (
        <div style={ps.card}>
          <div style={ps.title}><span style={ps.dot(ps.colors.purple)} /> GPU Overview</div>
          <div style={{ textAlign: 'center', marginBottom: '8px' }}>
            <div style={{ fontSize: '28px', fontWeight: 700, color: ps.colors.purple }}>72%</div>
            <div style={ps.muted}>Utilization</div>
          </div>
          <div style={ps.row}>
            <div style={ps.statBlock}>
              <span style={ps.statVal}>32</span>
              <span style={ps.statLbl}>Total</span>
            </div>
            <div style={ps.statBlock}>
              <span style={{ ...ps.statVal, color: ps.colors.purple }}>23</span>
              <span style={ps.statLbl}>Allocated</span>
            </div>
          </div>
        </div>
      )

    case 'hardware_health':
      return (
        <div style={ps.card}>
          <div style={ps.title}><span style={ps.dot(ps.colors.warning)} /> Hardware Health</div>
          <div style={{ ...ps.row, marginBottom: '6px' }}>
            <div style={{ ...ps.statBlock, borderLeft: `3px solid ${ps.colors.healthy}` }}>
              <span style={ps.statVal}>4</span>
              <span style={ps.statLbl}>Nodes</span>
            </div>
            <div style={{ ...ps.statBlock, borderLeft: `3px solid ${ps.colors.purple}` }}>
              <span style={{ ...ps.statVal, color: ps.colors.purple }}>16</span>
              <span style={ps.statLbl}>GPUs</span>
            </div>
            <div style={{ ...ps.statBlock, borderLeft: `3px solid ${ps.colors.info}` }}>
              <span style={{ ...ps.statVal, color: ps.colors.info }}>8</span>
              <span style={ps.statLbl}>NICs</span>
            </div>
          </div>
          <div style={ps.col}>
            <div style={{ fontSize: '9px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Alerts (2)</div>
            <div style={{ ...ps.row, padding: '3px 6px', backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: '4px', borderLeft: `3px solid ${ps.colors.error}` }}>
              <span style={{ fontSize: '10px', color: ps.colors.error, fontWeight: 600 }}>GPU</span>
              <span style={{ fontSize: '9px', color: '#9ca3af', marginLeft: '2px' }}>worker-3 (-2)</span>
            </div>
            <div style={{ ...ps.row, padding: '3px 6px', backgroundColor: 'rgba(234,179,8,0.1)', borderRadius: '4px', borderLeft: `3px solid ${ps.colors.warning}` }}>
              <span style={{ fontSize: '10px', color: ps.colors.warning, fontWeight: 600 }}>NIC</span>
              <span style={{ fontSize: '9px', color: '#9ca3af', marginLeft: '2px' }}>worker-1 (-1)</span>
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
              <div key={item.label} style={{ ...ps.row, padding: '3px 6px', backgroundColor: item.color === ps.colors.error ? 'rgba(239,68,68,0.1)' : 'rgba(234,179,8,0.1)', borderRadius: '4px' }}>
                <span style={{ color: item.color, fontWeight: 600, fontSize: '12px', minWidth: '16px' }}>{item.count}</span>
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
              <div key={a.name} style={{ ...ps.row, padding: '3px 6px', backgroundColor: a.severity === 'critical' ? 'rgba(239,68,68,0.1)' : 'rgba(234,179,8,0.1)', borderRadius: '4px', borderLeft: `3px solid ${a.severity === 'critical' ? ps.colors.error : ps.colors.warning}` }}>
                <span style={{ fontSize: '10px', color: a.severity === 'critical' ? ps.colors.error : ps.colors.warning, fontWeight: 600 }}>{a.name}</span>
                <span style={{ fontSize: '9px', color: '#6b7280', marginLeft: 'auto' }}>{a.ns}</span>
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
                <span style={{ fontSize: '10px', fontWeight: 500 }}>{r.name}</span>
                <span style={{ fontSize: '9px', color: r.status === 'deployed' ? ps.colors.healthy : ps.colors.error }}>{r.status}</span>
                <span style={{ fontSize: '9px', color: '#6b7280' }}>{r.ver}</span>
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
              <div key={p.name} style={{ ...ps.row, justifyContent: 'space-between', fontSize: '10px' }}>
                <span style={{ fontWeight: 500, maxWidth: '110px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                <span style={{ color: '#60a5fa' }}>{p.cpu}</span>
                <span style={{ color: '#c084fc' }}>{p.mem}</span>
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
              <div key={i} style={{ ...ps.row, fontSize: '10px' }}>
                <span style={{ color: e.type === 'Warning' ? ps.colors.warning : ps.colors.healthy, fontWeight: 600, minWidth: '18px' }}>{e.count}</span>
                <span style={{ color: '#cbd5e1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.msg}</span>
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
              <div key={o.name} style={{ ...ps.row, fontSize: '10px' }}>
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
              <span style={{ ...ps.statVal, fontSize: '16px', color: ps.colors.info }}>24</span>
              <span style={ps.statLbl}>PVCs</span>
            </div>
            <div style={ps.statBlock}>
              <span style={{ ...ps.statVal, fontSize: '16px', color: ps.colors.healthy }}>22</span>
              <span style={ps.statLbl}>Bound</span>
            </div>
            <div style={ps.statBlock}>
              <span style={{ ...ps.statVal, fontSize: '16px', color: ps.colors.warning }}>2</span>
              <span style={ps.statLbl}>Pending</span>
            </div>
          </div>
        </div>
      )

    case 'network_overview':
    case 'service_status':
      return (
        <div style={ps.card}>
          <div style={ps.title}><span style={ps.dot(ps.colors.info)} /> {card.displayName}</div>
          <div style={{ ...ps.row, marginBottom: '6px' }}>
            <div style={ps.statBlock}>
              <span style={{ ...ps.statVal, fontSize: '16px' }}>18</span>
              <span style={ps.statLbl}>Services</span>
            </div>
            <div style={ps.statBlock}>
              <span style={{ ...ps.statVal, fontSize: '16px', color: ps.colors.info }}>6</span>
              <span style={ps.statLbl}>Policies</span>
            </div>
          </div>
          <div style={ps.col}>
            {['ClusterIP (12)', 'LoadBalancer (4)', 'NodePort (2)'].map((s) => (
              <div key={s} style={{ fontSize: '10px', color: '#9ca3af' }}>{s}</div>
            ))}
          </div>
        </div>
      )

    case 'opencost_overview':
      return (
        <div style={ps.card}>
          <div style={ps.title}><span style={ps.dot(ps.colors.healthy)} /> OpenCost Overview</div>
          <div style={{ textAlign: 'center', marginBottom: '8px' }}>
            <div style={{ fontSize: '24px', fontWeight: 700, color: ps.colors.healthy }}>$1,247</div>
            <div style={ps.muted}>Monthly estimate</div>
          </div>
          <div style={ps.row}>
            <div style={ps.statBlock}>
              <span style={{ ...ps.statVal, fontSize: '14px', color: '#60a5fa' }}>$482</span>
              <span style={ps.statLbl}>Compute</span>
            </div>
            <div style={ps.statBlock}>
              <span style={{ ...ps.statVal, fontSize: '14px', color: '#c084fc' }}>$635</span>
              <span style={ps.statLbl}>GPU</span>
            </div>
            <div style={ps.statBlock}>
              <span style={{ ...ps.statVal, fontSize: '14px', color: '#22d3ee' }}>$130</span>
              <span style={ps.statLbl}>Storage</span>
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
              <div key={p.name} style={{ ...ps.row, justifyContent: 'space-between', fontSize: '10px' }}>
                <span style={{ fontWeight: 500 }}>{p.name}</span>
                <span style={{ color: p.color }}>{p.status}</span>
              </div>
            ))}
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
  }
  const data = categoryData[card.category] || categoryData.monitoring
  return (
    <div style={ps.card}>
      <div style={ps.title}><span style={ps.dot(data.dot)} /> {card.displayName}</div>
      <div style={ps.row}>
        {data.items.map((item) => (
          <div key={item.label} style={ps.statBlock}>
            <span style={{ ...ps.statVal, fontSize: '16px', color: item.color || '#f9fafb' }}>{item.value}</span>
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
    <div style={{ ...ps.card, display: 'flex', gap: '6px', padding: '8px 10px' }}>
      {statIds.map((id) => {
        const stat = WIDGET_STATS[id]
        const value = SAMPLE_STATS[id] ?? '—'
        return (
          <div key={id} style={{ ...ps.statBlock, borderTop: `3px solid ${stat?.color || '#9333ea'}`, textAlign: 'center' }}>
            <span style={{ ...ps.statVal, fontSize: '16px', color: stat?.color || '#fff' }}>{value}</span>
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
    <div style={{ display: 'flex', gap: '4px', marginBottom: '6px' }}>
      {template.stats.map((id) => {
        const stat = WIDGET_STATS[id]
        const value = SAMPLE_STATS[id] ?? '—'
        return (
          <div key={id} style={{ ...ps.statBlock, flex: 1, borderTop: `2px solid ${stat?.color || '#9333ea'}`, textAlign: 'center', padding: '4px 6px' }}>
            <span style={{ fontSize: '14px', fontWeight: 700, color: stat?.color || '#fff' }}>{value}</span>
            <span style={{ ...ps.statLbl, fontSize: '8px' }}>{stat?.displayName}</span>
          </div>
        )
      })}
    </div>
  ) : null

  const cardMiniStyle: React.CSSProperties = {
    flex: 1,
    backgroundColor: 'rgba(31, 41, 55, 0.5)',
    borderRadius: '6px',
    padding: '4px 6px',
    border: '1px solid rgba(255, 255, 255, 0.05)',
  }

  const isGrid = template.layout === 'grid'
  const isRow = template.layout === 'row'
  const cardsContainer: React.CSSProperties = isGrid
    ? { display: 'grid', gridTemplateColumns: `repeat(${template.gridCols || 2}, 1fr)`, gap: '4px' }
    : isRow
    ? { display: 'flex', gap: '4px' }
    : { display: 'flex', flexDirection: 'column', gap: '4px' }

  return (
    <div style={{ ...ps.card, maxWidth: 320 }}>
      <div style={{ ...ps.title, fontSize: '11px', marginBottom: '6px' }}>{template.displayName}</div>
      {statsRow}
      {template.cards.length > 0 && (
        <div style={cardsContainer}>
          {template.cards.map((cardType) => {
            const c = WIDGET_CARDS[cardType]
            return (
              <div key={cardType} style={cardMiniStyle}>
                <div style={{ fontSize: '9px', fontWeight: 600, color: '#d1d5db', marginBottom: '2px' }}>{c?.displayName || cardType}</div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: ps.colors.purple }}>
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
        { acronym: 'SA', dots: ['g','g','g','g','g','g','g'] },
        { acronym: 'TPC', dots: ['g','g','g','r','g','g','g'] },
        { acronym: 'WEP', dots: ['g','g','g','g','g','g','y'] },
        { acronym: 'WVA', dots: ['g','r','g','g','r','g','g'] },
        { acronym: 'BM', dots: ['r','r','g','r','g','r','g'] },
      ],
    },
    {
      name: 'GKE', color: '#3b82f6',
      guides: [
        { acronym: 'IS', dots: ['g','g','g','g','g','g','g'] },
        { acronym: 'PD', dots: ['r','g','g','g','g','g','g'] },
        { acronym: 'WEP', dots: ['g','g','g','g','g','g','g'] },
        { acronym: 'BM', dots: ['y','g','g','r','g','g','g'] },
      ],
    },
    {
      name: 'CKS', color: '#a855f7',
      guides: [
        { acronym: 'IS', dots: [] as string[] },
        { acronym: 'PD', dots: [] as string[] },
        { acronym: 'WEP', dots: [] as string[] },
        { acronym: 'BM', dots: [] as string[] },
      ],
    },
  ]
  const dotColor: Record<string, string> = { g: '#22c55e', r: '#ef4444', y: '#eab308' }

  return (
    <div style={{ ...ps.card, width: 320, fontSize: '10px', padding: '10px 12px' }}>
      <div style={ps.title}><span style={ps.dot('#22c55e')} /> Nightly E2E Status</div>
      <div style={{ display: 'flex', gap: '14px', marginBottom: '8px' }}>
        <div><span style={{ fontSize: '16px', fontWeight: 700, color: '#a855f7' }}>87%</span><div style={ps.muted}>Pass Rate</div></div>
        <div><span style={{ fontSize: '16px', fontWeight: 700 }}>16</span><div style={ps.muted}>Guides</div></div>
        <div><span style={{ fontSize: '16px', fontWeight: 700, color: '#ef4444' }}>3</span><div style={ps.muted}>Failing</div></div>
      </div>
      {platforms.map((p) => (
        <div key={p.name} style={{ marginBottom: '4px' }}>
          <div style={{ color: p.color, fontWeight: 600, fontSize: '9px', marginBottom: '2px' }}>{p.name}</div>
          {p.guides.map((g) => (
            <div key={`${p.name}-${g.acronym}`} style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '1px' }}>
              <span style={{ width: '24px', fontWeight: 600, color: '#94a3b8' }}>{g.acronym}</span>
              <div style={{ display: 'flex', gap: '2px' }}>
                {g.dots.length > 0 ? g.dots.map((d, i) => (
                  <span key={i} style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: dotColor[d], display: 'inline-block' }} />
                )) : (
                  <span style={{ color: '#4b5563', fontSize: '8px' }}>no runs</span>
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
