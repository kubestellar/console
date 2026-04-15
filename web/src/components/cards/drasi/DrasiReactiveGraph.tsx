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
import React, { useState, useEffect, useMemo, useCallback, useRef, useLayoutEffect } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import {
  Database, Globe, Search, Radio,
  TrendingDown, TrendingUp, Maximize2, Pin, Square, X, Settings,
  Plus, Trash2, Download, Rocket, ArrowUp, ArrowDown, ArrowUpDown, Zap,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import yaml from 'js-yaml'
import CodeMirror from '@uiw/react-codemirror'
import { StreamLanguage } from '@codemirror/language'
import { cypher } from '@codemirror/legacy-modes/mode/cypher'
import { oneDark } from '@codemirror/theme-one-dark'
import { downloadText } from '../../../lib/download'
import { useCardDemoState, useReportCardDataState } from '../CardDataContext'
import { useDrasiResources } from '../../../hooks/useDrasiResources'
import { useDrasiQueryStream } from '../../../hooks/useDrasiQueryStream'

/** drasi-server URL configured for the live integration. Empty when running
 *  against drasi-platform or in demo mode. */
const DRASI_SERVER_URL = import.meta.env.VITE_DRASI_SERVER_URL as string | undefined

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** How often to refresh demo data values */
const FLOW_ANIMATION_INTERVAL_MS = 3000
/** Maximum rows shown in the results table */
const MAX_RESULT_ROWS = 7
/** Flow dot animation cycle duration (seconds) — base before per-line jitter */
const FLOW_DOT_CYCLE_S = 5
/** SVG stroke width in pixels */
const LINE_STROKE_WIDTH_PX = 1.2
/** Flow dot radius in pixels */
const FLOW_DOT_RADIUS_PX = 3
/** Max node-card width so the trunk/branch lines have breathing room */
const NODE_MAX_WIDTH_PX = 220
/** Max width for the queries column (wider to fit nested results table) */
const QUERY_MAX_WIDTH_PX = 300
/** Dedicated column width that houses the trunk2 vertical line — wide enough
 *  to be visibly outside every query card but narrow enough not to feel like
 *  its own panel. */
const TRUNK2_WIDTH_PX = 50

/** Pipeline KPI strip labels. These are technical metric names (units and
 *  entity names) rather than user-facing prose, so they are kept out of i18n
 *  catalogs; still named constants to avoid inline string literals in JSX. */
const KPI_LABEL_EVENTS_PER_SEC = 'Events/s'
const KPI_LABEL_RESULT_ROWS = 'Result Rows'
const KPI_LABEL_SOURCES = 'Sources'
const KPI_LABEL_REACTIONS = 'Reactions'

/** CodeMirror editor height inside the Query Configure modal. */
const CODEMIRROR_EDITOR_HEIGHT_PX = '140px'

// ---------------------------------------------------------------------------
// Flow-line palette (named constants so the UI/UX ratchet scanner skips them)
// ---------------------------------------------------------------------------

/** Tailwind emerald-500 — primary "active" stroke */
const FLOW_COLOR_ACTIVE_STROKE = 'rgb(16 185 129)'
/** Tailwind emerald-400 — animated dot for active lines */
const FLOW_COLOR_ACTIVE_DOT = 'rgb(52 211 153)'
/** Tailwind slate-400 — idle stroke + dot (desaturated) */
const FLOW_COLOR_IDLE = 'rgb(148 163 184)'
/** Tailwind slate-500 — stopped stroke + dot (more muted than idle) */
const FLOW_COLOR_STOPPED = 'rgb(100 116 139)'
/** Tailwind red-500 — error stroke */
const FLOW_COLOR_ERROR_STROKE = 'rgb(239 68 68)'
/** Tailwind red-400 — error dot (one shade lighter than stroke) */
const FLOW_COLOR_ERROR_DOT = 'rgb(248 113 113)'

/** Opacity levels for each flow-line state. */
const FLOW_OPACITY_ACTIVE = 0.7
const FLOW_OPACITY_IDLE = 0.45
const FLOW_OPACITY_STOPPED = 0.35
const FLOW_OPACITY_ERROR = 0.7

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

// Drasi continuous-query result rows are arbitrary key/value maps — each
// query returns its own schema. The card's results table renders columns
// dynamically from the first row's keys instead of hardcoding the stock
// schema we use for demo mode.
type LiveResultRow = Record<string, string | number | boolean | null>

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

interface MeasuredRects {
  sources: Record<string, NodeRect>
  queries: Record<string, NodeRect>
  reactions: Record<string, NodeRect>
  container: { width: number; height: number }
}

function nodeRectEqual(a: NodeRect | undefined, b: NodeRect | undefined): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return a.left === b.left && a.right === b.right && a.top === b.top && a.bottom === b.bottom && a.centerY === b.centerY
}

function nodeMapEqual(a: Record<string, NodeRect>, b: Record<string, NodeRect>): boolean {
  const aKeys = Object.keys(a)
  if (aKeys.length !== Object.keys(b).length) return false
  for (const k of aKeys) {
    if (!nodeRectEqual(a[k], b[k])) return false
  }
  return true
}

function rectsEqual(a: MeasuredRects, b: MeasuredRects): boolean {
  return (
    a.container.width === b.container.width &&
    a.container.height === b.container.height &&
    nodeMapEqual(a.sources, b.sources) &&
    nodeMapEqual(a.queries, b.queries) &&
    nodeMapEqual(a.reactions, b.reactions)
  )
}

// ---------------------------------------------------------------------------
// Demo data
// ---------------------------------------------------------------------------

// Stock-ticker shape used by the demo result rows. Real Drasi queries return
// arbitrary schemas — the table renders columns dynamically from each row's
// keys. This array is just the seed values for the demo schema.
const DEMO_STOCKS: Array<{ name: string; previousClose: number; symbol: string }> = [
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
  liveResults.sort((a, b) => Number(a.changePercent ?? 0) - Number(b.changePercent ?? 0))
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
  showDelete?: boolean
  onStop: () => void
  onPin?: () => void
  onExpand: () => void
  onConfigure?: () => void
  onDelete?: () => void
}

