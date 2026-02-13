/**
 * Widget Export Modal
 *
 * Allows users to export dashboard cards as standalone desktop widgets
 * for Übersicht (macOS) and other platforms.
 */

import { useState, useMemo } from 'react'
import { Download, Monitor, Smartphone, Copy, Check, ExternalLink, Info } from 'lucide-react'
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
                  <p className="font-medium mb-1">Übersicht Setup:</p>
                  <ol className="list-decimal list-inside space-y-0.5 text-blue-300/80">
                    <li>Download the widget file</li>
                    <li>
                      Move to <code className="bg-blue-500/20 px-1 rounded">~/Library/Application Support/Übersicht/widgets/</code>
                    </li>
                    <li>Ensure KC agent is running locally on port 8080</li>
                    <li>Restart Übersicht</li>
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

// Simple widget preview
function WidgetPreview({ config }: { config: WidgetConfig | null }) {
  if (!config) {
    return (
      <div className="text-center text-muted-foreground">
        <Smartphone className="w-12 h-12 mx-auto mb-2 opacity-50" />
        <p className="text-sm">Select an item to preview</p>
      </div>
    )
  }

  // Render a simple preview based on config type
  const previewStyle = {
    backgroundColor: 'rgba(17, 24, 39, 0.9)',
    borderRadius: '12px',
    padding: '16px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    color: '#f9fafb',
    fontFamily: 'Inter, sans-serif',
  }

  if (config.type === 'card' && config.cardType) {
    const card = WIDGET_CARDS[config.cardType]

    // Custom preview for nightly E2E status
    if (config.cardType === 'nightly_e2e_status') {
      return <NightlyE2EPreview style={previewStyle} />
    }

    return (
      <div style={{ ...previewStyle, width: card?.defaultSize.width, height: card?.defaultSize.height }}>
        <div className="text-sm font-medium mb-2">{card?.displayName}</div>
        <div className="text-2xl font-bold text-purple-400">—</div>
        <div className="text-xs text-gray-400 mt-1">Preview</div>
      </div>
    )
  }

  if (config.type === 'stat' && config.statIds) {
    return (
      <div style={{ ...previewStyle, display: 'flex', gap: '8px' }}>
        {config.statIds.map((id) => {
          const stat = WIDGET_STATS[id]
          return (
            <div
              key={id}
              style={{
                padding: '8px 12px',
                backgroundColor: 'rgba(31, 41, 55, 0.5)',
                borderRadius: '8px',
                borderTop: `3px solid ${stat?.color || '#9333ea'}`,
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '18px', fontWeight: 700, color: stat?.color || '#fff' }}>—</div>
              <div style={{ fontSize: '10px', color: '#9ca3af' }}>{stat?.displayName}</div>
            </div>
          )
        })}
      </div>
    )
  }

  if (config.type === 'template' && config.templateId) {
    const template = WIDGET_TEMPLATES[config.templateId]
    return (
      <div
        style={{
          ...previewStyle,
          width: Math.min(template?.size.width || 300, 300),
          height: Math.min(template?.size.height || 200, 200),
        }}
      >
        <div className="text-sm font-medium mb-2">{template?.displayName}</div>
        <div className="grid grid-cols-2 gap-2">
          {template?.cards.slice(0, 4).map((c) => (
            <div key={c} className="h-8 bg-purple-500/20 rounded flex items-center justify-center text-[10px] text-purple-300">
              {c.replace(/_/g, ' ')}
            </div>
          ))}
        </div>
      </div>
    )
  }

  return null
}

// Nightly E2E preview with sample status dots
function NightlyE2EPreview({ style }: { style: React.CSSProperties }) {
  const platforms = [
    {
      name: 'OCP',
      color: '#f97316',
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
      name: 'GKE',
      color: '#3b82f6',
      guides: [
        { acronym: 'IS', dots: ['g','g','g','g','g','g','g'] },
        { acronym: 'PD', dots: ['r','g','g','g','g','g','g'] },
        { acronym: 'WEP', dots: ['g','g','g','g','g','g','g'] },
        { acronym: 'BM', dots: ['y','g','g','r','g','g','g'] },
      ],
    },
    {
      name: 'CKS',
      color: '#a855f7',
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
    <div style={{ ...style, width: 380, fontSize: '10px', padding: '10px 12px' }}>
      <div style={{ fontWeight: 600, fontSize: '12px', marginBottom: '6px' }}>Nightly E2E Status</div>
      <div style={{ display: 'flex', gap: '16px', marginBottom: '8px' }}>
        <div><span style={{ fontSize: '16px', fontWeight: 700, color: '#a855f7' }}>87%</span><div style={{ color: '#9ca3af' }}>Pass Rate</div></div>
        <div><span style={{ fontSize: '16px', fontWeight: 700 }}>16</span><div style={{ color: '#9ca3af' }}>Guides</div></div>
        <div><span style={{ fontSize: '16px', fontWeight: 700, color: '#ef4444' }}>3</span><div style={{ color: '#9ca3af' }}>Failing</div></div>
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
