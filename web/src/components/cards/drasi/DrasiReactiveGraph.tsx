/**
 * Drasi Reactive Graph Card
 *
 * Visualizes the Drasi reactive data pipeline:
 * Sources (HTTP, Postgres) → Continuous Queries (Cypher) → Reactions (SSE)
 *
 * Node positions are measured at runtime so SVG flow lines terminate
 * precisely at each block's edge. Each node has working Stop / Expand /
 * Pin / Configure (gear) controls that affect the demo behavior.
 *
 * Uses live Drasi API data when available, demo data when in demo mode.
 */
import { useState, useEffect, useMemo, useCallback, useRef, useLayoutEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Database, Globe, Search, Radio,
  TrendingDown, TrendingUp, Maximize2, Pin, Square, X, Settings,
} from 'lucide-react'
import { useCardDemoState, useReportCardDataState } from '../CardDataContext'
import { useDrasiResources } from '../../../hooks/useDrasiResources'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** How often to refresh demo data values */
const FLOW_ANIMATION_INTERVAL_MS = 3000
/** Maximum rows shown in the results table */
const MAX_RESULT_ROWS = 7
/** Number of dots flowing along each active connection line */
const FLOW_DOT_COUNT = 3
/** Flow dot animation cycle duration (seconds) */
const FLOW_DOT_CYCLE_S = 2
/** SVG stroke width in pixels */
const LINE_STROKE_WIDTH_PX = 1.2
/** Flow dot radius in pixels */
const FLOW_DOT_RADIUS_PX = 3
/** Horizontal gap reserved for trunk lines between columns (px) */
const TRUNK_GAP_PX = 42

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SourceKind = 'HTTP' | 'POSTGRES' | 'COSMOSDB' | 'GREMLIN' | 'SQL'
type ReactionKind = 'SSE' | 'SIGNALR' | 'WEBHOOK' | 'KAFKA'

interface DrasiSource {
  id: string
  name: string
  kind: SourceKind
  status: 'ready' | 'error' | 'pending'
}

interface DrasiQuery {
  id: string
  name: string
  language: string
  status: 'ready' | 'error' | 'pending'
  sourceIds: string[]
  /** Query body (editable in the config modal for demo purposes) */
  queryText?: string
}

interface DrasiReaction {
  id: string
  name: string
  kind: ReactionKind
  status: 'ready' | 'error' | 'pending'
  queryIds: string[]
}

interface LiveResultRow {
  changePercent: number
  name: string
  previousClose: number
  price: number
  symbol: string
}

interface DrasiPipelineData {
  sources: DrasiSource[]
  queries: DrasiQuery[]
  reactions: DrasiReaction[]
  liveResults: LiveResultRow[]
}

interface NodeRect {
  left: number
  right: number
  top: number
  bottom: number
  centerY: number
}

// ---------------------------------------------------------------------------
// Demo data
// ---------------------------------------------------------------------------

const DEMO_STOCKS: Omit<LiveResultRow, 'changePercent' | 'price'>[] = [
  { name: 'UnitedHealth Group', previousClose: 536.88, symbol: 'UNH' },
  { name: 'Visa Inc.', previousClose: 272.19, symbol: 'V' },
  { name: 'Chevron', previousClose: 144.75, symbol: 'CVX' },
  { name: 'Caterpillar', previousClose: 288.47, symbol: 'CAT' },
  { name: 'NVIDIA Corporation', previousClose: 851.30, symbol: 'NVDA' },
  { name: 'Intel Corporation', previousClose: 32.78, symbol: 'INTC' },
  { name: 'Nike Inc.', previousClose: 101.58, symbol: 'NKE' },
]

const DEMO_QUERY_TEXT: Record<string, string> = {
  'q-watchlist': 'MATCH (s:Stock)-[:IN_WATCHLIST]->(u:User) RETURN s.symbol, s.price',
  'q-portfolio': 'MATCH (u:User)-[:OWNS]->(s:Stock) RETURN s.symbol, s.price, s.shares',
  'q-top-gainers': 'MATCH (s:Stock) WHERE s.changePercent > 0 RETURN s ORDER BY s.changePercent DESC LIMIT 10',
  'q-top-losers': 'MATCH (s:Stock) WHERE s.changePercent < 0 RETURN s ORDER BY s.changePercent ASC LIMIT 10',
}

