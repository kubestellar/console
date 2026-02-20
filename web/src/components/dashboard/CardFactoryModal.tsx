import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  X, Plus, Code, Layers, Wand2, Eye, Save, Sparkles,
  AlertTriangle, CheckCircle, Loader2, Trash2, LayoutTemplate,
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
import { AiGenerationPanel } from './AiGenerationPanel'
import { LivePreviewPanel } from './LivePreviewPanel'
import { InlineAIAssist } from './InlineAIAssist'
import { CARD_T1_SYSTEM_PROMPT, CARD_T2_SYSTEM_PROMPT, CARD_INLINE_ASSIST_PROMPT, CODE_INLINE_ASSIST_PROMPT } from '../../lib/ai/prompts'
import { generateSampleData, detectFieldFormat } from '../../lib/ai/sampleData'
import { useAIMode } from '../../hooks/useAIMode'

interface CardFactoryModalProps {
  isOpen: boolean
  onClose: () => void
  onCardCreated?: (cardId: string) => void
}

type Tab = 'declarative' | 'code' | 'ai' | 'manage'

const SAVE_MESSAGE_TIMEOUT_MS = 3000 // Duration to display save/error messages before auto-clearing

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

// ============================================================================
// Declarative Templates
// ============================================================================

interface T1Template {
  name: string
  title: string
  description: string
  layout: 'list' | 'stats' | 'stats-and-list'
  width: number
  columns: DynamicCardColumn[]
  data: Record<string, unknown>[]
}

const T1_TEMPLATES: T1Template[] = [
  {
    name: 'Pod Status',
    title: 'Pod Status',
    description: 'Pod health across clusters',
    layout: 'list',
    width: 6,
    columns: [
      { field: 'name', label: 'Pod Name' },
      { field: 'namespace', label: 'Namespace' },
      { field: 'status', label: 'Status', format: 'badge', badgeColors: { Running: 'bg-green-500/20 text-green-400', Pending: 'bg-yellow-500/20 text-yellow-400', Failed: 'bg-red-500/20 text-red-400' } },
      { field: 'restarts', label: 'Restarts', format: 'number' },
    ],
    data: [
      { name: 'api-server-1', namespace: 'default', status: 'Running', restarts: 0 },
      { name: 'worker-2', namespace: 'production', status: 'Running', restarts: 2 },
      { name: 'cache-1', namespace: 'default', status: 'Pending', restarts: 0 },
      { name: 'scheduler-3', namespace: 'kube-system', status: 'Running', restarts: 1 },
      { name: 'ingress-5', namespace: 'ingress-nginx', status: 'Failed', restarts: 8 },
    ],
  },
  {
    name: 'Deployment Health',
    title: 'Deployment Health',
    description: 'Deployment status and readiness',
    layout: 'list',
    width: 6,
    columns: [
      { field: 'name', label: 'Deployment' },
      { field: 'replicas', label: 'Replicas', format: 'number' },
      { field: 'available', label: 'Available', format: 'number' },
      { field: 'status', label: 'Status', format: 'badge', badgeColors: { Healthy: 'bg-green-500/20 text-green-400', Degraded: 'bg-yellow-500/20 text-yellow-400', Critical: 'bg-red-500/20 text-red-400' } },
    ],
    data: [
      { name: 'api-gateway', replicas: 3, available: 3, status: 'Healthy' },
      { name: 'auth-service', replicas: 2, available: 2, status: 'Healthy' },
      { name: 'worker-pool', replicas: 5, available: 3, status: 'Degraded' },
      { name: 'cache-layer', replicas: 2, available: 0, status: 'Critical' },
    ],
  },
  {
    name: 'Node Resources',
    title: 'Node Resources',
    description: 'Node CPU and memory utilization',
    layout: 'list',
    width: 8,
    columns: [
      { field: 'node', label: 'Node' },
      { field: 'cpu', label: 'CPU' },
      { field: 'memory', label: 'Memory' },
      { field: 'status', label: 'Status', format: 'badge', badgeColors: { Ready: 'bg-green-500/20 text-green-400', NotReady: 'bg-red-500/20 text-red-400' } },
    ],
    data: [
      { node: 'worker-1', cpu: '45%', memory: '3.2Gi / 8Gi', status: 'Ready' },
      { node: 'worker-2', cpu: '72%', memory: '5.8Gi / 8Gi', status: 'Ready' },
      { node: 'worker-3', cpu: '18%', memory: '1.1Gi / 4Gi', status: 'Ready' },
      { node: 'control-1', cpu: '31%', memory: '2.4Gi / 16Gi', status: 'Ready' },
    ],
  },
  {
    name: 'Service Status',
    title: 'Service Status',
    description: 'Kubernetes services and their endpoints',
    layout: 'list',
    width: 6,
    columns: [
      { field: 'name', label: 'Service' },
      { field: 'type', label: 'Type', format: 'badge', badgeColors: { ClusterIP: 'bg-blue-500/20 text-blue-400', LoadBalancer: 'bg-purple-500/20 text-purple-400', NodePort: 'bg-cyan-500/20 text-cyan-400' } },
      { field: 'port', label: 'Port', format: 'number' },
      { field: 'namespace', label: 'Namespace' },
    ],
    data: [
      { name: 'api-gateway', type: 'LoadBalancer', port: 443, namespace: 'default' },
      { name: 'auth-service', type: 'ClusterIP', port: 8080, namespace: 'default' },
      { name: 'monitoring', type: 'NodePort', port: 9090, namespace: 'monitoring' },
    ],
  },
  {
    name: 'Namespace Summary',
    title: 'Namespace Summary',
    description: 'Resource counts per namespace',
    layout: 'stats-and-list',
    width: 8,
    columns: [
      { field: 'namespace', label: 'Namespace' },
      { field: 'pods', label: 'Pods', format: 'number' },
      { field: 'deployments', label: 'Deployments', format: 'number' },
      { field: 'services', label: 'Services', format: 'number' },
    ],
    data: [
      { namespace: 'default', pods: 12, deployments: 4, services: 3 },
      { namespace: 'production', pods: 45, deployments: 12, services: 8 },
      { namespace: 'monitoring', pods: 8, deployments: 3, services: 5 },
      { namespace: 'kube-system', pods: 15, deployments: 6, services: 4 },
    ],
  },
]

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
}`,
  },
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
            <span className="text-[10px] text-muted-foreground mt-1">{c.name}</span>
          </div>
        ))}
      </div>
    </div>
  )
}`,
  },
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
}`,
  },
  {
    name: 'Donut Chart',
    title: 'Resource Distribution',
    description: 'Donut chart showing distribution',
    width: 4,
    source: `export default function DonutCard({ config }) {
  const data = [
    { label: 'Running', value: 72, color: '#22c55e' },
    { label: 'Pending', value: 15, color: '#eab308' },
    { label: 'Failed', value: 8, color: '#ef4444' },
    { label: 'Unknown', value: 5, color: '#6b7280' },
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
            <span className="text-[10px] text-muted-foreground">{d.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}`,
  },
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
              <p className="text-[10px] text-muted-foreground">{e.time}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}`,
  },
]

