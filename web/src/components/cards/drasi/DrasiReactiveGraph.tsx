/**
 * Drasi Reactive Graph Card
 *
 * Visualizes the Drasi reactive data pipeline:
 * Sources (HTTP, Postgres) → Continuous Queries (Cypher) → Reactions (SSE)
 * with animated data flow connections and a live results table.
 *
 * Uses live Drasi API data when available, demo data when in demo mode.
 */
import { useState, useEffect, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Database, Globe, Search, Radio, ArrowRight,
  Activity, TrendingDown, TrendingUp,
} from 'lucide-react'
import { useCardDemoState, useReportCardDataState } from '../CardDataContext'
import { useCardExpanded } from '../CardWrapper'
import { useDrasiResources } from '../../../hooks/useDrasiResources'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** How often to refresh animated data flow in ms */
const FLOW_ANIMATION_INTERVAL_MS = 3000
/** Maximum rows shown in the live results table */
const MAX_LIVE_RESULT_ROWS = 7
/** Number of animated flow dots per connection */
const FLOW_DOT_COUNT = 3

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
  language: string // e.g. "CYPHER QUERY"
  status: 'ready' | 'error' | 'pending'
  /** IDs of sources this query reads from */
  sourceIds: string[]
}

interface DrasiReaction {
  id: string
  name: string
  kind: ReactionKind
  status: 'ready' | 'error' | 'pending'
  /** IDs of queries this reaction subscribes to */
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
  selectedQueryId: string | null
}

// ---------------------------------------------------------------------------
// Demo data
// ---------------------------------------------------------------------------

