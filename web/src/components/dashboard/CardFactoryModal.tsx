import { useState, useEffect, useRef, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  X, Plus, Code, Layers, Wand2, Eye, Save, Sparkles,
  AlertTriangle, CheckCircle, Loader2, Trash2 } from 'lucide-react'
import { BaseModal, ConfirmDialog } from '../../lib/modals'
import { cn } from '../../lib/cn'
import { saveDynamicCard, deleteDynamicCard, getAllDynamicCards } from '../../lib/dynamic-cards'
import { compileCardCode, createCardComponent } from '../../lib/dynamic-cards/compiler'
import type {
  DynamicCardDefinition,
  DynamicCardDefinition_T1,
  DynamicCardColumn } from '../../lib/dynamic-cards/types'
import { registerDynamicCardType } from '../cards/cardRegistry'
import { LivePreviewPanel } from './LivePreviewPanel'
import { InlineAIAssist } from './InlineAIAssist'
import { CARD_INLINE_ASSIST_PROMPT, CODE_INLINE_ASSIST_PROMPT } from '../../lib/ai/prompts'
import { generateSampleData } from '../../lib/ai/sampleData'
import { wrapAbbreviations } from '../shared/TechnicalAcronym'
import { T1_TEMPLATES, type T1Template } from './cardFactoryTemplates'
import { TemplateDropdown } from './cardFactoryPreviews'
import { FieldSuggestChips } from './FieldSuggestChips'
import { AiCardTab } from './cardFactoryAiTab'
import {
  validateT1AssistResult,
  validateT2AssistResult,
  type T1AssistResult,
  type T2AssistResult } from './cardFactoryAssistTypes'

interface CardFactoryModalProps {
  isOpen: boolean
  onClose: () => void
  onCardCreated?: (cardId: string) => void
  /** When true, renders content inline without BaseModal wrapper (used by Console Studio) */
  embedded?: boolean
}

type Tab = 'declarative' | 'code' | 'ai' | 'manage'

const SAVE_MESSAGE_TIMEOUT_MS = 3000 // Duration to display save/error messages before auto-clearing
const COPY_FEEDBACK_TIMEOUT_MS = 2000 // Duration to show "copied" feedback before resetting

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

// ============================================================================
// Code Templates
// ============================================================================

interface T2Template {
  name: string
  title: string
  description: string
  width: number
  source: string
}