// ============================================================================
// Field Auto-Suggest Chips
// ============================================================================

function FieldSuggestChips({
  dataJson,
  existingFields,
  onAddColumn,
}: {
  dataJson: string
  existingFields: Set<string>
  onAddColumn: (col: DynamicCardColumn) => void
}) {
  const { isFeatureEnabled } = useAIMode()
  const enabled = isFeatureEnabled('naturalLanguage')

  const suggestedFields = useMemo(() => {
    if (!enabled) return []
    try {
      const parsed = JSON.parse(dataJson)
      if (!Array.isArray(parsed) || parsed.length === 0) return []
      const allKeys = new Set<string>()
      for (const row of parsed.slice(0, 10)) {
        if (typeof row === 'object' && row) {
          Object.keys(row).forEach(k => allKeys.add(k))
        }
      }
      return [...allKeys].filter(k => !existingFields.has(k))
    } catch {
      return []
    }
  }, [dataJson, existingFields, enabled])

  if (!enabled || suggestedFields.length === 0) return null

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-[10px] text-muted-foreground/50">Fields:</span>
      {suggestedFields.map(field => {
        const sampleValues = (() => {
          try {
            const parsed = JSON.parse(dataJson)
            return parsed.slice(0, 5).map((row: Record<string, unknown>) => row[field])
          } catch { return [] }
        })()
        const detected = detectFieldFormat(field, sampleValues)

        return (
          <button
            key={field}
            onClick={() => onAddColumn({
              field,
              label: field.charAt(0).toUpperCase() + field.slice(1).replace(/([A-Z])/g, ' $1'),
              format: detected.format,
              badgeColors: detected.badgeColors,
            })}
            className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400/70 hover:bg-purple-500/20 hover:text-purple-400 transition-colors"
          >
            + {field}
          </button>
        )
      })}
    </div>
  )
}