function generateDemoData(): DrasiPipelineData {
  const wave = Math.sin(Date.now() / 5000)

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

  const baseStocks: Omit<LiveResultRow, 'changePercent' | 'price'>[] = [
    { name: 'Constellation Energy', previousClose: 131.46, symbol: 'CEG' },
    { name: 'Visa Inc.', previousClose: 370.28, symbol: 'V' },
    { name: 'Chevron', previousClose: 167.67, symbol: 'CVX' },
    { name: 'Caterpillar', previousClose: 381.26, symbol: 'CAT' },
    { name: 'NVIDIA Corporation', previousClose: 124.28, symbol: 'NVDA' },
    { name: 'Intel Corporation', previousClose: 44.37, symbol: 'INTC' },
    { name: 'Apple Inc.', previousClose: 184.36, symbol: 'AAPL' },
  ]

  const liveResults: LiveResultRow[] = baseStocks.map(stock => {
    const changePercent = parseFloat((-4 + Math.random() * 3 + wave * 2).toFixed(2))
    const price = parseFloat((stock.previousClose * (1 + changePercent / 100)).toFixed(2))
    return { ...stock, changePercent, price }
  })

  // Sort by changePercent ascending (top losers)
  liveResults.sort((a, b) => a.changePercent - b.changePercent)

  return {
    sources,
    queries,
    reactions,
    liveResults,
    selectedQueryId: 'q-top-losers',
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Status indicator dot */
function StatusDot({ status }: { status: 'ready' | 'error' | 'pending' }) {
  const colors: Record<string, string> = {
    ready: 'bg-green-400',
    error: 'bg-red-400',
    pending: 'bg-yellow-400',
  }
  return (
    <motion.div
      className={`w-2.5 h-2.5 rounded-full ${colors[status] || colors.pending}`}
      animate={status === 'ready' ? { scale: [1, 1.3, 1] } : {}}
      transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
    />
  )
}

/** Icon for source type */
function SourceIcon({ kind }: { kind: SourceKind }) {
  switch (kind) {
    case 'HTTP': return <Globe className="w-4 h-4 text-cyan-400" />
    case 'POSTGRES': return <Database className="w-4 h-4 text-blue-400" />
    case 'COSMOSDB': return <Database className="w-4 h-4 text-purple-400" />
    default: return <Database className="w-4 h-4 text-slate-400" />
  }
}

/** Icon for reaction type */
function ReactionIcon({ kind }: { kind: ReactionKind }) {
  switch (kind) {
    case 'SSE': return <Radio className="w-4 h-4 text-emerald-400" />
    case 'SIGNALR': return <Activity className="w-4 h-4 text-blue-400" />
    case 'WEBHOOK': return <ArrowRight className="w-4 h-4 text-orange-400" />
    default: return <Radio className="w-4 h-4 text-slate-400" />
  }
}

/** Source node card */
function SourceNode({ source }: { source: DrasiSource }) {
  return (
    <motion.div
      className="bg-slate-800/80 border border-emerald-500/30 rounded-lg p-3 min-w-[140px]"
      whileHover={{ scale: 1.03, borderColor: 'rgba(16,185,129,0.6)' }}
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
    >
      <div className="flex items-center gap-2 mb-1">
        <SourceIcon kind={source.kind} />
        <span className="text-white text-sm font-medium truncate">{source.name}</span>
        <StatusDot status={source.status} />
      </div>
      <span className="text-xs text-muted-foreground uppercase tracking-wider">{source.kind}</span>
    </motion.div>
  )
}

/** Query node card */
function QueryNode({ query, isSelected, onClick }: { query: DrasiQuery; isSelected: boolean; onClick: () => void }) {
  return (
    <motion.div
      className={`bg-slate-800/80 border rounded-lg p-3 min-w-[140px] cursor-pointer transition-colors ${
        isSelected ? 'border-cyan-400/60 ring-1 ring-cyan-400/30' : 'border-slate-600/40'
      }`}
      whileHover={{ scale: 1.03 }}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={onClick}
    >
      <div className="flex items-center gap-2 mb-1">
        <Search className="w-4 h-4 text-cyan-400" />
        <span className="text-white text-sm font-medium truncate">{query.name}</span>
        <StatusDot status={query.status} />
      </div>
      <span className="text-xs text-muted-foreground uppercase tracking-wider">{query.language}</span>
    </motion.div>
  )
}

/** Reaction node card */
function ReactionNode({ reaction }: { reaction: DrasiReaction }) {
  return (
    <motion.div
      className="bg-slate-800/80 border border-emerald-500/30 rounded-lg p-3 min-w-[120px]"
      whileHover={{ scale: 1.03, borderColor: 'rgba(16,185,129,0.6)' }}
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
    >
      <div className="flex items-center gap-2 mb-1">
        <ReactionIcon kind={reaction.kind} />
        <span className="text-white text-sm font-medium truncate">{reaction.name}</span>
        <StatusDot status={reaction.status} />
      </div>
      <span className="text-xs text-muted-foreground uppercase tracking-wider">{reaction.kind}</span>
    </motion.div>
  )
}

/** Animated connection line between nodes */
function FlowConnection({ direction }: { direction: 'horizontal' | 'vertical' }) {
  const isHorizontal = direction === 'horizontal'
  return (
    <div className={`flex ${isHorizontal ? 'flex-row items-center' : 'flex-col items-center'} gap-0`}>
      {Array.from({ length: FLOW_DOT_COUNT }).map((_, i) => (
        <motion.div
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-emerald-400"
          animate={{
            opacity: [0.2, 1, 0.2],
            scale: [0.6, 1.2, 0.6],
          }}
          transition={{
            repeat: Infinity,
            duration: 1.5,
            delay: i * 0.3,
            ease: 'easeInOut',
          }}
        />
      ))}
      <ArrowRight className={`w-3 h-3 text-emerald-400/60 ${isHorizontal ? '' : 'rotate-90'}`} />
    </div>
  )
}

/** Live results table for selected query */
function LiveResultsTable({ results }: { results: LiveResultRow[] }) {
  const displayResults = results.slice(0, MAX_LIVE_RESULT_ROWS)
  const totalRows = results.length

  return (
    <motion.div
      className="bg-slate-900/90 border border-slate-600/40 rounded-lg overflow-hidden"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
    >
      {/* Header */}
      <div className="px-3 py-2 border-b border-slate-700/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-cyan-400 uppercase">Live Results</span>
          <motion.div
            className="w-1.5 h-1.5 rounded-full bg-emerald-400"
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ repeat: Infinity, duration: 1.5 }}
          />
        </div>
        <span className="text-xs text-muted-foreground">{totalRows} rows</span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-700/30">
              <th className="text-left px-3 py-1.5 text-muted-foreground font-medium">changePercent</th>
              <th className="text-left px-3 py-1.5 text-muted-foreground font-medium">name</th>
              <th className="text-right px-3 py-1.5 text-muted-foreground font-medium">previousClose</th>
              <th className="text-right px-3 py-1.5 text-muted-foreground font-medium">price</th>
              <th className="text-right px-3 py-1.5 text-muted-foreground font-medium">symbol</th>
            </tr>
          </thead>
          <tbody>
            <AnimatePresence mode="popLayout">
              {displayResults.map((row, i) => (
                <motion.tr
                  key={`${row.symbol}-${i}`}
                  className="border-b border-slate-800/50 hover:bg-slate-800/40"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <td className="px-3 py-1.5">
                    <span className={`font-mono flex items-center gap-1 ${
                      row.changePercent < 0 ? 'text-red-400' : 'text-green-400'
                    }`}>
                      {row.changePercent < 0
                        ? <TrendingDown className="w-3 h-3" />
                        : <TrendingUp className="w-3 h-3" />}
                      {row.changePercent.toFixed(2)}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-white truncate max-w-[160px]">{row.name}</td>
                  <td className="px-3 py-1.5 text-muted-foreground font-mono text-right">{row.previousClose.toFixed(2)}</td>
                  <td className="px-3 py-1.5 text-white font-mono text-right">{row.price.toFixed(2)}</td>
                  <td className="px-3 py-1.5 text-cyan-400 font-mono text-right">{row.symbol}</td>
                </motion.tr>
              ))}
            </AnimatePresence>
          </tbody>
        </table>
      </div>
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function DrasiReactiveGraph() {
  const { shouldUseDemoData: isDemoMode, showDemoBadge } = useCardDemoState({ requires: 'none' })
  const { isExpanded } = useCardExpanded()

  // Live Drasi API data
  const { data: liveData, isLoading, error } = useDrasiResources()

  // Report demo state
  useReportCardDataState({
    isDemoData: showDemoBadge || (!liveData && !isLoading),
    isFailed: !!error,
    consecutiveFailures: error ? 1 : 0,
    hasData: true,
  })

  const [selectedQueryId, setSelectedQueryId] = useState<string | null>('q-top-losers')
  const [demoData, setDemoData] = useState<DrasiPipelineData>(generateDemoData)

  // Refresh demo data periodically for animation
  useEffect(() => {
    if (!isDemoMode && liveData) return
    const interval = setInterval(() => {
      setDemoData(generateDemoData())
    }, FLOW_ANIMATION_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [isDemoMode, liveData])

  // Choose data source
  const pipelineData = useMemo<DrasiPipelineData>(() => {
    if (liveData && !isDemoMode) {
      return {
        sources: liveData.sources,
        queries: liveData.queries,
        reactions: liveData.reactions,
        liveResults: liveData.liveResults,
        selectedQueryId: selectedQueryId || (liveData.queries[0]?.id ?? null),
      }
    }
    return { ...demoData, selectedQueryId: selectedQueryId || demoData.selectedQueryId }
  }, [liveData, isDemoMode, demoData, selectedQueryId])

  const { sources, queries, reactions, liveResults } = pipelineData

  const selectedQuery = queries.find(q => q.id === selectedQueryId)

  const handleQueryClick = useCallback((queryId: string) => {
    setSelectedQueryId(prev => prev === queryId ? null : queryId)
  }, [])

  return (
    <div className={`h-full flex flex-col gap-3 p-4 ${isExpanded ? 'max-w-6xl mx-auto' : ''}`}>
      {/* Pipeline graph */}
      <div className="flex-1 min-h-0">
        <div className="flex items-stretch gap-3 h-full">
          {/* Sources column */}
          <div className="flex flex-col gap-3 justify-center min-w-[150px]">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Sources</div>
            {sources.map(source => (
              <SourceNode key={source.id} source={source} />
            ))}
          </div>

          {/* Flow arrows: sources → queries */}
          <div className="flex flex-col justify-center gap-3">
            {sources.map(source => (
              <FlowConnection key={`flow-s-${source.id}`} direction="horizontal" />
            ))}
          </div>

          {/* Queries column */}
          <div className="flex flex-col gap-3 justify-center min-w-[150px]">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Continuous Queries</div>
            {queries.map(query => (
              <QueryNode
                key={query.id}
                query={query}
                isSelected={query.id === selectedQueryId}
                onClick={() => handleQueryClick(query.id)}
              />
            ))}
          </div>

          {/* Flow arrows: queries → reactions */}
          <div className="flex flex-col justify-center gap-3">
            {reactions.map(reaction => (
              <FlowConnection key={`flow-r-${reaction.id}`} direction="horizontal" />
            ))}
          </div>

          {/* Reactions column */}
          <div className="flex flex-col gap-3 justify-center min-w-[120px]">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Reactions</div>
            {reactions.map(reaction => (
              <ReactionNode key={reaction.id} reaction={reaction} />
            ))}
          </div>
        </div>
      </div>

      {/* Live results table (shown when a query is selected) */}
      {selectedQuery && liveResults.length > 0 && (
        <div className="flex-shrink-0">
          <LiveResultsTable
            results={liveResults}
          />
        </div>
      )}

      {/* Empty state when no query selected */}
      {!selectedQuery && (
        <div className="flex-shrink-0 text-center py-4 text-sm text-muted-foreground">
          Click a query node to view live results
        </div>
      )}
    </div>
  )
}