function generateDemoData(): DrasiPipelineData {
  const sources: DrasiSource[] = [
    { id: 'src-price-feed', name: 'price-feed', kind: 'HTTP', status: 'ready' },
    { id: 'src-postgres-stocks', name: 'postgres-stocks', kind: 'POSTGRES', status: 'ready' },
    { id: 'src-postgres-broker', name: 'postgres-broker', kind: 'POSTGRES', status: 'ready' },
  ]
  const queries: DrasiQuery[] = [
    { id: 'q-watchlist', name: 'watchlist-query', language: 'CYPHER QUERY', status: 'ready', sourceIds: ['src-price-feed', 'src-postgres-stocks'], queryText: DEMO_QUERY_TEXT['q-watchlist'] },
    { id: 'q-portfolio', name: 'portfolio-query', language: 'CYPHER QUERY', status: 'ready', sourceIds: ['src-postgres-stocks', 'src-postgres-broker'], queryText: DEMO_QUERY_TEXT['q-portfolio'] },
    { id: 'q-top-gainers', name: 'top-gainers-query', language: 'CYPHER QUERY', status: 'ready', sourceIds: ['src-postgres-broker'], queryText: DEMO_QUERY_TEXT['q-top-gainers'] },
    { id: 'q-top-losers', name: 'top-losers-query', language: 'CYPHER QUERY', status: 'ready', sourceIds: ['src-price-feed', 'src-postgres-stocks', 'src-postgres-broker'], queryText: DEMO_QUERY_TEXT['q-top-losers'] },
  ]
  const reactions: DrasiReaction[] = [
    { id: 'rx-sse', name: 'sse-stream', kind: 'SSE', status: 'ready', queryIds: ['q-watchlist', 'q-portfolio', 'q-top-gainers', 'q-top-losers'] },
  ]
  const liveResults: LiveResultRow[] = DEMO_STOCKS.map(stock => {
    const changePercent = parseFloat((-6 + Math.random() * 5).toFixed(2))
    const price = parseFloat((stock.previousClose * (1 + changePercent / 100)).toFixed(2))
    return { ...stock, changePercent, price }
  })
  liveResults.sort((a, b) => a.changePercent - b.changePercent)
  return { sources, queries, reactions, liveResults }
}

// ---------------------------------------------------------------------------
// Node card controls
// ---------------------------------------------------------------------------

interface NodeControlsProps {
  isStopped: boolean
  isPinned?: boolean
  showPin?: boolean
  showGear?: boolean
  onStop: () => void
  onPin?: () => void
  onExpand: () => void
  onConfigure?: () => void
}

function NodeControls({ isStopped, isPinned = false, showPin = false, showGear = false, onStop, onPin, onExpand, onConfigure }: NodeControlsProps) {
  const handle = (fn?: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation()
    fn?.()
  }
  return (
    <div className="flex items-center gap-1.5 mt-1.5">
      <button
        type="button"
        onClick={handle(onStop)}
        className={`w-5 h-5 flex items-center justify-center rounded border transition-colors ${
          isStopped
            ? 'bg-slate-700/60 border-slate-500/50 text-slate-300'
            : 'bg-red-500/20 hover:bg-red-500/40 border-red-500/40 text-red-400'
        }`}
        aria-label={isStopped ? 'Start' : 'Stop'}
        title={isStopped ? 'Start' : 'Stop'}
      >
        <Square className="w-2.5 h-2.5" fill="currentColor" />
      </button>
      <button
        type="button"
        onClick={handle(onExpand)}
        className="w-5 h-5 flex items-center justify-center rounded bg-slate-700/40 hover:bg-cyan-500/30 border border-slate-600/40 hover:border-cyan-500/50 text-slate-400 hover:text-cyan-300 transition-colors"
        aria-label="Expand"
        title="Expand details"
      >
        <Maximize2 className="w-2.5 h-2.5" />
      </button>
      {showPin && (
        <button
          type="button"
          onClick={handle(onPin)}
          className={`w-5 h-5 flex items-center justify-center rounded border transition-colors ${
            isPinned
              ? 'bg-amber-500/30 border-amber-500/60 text-amber-300'
              : 'bg-slate-700/40 hover:bg-slate-700/60 border-slate-600/40 text-slate-400'
          }`}
          aria-label={isPinned ? 'Unpin' : 'Pin'}
          title={isPinned ? 'Unpin' : 'Pin'}
        >
          <Pin className="w-2.5 h-2.5" fill={isPinned ? 'currentColor' : 'none'} />
        </button>
      )}
      {showGear && (
        <button
          type="button"
          onClick={handle(onConfigure)}
          className="w-5 h-5 flex items-center justify-center rounded bg-slate-700/40 hover:bg-cyan-500/30 border border-slate-600/40 hover:border-cyan-500/50 text-slate-400 hover:text-cyan-300 transition-colors"
          aria-label="Configure"
          title="Configure"
        >
          <Settings className="w-2.5 h-2.5" />
        </button>
      )}
    </div>
  )
}