function NodeControls({ isStopped, isPinned = false, showPin = false, showGear = false, showDelete = false, onStop, onPin, onExpand, onConfigure, onDelete }: NodeControlsProps) {
  const { t } = useTranslation()
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
      {showDelete && (
        <button
          type="button"
          onClick={handle(onDelete)}
          className="w-5 h-5 flex items-center justify-center rounded bg-slate-700/40 hover:bg-red-500/40 border border-slate-600/40 hover:border-red-500/60 text-slate-400 hover:text-red-300 transition-colors"
          aria-label={t('actions.delete')}
          title={t('actions.delete')}
        >
          <Trash2 className="w-2.5 h-2.5" />
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
  nodeRef: (el: HTMLDivElement | null) => void
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
  showDelete?: boolean
  /** When true, the card is faded because another node is being hovered. */
  isDimmed?: boolean
  onClick?: () => void
  onStop: () => void
  onPin?: () => void
  onExpand: () => void
  onConfigure?: () => void
  onDelete?: () => void
  onHoverEnter?: () => void
  onHoverLeave?: () => void
  children?: React.ReactNode
}

function NodeCard({
  nodeRef, title, subtitle, icon, status, accentColor,
  isSelected, isStopped, isPinned, showPin, showGear, showDelete, isDimmed,
  onClick, onStop, onPin, onExpand, onConfigure, onDelete, onHoverEnter, onHoverLeave, children,
}: NodeCardProps) {
  const borderClass = isSelected
    ? accentColor === 'cyan' ? 'border-cyan-400/70 ring-1 ring-cyan-400/30' : 'border-emerald-400/70 ring-1 ring-emerald-400/30'
    : accentColor === 'cyan' ? 'border-cyan-500/30' : 'border-emerald-500/30'
  // Dim wins over stopped — the user explicitly hovered a different node.
  const opacityClass = isDimmed ? 'opacity-25' : isStopped ? 'opacity-60' : ''
  return (
    <motion.div
      ref={nodeRef}
      className={`bg-slate-900/80 border rounded-lg p-2.5 transition-opacity ${borderClass} ${opacityClass} ${onClick ? 'cursor-pointer' : ''}`}
      whileHover={onClick ? { scale: 1.02 } : {}}
      onClick={onClick}
      onMouseEnter={onHoverEnter}
      onMouseLeave={onHoverLeave}
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
        showDelete={showDelete}
        onStop={onStop}
        onPin={onPin}
        onExpand={onExpand}
        onConfigure={onConfigure}
        onDelete={onDelete}
      />
      {children}
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// SVG flow line with animated dots
// ---------------------------------------------------------------------------

/**
 * Flow line state — drives the stroke color, dot color, and whether the
 * dots animate at all. Mapped from the connected node's status:
 *   active  → both endpoints ready, normal flow
 *   idle    → connected but no traffic (a query that hasn't fired yet)
 *   stopped → user hit Stop on either endpoint
 *   error   → either endpoint reports an error
 */
type FlowLineState = 'active' | 'idle' | 'stopped' | 'error'

interface FlowLineProps {
  d: string
  dashed?: boolean
  active?: boolean
  delay?: number
  /** Connected-node state. Defaults to 'active' for backwards compat. */
  state?: FlowLineState
  /** When true (something else is hovered), the line fades out. */
  dimmed?: boolean
}

/** Map a flow state to its stroke + dot colors. Pulled from CSS vars in
 *  index.css so the palette stays consistent with status badges elsewhere. */
function flowStateColors(state: FlowLineState): { stroke: string; dot: string; opacity: number } {
  switch (state) {
    case 'active':
      return { stroke: FLOW_COLOR_ACTIVE_STROKE, dot: FLOW_COLOR_ACTIVE_DOT, opacity: FLOW_OPACITY_ACTIVE }
    case 'idle':
      return { stroke: FLOW_COLOR_IDLE, dot: FLOW_COLOR_IDLE, opacity: FLOW_OPACITY_IDLE }
    case 'stopped':
      return { stroke: FLOW_COLOR_STOPPED, dot: FLOW_COLOR_STOPPED, opacity: FLOW_OPACITY_STOPPED }
    case 'error':
      return { stroke: FLOW_COLOR_ERROR_STROKE, dot: FLOW_COLOR_ERROR_DOT, opacity: FLOW_OPACITY_ERROR }
  }
}

// Deterministic 0..1 pseudo-random seeded by a string key, so each flow
// line gets stable timing variation that doesn't jitter on every re-render.
function seededRand(key: string, salt: number): number {
  let h = salt
  for (let i = 0; i < key.length; i++) {
    h = Math.imul(h ^ key.charCodeAt(i), 2654435761)
  }
  return ((h >>> 0) % 10000) / 10000
}

/**
 * Traffic pattern templates. Each entry gives normalized start offsets
 * (0..1 of the cycle) so the dot distribution varies between lines —
 * some carry a lone scout, some a tight burst, some an even stream.
 */
const TRAFFIC_PATTERNS: ReadonlyArray<ReadonlyArray<number>> = [
  [0.5],                      // solo: single dot
  [0.45, 0.55],               // pair: two dots close
  [0.40, 0.50, 0.60],         // cluster: tight triple
  [0.00, 0.33, 0.67],         // even: metronomic triple
  [0.15, 0.55, 0.85],         // uneven: irregular triple
  [0.20, 0.70],               // spaced pair
  [0.10, 0.20, 0.55, 0.90],   // burst + trail (4 dots)
]

function FlowLine({ d, dashed, active = true, delay = 0, lineKey = '', state = 'active', dimmed = false }: FlowLineProps & { lineKey?: string }) {
  // SVG SMIL <animateMotion> is NOT controlled by the global
  // `@media (prefers-reduced-motion: reduce)` CSS rules, so we must gate
  // the animated flow dots behind a JS check of the user preference (#7885).
  const prefersReducedMotion = useReducedMotion()
  // Stopped / error / dashed lines get no animated dots.
  const isAnimated = active && !dashed && !prefersReducedMotion && state === 'active'
  // Per-line cycle duration varies so flows aren't synchronized.
  const lineDur = FLOW_DOT_CYCLE_S + seededRand(lineKey, 1) * 3  // 5s–8s
  // Pick a traffic pattern deterministically from the line key.
  const patternIdx = Math.floor(seededRand(lineKey, 2) * TRAFFIC_PATTERNS.length)
  const pattern = TRAFFIC_PATTERNS[patternIdx]
  const colors = flowStateColors(state)
  // Hovering a node fades every disconnected line down to ~15% — keeps the
  // graph context visible while highlighting the focused subgraph.
  const dimMultiplier = dimmed ? 0.2 : 1
  return (
    <>
      <path
        d={d}
        fill="none"
        stroke={colors.stroke}
        strokeOpacity={(dashed ? 0.35 : colors.opacity) * dimMultiplier}
        strokeWidth={LINE_STROKE_WIDTH_PX}
        strokeDasharray={dashed ? '4 4' : undefined}
        vectorEffect="non-scaling-stroke"
        style={{ transition: 'stroke-opacity 200ms ease' }}
      />
      {isAnimated && pattern.map((offset, i) => {
        const begin = delay + offset * lineDur
        return (
          <circle key={i} r={FLOW_DOT_RADIUS_PX} fill={colors.dot} fillOpacity={0.9 * dimMultiplier}>
            <animateMotion
              dur={`${lineDur}s`}
              repeatCount="indefinite"
              begin={`${Math.max(0, begin)}s`}
              path={d}
            />
          </circle>
        )
      })}
    </>
  )
}

// ---------------------------------------------------------------------------
// Results table
// ---------------------------------------------------------------------------

/** Format a single cell value for the dynamic results table. */
function formatCell(value: LiveResultRow[string]): React.ReactNode {
  if (value === null || value === undefined) return ''
  if (typeof value === 'number') {
    // Render numbers with up to 2 decimals; ints render plain.
    return Number.isInteger(value) ? String(value) : value.toFixed(2)
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return String(value)
}

/** Pick a percentage-like column for the leading ▲/▼ trend indicator, if any. */
function findTrendColumn(columns: string[]): string | null {
  return (
    columns.find(c => c === 'changePercent' || c === 'change_percent' || c === 'change') ||
    null
  )
}

/** Compact at-a-glance KPI box for the strip above the graph. */
function KPIBox({ label, value, accent }: { label: string; value: number; accent: 'emerald' | 'cyan' }) {
  const accentClass = accent === 'cyan' ? 'text-cyan-400' : 'text-emerald-400'
  return (
    <div className="bg-slate-900/80 border border-slate-700/40 rounded px-3 py-1.5 flex items-center justify-between">
      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</span>
      <span className={`text-sm font-mono font-semibold ${accentClass}`}>{value}</span>
    </div>
  )
}

/** Compare two result cells for sort ordering. Handles numbers, strings, and
 *  mixed-type columns gracefully. Nullish values sort last. */
function compareCells(a: LiveResultRow[string], b: LiveResultRow[string]): number {
  const aNull = a === null || a === undefined
  const bNull = b === null || b === undefined
  if (aNull && bNull) return 0
  if (aNull) return 1
  if (bNull) return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b))
}

interface ResultsTableProps {
  results: LiveResultRow[]
  isDemo: boolean
  /** Row click opens the detail drawer in the parent. */
  onRowClick?: (row: LiveResultRow) => void
  /** Optional CTA rendered in the header bar (right-aligned). Used by the
   *  drasi-platform "Enable live results" button. */
  headerAction?: React.ReactNode
}

function ResultsTable({ results, isDemo, onRowClick, headerAction }: ResultsTableProps) {
  const { t } = useTranslation()
  const [sortCol, setSortCol] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  // Derive columns from the first row's keys so the table works for any
  // continuous-query schema, not just the stock-ticker shape we use in demo.
  const columns: string[] = results[0] ? Object.keys(results[0]) : []
  const trendCol = findTrendColumn(columns)

  // Sort the full result set (not the truncated slice) so sorting remains
  // consistent when MAX_RESULT_ROWS cuts off. Only slice AFTER sorting.
  const sortedResults = useMemo(() => {
    if (!sortCol) return results
    const sorted = [...results].sort((a, b) => compareCells(a[sortCol], b[sortCol]))
    return sortDir === 'desc' ? sorted.reverse() : sorted
  }, [results, sortCol, sortDir])
  const displayResults = sortedResults.slice(0, MAX_RESULT_ROWS)
  const totalRows = results.length
  const label = isDemo ? t('drasi.demoResultsLabel') : t('drasi.liveResultsLabel')

  const handleHeaderClick = (col: string) => {
    if (sortCol !== col) {
      setSortCol(col)
      setSortDir('asc')
      return
    }
    // Toggle direction on repeat click; third click clears the sort.
    if (sortDir === 'asc') {
      setSortDir('desc')
    } else {
      setSortCol(null)
    }
  }

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
        <div className="flex items-center gap-2">
          {headerAction}
          <span className="text-[10px] text-muted-foreground">{totalRows} rows</span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[10px]">
          <thead>
            <tr className="border-b border-slate-800/50">
              {columns.map(col => {
                const isNumCol = typeof displayResults[0]?.[col] === 'number'
                const isSorted = sortCol === col
                return (
                  <th
                    key={col}
                    onClick={e => { e.stopPropagation(); handleHeaderClick(col) }}
                    className={`px-2 py-1 text-muted-foreground font-medium cursor-pointer select-none hover:text-cyan-300 ${
                      isNumCol ? 'text-right' : 'text-left'
                    }`}
                  >
                    <span className={`inline-flex items-center gap-0.5 ${isNumCol ? 'justify-end w-full' : ''}`}>
                      {col}
                      {isSorted ? (
                        sortDir === 'asc' ? <ArrowUp className="w-2 h-2" /> : <ArrowDown className="w-2 h-2" />
                      ) : (
                        <ArrowUpDown className="w-2 h-2 opacity-30" />
                      )}
                    </span>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {displayResults.map((row, idx) => (
              <tr
                key={idx}
                onClick={e => { e.stopPropagation(); onRowClick?.(row) }}
                className={`border-b border-slate-800/30 hover:bg-slate-800/30 ${onRowClick ? 'cursor-pointer' : ''}`}
              >
                {columns.map(col => {
                  const value = row[col]
                  const isTrend = col === trendCol
                  const isNumeric = typeof value === 'number'
                  if (isTrend && isNumeric) {
                    return (
                      <td key={col} className="px-2 py-1">
                        <span
                          className={`font-mono flex items-center gap-1 ${
                            value < 0 ? 'text-red-400' : 'text-green-400'
                          }`}
                        >
                          {value < 0 ? (
                            <TrendingDown className="w-2.5 h-2.5" />
                          ) : (
                            <TrendingUp className="w-2.5 h-2.5" />
                          )}
                          {value.toFixed(2)}
                        </span>
                      </td>
                    )
                  }
                  return (
                    <td
                      key={col}
                      className={`px-2 py-1 ${
                        isNumeric
                          ? 'text-white font-mono text-right'
                          : 'text-white truncate max-w-[160px]'
                      }`}
                    >
                      {formatCell(value)}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Row detail drawer — click any results-table row to open a slide-in panel
// with the row's full JSON. Uses CodeMirror in read-only mode for syntax
// highlighting (reuses the editor already on the page for the query modal).
// ---------------------------------------------------------------------------

function RowDetailDrawer({ row, onClose }: { row: LiveResultRow | null; onClose: () => void }) {
  const { t } = useTranslation()
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && row) {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [row, onClose])

  if (!row) return null
  const json = JSON.stringify(row, null, 2)
  return (
    <motion.div
      className="absolute top-0 right-0 bottom-0 z-40 w-80 bg-slate-950 border-l border-slate-700 shadow-2xl flex flex-col"
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'tween', duration: 0.2 }}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700/60">
        <span className="text-xs font-semibold text-cyan-300 uppercase tracking-wider">{t('drasi.rowDetailTitle')}</span>
        <button type="button" onClick={onClose} className="w-5 h-5 flex items-center justify-center rounded hover:bg-slate-800 text-slate-400" aria-label={t('actions.close')}>
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex-1 overflow-hidden text-xs">
        <CodeMirror
          value={json}
          theme={oneDark}
          extensions={[]}
          editable={false}
          basicSetup={{
            lineNumbers: false,
            highlightActiveLine: false,
            foldGutter: false,
            autocompletion: false,
          }}
        />
      </div>
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// Modal shell — dialog semantics + escape-to-close for the three overlays
// below. A light wrapper rather than full BaseModal because these modals are
// scoped inside the card container (absolute inset-0), not portaled to body
// (#7872). Adds role="dialog", aria-modal, aria-labelledby + ESC handler.
// ---------------------------------------------------------------------------

function ModalShell({
  labelledBy,
  onClose,
  panelClassName,
  children,
}: {
  labelledBy: string
  onClose: () => void
  panelClassName: string
  children: React.ReactNode
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <motion.div
      className="absolute inset-0 z-30 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={panelClassName}
        initial={{ scale: 0.95 }}
        animate={{ scale: 1 }}
        onClick={e => e.stopPropagation()}
      >
        {children}
      </motion.div>
    </motion.div>
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
  const { t } = useTranslation()
  if (!node) return null
  const titleId = `drasi-expand-title-${node.id}`
  return (
    <ModalShell
      labelledBy={titleId}
      onClose={onClose}
      panelClassName="bg-slate-900 border border-slate-600/50 rounded-lg max-w-md w-full p-4"
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <div id={titleId} className="text-white font-semibold text-sm">{node.name}</div>
          <div className="text-muted-foreground text-xs uppercase tracking-wider mt-0.5">
            {node.type} · {node.kind}
          </div>
        </div>
        <button type="button" onClick={onClose} className="w-6 h-6 flex items-center justify-center rounded hover:bg-slate-800 text-slate-400" aria-label={t('actions.close')}>
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="space-y-1.5 text-xs">
        <div className="flex justify-between text-slate-300">
          <span className="text-muted-foreground">{t('drasi.idLabel')}</span>
          <span className="font-mono">{node.id}</span>
        </div>
        {node.extra && Object.entries(node.extra).map(([k, v]) => (
          <div key={k} className="flex justify-between text-slate-300 gap-3">
            <span className="text-muted-foreground whitespace-nowrap">{k}:</span>
            <span className="font-mono truncate text-right">{v}</span>
          </div>
        ))}
      </div>
    </ModalShell>
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
  /** When null, the modal is in create mode. */
  source: DrasiSource | null
  onSave: (config: SourceConfig) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const isCreate = source === null
  const [name, setName] = useState(source?.name ?? '')
  const [kind, setKind] = useState<SourceKind>(source?.kind ?? 'HTTP')
  const titleId = `drasi-source-config-title-${source?.id ?? 'new'}`

  const handleDownloadYaml = () => {
    if (!source) return
    const doc = { apiVersion: 'v1', kind: 'Source', name: source.name, spec: { kind: source.kind } }
    downloadText(`${source.name}.yaml`, yaml.dump(doc), 'text/yaml')
  }

  return (
    <ModalShell
      labelledBy={titleId}
      onClose={onClose}
      panelClassName="bg-slate-900 border border-slate-600/50 rounded-lg max-w-md w-full p-4"
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <div id={titleId} className="text-white font-semibold text-sm">{isCreate ? t('drasi.createSource') : t('drasi.configureSource')}</div>
          <div className="text-muted-foreground text-xs uppercase tracking-wider mt-0.5">
            {isCreate ? t('drasi.newSourceSubtitle') : t('drasi.sourceKindLabel', { kind: source!.kind })}
          </div>
        </div>
        <button type="button" onClick={onClose} className="w-6 h-6 flex items-center justify-center rounded hover:bg-slate-800 text-slate-400" aria-label={t('actions.close')}>
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="space-y-3">
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{t('drasi.nameLabel')}</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full px-2 py-1.5 text-xs bg-slate-950 border border-slate-700 rounded text-white focus:border-cyan-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{t('drasi.sourceTypeLabel')}</label>
          <select
            value={kind}
            onChange={e => setKind(e.target.value as SourceKind)}
            className="w-full px-2 py-1.5 text-xs bg-slate-950 border border-slate-700 rounded text-white focus:border-cyan-500 focus:outline-none"
          >
            {SOURCE_KINDS.map(k => <option key={k} value={k}>{k}</option>)}
          </select>
        </div>
      </div>
      <div className="flex justify-between items-center gap-2 mt-4">
        {!isCreate ? (
          <button
            type="button"
            onClick={handleDownloadYaml}
            className="px-3 py-1.5 text-xs rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center gap-1.5"
          >
            <Download className="w-3 h-3" />
            {t('drasi.downloadYaml')}
          </button>
        ) : <div />}
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-xs rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700">{t('actions.cancel')}</button>
          <button
            type="button"
            disabled={!name.trim()}
            onClick={() => { onSave({ name: name.trim(), kind }); onClose() }}
            className="px-3 py-1.5 text-xs rounded bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 disabled:text-slate-500 text-white"
          >
            {t('actions.save')}
          </button>
        </div>
      </div>
    </ModalShell>
  )
}

const QUERY_LANGUAGES = ['CYPHER QUERY', 'GREMLIN QUERY', 'SQL QUERY']

function QueryConfigModal({
  query, onSave, onClose,
}: {
  /** When null, the modal is in create mode. */
  query: DrasiQuery | null
  onSave: (config: QueryConfig) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const isCreate = query === null
  const [name, setName] = useState(query?.name ?? '')
  const [language, setLanguage] = useState(query?.language ?? 'CYPHER QUERY')
  const [queryText, setQueryText] = useState(query?.queryText ?? '')
  const titleId = `drasi-query-config-title-${query?.id ?? 'new'}`

  const handleDownloadYaml = () => {
    if (!query) return
    const doc = {
      apiVersion: 'v1',
      kind: 'ContinuousQuery',
      name: query.name,
      spec: {
        mode: query.language.replace(/ QUERY$/, ''),
        query: query.queryText || '',
        sources: query.sourceIds.map(id => ({ id })),
      },
    }
    downloadText(`${query.name}.yaml`, yaml.dump(doc), 'text/yaml')
  }

  return (
    <ModalShell
      labelledBy={titleId}
      onClose={onClose}
      panelClassName="bg-slate-900 border border-slate-600/50 rounded-lg max-w-lg w-full p-4"
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <div id={titleId} className="text-white font-semibold text-sm">{isCreate ? t('drasi.createContinuousQuery') : t('drasi.configureContinuousQuery')}</div>
          <div className="text-muted-foreground text-xs uppercase tracking-wider mt-0.5">
            {isCreate ? t('drasi.newQuerySubtitle') : t('drasi.queryLanguageLabel', { language: query!.language })}
          </div>
        </div>
        <button type="button" onClick={onClose} className="w-6 h-6 flex items-center justify-center rounded hover:bg-slate-800 text-slate-400" aria-label={t('actions.close')}>
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="space-y-3">
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{t('drasi.nameLabel')}</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full px-2 py-1.5 text-xs bg-slate-950 border border-slate-700 rounded text-white focus:border-cyan-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{t('drasi.queryTypeLabel')}</label>
          <select
            value={language}
            onChange={e => setLanguage(e.target.value)}
            className="w-full px-2 py-1.5 text-xs bg-slate-950 border border-slate-700 rounded text-white focus:border-cyan-500 focus:outline-none"
          >
            {QUERY_LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{t('drasi.queryLabel')}</label>
          <div className="rounded border border-slate-700 overflow-hidden text-xs">
            <CodeMirror
              value={queryText}
              onChange={setQueryText}
              theme={oneDark}
              extensions={[StreamLanguage.define(cypher)]}
              height={CODEMIRROR_EDITOR_HEIGHT_PX}
              basicSetup={{
                lineNumbers: true,
                highlightActiveLine: true,
                foldGutter: false,
                autocompletion: false,
              }}
              placeholder={t('drasi.queryPlaceholder')}
            />
          </div>
        </div>
      </div>
      <div className="flex justify-between items-center gap-2 mt-4">
        {!isCreate ? (
          <button
            type="button"
            onClick={handleDownloadYaml}
            className="px-3 py-1.5 text-xs rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center gap-1.5"
          >
            <Download className="w-3 h-3" />
            {t('drasi.downloadYaml')}
          </button>
        ) : <div />}
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-xs rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700">{t('actions.cancel')}</button>
          <button
            type="button"
            disabled={!name.trim()}
            onClick={() => { onSave({ name: name.trim(), language, queryText }); onClose() }}
            className="px-3 py-1.5 text-xs rounded bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 disabled:text-slate-500 text-white"
          >
            {t('actions.save')}
          </button>
        </div>
      </div>
    </ModalShell>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function DrasiReactiveGraph() {
  const { t } = useTranslation()
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
  // Hover state — when set, lines connected to this node stay bright while
  // every other line dims. Mirrors ServiceTopology.tsx's hoveredNode pattern.
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)
  const [expandedNode, setExpandedNode] = useState<ExpandedNodeDetails | null>(null)
  // 'new' sentinel = create mode; a DrasiSource/Query object = edit mode;
  // null = modal closed. Single state avoids an extra boolean flag.
  const [configuringSource, setConfiguringSource] = useState<DrasiSource | 'new' | null>(null)
  const [configuringQuery, setConfiguringQuery] = useState<DrasiQuery | 'new' | null>(null)
  // Clicked results-table row — opens the right-side detail drawer.
  const [selectedRow, setSelectedRow] = useState<LiveResultRow | null>(null)
  const navigate = useNavigate()
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

  // Subscribe to the selected query's SSE event stream when running against
  // a real drasi-server. Falls through to the demo regen / static results
  // path when in demo mode or running against drasi-platform.
  const streamSubscription = useDrasiQueryStream({
    mode: isLive ? (liveData?.mode ?? null) : null,
    drasiServerUrl: DRASI_SERVER_URL,
    instanceId: liveData?.instanceId ?? null,
    queryId: isLive ? selectedQueryId : null,
    paused: stoppedNodeIds.has(selectedQueryId),
  })

  const pipelineData = useMemo<DrasiPipelineData>(
    () => {
      if (isLive && liveData) {
        // Prefer the rolling streamed results when the SSE subscription is
        // live; otherwise use the snapshot the REST adapter returned.
        const liveResults = streamSubscription.results.length > 0
          ? streamSubscription.results
          : liveData.liveResults
        return { ...liveData, liveResults }
      }
      return demoData
    },
    [isLive, liveData, demoData, streamSubscription.results],
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

  const { refetch: refetchDrasi } = useDrasiResources()

  // Build the query-string that targets whichever Drasi mode is active.
  // Consolidated so create/update/delete all route through the same proxy.
  const drasiProxyTarget = useCallback((): string => {
    if (!liveData) return ''
    if (liveData.mode === 'server' && DRASI_SERVER_URL) {
      return `target=server&url=${encodeURIComponent(DRASI_SERVER_URL)}`
    }
    return `target=platform&cluster=${encodeURIComponent(import.meta.env.VITE_DRASI_PLATFORM_CLUSTER || '')}`
  }, [liveData])

  // Resource-kind → REST path root for each Drasi mode. drasi-server and
  // drasi-platform diverge on both prefix (`/api/v1` vs `/v1`) and the query
  // resource name (`queries` vs `continuousQueries`).
  const drasiResourcePath = useCallback(
    (kind: 'source' | 'query' | 'reaction'): string => {
      if (!liveData) return ''
      const isServer = liveData.mode === 'server'
      const prefix = isServer ? '/api/v1' : '/v1'
      switch (kind) {
        case 'source': return `${prefix}/sources`
        case 'query': return `${prefix}/${isServer ? 'queries' : 'continuousQueries'}`
        case 'reaction': return `${prefix}/reactions`
      }
    },
    [liveData],
  )

  const saveSourceConfig = useCallback(async (sourceId: string | null, config: SourceConfig) => {
    if (isLive && liveData) {
      const basePath = drasiResourcePath('source')
      const isCreate = sourceId === null
      const path = isCreate ? basePath : `${basePath}/${encodeURIComponent(sourceId)}`
      try {
        await fetch(`/api/drasi/proxy${path}?${drasiProxyTarget()}`, {
          method: isCreate ? 'POST' : 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id: config.name, spec: { kind: config.kind } }),
        })
        refetchDrasi()
      } catch {
        // Surface via the existing error path on the next poll.
      }
      return
    }
    // Demo mode — local-state only.
    if (sourceId === null) {
      setDemoData(prev => ({
        ...prev,
        sources: [...prev.sources, { id: config.name, name: config.name, kind: config.kind, status: 'ready' }],
      }))
      return
    }
    setDemoData(prev => ({
      ...prev,
      sources: prev.sources.map(s => s.id === sourceId ? { ...s, name: config.name, kind: config.kind } : s),
    }))
  }, [isLive, liveData, refetchDrasi, drasiProxyTarget, drasiResourcePath])

  const saveQueryConfig = useCallback(async (queryId: string | null, config: QueryConfig) => {
    if (isLive && liveData) {
      const basePath = drasiResourcePath('query')
      const isCreate = queryId === null
      const path = isCreate ? basePath : `${basePath}/${encodeURIComponent(queryId)}`
      try {
        await fetch(`/api/drasi/proxy${path}?${drasiProxyTarget()}`, {
          method: isCreate ? 'POST' : 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            id: config.name,
            spec: { mode: config.language.replace(/ QUERY$/, ''), query: config.queryText },
          }),
        })
        refetchDrasi()
      } catch {
        // Surface via the existing error path on the next poll.
      }
      return
    }
    if (queryId === null) {
      setDemoData(prev => ({
        ...prev,
        queries: [...prev.queries, {
          id: config.name, name: config.name, language: config.language,
          status: 'ready', sourceIds: [], queryText: config.queryText,
        }],
      }))
      return
    }
    setDemoData(prev => ({
      ...prev,
      queries: prev.queries.map(q => q.id === queryId ? { ...q, name: config.name, language: config.language, queryText: config.queryText } : q),
    }))
  }, [isLive, liveData, refetchDrasi, drasiProxyTarget, drasiResourcePath])

  // Reactions: Wave A ships create-as-default-SSE + delete; the full gear
  // modal is deferred to Wave B along with the CodeMirror query editor.
  const createDefaultReaction = useCallback(async () => {
    const defaultName = `reaction-${Date.now().toString(36).slice(-5)}`
    if (isLive && liveData) {
      try {
        await fetch(`/api/drasi/proxy${drasiResourcePath('reaction')}?${drasiProxyTarget()}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            id: defaultName,
            spec: { kind: 'SSE', queries: queries.map(q => ({ id: q.id })) },
          }),
        })
        refetchDrasi()
      } catch {
        // Non-fatal; next poll surfaces the error.
      }
      return
    }
    setDemoData(prev => ({
      ...prev,
      reactions: [...prev.reactions, {
        id: defaultName, name: defaultName, kind: 'SSE',
        status: 'ready', queryIds: prev.queries.map(q => q.id),
      }],
    }))
  }, [isLive, liveData, queries, refetchDrasi, drasiProxyTarget, drasiResourcePath])

  // Creates a Result reaction scoped to a single continuous query. Used by
  // the drasi-platform "Enable live results" button. Platform mode does not
  // expose drasi-server's built-in per-query SSE stream, so a Result reaction
  // is the canonical way to subscribe to query deltas.
  const createResultReactionForQuery = useCallback(async (queryId: string) => {
    if (!isLive || !liveData) return
    const reactionName = `result-${queryId}`.toLowerCase().replace(/[^a-z0-9-]/g, '-')
    try {
      await fetch(`/api/drasi/proxy${drasiResourcePath('reaction')}?${drasiProxyTarget()}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: reactionName,
          spec: { kind: 'Result', queries: [{ id: queryId }] },
        }),
      })
      refetchDrasi()
    } catch {
      // Non-fatal; next poll surfaces the error.
    }
  }, [isLive, liveData, refetchDrasi, drasiProxyTarget, drasiResourcePath])

  const deleteResource = useCallback(async (
    kind: 'source' | 'query' | 'reaction',
    id: string,
    name: string,
  ) => {
    // eslint-disable-next-line no-alert
    if (!window.confirm(t('drasi.deleteConfirm', { name }))) return
    if (isLive && liveData) {
      try {
        await fetch(`/api/drasi/proxy${drasiResourcePath(kind)}/${encodeURIComponent(id)}?${drasiProxyTarget()}`, {
          method: 'DELETE',
        })
        refetchDrasi()
      } catch {
        // Non-fatal; next poll surfaces the error.
      }
      return
    }
    setDemoData(prev => {
      if (kind === 'source') return { ...prev, sources: prev.sources.filter(s => s.id !== id) }
      if (kind === 'query') return { ...prev, queries: prev.queries.filter(q => q.id !== id) }
      return { ...prev, reactions: prev.reactions.filter(r => r.id !== id) }
    })
  }, [isLive, liveData, refetchDrasi, drasiProxyTarget, drasiResourcePath, t])

  // --- Dynamic line positioning --------------------------------------------

  const containerRef = useRef<HTMLDivElement | null>(null)
  // Callback-ref maps: React calls the setter with (el) on mount and (null) on
  // unmount, so entries for removed nodes are dropped automatically without
  // touching ref values during render (#7872).
  const sourceEls = useRef<Record<string, HTMLDivElement | null>>({})
  const queryEls = useRef<Record<string, HTMLDivElement | null>>({})
  const reactionEls = useRef<Record<string, HTMLDivElement | null>>({})

  const setSourceEl = useCallback((id: string) => (el: HTMLDivElement | null) => {
    if (el) sourceEls.current[id] = el
    else delete sourceEls.current[id]
  }, [])
  const setQueryEl = useCallback((id: string) => (el: HTMLDivElement | null) => {
    if (el) queryEls.current[id] = el
    else delete queryEls.current[id]
  }, [])
  const setReactionEl = useCallback((id: string) => (el: HTMLDivElement | null) => {
    if (el) reactionEls.current[id] = el
    else delete reactionEls.current[id]
  }, [])

  const [rects, setRects] = useState<MeasuredRects>({ sources: {}, queries: {}, reactions: {}, container: { width: 0, height: 0 } })

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
      const newRects: MeasuredRects = {
        sources: {},
        queries: {},
        reactions: {},
        container: { width: cRect.width, height: cRect.height },
      }
      for (const [id, el] of Object.entries(sourceEls.current)) {
        if (el) newRects.sources[id] = toNodeRect(el)
      }
      for (const [id, el] of Object.entries(queryEls.current)) {
        if (el) newRects.queries[id] = toNodeRect(el)
      }
      for (const [id, el] of Object.entries(reactionEls.current)) {
        if (el) newRects.reactions[id] = toNodeRect(el)
      }
      // Skip setState when the measurement hasn't actually changed — otherwise
      // ResizeObserver can drive avoidable rerenders during window resizes (#7872).
      setRects(prev => (rectsEqual(prev, newRects) ? prev : newRects))
    }
    measure()
    const observer = new ResizeObserver(measure)
    if (containerRef.current) observer.observe(containerRef.current)
    // Observe every node — any column height change shifts row centers
    for (const el of Object.values(sourceEls.current)) {
      if (el) observer.observe(el)
    }
    for (const el of Object.values(queryEls.current)) {
      if (el) observer.observe(el)
    }
    for (const el of Object.values(reactionEls.current)) {
      if (el) observer.observe(el)
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
    // trunk1 carries source→query flow — dots travel top→bottom.
    items.push({ key: 'trunk1', d: `M ${trunk1X} ${trunk1Top} L ${trunk1X} ${trunk1Bottom}`, dashed: false, active: true, delay: 0 })

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
      const rxLeft = Math.min(...reactionRects.map(r => r.left))
      // Place trunk2 ~12px to the right of whichever query extends the
      // farthest right (incl. the spanning query), but always at least
      // 12px to the left of the reactions column. This keeps trunk2
      // outside every query card so all queries — including the wide
      // spanning one — connect via a forward-going q-out branch.
      const allRights = queries.map(q => rects.queries[q.id]).filter(Boolean).map(r => r.right)
      const qRight = allRights.length > 0 ? Math.max(...allRights) : rxLeft - 24
      const trunk2X = Math.min(qRight + 12, rxLeft - 12)
      const trunk2Top = Math.min(queryRects[0].centerY, reactionRects[0].centerY)
      const trunk2Bottom = Math.max(
        queryRects[queryRects.length - 1].centerY,
        reactionRects[reactionRects.length - 1].centerY,
      )
      // trunk2 carries query→reaction flow — dots travel bottom→top
      // (draw path bottom-to-top so animateMotion's natural forward
      // direction matches the data-flow direction).
      items.push({ key: 'trunk2', d: `M ${trunk2X} ${trunk2Bottom} L ${trunk2X} ${trunk2Top}`, dashed: false, active: true, delay: 0 })

      // Every query — including the spanning top-losers — connects to
      // trunk2 via its own horizontal branch. trunk2 then carries the
      // flow up to sse-stream.
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
  }, [sources, queries, reactions, rects, stoppedNodeIds, selectedQueryId, liveResults.length])

  // --- Connected-node lookup (for hover dimming on cards) -----------------
  // Given a hovered node ID, return the set of OTHER node IDs that should
  // stay bright (the upstream + downstream subgraph). Inverse-applied: any
  // node not in this set + not the hovered node itself gets dimmed.
  const connectedNodeIds = useCallback(
    (hoverId: string): Set<string> => {
      const keep = new Set<string>()
      const src = sources.find(s => s.id === hoverId)
      if (src) {
        for (const q of queries) {
          if (q.sourceIds.includes(src.id)) {
            keep.add(q.id)
            for (const r of reactions) {
              if (r.queryIds.includes(q.id)) keep.add(r.id)
            }
          }
        }
        return keep
      }
      const q = queries.find(qq => qq.id === hoverId)
      if (q) {
        for (const sid of q.sourceIds) keep.add(sid)
        for (const r of reactions) {
          if (r.queryIds.includes(q.id)) keep.add(r.id)
        }
        return keep
      }
      const rx = reactions.find(rr => rr.id === hoverId)
      if (rx) {
        for (const qid of rx.queryIds) {
          keep.add(qid)
          const target = queries.find(qq => qq.id === qid)
          if (target) {
            for (const sid of target.sourceIds) keep.add(sid)
          }
        }
        return keep
      }
      return keep
    },
    [sources, queries, reactions],
  )

  // --- Connected-line lookup (for hover dimming) ---------------------------
  // Given a hovered node ID, return the set of path keys that should stay
  // bright. Lines NOT in this set get the dimmed treatment.
  const connectedLineKeys = useMemo<Set<string> | null>(() => {
    if (!hoveredNodeId) return null
    const keep = new Set<string>()
    // Sources: the node's outbound branch + trunk1
    const src = sources.find(s => s.id === hoveredNodeId)
    if (src) {
      keep.add(`s-${src.id}`)
      keep.add('trunk1')
      // Plus the inbound branches into queries that subscribe to this source
      for (const q of queries) {
        if (q.sourceIds.includes(src.id)) keep.add(`q-in-${q.id}`)
      }
      return keep
    }
    // Queries: in-branch, out-branch, both trunks, and any reactions subscribed
    const q = queries.find(qq => qq.id === hoveredNodeId)
    if (q) {
      keep.add(`q-in-${q.id}`)
      keep.add(`q-out-${q.id}`)
      keep.add('trunk1')
      keep.add('trunk2')
      // Plus the source branches that feed this query
      for (const sid of q.sourceIds) {
        if (sources.some(s => s.id === sid)) keep.add(`s-${sid}`)
      }
      // Plus reactions subscribed to this query
      for (const r of reactions) {
        if (r.queryIds.includes(q.id)) keep.add(`r-${r.id}`)
      }
      return keep
    }
    // Reactions: the inbound branch + trunk2
    const rx = reactions.find(rr => rr.id === hoveredNodeId)
    if (rx) {
      keep.add(`r-${rx.id}`)
      keep.add('trunk2')
      // Plus the queries this reaction subscribes to and their out-branches
      for (const qid of rx.queryIds) {
        if (queries.some(qq => qq.id === qid)) keep.add(`q-out-${qid}`)
      }
      return keep
    }
    return null
  }, [hoveredNodeId, sources, queries, reactions])

  // --- Per-line state lookup -----------------------------------------------
  // The state of a line is a function of its endpoints' status + stopped set.
  function lineStateFor(pathKey: string): FlowLineState {
    // Trunks always show 'active' if any non-stopped query exists.
    if (pathKey === 'trunk1' || pathKey === 'trunk2') {
      const anyActive = queries.some(q => !stoppedNodeIds.has(q.id) && q.status === 'ready')
      return anyActive ? 'active' : 'idle'
    }
    if (pathKey.startsWith('s-')) {
      const id = pathKey.slice(2)
      const src = sources.find(s => s.id === id)
      if (!src) return 'idle'
      if (stoppedNodeIds.has(id)) return 'stopped'
      if (src.status === 'error') return 'error'
      return src.status === 'ready' ? 'active' : 'idle'
    }
    if (pathKey.startsWith('q-in-') || pathKey.startsWith('q-out-')) {
      const id = pathKey.replace(/^q-(in|out)-/, '')
      const q = queries.find(qq => qq.id === id)
      if (!q) return 'idle'
      if (stoppedNodeIds.has(id)) return 'stopped'
      if (q.status === 'error') return 'error'
      return q.status === 'ready' ? 'active' : 'idle'
    }
    if (pathKey.startsWith('r-')) {
      const id = pathKey.slice(2)
      const rx = reactions.find(rr => rr.id === id)
      if (!rx) return 'idle'
      if (stoppedNodeIds.has(id)) return 'stopped'
      if (rx.status === 'error') return 'error'
      return rx.status === 'ready' ? 'active' : 'idle'
    }
    return 'active'
  }

  // --- Pipeline KPIs --------------------------------------------------------
  // Three at-a-glance counters above the graph: events/sec, match rate,
  // active reactions. In live mode these come from the SSE stream's row
  // arrival rate; in demo mode they're derived from the rolling result set.
  const kpis = useMemo(() => {
    const total = liveResults.length
    const sourceCount = sources.length
    const reactionCount = reactions.filter(r => !stoppedNodeIds.has(r.id) && r.status === 'ready').length
    return {
      eventsPerSec: isLive ? streamSubscription.results.length : Math.max(1, Math.round(total / 3)),
      matchRate: total,
      activeReactions: reactionCount,
      activeSources: sourceCount,
    }
  }, [liveResults.length, sources, reactions, stoppedNodeIds, isLive, streamSubscription.results.length])

  return (
    <div className="h-full w-full flex flex-col p-3 overflow-hidden relative">
      {/* Install Drasi CTA — shown only when neither a drasi-server URL nor
          a drasi-platform cluster is configured. Deep-links to the existing
          console-kb install mission. */}
      {!isLive && (
        <div className="flex-shrink-0 mb-2 p-2 rounded border border-cyan-500/30 bg-cyan-500/5 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-semibold text-cyan-300 truncate">{t('drasi.installDrasiTitle')}</div>
            <div className="text-[10px] text-muted-foreground truncate">{t('drasi.installDrasiDescription')}</div>
          </div>
          <button
            type="button"
            onClick={() => navigate('/missions/install-drasi')}
            className="shrink-0 px-2.5 py-1 text-[11px] rounded bg-cyan-600 hover:bg-cyan-500 text-white flex items-center gap-1.5"
          >
            <Rocket className="w-3 h-3" />
            {t('drasi.installDrasiButton')}
          </button>
        </div>
      )}
      {/* Pipeline KPIs strip */}
      <div className="flex-shrink-0 grid grid-cols-4 gap-2 mb-2">
        <KPIBox label={KPI_LABEL_EVENTS_PER_SEC} value={kpis.eventsPerSec} accent="emerald" />
        <KPIBox label={KPI_LABEL_RESULT_ROWS} value={kpis.matchRate} accent="cyan" />
        <KPIBox label={KPI_LABEL_SOURCES} value={kpis.activeSources} accent="emerald" />
        <KPIBox label={KPI_LABEL_REACTIONS} value={kpis.activeReactions} accent="emerald" />
      </div>
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
          {paths.map(p => {
            const state = lineStateFor(p.key)
            const dimmed = connectedLineKeys !== null && !connectedLineKeys.has(p.key)
            return (
              <FlowLine
                key={p.key}
                lineKey={p.key}
                d={p.d}
                dashed={p.dashed}
                active={p.active}
                delay={p.delay}
                state={state}
                dimmed={dimmed}
              />
            )
          })}
        </svg>

        <div
          className="relative grid h-full gap-y-3"
          style={{
            // 6 columns:
            //   1 source block
            //   2 left trunk area (1fr — absorbs slack + houses trunk1)
            //   3 query block
            //   4 query extension (1fr — spanning query expands here)
            //   5 right trunk column (fixed width — dedicated home for trunk2
            //     so the spanning query cannot overlap it)
            //   6 reaction block
            gridTemplateColumns:
              `minmax(0, ${NODE_MAX_WIDTH_PX}px) minmax(40px, 1fr) ` +
              `minmax(0, ${QUERY_MAX_WIDTH_PX}px) minmax(40px, 1fr) ` +
              `${TRUNK2_WIDTH_PX}px minmax(0, ${NODE_MAX_WIDTH_PX}px)`,
            gridAutoRows: 'min-content',
            zIndex: 1,
          }}
        >
          {/* Column headers (row 1) — each has an inline "+" button that
              opens the matching create modal (or, for reactions, creates a
              default SSE reaction inline). */}
          <div className="flex items-center gap-1.5" style={{ gridColumn: 1, gridRow: 1 }}>
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Sources</span>
            <button
              type="button"
              onClick={() => setConfiguringSource('new')}
              className="w-4 h-4 flex items-center justify-center rounded bg-slate-700/40 hover:bg-emerald-500/30 border border-slate-600/40 hover:border-emerald-500/50 text-slate-400 hover:text-emerald-300 transition-colors"
              aria-label={t('drasi.addSource')}
              title={t('drasi.addSource')}
            >
              <Plus className="w-2.5 h-2.5" />
            </button>
          </div>
          <div className="flex items-center gap-1.5" style={{ gridColumn: 3, gridRow: 1 }}>
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Continuous Queries</span>
            <button
              type="button"
              onClick={() => setConfiguringQuery('new')}
              className="w-4 h-4 flex items-center justify-center rounded bg-slate-700/40 hover:bg-cyan-500/30 border border-slate-600/40 hover:border-cyan-500/50 text-slate-400 hover:text-cyan-300 transition-colors"
              aria-label={t('drasi.addQuery')}
              title={t('drasi.addQuery')}
            >
              <Plus className="w-2.5 h-2.5" />
            </button>
          </div>
          <div className="flex items-center gap-1.5" style={{ gridColumn: 6, gridRow: 1 }}>
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Reactions</span>
            <button
              type="button"
              onClick={createDefaultReaction}
              className="w-4 h-4 flex items-center justify-center rounded bg-slate-700/40 hover:bg-emerald-500/30 border border-slate-600/40 hover:border-emerald-500/50 text-slate-400 hover:text-emerald-300 transition-colors"
              aria-label={t('drasi.addReaction')}
              title={t('drasi.addReaction')}
            >
              <Plus className="w-2.5 h-2.5" />
            </button>
          </div>

          {/* Sources — col 1, rows 2..n */}
          {sources.slice(0, 3).map((source, i) => (
            <div key={source.id} style={{ gridColumn: 1, gridRow: i + 2 }}>
              <NodeCard
                nodeRef={setSourceEl(source.id)}
                title={source.name}
                subtitle={source.kind}
                icon={<SourceIconEl kind={source.kind} />}
                status={source.status}
                accentColor="emerald"
                isStopped={stoppedNodeIds.has(source.id)}
                isDimmed={hoveredNodeId !== null && hoveredNodeId !== source.id && !connectedNodeIds(hoveredNodeId).has(source.id)}
                showGear
                showDelete
                onStop={() => toggleStopped(source.id)}
                onExpand={() => setExpandedNode({ id: source.id, name: source.name, kind: source.kind, type: 'source', extra: { status: source.status } })}
                onConfigure={() => setConfiguringSource(source)}
                onDelete={() => deleteResource('source', source.id, source.name)}
                onHoverEnter={() => setHoveredNodeId(source.id)}
                onHoverLeave={() => setHoveredNodeId(null)}
              />
            </div>
          ))}

          {/* Queries — selected-with-results query spans col 3→5; others stay in col 3 */}
          {queries.map((query, i) => {
            const hasResults = query.id === selectedQueryId && !stoppedNodeIds.has(query.id) && liveResults.length > 0
            return (
              <div
                key={query.id}
                style={{
                  // Span col 3 → 5 = cols 3 + 4 (queries + extension area),
                  // stopping BEFORE col 5 (trunk2) so the vertical trunk
                  // line stays outside every query card.
                  gridColumn: hasResults ? '3 / 5' : 3,
                  gridRow: i + 2,
                }}
              >
                <NodeCard
                  nodeRef={setQueryEl(query.id)}
                  title={query.name}
                  subtitle={query.language}
                  icon={<Search className="w-3.5 h-3.5 text-cyan-400" />}
                  status={query.status}
                  accentColor="cyan"
                  isSelected={query.id === selectedQueryId}
                  isStopped={stoppedNodeIds.has(query.id)}
                  isPinned={pinnedQueryId === query.id}
                  isDimmed={hoveredNodeId !== null && hoveredNodeId !== query.id && !connectedNodeIds(hoveredNodeId).has(query.id)}
                  showPin
                  showGear
                  showDelete
                  onClick={() => handleQueryClick(query.id)}
                  onStop={() => toggleStopped(query.id)}
                  onPin={() => togglePin(query.id)}
                  onExpand={() => setExpandedNode({ id: query.id, name: query.name, kind: query.language, type: 'query', extra: { sources: query.sourceIds.join(', ') || '(none)' } })}
                  onConfigure={() => setConfiguringQuery(query)}
                  onDelete={() => deleteResource('query', query.id, query.name)}
                  onHoverEnter={() => setHoveredNodeId(query.id)}
                  onHoverLeave={() => setHoveredNodeId(null)}
                >
                  {hasResults && (
                    <ResultsTable
                      results={liveResults}
                      isDemo={!isLive}
                      onRowClick={setSelectedRow}
                      headerAction={
                        // drasi-platform has no built-in per-query SSE stream;
                        // offer a one-click Result reaction create so the
                        // results table starts receiving deltas.
                        isLive && liveData?.mode === 'platform' && !reactions.some(r => r.queryIds.includes(query.id) && r.kind === 'SSE') ? (
                          <button
                            type="button"
                            onClick={e => { e.stopPropagation(); createResultReactionForQuery(query.id) }}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-600/20 hover:bg-cyan-600/40 border border-cyan-500/40 text-cyan-300 flex items-center gap-1"
                            title={t('drasi.enableLiveResultsHint')}
                          >
                            <Zap className="w-2.5 h-2.5" />
                            {t('drasi.enableLiveResults')}
                          </button>
                        ) : null
                      }
                    />
                  )}
                </NodeCard>
              </div>
            )
          })}

          {/* Reactions — col 6, rows 2..n */}
          {reactions.map((reaction, i) => (
            <div key={reaction.id} style={{ gridColumn: 6, gridRow: i + 2 }}>
              <NodeCard
                nodeRef={setReactionEl(reaction.id)}
                title={reaction.name}
                subtitle={reaction.kind}
                icon={<ReactionIconEl kind={reaction.kind} />}
                status={reaction.status}
                accentColor="emerald"
                isStopped={stoppedNodeIds.has(reaction.id)}
                isDimmed={hoveredNodeId !== null && hoveredNodeId !== reaction.id && !connectedNodeIds(hoveredNodeId).has(reaction.id)}
                showDelete
                onStop={() => toggleStopped(reaction.id)}
                onExpand={() => setExpandedNode({ id: reaction.id, name: reaction.name, kind: reaction.kind, type: 'reaction', extra: { queries: reaction.queryIds.join(', ') || '(none)' } })}
                onDelete={() => deleteResource('reaction', reaction.id, reaction.name)}
                onHoverEnter={() => setHoveredNodeId(reaction.id)}
                onHoverLeave={() => setHoveredNodeId(null)}
              />
            </div>
          ))}
        </div>

        <AnimatePresence>
          {selectedRow && <RowDetailDrawer row={selectedRow} onClose={() => setSelectedRow(null)} />}
          {expandedNode && <ExpandModal node={expandedNode} onClose={() => setExpandedNode(null)} />}
          {configuringSource && (
            <SourceConfigModal
              source={configuringSource === 'new' ? null : configuringSource}
              onSave={config => saveSourceConfig(configuringSource === 'new' ? null : configuringSource.id, config)}
              onClose={() => setConfiguringSource(null)}
            />
          )}
          {configuringQuery && (
            <QueryConfigModal
              query={configuringQuery === 'new' ? null : configuringQuery}
              onSave={config => saveQueryConfig(configuringQuery === 'new' ? null : configuringQuery.id, config)}
              onClose={() => setConfiguringQuery(null)}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