const T2_TEMPLATES: T2Template[] = [
  {
    name: 'Animated Gauge',
    title: 'Cluster CPU Gauge',
    description: 'Animated circular gauge showing utilization',
    width: 4,
    source: `export default function GaugeCard({ config }) {
  const [value, setValue] = useState(67)
  
  // Gauge dimensions
  const GAUGE_RADIUS = 45
  const GAUGE_CENTER_X = 60
  const GAUGE_CENTER_Y = 60
  const circumference = 2 * Math.PI * GAUGE_RADIUS
  const offset = circumference - (value / 100) * circumference
  
  // Utilization thresholds for color coding
  const HIGH_THRESHOLD = 80  // Red: high utilization
  const MED_THRESHOLD = 60   // Yellow: medium utilization
  const color = value > HIGH_THRESHOLD ? 'text-red-400' : value > MED_THRESHOLD ? 'text-yellow-400' : 'text-green-400'

  return (
    <div className="h-full flex flex-col items-center justify-center gap-3">
      <svg width="120" height="120" className="-rotate-90">
        <circle cx={GAUGE_CENTER_X} cy={GAUGE_CENTER_Y} r={GAUGE_RADIUS} fill="none" strokeWidth="8"
          className="stroke-secondary" />
        <circle cx={GAUGE_CENTER_X} cy={GAUGE_CENTER_Y} r={GAUGE_RADIUS} fill="none" strokeWidth="8"
          strokeLinecap="round"
          className={\`\${color.replace('text-', 'stroke-')} transition-all duration-700\`}
          style={{ strokeDasharray: circumference, strokeDashoffset: offset }} />
      </svg>
      <div className="absolute">
        <p className={\`text-2xl font-bold \${color}\`}>{value}%</p>
      </div>
      <p className="text-xs text-muted-foreground">Average CPU Usage</p>
    </div>
  )
}` },
  {
    name: 'Status Heatmap',
    title: 'Cluster Status Heatmap',
    description: 'Grid heatmap of cluster health',
    width: 6,
    source: `export default function HeatmapCard({ config }) {
  const clusters = [
    { name: 'us-east-1', health: 98 }, { name: 'eu-west-1', health: 85 },
    { name: 'ap-south-1', health: 45 }, { name: 'us-west-2', health: 100 },
    { name: 'eu-central-1', health: 72 }, { name: 'ap-east-1', health: 91 },
  ]
  
  // Health thresholds for color coding
  const HEALTHY_THRESHOLD = 90  // Green: healthy
  const WARNING_THRESHOLD = 70  // Yellow: warning, Red: critical
  const getColor = (h) => h >= HEALTHY_THRESHOLD ? 'bg-green-500/30' : h >= WARNING_THRESHOLD ? 'bg-yellow-500/30' : 'bg-red-500/30'
  const getTextColor = (h) => h >= HEALTHY_THRESHOLD ? 'text-green-400' : h >= WARNING_THRESHOLD ? 'text-yellow-400' : 'text-red-400'

  return (
    <div className="h-full flex flex-col p-1">
      <div className="flex items-center gap-2 mb-3">
        <Globe className="w-4 h-4 text-purple-400" />
        <span className="text-sm font-medium text-foreground">Cluster Health</span>
      </div>
      <div className="grid grid-cols-3 gap-2 flex-1">
        {clusters.map(c => (
          <div key={c.name} className={\`rounded-lg \${getColor(c.health)} p-3 flex flex-col items-center justify-center\`}>
            <span className={\`text-xl font-bold \${getTextColor(c.health)}\`}>{c.health}%</span>
            <span className="text-xs text-muted-foreground mt-1">{c.name}</span>
          </div>
        ))}
      </div>
    </div>
  )
}` },
  {
    name: 'Live Counter',
    title: 'Live Resource Counter',
    description: 'Animated counters for resource types',
    width: 4,
    source: `export default function CounterCard({ config }) {
  const [counts] = useState({ pods: 142, deployments: 38, services: 24, nodes: 12 })
  const items = [
    { label: 'Pods', count: counts.pods, icon: Box, color: 'text-blue-400' },
    { label: 'Deploys', count: counts.deployments, icon: Layers, color: 'text-purple-400' },
    { label: 'Services', count: counts.services, icon: Globe, color: 'text-cyan-400' },
    { label: 'Nodes', count: counts.nodes, icon: Server, color: 'text-green-400' },
  ]

  return (
    <div className="h-full flex flex-col gap-2 p-1">
      {items.map(item => (
        <div key={item.label} className="flex items-center gap-3 rounded-lg bg-secondary/30 px-3 py-2">
          <item.icon className={\`w-4 h-4 \${item.color} shrink-0\`} />
          <span className="text-xs text-muted-foreground flex-1">{item.label}</span>
          <span className={\`text-lg font-bold \${item.color}\`}>{item.count}</span>
        </div>
      ))}
    </div>
  )
}` },
  {
    name: 'Donut Chart',
    title: 'Resource Distribution',
    description: 'Donut chart showing distribution',
    width: 4,
    source: `export default function DonutCard({ config }) {
  const data = [
    { label: 'Running', value: 72, color: 'var(--color-success)' },
    { label: 'Pending', value: 15, color: 'var(--color-pending)' },
    { label: 'Failed', value: 8, color: 'var(--color-error)' },
    { label: 'Unknown', value: 5, color: 'var(--color-neutral)' },
  ]
  const total = data.reduce((s, d) => s + d.value, 0)
  
  // Donut chart dimensions
  const DONUT_RADIUS = 40
  const DONUT_CENTER_X = 60
  const DONUT_CENTER_Y = 60
  let cumulative = 0

  return (
    <div className="h-full flex flex-col items-center justify-center gap-2">
      <svg width="120" height="120" viewBox="0 0 120 120">
        {data.map((d, i) => {
          const pct = d.value / total
          const dashArray = 2 * Math.PI * DONUT_RADIUS
          const dashOffset = dashArray * (1 - pct)
          const rotation = cumulative * 360 - 90
          cumulative += pct
          return (
            <circle key={i} cx={DONUT_CENTER_X} cy={DONUT_CENTER_Y} r={DONUT_RADIUS} fill="none" strokeWidth="16"
              stroke={d.color} strokeDasharray={dashArray} strokeDashoffset={dashOffset}
              transform={\`rotate(\${rotation} \${DONUT_CENTER_X} \${DONUT_CENTER_Y})\`} />
          )
        })}
        <text x={DONUT_CENTER_X} y={DONUT_CENTER_Y} textAnchor="middle" dy="0.35em" className="fill-foreground text-lg font-bold">{total}</text>
      </svg>
      <div className="flex gap-3">
        {data.map(d => (
          <div key={d.label} className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full" style={{ background: d.color }} />
            <span className="text-xs text-muted-foreground">{d.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}` },
  {
    name: 'Activity Timeline',
    title: 'Recent Events',
    description: 'Timeline of recent cluster events',
    width: 6,
    source: `export default function TimelineCard({ config }) {
  const events = [
    { time: '2m ago', msg: 'Pod api-server-1 restarted', type: 'warning' },
    { time: '5m ago', msg: 'Deployment worker-pool scaled to 5', type: 'info' },
    { time: '12m ago', msg: 'Node worker-3 joined cluster', type: 'success' },
    { time: '1h ago', msg: 'Certificate renewed for ingress', type: 'info' },
    { time: '3h ago', msg: 'PVC storage-1 bound successfully', type: 'success' },
  ]
  const colors = { warning: 'bg-yellow-400', info: 'bg-blue-400', success: 'bg-green-400' }

  return (
    <div className="h-full flex flex-col p-1">
      <div className="flex items-center gap-2 mb-3">
        <Activity className="w-4 h-4 text-purple-400" />
        <span className="text-sm font-medium text-foreground">Recent Events</span>
      </div>
      <div className="flex-1 overflow-y-auto space-y-0">
        {events.map((e, i) => (
          <div key={i} className="flex gap-3 py-1.5">
            <div className="flex flex-col items-center">
              <div className={\`w-2 h-2 rounded-full \${colors[e.type]} shrink-0 mt-1.5\`} />
              {i < events.length - 1 && <div className="w-px flex-1 bg-border/50" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-foreground truncate">{e.msg}</p>
              <p className="text-xs text-muted-foreground">{e.time}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}` },
  {
    name: 'Auto-Refresh Timer',
    title: 'Live Refresh Demo',
    description: 'Demonstrates setInterval for periodic data refresh',
    width: 4,
    source: `export default function TimerCard({ config }) {
  const [tick, setTick] = useState(0)
  const [items, setItems] = useState([
    { id: 1, name: 'api-gateway', latency: 42 },
    { id: 2, name: 'auth-service', latency: 18 },
    { id: 3, name: 'data-pipeline', latency: 95 },
    { id: 4, name: 'cache-layer', latency: 7 },
  ])

  // Refresh interval in ms — setInterval is safe in the Card Factory sandbox.
  // The sandbox clamps intervals to a 1-second minimum and auto-cleans on unmount.
  const REFRESH_MS = 3000

  useEffect(() => {
    const timer = setInterval(() => {
      setTick(t => t + 1)
      setItems(prev => prev.map(item => ({
        ...item,
        latency: Math.max(1, item.latency + Math.floor(Math.random() * 21) - 10) })))
    }, REFRESH_MS)
    return () => clearInterval(timer)
  }, [])

  const WARN_THRESHOLD = 50
  const HIGH_THRESHOLD = 80

  return (
    <div className="h-full flex flex-col p-1">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Timer className="w-4 h-4 text-purple-400" />
          <span className="text-sm font-medium text-foreground">Service Latency</span>
        </div>
        <span className="text-xs text-muted-foreground">tick #{tick}</span>
      </div>
      <div className="flex-1 space-y-2">
        {items.map(item => {
          const color = item.latency > HIGH_THRESHOLD ? 'text-red-400' : item.latency > WARN_THRESHOLD ? 'text-yellow-400' : 'text-green-400'
          const barColor = item.latency > HIGH_THRESHOLD ? 'bg-red-400/30' : item.latency > WARN_THRESHOLD ? 'bg-yellow-400/30' : 'bg-green-400/30'
          const BAR_MAX = 120
          const barWidth = Math.min(100, (item.latency / BAR_MAX) * 100)
          return (
            <div key={item.id} className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground w-24 truncate">{item.name}</span>
              <div className="flex-1 h-4 bg-secondary/30 rounded-full overflow-hidden">
                <div className={\`h-full \${barColor} rounded-full transition-all duration-500\`} style={{ width: \`\${barWidth}%\` }} />
              </div>
              <span className={\`text-xs font-mono w-10 text-right \${color}\`}>{item.latency}ms</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}` },
  {
    name: 'Image from URL',
    title: 'Image Viewer',
    description: 'Display and auto-refresh an image from any URL or API endpoint',
    width: 6,
    source: `export default function ImageCard({ config }) {
  const [url, setUrl] = useState(config?.url || '')
  const [editUrl, setEditUrl] = useState('')
  const [editing, setEditing] = useState(!config?.url)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  // Auto-refresh interval (0 = disabled). Sandbox clamps to 1s minimum.
  const REFRESH_INTERVAL_MS = config?.refreshMs || 0

  useEffect(() => {
    if (REFRESH_INTERVAL_MS > 0 && url) {
      const timer = setInterval(() => setRefreshKey(k => k + 1), REFRESH_INTERVAL_MS)
      return () => clearInterval(timer)
    }
  }, [REFRESH_INTERVAL_MS, url])

  const handleSet = () => {
    if (editUrl.trim()) {
      setUrl(editUrl.trim())
      setEditing(false)
      setError(null)
      setLoading(true)
    }
  }

  if (editing || !url) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 p-4">
        <Image className="w-8 h-8 text-purple-400/70" />
        <p className="text-xs text-muted-foreground text-center">Enter an image URL or API endpoint</p>
        <div className="flex gap-2 w-full max-w-sm">
          <input
            type="text"
            value={editUrl}
            onChange={e => setEditUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSet()}
            placeholder="https://example.com/image.png"
            className="flex-1 text-xs px-2 py-1.5 rounded bg-secondary text-foreground"
          />
          <button onClick={handleSet} className="text-xs px-3 py-1.5 rounded bg-purple-500/20 text-purple-400 hover:bg-purple-500/30">
            Load
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col p-2">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Image className="w-3.5 h-3.5 text-purple-400" />
          <span className="text-xs text-muted-foreground truncate max-w-[200px]">{url}</span>
        </div>
        <div className="flex gap-1">
          <button onClick={() => { setLoading(true); setRefreshKey(k => k + 1) }} className="min-h-11 min-w-11 flex items-center justify-center rounded hover:bg-secondary/50" title="Refresh">
            <RefreshCw className={cn('w-3 h-3 text-muted-foreground', loading && 'animate-spin')} />
          </button>
          <button onClick={() => { setEditing(true); setEditUrl(url) }} className="min-h-11 min-w-11 flex items-center justify-center rounded hover:bg-secondary/50" title="Change URL">
            <Settings className="w-3 h-3 text-muted-foreground" />
          </button>
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center overflow-auto rounded bg-secondary/10">
        {error ? (
          <div className="flex flex-col items-center gap-2 p-4">
            <AlertTriangle className="w-5 h-5 text-red-400" />
            <p className="text-xs text-red-400">Failed to load image</p>
            <button onClick={() => { setError(null); setLoading(true); setRefreshKey(k => k + 1) }}
              className="min-h-11 min-w-11 flex items-center justify-center text-xs text-purple-400 hover:underline">{t('common.retry')}</button>
          </div>
        ) : (
          <>
            {loading && <Loader2 className="w-5 h-5 text-purple-400 animate-spin absolute" />}
            <img
              key={refreshKey}
              src={url + (url.includes('?') ? '&' : '?') + '_t=' + Date.now()}
              alt="Card image"
              className="max-w-full max-h-full object-contain"
              onLoad={() => setLoading(false)}
              onError={() => { setError(true); setLoading(false) }}
            />
          </>
        )}
      </div>
    </div>
  )
}` },
  {
    name: 'Port Forward Tracker',
    title: 'Port Forwards',
    description: 'Track and manage kubectl port-forward sessions',
    width: 6,
    source: `export default function PortForwardCard({ config }) {
  const STORAGE_KEY = 'kc-port-forwards'
  const [forwards, setForwards] = useState(() => {
    try {
      const saved = window?.localStorage?.getItem?.(STORAGE_KEY)
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ namespace: 'default', resource: '', localPort: '', remotePort: '', protocol: 'TCP' })
  const [copied, setCopied] = useState(null)

  // Persist forwards
  useEffect(() => {
    try { window?.localStorage?.setItem?.(STORAGE_KEY, JSON.stringify(forwards)) } catch {}
  }, [forwards])

  const addForward = () => {
    if (!form.resource || !form.localPort || !form.remotePort) return
    setForwards(prev => [...prev, {
      id: Date.now(),
      ...form,
      active: true,
      addedAt: new Date().toLocaleString() }])
    setForm({ namespace: 'default', resource: '', localPort: '', remotePort: '', protocol: 'TCP' })
    setAdding(false)
  }

  const toggleActive = (id) => {
    setForwards(prev => prev.map(f => f.id === id ? { ...f, active: !f.active } : f))
  }

  const removeForward = (id) => {
    setForwards(prev => prev.filter(f => f.id !== id))
  }

  const getCommand = (f) =>
    \`kubectl port-forward -n \${f.namespace} \${f.resource} \${f.localPort}:\${f.remotePort}\`

  const copyCommand = (f) => {
    // #6229: catch the dropped Promise so a failed write (clipboard
    // permission denied, blocked iframe, etc.) doesn't surface as an
    // unhandled rejection in the generated card. The optional chain
    // already guards undefined.
    navigator?.clipboard?.writeText?.(getCommand(f))?.catch?.(() => {})
    setCopied(f.id)
    setTimeout(() => setCopied(null), ${COPY_FEEDBACK_TIMEOUT_MS})
  }

  return (
    <div className="h-full flex flex-col p-1">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Cable className="w-4 h-4 text-purple-400" />
          <span className="text-sm font-medium text-foreground">Port Forwards</span>
          <span className="text-xs px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground">
            {forwards.filter(f => f.active).length} active
          </span>
        </div>
        <button onClick={() => setAdding(!adding)}
          className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-purple-500/20 text-purple-400 hover:bg-purple-500/30">
          {adding ? <X className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
          {adding ? 'Cancel' : 'Add'}
        </button>
      </div>

      {adding && (
        <div className="grid grid-cols-2 gap-2 mb-3 p-2 rounded bg-secondary/20 border border-border/50">
          <input placeholder="Namespace" value={form.namespace}
            onChange={e => setForm(p => ({...p, namespace: e.target.value}))}
            className="text-xs px-2 py-1 rounded bg-secondary text-foreground" />
          <input placeholder="pod/name or svc/name" value={form.resource}
            onChange={e => setForm(p => ({...p, resource: e.target.value}))}
            className="text-xs px-2 py-1 rounded bg-secondary text-foreground" />
          <input placeholder="Local port" value={form.localPort} type="number"
            onChange={e => setForm(p => ({...p, localPort: e.target.value}))}
            className="text-xs px-2 py-1 rounded bg-secondary text-foreground" />
          <input placeholder="Remote port" value={form.remotePort} type="number"
            onChange={e => setForm(p => ({...p, remotePort: e.target.value}))}
            className="text-xs px-2 py-1 rounded bg-secondary text-foreground" />
          <button onClick={addForward}
            className="col-span-2 text-xs py-1.5 rounded bg-purple-500/20 text-purple-400 hover:bg-purple-500/30">
            Add Port Forward
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto space-y-1.5">
        {forwards.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-2 text-muted-foreground">
            <Cable className="w-6 h-6 opacity-30" />
            <p className="text-xs">No port forwards configured</p>
            <p className="text-xs">Click Add to track a kubectl port-forward session</p>
          </div>
        ) : forwards.map(f => (
          <div key={f.id} className={\`flex items-center gap-2 px-2 py-1.5 rounded \${f.active ? 'bg-green-500/10 border border-green-500/20' : 'bg-secondary/20 border border-border/30'}\`}>
            <button onClick={() => toggleActive(f.id)} title={f.active ? 'Mark inactive' : 'Mark active'}>
              {f.active
                ? <CircleDot className="w-3.5 h-3.5 text-green-400" />
                : <Circle className="w-3.5 h-3.5 text-muted-foreground" />}
            </button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium text-foreground truncate">{f.resource}</span>
                <span className="text-xs text-muted-foreground">({f.namespace})</span>
              </div>
              <span className="text-xs text-muted-foreground font-mono">
                :{f.localPort} → :{f.remotePort}
              </span>
            </div>
            <button onClick={() => copyCommand(f)} title="Copy kubectl command"
              className="p-1 rounded hover:bg-secondary/50">
              {copied === f.id
                ? <Check className="w-3 h-3 text-green-400" />
                : <Copy className="w-3 h-3 text-muted-foreground" />}
            </button>
            <button onClick={() => removeForward(f.id)} title="Remove"
              className="p-1 rounded hover:bg-secondary/50">
              <Trash2 className="w-3 h-3 text-muted-foreground hover:text-red-400" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}` },
]