function StatusDot({ status, isStopped }: { status: 'ready' | 'error' | 'pending'; isStopped: boolean }) {
  const color = isStopped
    ? 'bg-slate-500'
    : status === 'ready' ? 'bg-green-400' : status === 'error' ? 'bg-red-400' : 'bg-yellow-400'
  return (
    <motion.div
      className={`w-2 h-2 rounded-full ${color}`}
      animate={!isStopped && status === 'ready' ? { scale: [1, 1.3, 1] } : {}}
      transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
    />
  )
}

function SourceIconEl({ kind }: { kind: SourceKind }) {
  if (kind === 'HTTP') return <Globe className="w-3.5 h-3.5 text-emerald-400" />
  return <Database className="w-3.5 h-3.5 text-emerald-400" />
}

function ReactionIconEl({ kind }: { kind: ReactionKind }) {
  if (kind === 'SSE') return <Radio className="w-3.5 h-3.5 text-emerald-400" />
  return <Radio className="w-3.5 h-3.5 text-emerald-400" />
}

// ---------------------------------------------------------------------------
// Node card
// ---------------------------------------------------------------------------

interface NodeCardProps {
  nodeRef: React.RefObject<HTMLDivElement | null>
  title: string
  subtitle: string
  icon: React.ReactNode
  status: 'ready' | 'error' | 'pending'
  accentColor: 'emerald' | 'cyan'
  isSelected?: boolean
  isStopped: boolean
  isPinned?: boolean
  showPin?: boolean
  showGear?: boolean
  onClick?: () => void
  onStop: () => void
  onPin?: () => void
  onExpand: () => void
  onConfigure?: () => void
  children?: React.ReactNode
}

