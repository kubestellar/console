// T2 Templates — code-editor starter templates for the Card Factory.
// Extracted from CardFactoryModal.tsx to keep the modal under budget.
// Zero behavior change — re-exported at the same symbol names.

// Used inside template source strings to generate user-facing code with
// the correct feedback timeout value.
const COPY_FEEDBACK_TIMEOUT_MS = 2000

export interface T2Template {
  name: string
  title: string
  description: string
  width: number
  source: string
}

export const T2_TEMPLATES: T2Template[] = [
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
    try { window?.localStorage?.setItem?.(STORAGE_KEY, JSON.stringify(forwards)) } catch (e) { console.warn('[CardFactoryModal] failed to persist port-forwards:', e) }
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