// ============================================================================
// Main Component
// ============================================================================

export function CardFactoryModal({ isOpen, onClose, onCardCreated, embedded = false }: CardFactoryModalProps) {
  const { t } = useTranslation()
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
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  // Track timeouts for cleanup
  const timeoutsRef = useRef<number[]>([])

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      timeoutsRef.current.forEach(clearTimeout)
      timeoutsRef.current = []
    }
  }, [])

  // Refresh existing cards list when switching to manage tab
  const handleTabChange = (newTab: Tab) => {
    setTab(newTab)
    if (newTab === 'manage') {
      setExistingCards(getAllDynamicCards())
    }
  }

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

  // Save Tier 1 card
  const handleSaveT1 = () => {
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
      defaultLimit: 5 }

    const def: DynamicCardDefinition = {
      id,
      title: t1Title.trim(),
      tier: 'tier1',
      description: t1Description.trim() || undefined,
      defaultWidth: t1Width,
      createdAt: now,
      updatedAt: now,
      cardDefinition: cardDef }

    saveDynamicCard(def)
    registerDynamicCardType(id, t1Width)
    setSaving(false)
    setSaveMessage(`Card "${def.title}" created!`)
    onCardCreated?.(id)

    // Reset
    const saveMessageTimeoutId = window.setTimeout(() => setSaveMessage(null), SAVE_MESSAGE_TIMEOUT_MS)
    timeoutsRef.current.push(saveMessageTimeoutId)
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
    setSaveMessage(`Card "${def.title}" created!`)
    onCardCreated?.(id)

    const tier2SaveTimeoutId = window.setTimeout(() => setSaveMessage(null), SAVE_MESSAGE_TIMEOUT_MS)
    timeoutsRef.current.push(tier2SaveTimeoutId)
  }

  // Delete a card
  const handleDelete = (id: string) => {
    deleteDynamicCard(id)
    setExistingCards(getAllDynamicCards())
  }

  // Add column (Tier 1)
  const addColumn = () => {
    setT1Columns(prev => [...prev, { field: '', label: '' }])
  }

  const addColumnDef = (col: DynamicCardColumn) => {
    setT1Columns(prev => [...prev, col])
  }

  const updateColumn = (idx: number, field: keyof DynamicCardColumn, value: string) => {
    setT1Columns(prev => prev.map((col, i) => i === idx ? { ...col, [field]: value } : col))
  }

  const removeColumn = (idx: number) => {
    setT1Columns(prev => prev.filter((_, i) => i !== idx))
  }

  // Apply T1 template
  const applyT1Template = (tpl: T1Template) => {
    setT1Title(tpl.title)
    setT1Description(tpl.description)
    setT1Layout(tpl.layout)
    setT1Width(tpl.width)
    setT1Columns(tpl.columns)
    setT1DataJson(JSON.stringify(tpl.data, null, 2))
  }

  // Apply T2 template
  const applyT2Template = (tpl: T2Template) => {
    setT2Title(tpl.title)
    setT2Description(tpl.description)
    setT2Width(tpl.width)
    setT2Source(tpl.source)
    setCompileStatus('idle')
  }

  // Handle inline AI assist result for T1
  const handleT1AssistResult = (result: T1AssistResult) => {
    if (result.title) setT1Title(result.title)
    if (result.description) setT1Description(result.description)
    if (result.layout) setT1Layout(result.layout)
    if (result.width) setT1Width(result.width)
    if (result.columns) setT1Columns(result.columns)
    if (result.data) setT1DataJson(JSON.stringify(result.data, null, 2))
  }

  // Handle inline AI assist result for T2
  const handleT2AssistResult = (result: T2AssistResult) => {
    if (result.title) setT2Title(result.title)
    if (result.description) setT2Description(result.description)
    if (result.width) setT2Width(result.width)
    if (result.sourceCode) { setT2Source(result.sourceCode); setCompileStatus('idle') }
  }

  // Compute T1 preview data (use sample data if user data is empty/invalid)
  const t1PreviewData = useMemo(() => {
    try {
      const parsed = JSON.parse(t1DataJson)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    } catch { /* use sample */ }
    return generateSampleData(t1Columns)
  }, [t1DataJson, t1Columns])

  // Existing field set for chip filtering
  const existingFieldSet = new Set(t1Columns.map(c => c.field))

  // Shared content for both modal and embedded modes
  const factoryContent = (
      <div className="flex flex-col">
        {/* Tabs */}
        <div
          role="tablist"
          className="flex items-center gap-1 border-b border-border pb-2 mb-4"
          onKeyDown={(e) => {
            const tabIds: Tab[] = ['declarative', 'code', 'ai', 'manage']
            const idx = tabIds.indexOf(tab)
            if (e.key === 'ArrowRight') handleTabChange(tabIds[Math.min(idx + 1, tabIds.length - 1)])
            else if (e.key === 'ArrowLeft') handleTabChange(tabIds[Math.max(idx - 1, 0)])
          }}
        >
          {[
            { id: 'declarative' as Tab, label: t('dashboard.cardFactory.declarativeTab'), icon: Layers },
            { id: 'code' as Tab, label: t('dashboard.cardFactory.customCodeTab'), icon: Code },
            { id: 'ai' as Tab, label: t('dashboard.cardFactory.aiCreateTab'), icon: Sparkles },
            { id: 'manage' as Tab, label: t('dashboard.cardFactory.manageTab'), icon: Wand2 },
          ].map(t => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              tabIndex={tab === t.id ? 0 : -1}
              onClick={() => handleTabChange(t.id)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                tab === t.id
                  ? 'bg-purple-500/20 text-purple-400'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary',
              )}
            >
              {/* Icon removed for cleaner look */}
              {t.label}
            </button>
          ))}
        </div>

        {/* Save feedback */}
        {saveMessage && (
          <div className="mb-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-green-500/10 border border-green-500/20">
            <CheckCircle className="w-4 h-4 text-green-400 shrink-0" />
            <span className="text-sm text-green-400">{saveMessage}</span>
          </div>
        )}

        {/* Tab content */}
        <div className="flex-1">
          {/* Declarative (Tier 1) — split pane */}
          {tab === 'declarative' && (
            <div className="flex gap-0 min-h-[400px]">
              {/* Left: Form */}
              <div className="flex-1 min-w-0 overflow-y-auto pr-2 space-y-4">
                {/* AI Assist bar */}
                <InlineAIAssist<T1AssistResult>
                  systemPrompt={CARD_INLINE_ASSIST_PROMPT}
                  placeholder="e.g., Show pod health as a table with name, namespace, status"
                  onResult={handleT1AssistResult}
                  validateResult={validateT1AssistResult}
                />

                {/* Template dropdown */}
                <TemplateDropdown
                  templates={T1_TEMPLATES}
                  onSelect={applyT1Template}
                  label={t('dashboard.cardFactory.declarativeTemplates')}
                />

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">{t('dashboard.cardFactory.titleRequired')}</label>
                    <input
                      type="text"
                      value={t1Title}
                      onChange={e => setT1Title(e.target.value)}
                      placeholder={t('dashboard.cardFactory.titlePlaceholder')}
                      className="w-full text-sm px-3 py-2 rounded-lg bg-secondary text-foreground focus:outline-none focus:ring-1 focus:ring-inset focus:ring-purple-500/50"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">{t('dashboard.cardFactory.widthLabel')}</label>
                    <select
                      value={t1Width}
                      onChange={e => setT1Width(Number(e.target.value))}
                      className="w-full text-sm px-3 py-2 rounded-lg bg-secondary text-foreground focus:outline-none focus:ring-1 focus:ring-inset focus:ring-purple-500/50"
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
                    value={t1Description}
                    onChange={e => setT1Description(e.target.value)}
                    placeholder={t('dashboard.cardFactory.descPlaceholder')}
                    className="w-full text-sm px-3 py-2 rounded-lg bg-secondary text-foreground focus:outline-none focus:ring-1 focus:ring-inset focus:ring-purple-500/50"
                  />
                </div>

                <div>
                  <label className="text-xs text-muted-foreground block mb-1">{t('dashboard.cardFactory.layoutLabel')}</label>
                  <div className="flex gap-2">
                    {(['list', 'stats', 'stats-and-list'] as const).map(l => (
                      <button
                        key={l}
                        onClick={() => setT1Layout(l)}
                        className={cn(
                          'px-3 py-1.5 rounded-lg text-xs transition-colors',
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
                    <label className="text-xs text-muted-foreground">{t('dashboard.cardFactory.columnsLabel')}</label>
                    <button
                      onClick={addColumn}
                      className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Plus className="w-3 h-3" />
                      {t('dashboard.cardFactory.addColumn')}
                    </button>
                  </div>
                  <div className="space-y-2">
                    {t1Columns.map((col, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={col.field}
                          onChange={e => updateColumn(idx, 'field', e.target.value)}
                          placeholder={t('dashboard.cardFactory.fieldPlaceholder')}
                          className="flex-1 text-xs px-2 py-1.5 rounded-lg bg-secondary text-foreground focus:outline-none focus:ring-1 focus:ring-inset focus:ring-purple-500/50"
                        />
                        <input
                          type="text"
                          value={col.label}
                          onChange={e => updateColumn(idx, 'label', e.target.value)}
                          placeholder={t('dashboard.cardFactory.labelPlaceholder')}
                          className="flex-1 text-xs px-2 py-1.5 rounded-lg bg-secondary text-foreground focus:outline-none focus:ring-1 focus:ring-inset focus:ring-purple-500/50"
                        />
                        <select
                          value={col.format || 'text'}
                          onChange={e => updateColumn(idx, 'format', e.target.value)}
                          className="w-20 text-xs px-2 py-1.5 rounded-lg bg-secondary text-foreground focus:outline-none"
                        >
                          <option value="text">{t('cardFactory.formatText')}</option>
                          <option value="badge">{t('cardFactory.formatBadge')}</option>
                          <option value="number">{t('cardFactory.formatNumber')}</option>
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
                  {/* Field auto-suggest chips */}
                  <div className="mt-2">
                    <FieldSuggestChips
                      dataJson={t1DataJson}
                      existingFields={existingFieldSet}
                      onAddColumn={addColumnDef}
                    />
                  </div>
                </div>

                {/* Static data JSON */}
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">{t('dashboard.cardFactory.dataLabel')}</label>
                  <textarea
                    value={t1DataJson}
                    onChange={e => setT1DataJson(e.target.value)}
                    rows={6}
                    className="w-full text-xs px-3 py-2 rounded-lg bg-secondary text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-inset focus:ring-purple-500/50"
                  />
                </div>

                {/* Save button */}
                <button
                  onClick={handleSaveT1}
                  disabled={!t1Title.trim()}
                  className={cn(
                    'w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors',
                    t1Title.trim()
                      ? 'bg-purple-500/20 text-purple-400 hover:bg-purple-500/30'
                      : 'bg-secondary text-muted-foreground cursor-not-allowed',
                  )}
                >
                  <Save className="w-4 h-4" />
                  {t('dashboard.cardFactory.createCard')}
                </button>
              </div>

              {/* Right: Live Preview */}
              <LivePreviewPanel
                tier="tier1"
                t1Config={{
                  layout: t1Layout,
                  columns: t1Columns,
                  staticData: t1PreviewData }}
                title={t1Title || t('dashboard.cardFactory.untitledCard')}
                width={t1Width}
              />
            </div>
          )}

          {/* Code (Tier 2) — split pane */}
          {tab === 'code' && (
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
                      className="w-full text-sm px-3 py-2 rounded-lg bg-secondary text-foreground focus:outline-none focus:ring-1 focus:ring-inset focus:ring-purple-500/50"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">{t('dashboard.cardFactory.widthLabel')}</label>
                    <select
                      value={t2Width}
                      onChange={e => setT2Width(Number(e.target.value))}
                      className="w-full text-sm px-3 py-2 rounded-lg bg-secondary text-foreground focus:outline-none focus:ring-1 focus:ring-inset focus:ring-purple-500/50"
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
                    className="w-full text-sm px-3 py-2 rounded-lg bg-secondary text-foreground focus:outline-none focus:ring-1 focus:ring-inset focus:ring-purple-500/50"
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
                    className="w-full text-xs px-3 py-2 rounded-lg bg-secondary text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-inset focus:ring-purple-500/50 leading-relaxed"
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
          )}

          {/* AI Create */}
          {tab === 'ai' && (
            <AiCardTab
              onCardCreated={(id) => {
                setSaveMessage('Card created with AI!')
                onCardCreated?.(id)
                const aiCreateTimeoutId = window.setTimeout(() => setSaveMessage(null), SAVE_MESSAGE_TIMEOUT_MS)
                timeoutsRef.current.push(aiCreateTimeoutId)
              }}
            />
          )}

          {/* Manage */}
          {tab === 'manage' && (
            <div className="space-y-3">
              {existingCards.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Wand2 className="w-8 h-8 text-muted-foreground/40 mb-2" />
                  <p className="text-sm text-muted-foreground">{t('dashboard.cardFactory.noCustomCards')}</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">
                    {t('dashboard.cardFactory.useDeclarativeOrCode')}
                  </p>
                </div>
              ) : (
                existingCards.map(card => (
                  <div key={card.id} className="rounded-lg bg-card/50 border border-border p-3 flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground">{wrapAbbreviations(card.title)}</span>
                        <span className={cn(
                          'text-xs px-1.5 py-0.5 rounded',
                          card.tier === 'tier1' ? 'bg-blue-500/20 text-blue-400' : 'bg-purple-500/20 text-purple-400',
                        )}>
                          {card.tier === 'tier1' ? t('dashboard.cardFactory.declarativeBadge') : t('dashboard.cardFactory.customCodeBadge')}
                        </span>
                      </div>
                      {card.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">{wrapAbbreviations(card.description)}</p>
                      )}
                      <p className="text-xs text-muted-foreground/70 mt-1">
                        ID: {card.id} · Created: {new Date(card.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <button
                      onClick={() => setDeleteConfirmId(card.id)}
                      className="p-1.5 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-400 transition-colors shrink-0"
                      title={t('dashboard.cardFactory.deleteCard')}
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
  )

  const confirmDialog = (
    <ConfirmDialog
      isOpen={deleteConfirmId !== null}
      onClose={() => setDeleteConfirmId(null)}
      onConfirm={() => {
        if (deleteConfirmId) {
          handleDelete(deleteConfirmId)
          setDeleteConfirmId(null)
        }
      }}
      title={t('dashboard.cardFactory.deleteCard')}
      message={t('dashboard.delete.warning')}
      confirmLabel={t('actions.delete')}
      cancelLabel={t('actions.cancel')}
      variant="danger"
    />
  )

  // Embedded mode: render content inline within Console Studio
  if (embedded) {
    return (
      <div className="h-full flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4">
          {factoryContent}
        </div>
        {confirmDialog}
      </div>
    )
  }

  // Standard modal mode
  return (
    <BaseModal isOpen={isOpen} onClose={onClose} size="xl" closeOnBackdrop={false}>
      <BaseModal.Header title={t('dashboard.cardFactory.title')} icon={Wand2} onClose={onClose} showBack={false} />
      <BaseModal.Content className="max-h-[70vh]">
        {factoryContent}
      </BaseModal.Content>
      {confirmDialog}
    </BaseModal>
  )
}