function NodeCard({
  nodeRef, title, subtitle, icon, status, accentColor,
  isSelected, isStopped, isPinned, showPin, showGear,
  onClick, onStop, onPin, onExpand, onConfigure, children,
}: NodeCardProps) {
  const borderClass = isSelected
    ? accentColor === 'cyan' ? 'border-cyan-400/70 ring-1 ring-cyan-400/30' : 'border-emerald-400/70 ring-1 ring-emerald-400/30'
    : accentColor === 'cyan' ? 'border-cyan-500/30' : 'border-emerald-500/30'
  return (
    <motion.div
      ref={nodeRef}
      className={`bg-slate-900/80 border rounded-lg p-2.5 ${borderClass} ${isStopped ? 'opacity-60' : ''} ${onClick ? 'cursor-pointer' : ''}`}
      whileHover={onClick ? { scale: 1.02 } : {}}
      onClick={onClick}
    >
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="text-white text-xs font-semibold truncate flex-1">{title}</span>
        <StatusDot status={status} isStopped={isStopped} />
      </div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">{subtitle}</div>
      <NodeControls
        isStopped={isStopped}
        isPinned={isPinned}
        showPin={showPin}
        showGear={showGear}
        onStop={onStop}
        onPin={onPin}
        onExpand={onExpand}
        onConfigure={onConfigure}
      />
      {children}
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// SVG flow line with animated dots
// ---------------------------------------------------------------------------

interface FlowLineProps {
  d: string
  dashed?: boolean
  active?: boolean
  delay?: number
}

function FlowLine({ d, dashed, active = true, delay = 0 }: FlowLineProps) {
  const isAnimated = active && !dashed
  return (
    <>
      <path
        d={d}
        fill="none"
        stroke="rgb(16 185 129)"
        strokeOpacity={dashed ? 0.35 : 0.7}
        strokeWidth={LINE_STROKE_WIDTH_PX}
        strokeDasharray={dashed ? '4 4' : undefined}
        vectorEffect="non-scaling-stroke"
      />
      {isAnimated && Array.from({ length: FLOW_DOT_COUNT }).map((_, i) => (
        <circle key={i} r={FLOW_DOT_RADIUS_PX} fill="rgb(52 211 153)" fillOpacity={0.9}>
          <animateMotion
            dur={`${FLOW_DOT_CYCLE_S}s`}
            repeatCount="indefinite"
            begin={`${delay + (i * FLOW_DOT_CYCLE_S) / FLOW_DOT_COUNT}s`}
            path={d}
          />
        </circle>
      ))}
    </>
  )
}

// ---------------------------------------------------------------------------
// Results table
// ---------------------------------------------------------------------------

function ResultsTable({ results, isDemo }: { results: LiveResultRow[]; isDemo: boolean }) {
  const displayResults = results.slice(0, MAX_RESULT_ROWS)
  const totalRows = results.length
  const label = isDemo ? 'Demo Results' : 'Live Results'
  return (
    <div className="mt-2 bg-slate-950/80 border border-slate-700/40 rounded overflow-hidden">
      <div className="px-2 py-1 border-b border-slate-700/50 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-medium text-cyan-400 uppercase tracking-wider">{label}</span>
          <motion.div
            className="w-1.5 h-1.5 rounded-full bg-emerald-400"
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ repeat: Infinity, duration: 1.5 }}
          />
        </div>
        <span className="text-[10px] text-muted-foreground">{totalRows} rows</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[10px]">
          <thead>
            <tr className="border-b border-slate-800/50">
              <th className="text-left px-2 py-1 text-muted-foreground font-medium">changePercent</th>
              <th className="text-left px-2 py-1 text-muted-foreground font-medium">name</th>
              <th className="text-right px-2 py-1 text-muted-foreground font-medium">previousClose</th>
              <th className="text-right px-2 py-1 text-muted-foreground font-medium">price</th>
              <th className="text-right px-2 py-1 text-muted-foreground font-medium">symbol</th>
            </tr>
          </thead>
          <tbody>
            {displayResults.map(row => (
              <tr key={row.symbol} className="border-b border-slate-800/30 hover:bg-slate-800/30">
                <td className="px-2 py-1">
                  <span className={`font-mono flex items-center gap-1 ${row.changePercent < 0 ? 'text-red-400' : 'text-green-400'}`}>
                    {row.changePercent < 0 ? <TrendingDown className="w-2.5 h-2.5" /> : <TrendingUp className="w-2.5 h-2.5" />}
                    {row.changePercent.toFixed(2)}
                  </span>
                </td>
                <td className="px-2 py-1 text-white truncate max-w-[120px]">{row.name}</td>
                <td className="px-2 py-1 text-muted-foreground font-mono text-right">{row.previousClose.toFixed(2)}</td>
                <td className="px-2 py-1 text-white font-mono text-right">{row.price.toFixed(2)}</td>
                <td className="px-2 py-1 text-cyan-400 font-mono text-right">{row.symbol}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Expand modal — read-only node details
// ---------------------------------------------------------------------------

interface ExpandedNodeDetails {
  id: string
  name: string
  kind: string
  type: 'source' | 'query' | 'reaction'
  extra?: Record<string, string>
}

function ExpandModal({ node, onClose }: { node: ExpandedNodeDetails | null; onClose: () => void }) {
  if (!node) return null
  return (
    <motion.div
      className="absolute inset-0 z-30 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="bg-slate-900 border border-slate-600/50 rounded-lg max-w-md w-full p-4"
        initial={{ scale: 0.95 }}
        animate={{ scale: 1 }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="text-white font-semibold text-sm">{node.name}</div>
            <div className="text-muted-foreground text-xs uppercase tracking-wider mt-0.5">
              {node.type} · {node.kind}
            </div>
          </div>
          <button type="button" onClick={onClose} className="w-6 h-6 flex items-center justify-center rounded hover:bg-slate-800 text-slate-400" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="space-y-1.5 text-xs">
          <div className="flex justify-between text-slate-300">
            <span className="text-muted-foreground">ID:</span>
            <span className="font-mono">{node.id}</span>
          </div>
          {node.extra && Object.entries(node.extra).map(([k, v]) => (
            <div key={k} className="flex justify-between text-slate-300 gap-3">
              <span className="text-muted-foreground whitespace-nowrap">{k}:</span>
              <span className="font-mono truncate text-right">{v}</span>
            </div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// Configure modals — Source and Query
// ---------------------------------------------------------------------------

const SOURCE_KINDS: SourceKind[] = ['HTTP', 'POSTGRES', 'COSMOSDB', 'GREMLIN', 'SQL']

interface SourceConfig {
  name: string
  kind: SourceKind
}

interface QueryConfig {
  name: string
  language: string
  queryText: string
}

function SourceConfigModal({
  source, onSave, onClose,
}: {
  source: DrasiSource
  onSave: (config: SourceConfig) => void
  onClose: () => void
}) {
  const [name, setName] = useState(source.name)
  const [kind, setKind] = useState<SourceKind>(source.kind)

  return (
    <motion.div
      className="absolute inset-0 z-30 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="bg-slate-900 border border-slate-600/50 rounded-lg max-w-md w-full p-4"
        initial={{ scale: 0.95 }}
        animate={{ scale: 1 }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="text-white font-semibold text-sm">Configure Source</div>
            <div className="text-muted-foreground text-xs uppercase tracking-wider mt-0.5">Source · {source.kind}</div>
          </div>
          <button type="button" onClick={onClose} className="w-6 h-6 flex items-center justify-center rounded hover:bg-slate-800 text-slate-400" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full px-2 py-1.5 text-xs bg-slate-950 border border-slate-700 rounded text-white focus:border-cyan-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Source Type</label>
            <select
              value={kind}
              onChange={e => setKind(e.target.value as SourceKind)}
              className="w-full px-2 py-1.5 text-xs bg-slate-950 border border-slate-700 rounded text-white focus:border-cyan-500 focus:outline-none"
            >
              {SOURCE_KINDS.map(k => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-xs rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700">Cancel</button>
          <button type="button" onClick={() => { onSave({ name, kind }); onClose() }} className="px-3 py-1.5 text-xs rounded bg-cyan-600 hover:bg-cyan-500 text-white">Save</button>
        </div>
      </motion.div>
    </motion.div>
  )
}

const QUERY_LANGUAGES = ['CYPHER QUERY', 'GREMLIN QUERY', 'SQL QUERY']

function QueryConfigModal({
  query, onSave, onClose,
}: {
  query: DrasiQuery
  onSave: (config: QueryConfig) => void
  onClose: () => void
}) {
  const [name, setName] = useState(query.name)
  const [language, setLanguage] = useState(query.language)
  const [queryText, setQueryText] = useState(query.queryText || '')

  return (
    <motion.div
      className="absolute inset-0 z-30 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="bg-slate-900 border border-slate-600/50 rounded-lg max-w-lg w-full p-4"
        initial={{ scale: 0.95 }}
        animate={{ scale: 1 }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="text-white font-semibold text-sm">Configure Continuous Query</div>
            <div className="text-muted-foreground text-xs uppercase tracking-wider mt-0.5">Query · {query.language}</div>
          </div>
          <button type="button" onClick={onClose} className="w-6 h-6 flex items-center justify-center rounded hover:bg-slate-800 text-slate-400" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full px-2 py-1.5 text-xs bg-slate-950 border border-slate-700 rounded text-white focus:border-cyan-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Query Type</label>
            <select
              value={language}
              onChange={e => setLanguage(e.target.value)}
              className="w-full px-2 py-1.5 text-xs bg-slate-950 border border-slate-700 rounded text-white focus:border-cyan-500 focus:outline-none"
            >
              {QUERY_LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Query</label>
            <textarea
              value={queryText}
              onChange={e => setQueryText(e.target.value)}
              rows={5}
              className="w-full px-2 py-1.5 text-xs font-mono bg-slate-950 border border-slate-700 rounded text-white focus:border-cyan-500 focus:outline-none resize-none"
              placeholder="MATCH (n) RETURN n"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-xs rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700">Cancel</button>
          <button type="button" onClick={() => { onSave({ name, language, queryText }); onClose() }} className="px-3 py-1.5 text-xs rounded bg-cyan-600 hover:bg-cyan-500 text-white">Save</button>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function DrasiReactiveGraph() {
  const { shouldUseDemoData: isDemoMode, showDemoBadge } = useCardDemoState({ requires: 'none' })
  const { data: liveData, isLoading, error } = useDrasiResources()

  useReportCardDataState({
    isDemoData: showDemoBadge || (!liveData && !isLoading),
    isFailed: !!error,
    consecutiveFailures: error ? 1 : 0,
    hasData: true,
  })

  const [selectedQueryId, setSelectedQueryId] = useState<string>('q-top-losers')
  const [pinnedQueryId, setPinnedQueryId] = useState<string | null>(null)
  const [stoppedNodeIds, setStoppedNodeIds] = useState<Set<string>>(new Set())
  const [expandedNode, setExpandedNode] = useState<ExpandedNodeDetails | null>(null)
  const [configuringSource, setConfiguringSource] = useState<DrasiSource | null>(null)
  const [configuringQuery, setConfiguringQuery] = useState<DrasiQuery | null>(null)
  const [demoData, setDemoData] = useState<DrasiPipelineData>(generateDemoData)

  // Periodically regenerate demo results so the table values change
  useEffect(() => {
    if (!isDemoMode && liveData) return
    const interval = setInterval(() => {
      setDemoData(prev => {
        // Keep existing sources/queries/reactions (user may have edited them);
        // only regenerate the result rows for animation.
        const fresh = generateDemoData()
        return { ...prev, liveResults: fresh.liveResults }
      })
    }, FLOW_ANIMATION_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [isDemoMode, liveData])

  const isLive = !!liveData && !isDemoMode
  const pipelineData = useMemo<DrasiPipelineData>(
    () => (isLive && liveData ? liveData : demoData),
    [isLive, liveData, demoData],
  )
  const { sources, queries, reactions, liveResults } = pipelineData

  useEffect(() => {
    if (queries.length > 0 && !queries.find(q => q.id === selectedQueryId)) {
      setSelectedQueryId(pinnedQueryId && queries.find(q => q.id === pinnedQueryId) ? pinnedQueryId : queries[0].id)
    }
  }, [queries, selectedQueryId, pinnedQueryId])

  const handleQueryClick = useCallback((queryId: string) => {
    if (pinnedQueryId && pinnedQueryId !== queryId) return
    setSelectedQueryId(queryId)
  }, [pinnedQueryId])

  const toggleStopped = useCallback((nodeId: string) => {
    setStoppedNodeIds(prev => {
      const next = new Set(prev)
      if (next.has(nodeId)) next.delete(nodeId)
      else next.add(nodeId)
      return next
    })
  }, [])

  const togglePin = useCallback((queryId: string) => {
    setPinnedQueryId(prev => (prev === queryId ? null : queryId))
    setSelectedQueryId(queryId)
  }, [])

  const saveSourceConfig = useCallback((sourceId: string, config: SourceConfig) => {
    setDemoData(prev => ({
      ...prev,
      sources: prev.sources.map(s => s.id === sourceId ? { ...s, name: config.name, kind: config.kind } : s),
    }))
  }, [])

  const saveQueryConfig = useCallback((queryId: string, config: QueryConfig) => {
    setDemoData(prev => ({
      ...prev,
      queries: prev.queries.map(q => q.id === queryId ? { ...q, name: config.name, language: config.language, queryText: config.queryText } : q),
    }))
  }, [])

  // --- Dynamic line positioning --------------------------------------------

  const containerRef = useRef<HTMLDivElement | null>(null)
  const sourceRefs = useRef<Record<string, React.RefObject<HTMLDivElement | null>>>({})
  const queryRefs = useRef<Record<string, React.RefObject<HTMLDivElement | null>>>({})
  const reactionRefs = useRef<Record<string, React.RefObject<HTMLDivElement | null>>>({})

  sources.forEach(s => { if (!sourceRefs.current[s.id]) sourceRefs.current[s.id] = { current: null } })
  queries.forEach(q => { if (!queryRefs.current[q.id]) queryRefs.current[q.id] = { current: null } })
  reactions.forEach(r => { if (!reactionRefs.current[r.id]) reactionRefs.current[r.id] = { current: null } })

  const [rects, setRects] = useState<{
    sources: Record<string, NodeRect>
    queries: Record<string, NodeRect>
    reactions: Record<string, NodeRect>
    container: { width: number; height: number }
  }>({ sources: {}, queries: {}, reactions: {}, container: { width: 0, height: 0 } })

  useLayoutEffect(() => {
    function measure() {
      const containerEl = containerRef.current
      if (!containerEl) return
      const cRect = containerEl.getBoundingClientRect()
      const toNodeRect = (el: HTMLElement): NodeRect => {
        const r = el.getBoundingClientRect()
        return {
          left: r.left - cRect.left,
          right: r.right - cRect.left,
          top: r.top - cRect.top,
          bottom: r.bottom - cRect.top,
          centerY: (r.top + r.bottom) / 2 - cRect.top,
        }
      }
      const newRects = {
        sources: {} as Record<string, NodeRect>,
        queries: {} as Record<string, NodeRect>,
        reactions: {} as Record<string, NodeRect>,
        container: { width: cRect.width, height: cRect.height },
      }
      for (const [id, ref] of Object.entries(sourceRefs.current)) {
        if (ref.current) newRects.sources[id] = toNodeRect(ref.current)
      }
      for (const [id, ref] of Object.entries(queryRefs.current)) {
        if (ref.current) newRects.queries[id] = toNodeRect(ref.current)
      }
      for (const [id, ref] of Object.entries(reactionRefs.current)) {
        if (ref.current) newRects.reactions[id] = toNodeRect(ref.current)
      }
      setRects(newRects)
    }
    measure()
    const observer = new ResizeObserver(measure)
    if (containerRef.current) observer.observe(containerRef.current)
    // Observe every node — any column height change shifts row centers
    for (const ref of Object.values(sourceRefs.current)) {
      if (ref.current) observer.observe(ref.current)
    }
    for (const ref of Object.values(queryRefs.current)) {
      if (ref.current) observer.observe(ref.current)
    }
    for (const ref of Object.values(reactionRefs.current)) {
      if (ref.current) observer.observe(ref.current)
    }
    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [sources, queries, reactions, selectedQueryId, liveResults.length])

  // --- Compute paths from measured rects ------------------------------------

  const paths = useMemo(() => {
    const items: Array<{ key: string; d: string; dashed: boolean; active: boolean; delay: number }> = []
    if (!rects.container.width) return items

    const sourceRects = sources.map(s => rects.sources[s.id]).filter(Boolean)
    const queryRects = queries.map(q => rects.queries[q.id]).filter(Boolean)
    const reactionRects = reactions.map(r => rects.reactions[r.id]).filter(Boolean)

    if (sourceRects.length === 0 || queryRects.length === 0) return items

    const srcRight = Math.max(...sourceRects.map(r => r.right))
    const qLeft = Math.min(...queryRects.map(r => r.left))
    const trunk1X = (srcRight + qLeft) / 2
    const trunk1Top = Math.min(sourceRects[0].centerY, queryRects[0].centerY)
    const trunk1Bottom = Math.max(
      sourceRects[sourceRects.length - 1].centerY,
      queryRects[queryRects.length - 1].centerY,
    )
    items.push({ key: 'trunk1', d: `M ${trunk1X} ${trunk1Top} L ${trunk1X} ${trunk1Bottom}`, dashed: false, active: false, delay: 0 })

    sources.forEach((s, i) => {
      const r = rects.sources[s.id]
      if (!r) return
      const isActive = !stoppedNodeIds.has(s.id) && s.status === 'ready'
      items.push({
        key: `s-${s.id}`,
        d: `M ${r.right} ${r.centerY} L ${trunk1X} ${r.centerY}`,
        dashed: !isActive,
        active: isActive,
        delay: i * 0.2,
      })
    })

    queries.forEach((q, i) => {
      const r = rects.queries[q.id]
      if (!r) return
      const isActive = !stoppedNodeIds.has(q.id) && q.status === 'ready'
      items.push({
        key: `q-in-${q.id}`,
        d: `M ${trunk1X} ${r.centerY} L ${r.left} ${r.centerY}`,
        dashed: !isActive,
        active: isActive,
        delay: 0.3 + i * 0.2,
      })
    })

    if (reactionRects.length > 0) {
      const qRight = Math.max(...queryRects.map(r => r.right))
      const rxLeft = Math.min(...reactionRects.map(r => r.left))
      const trunk2X = (qRight + rxLeft) / 2
      const trunk2Top = Math.min(queryRects[0].centerY, reactionRects[0].centerY)
      const trunk2Bottom = Math.max(
        queryRects[queryRects.length - 1].centerY,
        reactionRects[reactionRects.length - 1].centerY,
      )
      items.push({ key: 'trunk2', d: `M ${trunk2X} ${trunk2Top} L ${trunk2X} ${trunk2Bottom}`, dashed: false, active: false, delay: 0 })

      queries.forEach((q, i) => {
        const r = rects.queries[q.id]
        if (!r) return
        const isActive = !stoppedNodeIds.has(q.id) && q.status === 'ready'
        items.push({
          key: `q-out-${q.id}`,
          d: `M ${r.right} ${r.centerY} L ${trunk2X} ${r.centerY}`,
          dashed: !isActive,
          active: isActive,
          delay: 0.5 + i * 0.2,
        })
      })

      reactions.forEach((rx, i) => {
        const r = rects.reactions[rx.id]
        if (!r) return
        const isActive = !stoppedNodeIds.has(rx.id) && rx.status === 'ready'
        items.push({
          key: `r-${rx.id}`,
          d: `M ${trunk2X} ${r.centerY} L ${r.left} ${r.centerY}`,
          dashed: !isActive,
          active: isActive,
          delay: 0.7 + i * 0.2,
        })
      })
    }

    return items
  }, [sources, queries, reactions, rects, stoppedNodeIds])

  return (
    <div className="h-full w-full flex flex-col p-3 overflow-hidden relative">
      <div ref={containerRef} className="relative flex-1 min-h-0">
        <svg
          className="absolute pointer-events-none"
          style={{
            zIndex: 0,
            top: 0,
            left: 0,
            width: rects.container.width || 0,
            height: rects.container.height || 0,
            overflow: 'visible',
          }}
          width={rects.container.width || 0}
          height={rects.container.height || 0}
          viewBox={`0 0 ${rects.container.width || 1} ${rects.container.height || 1}`}
          preserveAspectRatio="xMidYMid meet"
        >
          {paths.map(p => (
            <FlowLine key={p.key} d={p.d} dashed={p.dashed} active={p.active} delay={p.delay} />
          ))}
        </svg>

        <div
          className="relative grid h-full"
          style={{
            gridTemplateColumns: `minmax(0, 1fr) ${TRUNK_GAP_PX}px minmax(0, 2fr) ${TRUNK_GAP_PX}px minmax(0, 1fr)`,
            zIndex: 1,
          }}
        >
          {/* Sources */}
          <div className="flex flex-col gap-3 col-start-1">
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Sources</div>
            {sources.slice(0, 3).map(source => (
              <NodeCard
                key={source.id}
                nodeRef={sourceRefs.current[source.id]}
                title={source.name}
                subtitle={source.kind}
                icon={<SourceIconEl kind={source.kind} />}
                status={source.status}
                accentColor="emerald"
                isStopped={stoppedNodeIds.has(source.id)}
                showGear
                onStop={() => toggleStopped(source.id)}
                onExpand={() => setExpandedNode({ id: source.id, name: source.name, kind: source.kind, type: 'source', extra: { status: source.status } })}
                onConfigure={() => setConfiguringSource(source)}
              />
            ))}
          </div>

          {/* Queries */}
          <div className="flex flex-col gap-3 col-start-3">
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Continuous Queries</div>
            {queries.map(query => (
              <NodeCard
                key={query.id}
                nodeRef={queryRefs.current[query.id]}
                title={query.name}
                subtitle={query.language}
                icon={<Search className="w-3.5 h-3.5 text-cyan-400" />}
                status={query.status}
                accentColor="cyan"
                isSelected={query.id === selectedQueryId}
                isStopped={stoppedNodeIds.has(query.id)}
                isPinned={pinnedQueryId === query.id}
                showPin
                showGear
                onClick={() => handleQueryClick(query.id)}
                onStop={() => toggleStopped(query.id)}
                onPin={() => togglePin(query.id)}
                onExpand={() => setExpandedNode({ id: query.id, name: query.name, kind: query.language, type: 'query', extra: { sources: query.sourceIds.join(', ') || '(none)' } })}
                onConfigure={() => setConfiguringQuery(query)}
              >
                {query.id === selectedQueryId && !stoppedNodeIds.has(query.id) && liveResults.length > 0 && (
                  <ResultsTable results={liveResults} isDemo={!isLive} />
                )}
              </NodeCard>
            ))}
          </div>

          {/* Reactions */}
          <div className="flex flex-col gap-3 col-start-5">
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Reactions</div>
            {reactions.map(reaction => (
              <NodeCard
                key={reaction.id}
                nodeRef={reactionRefs.current[reaction.id]}
                title={reaction.name}
                subtitle={reaction.kind}
                icon={<ReactionIconEl kind={reaction.kind} />}
                status={reaction.status}
                accentColor="emerald"
                isStopped={stoppedNodeIds.has(reaction.id)}
                onStop={() => toggleStopped(reaction.id)}
                onExpand={() => setExpandedNode({ id: reaction.id, name: reaction.name, kind: reaction.kind, type: 'reaction', extra: { queries: reaction.queryIds.join(', ') || '(none)' } })}
              />
            ))}
          </div>
        </div>

        <AnimatePresence>
          {expandedNode && <ExpandModal node={expandedNode} onClose={() => setExpandedNode(null)} />}
          {configuringSource && (
            <SourceConfigModal
              source={configuringSource}
              onSave={config => saveSourceConfig(configuringSource.id, config)}
              onClose={() => setConfiguringSource(null)}
            />
          )}
          {configuringQuery && (
            <QueryConfigModal
              query={configuringQuery}
              onSave={config => saveQueryConfig(configuringQuery.id, config)}
              onClose={() => setConfiguringQuery(null)}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
