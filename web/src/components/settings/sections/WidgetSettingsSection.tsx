import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Monitor, Download, Copy, Check, ExternalLink, Smartphone, Globe, Apple, Chrome } from 'lucide-react'
import { cn } from '../../../lib/cn'

// The widget code that gets downloaded - includes drag functionality
const WIDGET_CODE = `/**
 * KubeStellar Console - Übersicht Widget
 *
 * Draggable desktop widget for monitoring Kubernetes clusters.
 * Requires kc-agent running on localhost:8585
 *
 * Installation:
 * 1. Copy this file to ~/Library/Application Support/Übersicht/widgets/
 * 2. Start kc-agent: brew install kubestellar/tap/kc-agent && kc-agent
 * 3. Restart Übersicht
 */

import { css, run } from "uebersicht";

export const command = \`/usr/bin/curl -s --connect-timeout 2 http://127.0.0.1:8585/nodes 2>/dev/null || echo '{"offline":true}'\`;

export const refreshFrequency = 30000;

const CONSOLE_URL = "http://localhost:5174";
const STORAGE_KEY = "kubestellar-widget-position";

// Drag state
let isDragging = false;
let dragStart = { x: 0, y: 0 };
let posStart = { x: 0, y: 0 };

// Load saved position
const getStoredPosition = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch (e) {}
  return { top: 20, left: 20 };
};

const savePosition = (pos) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pos));
  } catch (e) {}
};

let widgetPosition = getStoredPosition();

export const className = css\`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 9999;
  font-family: -apple-system, BlinkMacSystemFont, sans-serif;
  color: #fff;
  user-select: none;
  pointer-events: none;

  .widget-container {
    transition: background 0.2s ease, box-shadow 0.2s ease;
  }
  .widget-container:hover {
    background: rgba(17, 24, 39, 0.98) !important;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5) !important;
  }

  .drag-handle {
    cursor: grab;
  }
  .drag-handle:active {
    cursor: grabbing;
  }
\`;

// Drag handlers - use direct DOM manipulation for smooth dragging
let dragElement = null;

const handleDragStart = (e) => {
  isDragging = true;
  dragStart = { x: e.clientX, y: e.clientY };
  posStart = { ...widgetPosition };
  // Find the widget container element
  dragElement = e.target.closest('.widget-container');
  document.addEventListener("mousemove", handleDragMove);
  document.addEventListener("mouseup", handleDragEnd);
  e.preventDefault();
};

const handleDragMove = (e) => {
  if (!isDragging || !dragElement) return;
  const newTop = Math.max(0, posStart.top + (e.clientY - dragStart.y));
  const newLeft = Math.max(0, posStart.left + (e.clientX - dragStart.x));
  // Update position in memory
  widgetPosition = { top: newTop, left: newLeft };
  // Directly update DOM for smooth dragging
  dragElement.style.top = \`\${newTop}px\`;
  dragElement.style.left = \`\${newLeft}px\`;
};

const handleDragEnd = () => {
  isDragging = false;
  dragElement = null;
  savePosition(widgetPosition);
  document.removeEventListener("mousemove", handleDragMove);
  document.removeEventListener("mouseup", handleDragEnd);
};

const openUrl = (path = "") => {
  run(\`open "\${CONSOLE_URL}\${path}"\`);
};

const styles = {
  card: {
    backgroundColor: 'rgba(17, 24, 39, 0.9)',
    backdropFilter: 'blur(12px)',
    borderRadius: '12px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    padding: '16px',
    color: '#f9fafb',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
    minWidth: '280px',
    pointerEvents: 'auto',
  },
  dragHandle: {
    padding: '4px 0',
    marginBottom: '6px',
    display: 'flex',
    justifyContent: 'center',
    cursor: 'grab',
    pointerEvents: 'auto',
  },
  dragIndicator: {
    fontSize: '14px',
    color: 'rgba(255,255,255,0.3)',
    letterSpacing: '2px',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '12px',
    cursor: 'pointer',
  },
  title: {
    fontSize: '14px',
    fontWeight: 600,
  },
  statusDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '8px',
  },
  statBlock: {
    backgroundColor: 'rgba(31, 41, 55, 0.5)',
    borderRadius: '8px',
    padding: '8px 12px',
    textAlign: 'center',
    cursor: 'pointer',
  },
  statValue: {
    fontSize: '20px',
    fontWeight: 700,
  },
  statLabel: {
    fontSize: '10px',
    color: '#9ca3af',
    textTransform: 'uppercase',
  },
  footer: {
    textAlign: 'center',
    padding: '8px',
    fontSize: '12px',
    cursor: 'pointer',
    borderTop: '1px solid rgba(255,255,255,0.1)',
    marginTop: '8px',
  },
  colors: {
    healthy: '#22c55e',
    error: '#ef4444',
    warning: '#f59e0b',
    info: '#3b82f6',
    offline: '#6b7280',
  },
};

export const render = ({ output }) => {
  let nodes = [];
  let isOffline = false;

  try {
    const trimmed = (output || '').trim();
    if (!trimmed || trimmed.includes('"offline":true')) {
      isOffline = true;
    } else {
      const response = JSON.parse(trimmed);
      nodes = response.nodes || [];
    }
  } catch (e) {
    isOffline = true;
  }

  const containerStyle = {
    ...styles.card,
    position: 'absolute',
    top: \`\${widgetPosition.top}px\`,
    left: \`\${widgetPosition.left}px\`,
  };

  if (isOffline) {
    return (
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        <div className="widget-container" style={containerStyle}>
          <div
            className="drag-handle"
            style={styles.dragHandle}
            onMouseDown={handleDragStart}
            title="Drag to move"
          >
            <span style={styles.dragIndicator}>⋮⋮</span>
          </div>
          <div 
            style={styles.header} 
            onClick={() => openUrl()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openUrl() } }}
          >
            <div style={{ ...styles.statusDot, backgroundColor: styles.colors.offline }} />
            <span style={styles.title}>KubeStellar Console</span>
          </div>
          <div style={{ textAlign: 'center', padding: '12px', color: '#9ca3af' }}>
            <div style={{ fontSize: '24px', marginBottom: '8px' }}>⏳</div>
            <div>Agent connecting...</div>
          </div>
        </div>
      </div>
    );
  }

  const offlineNodes = nodes.filter(n => n.status !== 'Ready' || n.unschedulable);
  const totalGPUs = nodes.reduce((sum, n) => sum + (n.gpuCount || 0), 0);
  const allocatedGPUs = nodes.reduce((sum, n) => sum + (n.gpuAllocated || 0), 0);
  const hasIssues = offlineNodes.length > 0;
  const statusColor = hasIssues ? styles.colors.error : styles.colors.healthy;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div className="widget-container" style={containerStyle}>
        <div
          className="drag-handle"
          style={styles.dragHandle}
          onMouseDown={handleDragStart}
          title="Drag to move"
        >
          <span style={styles.dragIndicator}>⋮⋮</span>
        </div>
        <div 
          style={styles.header} 
          onClick={() => openUrl()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openUrl() } }}
        >
          <div style={{ ...styles.statusDot, backgroundColor: statusColor }} />
          <span style={styles.title}>KubeStellar Console</span>
          <span style={{ marginLeft: 'auto', fontSize: '10px', opacity: 0.5 }}>↗</span>
        </div>
        <div style={styles.statsGrid}>
          <div 
            style={styles.statBlock} 
            onClick={() => openUrl('/clusters')}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openUrl('/clusters') } }}
          >
            <div style={{ ...styles.statValue, color: hasIssues ? styles.colors.error : styles.colors.healthy }}>
              {offlineNodes.length}
            </div>
            <div style={styles.statLabel}>{t('common.offline')}</div>
          </div>
          <div 
            style={styles.statBlock} 
            onClick={() => openUrl('/clusters')}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openUrl('/clusters') } }}
          >
            <div style={{ ...styles.statValue, color: styles.colors.info }}>
              {nodes.length - offlineNodes.length}/{nodes.length}
            </div>
            <div style={styles.statLabel}>{t('common.ready')}</div>
          </div>
          <div 
            style={styles.statBlock} 
            onClick={() => openUrl('/gpu')}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openUrl('/gpu') } }}
          >
            <div style={{ ...styles.statValue, color: styles.colors.healthy }}>
              {allocatedGPUs}/{totalGPUs}
            </div>
            <div style={styles.statLabel}>GPUs</div>
          </div>
          <div 
            style={styles.statBlock} 
            onClick={() => openUrl('/clusters')}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openUrl('/clusters') } }}
          >
            <div style={{ ...styles.statValue, color: styles.colors.healthy }}>
              {nodes.length}
            </div>
            <div style={styles.statLabel}>{t('common.total')}</div>
          </div>
        </div>
        <div 
          style={{ ...styles.footer, color: statusColor }} 
          onClick={() => openUrl('/dashboard')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openUrl('/dashboard') } }}
        >
          {hasIssues ? \`⚠️ \${offlineNodes.length} node(s) need attention\` : '✓ All nodes healthy'}
        </div>
      </div>
    </div>
  );
};
`;

