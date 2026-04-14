/**
 * Drasi Reactive Graph Card
 *
 * Visualizes the Drasi reactive data pipeline:
 * Sources (HTTP, Postgres) → Continuous Queries (Cypher) → Reactions (SSE)
 * with an SVG-based trunk/branch flow topology, animated data flow dots,
 * dashed/solid connection styles, and a results table nested inside the
 * selected query node.
 *
 * Uses live Drasi API data when available, demo data when in demo mode.
 */
import { useState, useEffect, useMemo, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  Database, Globe, Search, Radio,
  TrendingDown, TrendingUp, Maximize2, Pin, Square,
} from 'lucide-react'
import { useCardDemoState, useReportCardDataState } from '../CardDataContext'
import { useCardExpanded } from '../CardWrapper'
import { useDrasiResources } from '../../../hooks/useDrasiResources'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** How often to refresh demo data values (animation-safe in-place update) */
const FLOW_ANIMATION_INTERVAL_MS = 3000
/** Maximum rows shown in the results table */
const MAX_RESULT_ROWS = 7
/** Number of dots flowing along each active connection line */
const FLOW_DOT_COUNT = 3
/** Flow dot animation cycle duration (ms) */
const FLOW_DOT_CYCLE_MS = 2000

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

function generateDemoData(): DrasiPipelineData {
  const sources: DrasiSource[] = [
    { id: 'src-price-feed', name: 'price-feed', kind: 'HTTP', status: 'ready' },
    { id: 'src-postgres-stocks', name: 'postgres-stocks', kind: 'POSTGRES', status: 'ready' },
    { id: 'src-postgres-broker', name: 'postgres-broker', kind: 'POSTGRES', status: 'ready' },
  ]

  const queries: DrasiQuery[] = [
    { id: 'q-watchlist', name: 'watchlist-query', language: 'CYPHER QUERY', status: 'ready', sourceIds: ['src-price-feed', 'src-postgres-stocks'] },
    { id: 'q-portfolio', name: 'portfolio-query', language: 'CYPHER QUERY', status: 'ready', sourceIds: ['src-postgres-stocks', 'src-postgres-broker'] },
    { id: 'q-top-gainers', name: 'top-gainers-query', language: 'CYPHER QUERY', status: 'ready', sourceIds: ['src-postgres-broker'] },
    { id: 'q-top-losers', name: 'top-losers-query', language: 'CYPHER QUERY', status: 'ready', sourceIds: ['src-price-feed', 'src-postgres-stocks', 'src-postgres-broker'] },
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
// Node card sub-components
// ---------------------------------------------------------------------------

/** Status pill that pulses when active */
function StatusDot({ status }: { status: 'ready' | 'error' | 'pending' }) {
  const color = status === 'ready' ? 'bg-green-400' : status === 'error' ? 'bg-red-400' : 'bg-yellow-400'
  return (
    <motion.div
      className={`w-2 h-2 rounded-full ${color}`}
      animate={status === 'ready' ? { scale: [1, 1.3, 1] } : {}}
      transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
    />
  )
}

/** Drasi-style node controls: stop, expand, pin (visual affordance, read-only) */
function NodeControls() {
  return (
    <div className="flex items-center gap-1.5 mt-1.5">
      <button
        type="button"
        className="w-5 h-5 flex items-center justify-center rounded bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 transition-colors"
        aria-label="Stop"
      >
        <Square className="w-2.5 h-2.5 text-red-400 fill-red-400" />
      </button>
      <button
        type="button"
        className="w-5 h-5 flex items-center justify-center rounded bg-slate-700/40 hover:bg-slate-700/60 border border-slate-600/40 transition-colors"
        aria-label="Expand"
      >
        <Maximize2 className="w-2.5 h-2.5 text-slate-400" />
      </button>
      <button
        type="button"
        className="w-5 h-5 flex items-center justify-center rounded bg-slate-700/40 hover:bg-slate-700/60 border border-slate-600/40 transition-colors"
        aria-label="Pin"
      >
        <Pin className="w-2.5 h-2.5 text-slate-400" />
      </button>
    </div>
  )
}

function SourceIcon({ kind }: { kind: SourceKind }) {
  if (kind === 'HTTP') return <Globe className="w-3.5 h-3.5 text-emerald-400" />
  return <Database className="w-3.5 h-3.5 text-emerald-400" />
}

function ReactionIcon({ kind }: { kind: ReactionKind }) {
  if (kind === 'SSE') return <Radio className="w-3.5 h-3.5 text-emerald-400" />
  return <Radio className="w-3.5 h-3.5 text-emerald-400" />
}

interface NodeCardProps {
  title: string
  subtitle: string
  icon: React.ReactNode
  status: 'ready' | 'error' | 'pending'
  accentColor: 'emerald' | 'cyan'
  isSelected?: boolean
  onClick?: () => void
  children?: React.ReactNode
}

function NodeCard({ title, subtitle, icon, status, accentColor, isSelected, onClick, children }: NodeCardProps) {
  const borderClass = isSelected
    ? accentColor === 'cyan' ? 'border-cyan-400/70 ring-1 ring-cyan-400/30' : 'border-emerald-400/70 ring-1 ring-emerald-400/30'
    : accentColor === 'cyan' ? 'border-cyan-500/30' : 'border-emerald-500/30'

  return (
    <motion.div
      className={`bg-slate-900/80 border rounded-lg p-2.5 ${borderClass} ${onClick ? 'cursor-pointer' : ''}`}
      whileHover={onClick ? { scale: 1.02 } : {}}
      onClick={onClick}
    >
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="text-white text-xs font-semibold truncate flex-1">{title}</span>
        <StatusDot status={status} />
      </div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">{subtitle}</div>
      <NodeControls />
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

/** One SVG path with optional animated dots flowing along it */
function FlowLine({ d, dashed, active = true, delay = 0 }: FlowLineProps) {
  return (
    <>
      <path
        d={d}
        fill="none"
        stroke="rgb(16 185 129)"
        strokeOpacity={dashed ? 0.4 : 0.7}
        strokeWidth={1.5}
        strokeDasharray={dashed ? '4 4' : undefined}
      />
      {active && !dashed && Array.from({ length: FLOW_DOT_COUNT }).map((_, i) => (
        <circle key={i} r={2.5} fill="rgb(52 211 153)">
          <animateMotion
            dur={`${FLOW_DOT_CYCLE_MS}ms`}
            repeatCount="indefinite"
            begin={`${delay + (i * FLOW_DOT_CYCLE_MS) / FLOW_DOT_COUNT}ms`}
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
                  <span className={`font-mono flex items-center gap-1 ${
                    row.changePercent < 0 ? 'text-red-400' : 'text-green-400'
                  }`}>
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
// Main component
// ---------------------------------------------------------------------------

export function DrasiReactiveGraph() {
  const { shouldUseDemoData: isDemoMode, showDemoBadge } = useCardDemoState({ requires: 'none' })
  const { isExpanded } = useCardExpanded()
  const { data: liveData, isLoading, error } = useDrasiResources()

  useReportCardDataState({
    isDemoData: showDemoBadge || (!liveData && !isLoading),
    isFailed: !!error,
    consecutiveFailures: error ? 1 : 0,
    hasData: true,
  })

  const [selectedQueryId, setSelectedQueryId] = useState<string>('q-top-losers')
  const [demoData, setDemoData] = useState<DrasiPipelineData>(generateDemoData)

  useEffect(() => {
    if (!isDemoMode && liveData) return
    const interval = setInterval(() => {
      setDemoData(generateDemoData())
    }, FLOW_ANIMATION_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [isDemoMode, liveData])

  const isLive = !!liveData && !isDemoMode
  const pipelineData = useMemo<DrasiPipelineData>(() => {
    if (isLive && liveData) return liveData
    return demoData
  }, [isLive, liveData, demoData])

  const { sources, queries, reactions, liveResults } = pipelineData

  // Keep selected query valid across data source switches
  useEffect(() => {
    if (queries.length > 0 && !queries.find(q => q.id === selectedQueryId)) {
      setSelectedQueryId(queries[0].id)
    }
  }, [queries, selectedQueryId])

  const handleQueryClick = useCallback((queryId: string) => {
    setSelectedQueryId(queryId)
  }, [])

  return (
    <div className={`h-full w-full flex flex-col p-3 ${isExpanded ? 'max-w-4xl mx-auto' : ''} overflow-hidden`}>
      <div className="relative flex-1 min-h-0">
        {/* SVG flow lines layer — positioned behind nodes */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          {/* Vertical trunk between sources and queries (x=34) */}
          <FlowLine d="M 34 6 L 34 78" />
          {/* Vertical trunk between queries and reactions (x=66) */}
          <FlowLine d="M 66 6 L 66 78" />

          {/* Horizontal branches: sources (x=22) → trunk1 (x=34) */}
          <FlowLine d="M 22 8 L 34 8" active delay={0} />
          <FlowLine d="M 22 22 L 34 22" active delay={400} />
          <FlowLine d="M 22 36 L 34 36" dashed />

          {/* Horizontal branches: trunk1 (x=34) → queries (x=38) */}
          <FlowLine d="M 34 8 L 38 8" active delay={200} />
          <FlowLine d="M 34 22 L 38 22" dashed />
          <FlowLine d="M 34 36 L 38 36" dashed />
          <FlowLine d="M 34 56 L 38 56" active delay={600} />

          {/* Horizontal branches: queries (x=62) → trunk2 (x=66) */}
          <FlowLine d="M 62 8 L 66 8" active delay={300} />
          <FlowLine d="M 62 22 L 66 22" dashed />
          <FlowLine d="M 62 36 L 66 36" dashed />
          <FlowLine d="M 62 56 L 66 56" active delay={800} />

          {/* Trunk2 → reaction (x=78) via curve up to top */}
          <FlowLine d="M 66 8 L 78 8" active delay={500} />
        </svg>

        {/* Node grid — 3 columns */}
        <div className="relative grid grid-cols-[22%_44%_22%] gap-x-[6%] h-full">
          {/* Sources column */}
          <div className="flex flex-col gap-3">
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Sources</div>
            {sources.slice(0, 3).map(source => (
              <NodeCard
                key={source.id}
                title={source.name}
                subtitle={source.kind}
                icon={<SourceIcon kind={source.kind} />}
                status={source.status}
                accentColor="emerald"
              />
            ))}
          </div>

          {/* Queries column */}
          <div className="flex flex-col gap-3">
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Continuous Queries</div>
            {queries.map(query => (
              <NodeCard
                key={query.id}
                title={query.name}
                subtitle={query.language}
                icon={<Search className="w-3.5 h-3.5 text-cyan-400" />}
                status={query.status}
                accentColor="cyan"
                isSelected={query.id === selectedQueryId}
                onClick={() => handleQueryClick(query.id)}
              >
                {query.id === selectedQueryId && liveResults.length > 0 && (
                  <ResultsTable results={liveResults} isDemo={!isLive} />
                )}
              </NodeCard>
            ))}
          </div>

          {/* Reactions column */}
          <div className="flex flex-col gap-3">
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Reactions</div>
            {reactions.map(reaction => (
              <NodeCard
                key={reaction.id}
                title={reaction.name}
                subtitle={reaction.kind}
                icon={<ReactionIcon kind={reaction.kind} />}
                status={reaction.status}
                accentColor="emerald"
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