// ============================================================================
// Inline AI Assist Result Types
// ============================================================================

interface T1AssistResult {
  title?: string
  description?: string
  layout?: 'list' | 'stats' | 'stats-and-list'
  width?: number
  columns?: DynamicCardColumn[]
  data?: Record<string, unknown>[]
}

interface T2AssistResult {
  title?: string
  description?: string
  width?: number
  sourceCode?: string
}

function validateT1AssistResult(data: unknown): { valid: true; result: T1AssistResult } | { valid: false; error: string } {
  const obj = data as Record<string, unknown>
  if (!obj.columns && !obj.data && !obj.title) return { valid: false, error: 'Response must include title, columns, or data' }
  return { valid: true, result: obj as T1AssistResult }
}

function validateT2AssistResult(data: unknown): { valid: true; result: T2AssistResult } | { valid: false; error: string } {
  const obj = data as Record<string, unknown>
  if (!obj.sourceCode && !obj.title) return { valid: false, error: 'Response must include sourceCode or title' }
  return { valid: true, result: obj as T2AssistResult }
}

// ============================================================================
// Main Component
// ============================================================================

export function CardFactoryModal({ isOpen, onClose, onCardCreated }: CardFactoryModalProps) {
  const { t } = useTranslation()
  const [tab, setTab] = useState<Tab>('declarative')

  // Declarative (Tier 1) state
  const [t1Title, setT1Title] = useState('')
  const [t1Description, setT1Description] = useState('')
  const [t1Layout, setT1Layout] = useState<'list' | 'stats' | 'stats-and-list'>('list')
  const [t1Columns, setT1Columns] = useState<DynamicCardColumn[]>([
    { field: 'name', label: 'Name' },
    { field: 'status', label: 'Status', format: 'badge', badgeColors: { healthy: 'bg-green-500/20 text-green-400 dark:bg-green-900/30 dark:text-green-400', error: 'bg-red-500/20 text-red-400 dark:bg-red-900/30 dark:text-red-400' } },
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
    const saveMessageTimeoutId = setTimeout(() => setSaveMessage(null), SAVE_MESSAGE_TIMEOUT_MS)
    timeoutsRef.current.push(saveMessageTimeoutId)
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

    const tier2SaveTimeoutId = setTimeout(() => setSaveMessage(null), SAVE_MESSAGE_TIMEOUT_MS)
    timeoutsRef.current.push(tier2SaveTimeoutId)
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

  const addColumnDef = useCallback((col: DynamicCardColumn) => {
    setT1Columns(prev => [...prev, col])
  }, [])

  const updateColumn = useCallback((idx: number, field: keyof DynamicCardColumn, value: string) => {
    setT1Columns(prev => prev.map((col, i) => i === idx ? { ...col, [field]: value } : col))
  }, [])

  const removeColumn = useCallback((idx: number) => {
    setT1Columns(prev => prev.filter((_, i) => i !== idx))
  }, [])

  // Apply T1 template
  const applyT1Template = useCallback((tpl: T1Template) => {
    setT1Title(tpl.title)
    setT1Description(tpl.description)
    setT1Layout(tpl.layout)
    setT1Width(tpl.width)
    setT1Columns(tpl.columns)
    setT1DataJson(JSON.stringify(tpl.data, null, 2))
  }, [])

  // Apply T2 template
  const applyT2Template = useCallback((tpl: T2Template) => {
    setT2Title(tpl.title)
    setT2Description(tpl.description)
    setT2Width(tpl.width)
    setT2Source(tpl.source)
    setCompileStatus('idle')
  }, [])

  // Handle inline AI assist result for T1
  const handleT1AssistResult = useCallback((result: T1AssistResult) => {
    if (result.title) setT1Title(result.title)
    if (result.description) setT1Description(result.description)
    if (result.layout) setT1Layout(result.layout)
    if (result.width) setT1Width(result.width)
    if (result.columns) setT1Columns(result.columns)
    if (result.data) setT1DataJson(JSON.stringify(result.data, null, 2))
  }, [])

  // Handle inline AI assist result for T2
  const handleT2AssistResult = useCallback((result: T2AssistResult) => {
    if (result.title) setT2Title(result.title)
    if (result.description) setT2Description(result.description)
    if (result.width) setT2Width(result.width)
    if (result.sourceCode) { setT2Source(result.sourceCode); setCompileStatus('idle') }
  }, [])

  // Compute T1 preview data (use sample data if user data is empty/invalid)
  const t1PreviewData = useMemo(() => {
    try {
      const parsed = JSON.parse(t1DataJson)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    } catch { /* use sample */ }
    return generateSampleData(t1Columns)
  }, [t1DataJson, t1Columns])

  // Existing field set for chip filtering
  const existingFieldSet = useMemo(
    () => new Set(t1Columns.map(c => c.field)),
    [t1Columns]
  )

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      size="xl"
      closeOnBackdrop={false}
    >
      <BaseModal.Header title={t('dashboard.cardFactory.title')} icon={Wand2} onClose={onClose} showBack={false} />
      <BaseModal.Content className="max-h-[70vh]">
      <div className="flex flex-col">
        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-border pb-2 mb-4">
          {[
            { id: 'declarative' as Tab, label: t('dashboard.cardFactory.declarativeTab'), icon: Layers },
            { id: 'code' as Tab, label: t('dashboard.cardFactory.customCodeTab'), icon: Code },
            { id: 'ai' as Tab, label: t('dashboard.cardFactory.aiCreateTab'), icon: Sparkles },
            { id: 'manage' as Tab, label: t('dashboard.cardFactory.manageTab'), icon: Wand2 },
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
                      className="w-full text-sm px-3 py-2 rounded-md bg-secondary/50 border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-purple-500/50"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">{t('dashboard.cardFactory.widthLabel')}</label>
                    <select
                      value={t1Width}
                      onChange={e => setT1Width(Number(e.target.value))}
                      className="w-full text-sm px-3 py-2 rounded-md bg-secondary/50 border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-purple-500/50"
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
                    className="w-full text-sm px-3 py-2 rounded-md bg-secondary/50 border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-purple-500/50"
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
                    <label className="text-xs text-muted-foreground">{t('dashboard.cardFactory.columnsLabel')}</label>
                    <button
                      onClick={addColumn}
                      className="flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-secondary text-muted-foreground hover:text-foreground transition-colors"
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
                          className="flex-1 text-xs px-2 py-1.5 rounded-md bg-secondary/50 border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-purple-500/50"
                        />
                        <input
                          type="text"
                          value={col.label}
                          onChange={e => updateColumn(idx, 'label', e.target.value)}
                          placeholder={t('dashboard.cardFactory.labelPlaceholder')}
                          className="flex-1 text-xs px-2 py-1.5 rounded-md bg-secondary/50 border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-purple-500/50"
                        />
                        <select
                          value={col.format || 'text'}
                          onChange={e => updateColumn(idx, 'format', e.target.value)}
                          className="w-20 text-xs px-2 py-1.5 rounded-md bg-secondary/50 border border-border text-foreground focus:outline-none"
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
                  {t('dashboard.cardFactory.createCard')}
                </button>
              </div>

              {/* Right: Live Preview */}
              <LivePreviewPanel
                tier="tier1"
                t1Config={{
                  layout: t1Layout,
                  columns: t1Columns,
                  staticData: t1PreviewData,
                }}
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
                      className="w-full text-sm px-3 py-2 rounded-md bg-secondary/50 border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-purple-500/50"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">{t('dashboard.cardFactory.widthLabel')}</label>
                    <select
                      value={t2Width}
                      onChange={e => setT2Width(Number(e.target.value))}
                      className="w-full text-sm px-3 py-2 rounded-md bg-secondary/50 border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-purple-500/50"
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
                    className="w-full text-sm px-3 py-2 rounded-md bg-secondary/50 border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-purple-500/50"
                  />
                </div>

                {/* Code editor */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs text-muted-foreground">{t('dashboard.cardFactory.tsxSourceCode')}</label>
                    <button
                      onClick={handleCompile}
                      className="flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Eye className="w-3 h-3" />
                      {t('dashboard.cardFactory.validate')}
                    </button>
                  </div>
                  <textarea
                    value={t2Source}
                    onChange={e => { setT2Source(e.target.value); setCompileStatus('idle') }}
                    rows={14}
                    className="w-full text-xs px-3 py-2 rounded-md bg-secondary/50 border border-border text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-purple-500/50 leading-relaxed"
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
                <div className="rounded-md bg-secondary/30 border border-border/50 p-3">
                  <p className="text-xs font-medium text-muted-foreground mb-1">{t('dashboard.cardFactory.availableInScope')}</p>
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
                const aiCreateTimeoutId = setTimeout(() => setSaveMessage(null), SAVE_MESSAGE_TIMEOUT_MS)
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
                  <div key={card.id} className="rounded-md bg-card/50 border border-border p-3 flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground">{card.title}</span>
                        <span className={cn(
                          'text-[10px] px-1.5 py-0.5 rounded',
                          card.tier === 'tier1' ? 'bg-blue-500/20 text-blue-400' : 'bg-purple-500/20 text-purple-400',
                        )}>
                          {card.tier === 'tier1' ? t('dashboard.cardFactory.declarativeBadge') : t('dashboard.cardFactory.customCodeBadge')}
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
      </BaseModal.Content>
    </BaseModal>
  )
}

// ============================================================================
// Template Dropdown (generic)
// ============================================================================

function TemplateDropdown<T extends { name: string }>({
  templates,
  onSelect,
  label,
}: {
  templates: T[]
  onSelect: (tpl: T) => void
  label: string
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md bg-secondary/50 border border-border text-muted-foreground hover:text-foreground transition-colors"
      >
        <LayoutTemplate className="w-3 h-3" />
        {label}
      </button>
      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 bg-card border border-border rounded-lg shadow-lg p-1.5 min-w-[200px]">
          {templates.map(tpl => (
            <button
              key={tpl.name}
              onClick={() => { onSelect(tpl); setOpen(false) }}
              className="w-full text-left px-3 py-1.5 rounded-md text-xs text-foreground hover:bg-secondary transition-colors"
            >
              {tpl.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// AI Create Tab
// ============================================================================

interface AiCardT1Result {
  title: string
  description: string
  layout: 'list' | 'stats' | 'stats-and-list'
  defaultWidth: number
  defaultLimit: number
  columns: DynamicCardColumn[]
  searchFields: string[]
  staticData: Record<string, unknown>[]
}

interface AiCardT2Result {
  title: string
  description: string
  defaultWidth: number
  sourceCode: string
}

type AiMode = 'tier1' | 'tier2'

function validateT1Result(data: unknown): { valid: true; result: AiCardT1Result } | { valid: false; error: string } {
  const obj = data as Record<string, unknown>
  if (!obj.title || typeof obj.title !== 'string') return { valid: false, error: 'Missing or invalid "title"' }
  if (!obj.columns || !Array.isArray(obj.columns)) return { valid: false, error: 'Missing or invalid "columns" array' }
  if (!['list', 'stats', 'stats-and-list'].includes(obj.layout as string)) {
    (obj as Record<string, unknown>).layout = 'list' // default
  }
  return { valid: true, result: obj as unknown as AiCardT1Result }
}

function validateT2Result(data: unknown): { valid: true; result: AiCardT2Result } | { valid: false; error: string } {
  const obj = data as Record<string, unknown>
  if (!obj.title || typeof obj.title !== 'string') return { valid: false, error: 'Missing or invalid "title"' }
  if (!obj.sourceCode || typeof obj.sourceCode !== 'string') return { valid: false, error: 'Missing or invalid "sourceCode"' }
  return { valid: true, result: obj as unknown as AiCardT2Result }
}

function T1Preview({ result }: { result: AiCardT1Result }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Layers className="w-4 h-4 text-purple-400" />
        <span className="text-sm font-medium text-foreground">{result.title}</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400">
          {result.layout}
        </span>
      </div>
      {result.description && (
        <p className="text-xs text-muted-foreground mb-3">{result.description}</p>
      )}
      {result.columns && result.columns.length > 0 && (
        <div className="text-xs">
          <div className="flex gap-2 border-b border-border pb-1 mb-1">
            {result.columns.map(col => (
              <span key={col.field} className="flex-1 text-muted-foreground font-medium truncate">
                {col.label}
              </span>
            ))}
          </div>
          {(result.staticData || []).slice(0, 3).map((row, i) => (
            <div key={i} className="flex gap-2 py-0.5">
              {result.columns.map(col => {
                const val = String(row[col.field] ?? '')
                if (col.format === 'badge' && col.badgeColors) {
                  const badgeClass = col.badgeColors[val] || 'bg-gray-500/20 text-gray-400 dark:bg-gray-900/30 dark:text-gray-400'
                  return (
                    <span key={col.field} className={cn('flex-1 truncate text-[10px] px-1 py-0.5 rounded', badgeClass)}>
                      {val}
                    </span>
                  )
                }
                return (
                  <span key={col.field} className="flex-1 text-foreground truncate">
                    {val}
                  </span>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function T2Preview({ result }: { result: AiCardT2Result }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Code className="w-4 h-4 text-purple-400" />
        <span className="text-sm font-medium text-foreground">{result.title}</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400">
          Custom Code
        </span>
      </div>
      {result.description && (
        <p className="text-xs text-muted-foreground mb-2">{result.description}</p>
      )}
      <pre className="text-[10px] px-3 py-2 rounded-md bg-secondary/50 border border-border text-foreground font-mono max-h-48 overflow-y-auto whitespace-pre-wrap">
        {result.sourceCode}
      </pre>
    </div>
  )
}

function AiCardTab({ onCardCreated }: { onCardCreated: (id: string) => void }) {
  const [aiMode, setAiMode] = useState<AiMode>('tier1')

  const handleSaveT1 = useCallback((result: AiCardT1Result) => {
    const id = `dynamic_${Date.now()}`
    const now = new Date().toISOString()

    const cardDef: DynamicCardDefinition_T1 = {
      dataSource: 'static',
      staticData: result.staticData || [],
      columns: result.columns,
      layout: result.layout || 'list',
      searchFields: result.searchFields || result.columns.map(c => c.field),
      defaultLimit: result.defaultLimit || 5,
    }

    const def: DynamicCardDefinition = {
      id,
      title: result.title,
      tier: 'tier1',
      description: result.description || undefined,
      defaultWidth: result.defaultWidth || 6,
      createdAt: now,
      updatedAt: now,
      cardDefinition: cardDef,
    }

    saveDynamicCard(def)
    registerDynamicCardType(id, result.defaultWidth || 6)
    onCardCreated(id)
  }, [onCardCreated])

  const handleSaveT2 = useCallback(async (result: AiCardT2Result) => {
    const compileResult = await compileCardCode(result.sourceCode)
    if (compileResult.error) {
      throw new Error(`Compile error: ${compileResult.error}`)
    }

    const id = `dynamic_${Date.now()}`
    const now = new Date().toISOString()

    const def: DynamicCardDefinition = {
      id,
      title: result.title,
      tier: 'tier2',
      description: result.description || undefined,
      defaultWidth: result.defaultWidth || 6,
      createdAt: now,
      updatedAt: now,
      sourceCode: result.sourceCode,
      compiledCode: compileResult.code!,
    }

    saveDynamicCard(def)
    registerDynamicCardType(id, result.defaultWidth || 6)
    onCardCreated(id)
  }, [onCardCreated])

  return (
    <div className="space-y-4">
      {/* Mode toggle */}
      <div>
        <label className="text-xs text-muted-foreground block mb-1">Card Type</label>
        <div className="flex gap-2">
          <button
            onClick={() => setAiMode('tier1')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-colors',
              aiMode === 'tier1'
                ? 'bg-blue-500/20 text-blue-400'
                : 'bg-secondary text-muted-foreground hover:text-foreground',
            )}
          >
            <Layers className="w-3 h-3" />
            Declarative (table/list)
          </button>
          <button
            onClick={() => setAiMode('tier2')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-colors',
              aiMode === 'tier2'
                ? 'bg-purple-500/20 text-purple-400'
                : 'bg-secondary text-muted-foreground hover:text-foreground',
            )}
          >
            <Code className="w-3 h-3" />
            Custom Code (React)
          </button>
        </div>
      </div>

      {/* AI Generation Panel */}
      {aiMode === 'tier1' ? (
        <AiGenerationPanel<AiCardT1Result>
          systemPrompt={CARD_T1_SYSTEM_PROMPT}
          placeholder="Describe the card you want, e.g., 'A card showing deployment status across clusters with name, namespace, replicas, and status columns'"
          missionTitle="AI Card Generation (Declarative)"
          validateResult={validateT1Result}
          renderPreview={(result) => <T1Preview result={result} />}
          onSave={handleSaveT1}
          saveLabel="Create Declarative Card"
        />
      ) : (
        <AiGenerationPanel<AiCardT2Result>
          systemPrompt={CARD_T2_SYSTEM_PROMPT}
          placeholder="Describe the card you want, e.g., 'A card with animated donut chart showing cluster health percentages with color-coded segments'"
          missionTitle="AI Card Generation (Custom Code)"
          validateResult={validateT2Result}
          renderPreview={(result) => <T2Preview result={result} />}
          onSave={handleSaveT2}
          saveLabel="Create Custom Code Card"
        />
      )}
    </div>
  )
}