interface WidgetOption {
  id: string
  name: string
  description: string
  platform: string[]
  icon: typeof Monitor
  color: string
  recommended?: boolean
}

const WIDGET_OPTIONS: WidgetOption[] = [
  {
    id: 'browser',
    name: 'Browser Widget',
    description: 'Open in any browser. Use Safari PiP or Chrome Always-on-Top.',
    platform: ['macos', 'windows', 'linux'],
    icon: Globe,
    color: 'text-blue-400 bg-blue-900',
    recommended: true,
  },
  {
    id: 'uebersicht',
    name: 'Übersicht Widget',
    description: 'Native macOS desktop widget. Draggable and always visible.',
    platform: ['macos'],
    icon: Apple,
    color: 'text-purple-400 bg-purple-900',
  },
]

export function WidgetSettingsSection() {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const [downloaded, setDownloaded] = useState(false)
  const [selectedWidget, setSelectedWidget] = useState<string | null>(null)

  const handleDownload = () => {
    const blob = new Blob([WIDGET_CODE], { type: 'text/javascript' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'kubestellar-widget.jsx'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    setDownloaded(true)
    setTimeout(() => setDownloaded(false), 3000)
  }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(WIDGET_CODE)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const widgetPath = '~/Library/Application Support/Übersicht/widgets/'

  return (
    <div id="widget-settings" className="glass rounded-xl p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-lg bg-secondary">
          <Monitor className="w-5 h-5 text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-lg font-medium text-foreground">{t('settings.widget.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('settings.widget.subtitle')}</p>
        </div>
      </div>

      {/* Widget Selection Grid */}
      <div className="grid gap-3 mb-4">
        {WIDGET_OPTIONS.map((widget) => {
          const Icon = widget.icon
          const isSelected = selectedWidget === widget.id
          return (
            <button
              key={widget.id}
              onClick={() => setSelectedWidget(isSelected ? null : widget.id)}
              className={cn(
                'w-full p-4 rounded-lg border text-left transition-all',
                isSelected
                  ? 'bg-purple-950 border-purple-800'
                  : 'bg-secondary border-border hover:border-purple-800 hover:bg-secondary/80'
              )}
            >
              <div className="flex items-start gap-3">
                <div className={cn('p-2 rounded-lg shrink-0', widget.color.split(' ')[1])}>
                  <Icon className={cn('w-5 h-5', widget.color.split(' ')[0])} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground">{widget.name}</span>
                    {widget.recommended && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-900 text-green-400">
                        Recommended
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{widget.description}</p>
                  <div className="flex items-center gap-2 mt-2">
                    {widget.platform.includes('macos') && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground flex items-center gap-1">
                        <Apple className="w-3 h-3" /> macOS
                      </span>
                    )}
                    {widget.platform.includes('windows') && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
                        Windows
                      </span>
                    )}
                    {widget.platform.includes('linux') && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
                        Linux
                      </span>
                    )}
                  </div>
                </div>
                <div className={cn(
                  'w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-1',
                  isSelected ? 'border-purple-500 bg-purple-500' : 'border-muted-foreground/30'
                )}>
                  {isSelected && <Check className="w-3 h-3 text-white" />}
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {/* Installation Panel - Browser Widget */}
      {selectedWidget === 'browser' && (
        <div className="p-4 rounded-lg bg-blue-950 border border-blue-900 space-y-4">
          <div className="flex items-center gap-2 text-blue-400">
            <Globe className="w-4 h-4" />
            <span className="font-medium text-sm">{t('settings.widget.browserSetup')}</span>
          </div>

          <a
            href="/widget"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            {t('settings.widget.openWidgetPage')}
          </a>

          <div className="space-y-3 text-xs text-muted-foreground">
            <div className="flex items-start gap-2">
              <Chrome className="w-4 h-4 mt-0.5 text-blue-400 shrink-0" />
              <div>
                <span className="font-medium text-foreground">Chrome/Edge:</span> Install an "Always on Top" extension, then pin the widget tab.
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Apple className="w-4 h-4 mt-0.5 text-blue-400 shrink-0" />
              <div>
                <span className="font-medium text-foreground">Safari:</span> Right-click the tab → "Enter Picture in Picture" for a floating widget.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Installation Panel - Übersicht Widget */}
      {selectedWidget === 'uebersicht' && (
        <div className="p-4 rounded-lg bg-purple-950 border border-purple-900 space-y-4">
          <div className="flex items-center gap-2 text-purple-400">
            <Smartphone className="w-4 h-4" />
            <span className="font-medium text-sm">{t('settings.widget.ubersichtSetup')}</span>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleDownload}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-medium transition-colors"
            >
              {downloaded ? <Check className="w-4 h-4" /> : <Download className="w-4 h-4" />}
              {downloaded ? t('settings.widget.downloaded') : t('settings.widget.downloadWidget')}
            </button>
            <button
              onClick={handleCopy}
              className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-secondary hover:bg-secondary/80 transition-colors"
              title="Copy widget code"
            >
              {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>

          <div className="space-y-2 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">{t('settings.widget.installSteps')}</p>
            <ol className="list-decimal list-inside space-y-1 pl-1">
              <li>{t('settings.widget.step1')}</li>
              <li>{t('settings.widget.step2', { path: widgetPath })}</li>
              <li>{t('settings.widget.step3')}</li>
              <li>{t('settings.widget.step4')}</li>
            </ol>
          </div>

          <a
            href="https://tracesof.net/uebersicht/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-purple-400 hover:underline"
          >
            {t('settings.widget.getUbersicht')} <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      )}

      {/* Widget Preview */}
      {selectedWidget && (
        <div className="mt-4 p-4 rounded-lg bg-gray-900 border border-border">
          <div className="text-xs text-muted-foreground mb-3">{t('settings.widget.widgetPreview')}</div>
          <div className="flex justify-center">
            <div
              style={{
                backgroundColor: 'rgba(17, 24, 39, 0.95)',
                borderRadius: '12px',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                padding: '12px',
                minWidth: '200px',
                fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
              }}
            >
              {/* Drag handle preview */}
              <div className="text-center mb-2">
                <span className="text-gray-500 text-sm tracking-widest">⋮⋮</span>
              </div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-sm font-semibold text-white">KubeStellar Console</span>
                <span className="ml-auto text-[10px] text-gray-500">↗</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-gray-800/50 rounded-lg p-2 text-center">
                  <div className="text-lg font-bold text-green-400">0</div>
                  <div className="text-[9px] text-gray-400 uppercase">{t('common.offline')}</div>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-2 text-center">
                  <div className="text-lg font-bold text-blue-400">3/3</div>
                  <div className="text-[9px] text-gray-400 uppercase">{t('common.ready')}</div>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-2 text-center">
                  <div className="text-lg font-bold text-green-400">4/8</div>
                  <div className="text-[9px] text-gray-400 uppercase">GPUs</div>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-2 text-center">
                  <div className="text-lg font-bold text-green-400">3</div>
                  <div className="text-[9px] text-gray-400 uppercase">{t('common.total')}</div>
                </div>
              </div>
              <div className="text-center text-[11px] text-green-400 mt-2 pt-2 border-t border-gray-700">
                ✓ All nodes healthy
              </div>
            </div>
          </div>
          <div className="text-center mt-3 text-xs text-muted-foreground">
            {t('settings.widget.previewDesc')}
          </div>
        </div>
      )}

      {/* Collapsed state hint */}
      {!selectedWidget && (
        <p className="text-xs text-center text-muted-foreground mt-2">
          {t('settings.widget.selectWidget')}
        </p>
      )}
    </div>
  )
}
