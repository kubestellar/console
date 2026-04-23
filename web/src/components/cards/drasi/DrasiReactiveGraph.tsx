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
 *
 * Sub-modules:
 *   DrasiTypes.ts           — shared types and interfaces
 *   DrasiConstants.ts       — all named constants and palette values
 *   DrasiDemoData.ts        — themed demo pipelines and row generators
 *   DrasiFlowUtils.ts       — union-find flow discovery (computeFlows)
 *   DrasiNodeCard.tsx       — NodeCard, NodeControls, StatusDot, icon helpers
 *   DrasiFlowLine.tsx       — FlowLine SVG component with animated dots
 *   DrasiResultsTable.tsx   — ResultsTable, KPIBox
 *   DrasiModals.tsx         — ModalShell, ExpandModal, SourceConfigModal,
 *                             QueryConfigModal, ConnectionsModal, RowDetailDrawer
 *   DrasiStreamSamples.tsx  — StreamSampleDrawer, STREAM_SAMPLES
 */
import { useState, useEffect, useMemo, useCallback, useRef, useLayoutEffect } from 'react'
import { AnimatePresence } from 'framer-motion'
import { Search, Plus, Settings, Rocket, Code2, Zap, Server } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getMissionRoute } from '../../../config/routes'
import { ConfirmDialog } from '../../../lib/modals'
import { useCardDemoState, useReportCardDataState } from '../CardDataContext'
import { useDrasiResources } from '../../../hooks/useDrasiResources'
import { useDrasiQueryStream } from '../../../hooks/useDrasiQueryStream'
import { useDrasiConnections, type DrasiConnection } from '../../../hooks/useDrasiConnections'

// Sub-module imports
import type {
  DrasiSource, DrasiQuery, DrasiPipelineData, LiveResultRow,
  MeasuredRects, NodeRect, ExpandedNodeDetails, SourceConfig, QueryConfig,
  FlowLineState,
} from './DrasiTypes'
import { rectsEqual } from './DrasiTypes'
import {
  DRASI_PROXY_TIMEOUT_MS, FLOW_ANIMATION_INTERVAL_MS,
  NODE_MAX_WIDTH_PX, QUERY_MAX_WIDTH_PX, TRUNK2_WIDTH_PX,
  KPI_LABEL_EVENTS_PER_SEC, KPI_LABEL_RESULT_ROWS, KPI_LABEL_SOURCES, KPI_LABEL_REACTIONS,
  DEMO_STREAM_ENDPOINT,
} from './DrasiConstants'
import { generateDemoData, demoThemeForConnection } from './DrasiDemoData'
import { computeFlows, FLOW_ID_ALL } from './DrasiFlowUtils'
import { NodeCard, SourceIconEl, ReactionIconEl } from './DrasiNodeCard'
import { FlowLine } from './DrasiFlowLine'
import { ResultsTable, KPIBox } from './DrasiResultsTable'
import {
  ExpandModal, RowDetailDrawer, SourceConfigModal, QueryConfigModal, ConnectionsModal,
} from './DrasiModals'
import { StreamSampleDrawer } from './DrasiStreamSamples'

// ---------------------------------------------------------------------------
// buildStreamEndpoint — lives here because it joins connection + liveData
// state that only the main component owns.
// ---------------------------------------------------------------------------

/** Build the SSE endpoint URL to show in the stream-sample drawer. In live
 *  mode this is the absolute URL of the actual drasi-server events/stream
 *  endpoint (so the snippets work against the real install). In demo mode
 *  it returns a clearly-placeholder URL so users know to substitute. */
function buildStreamEndpoint(
  connection: DrasiConnection | null,
  liveData: { mode: 'server' | 'platform'; instanceId: string | null } | null,
  queryId: string,
): string {
  if (!connection || !liveData || connection.isDemoSeed) return DEMO_STREAM_ENDPOINT
  if (connection.mode === 'server' && connection.url && liveData.instanceId) {
    const base = connection.url.replace(/\/+$/, '')
    return `${base}/api/v1/instances/${liveData.instanceId}/queries/${encodeURIComponent(queryId)}/events/stream`
  }
  // drasi-platform: Result-reaction endpoint placeholder. The real URL
  // depends on the reaction Service the user deploys; show a representative
  // template that points at the in-cluster reaction Service.
  return `http://<your-result-reaction>.drasi-system.svc/v1/queries/${encodeURIComponent(queryId)}/events/stream`
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

  const {
    connections: drasiConnections,
    activeConnection,
    addConnection,
    updateConnection,
    removeConnection,
    setActive,
  } = useDrasiConnections()

  // Pick the demo theme that matches the currently-active connection. Demo
  // seeds each have their own thematic pipeline; non-seed (or no active)
  // falls back to the original "stocks" theme.
  const demoThemeId = useMemo(
    () => demoThemeForConnection(activeConnection?.isDemoSeed ? activeConnection.id : undefined),
    [activeConnection],
  )
  const [demoData, setDemoData] = useState<DrasiPipelineData>(() => generateDemoData(demoThemeId))

  // Reset demo graph when the user switches demo-seed servers so the whole
  // pipeline swaps in (not just the row values). Only fires on theme change.
  useEffect(() => {
    setDemoData(generateDemoData(demoThemeId))
  }, [demoThemeId])

  // Periodically regenerate demo results so the table values change
  useEffect(() => {
    if (!isDemoMode && liveData) return
    const interval = setInterval(() => {
      setDemoData(prev => {
        // Keep existing sources/queries/reactions (user may have edited them);
        // only regenerate the result rows for animation.
        const fresh = generateDemoData(demoThemeId)
        return { ...prev, liveResults: fresh.liveResults }
      })
    }, FLOW_ANIMATION_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [isDemoMode, liveData, demoThemeId])
  const isLive = !!liveData && !isDemoMode
  const [showConnectionsModal, setShowConnectionsModal] = useState(false)
  const [showStreamSamples, setShowStreamSamples] = useState(false)
  // Shared confirm-dialog state for every destructive action in the card.
  // Replaces window.confirm() so delete flows go through the themed
  // ConfirmDialog (user does not want browser-chrome alerts).
  const [pendingConfirm, setPendingConfirm] = useState<{
    title: string
    message: string
    onConfirm: () => void
  } | null>(null)
  // Selected flow (connected component) — FLOW_ID_ALL means show the full
  // graph (no filter). Reset automatically if the selected id disappears
  // after a poll (e.g. the user deleted a resource in the active flow).
  const [selectedFlowId, setSelectedFlowId] = useState<string>(FLOW_ID_ALL)

  // Subscribe to the selected query's SSE event stream when running against
  // a real drasi-server. Falls through to the demo regen / static results
  // path when in demo mode or running against drasi-platform.
  const streamSubscription = useDrasiQueryStream({
    mode: isLive ? (liveData?.mode ?? null) : null,
    drasiServerUrl: activeConnection?.mode === 'server' ? activeConnection.url : undefined,
    instanceId: liveData?.instanceId ?? null,
    queryId: isLive ? selectedQueryId : null,
    paused: stoppedNodeIds.has(selectedQueryId),
  })

  const rawPipelineData = useMemo<DrasiPipelineData>(
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

  // Derive flows (connected components) from the raw graph. Recomputes on
  // every poll; the `id` field is deterministic (sorted member list) so
  // stable across re-computations as long as membership hasn't changed.
  const flows = useMemo(
    () => computeFlows(rawPipelineData.sources, rawPipelineData.queries, rawPipelineData.reactions),
    [rawPipelineData.sources, rawPipelineData.queries, rawPipelineData.reactions],
  )

  // Filter the pipeline to the currently selected flow, or pass through if
  // "All" is selected or the id no longer exists after a refresh.
  const pipelineData = useMemo<DrasiPipelineData>(() => {
    if (selectedFlowId === FLOW_ID_ALL) return rawPipelineData
    const flow = flows.find(f => f.id === selectedFlowId)
    if (!flow) return rawPipelineData
    return {
      ...rawPipelineData,
      sources: rawPipelineData.sources.filter(s => flow.sourceIds.has(s.id)),
      queries: rawPipelineData.queries.filter(q => flow.queryIds.has(q.id)),
      reactions: rawPipelineData.reactions.filter(r => flow.reactionIds.has(r.id)),
    }
  }, [rawPipelineData, flows, selectedFlowId])

  const { sources, queries, reactions, liveResults } = pipelineData

  // If the selected flow id disappeared after a refresh (e.g. the last query
  // in it was deleted), fall back to "All" rather than leaving the card empty.
  useEffect(() => {
    if (selectedFlowId !== FLOW_ID_ALL && !flows.some(f => f.id === selectedFlowId)) {
      setSelectedFlowId(FLOW_ID_ALL)
    }
  }, [flows, selectedFlowId])

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

  // Build the query-string that targets whichever Drasi connection is active.
  // Consolidated so create/update/delete all route through the same proxy.
  const drasiProxyTarget = useCallback((): string => {
    if (!activeConnection) return ''
    if (activeConnection.mode === 'server' && activeConnection.url) {
      return `target=server&url=${encodeURIComponent(activeConnection.url)}`
    }
    return `target=platform&cluster=${encodeURIComponent(activeConnection.cluster || '')}`
  }, [activeConnection])

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
          headers: { 'content-type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
          body: JSON.stringify({ id: config.name, spec: { kind: config.kind } }),
          signal: AbortSignal.timeout(DRASI_PROXY_TIMEOUT_MS),
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
          headers: { 'content-type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
          body: JSON.stringify({
            id: config.name,
            spec: { mode: config.language.replace(/ QUERY$/, ''), query: config.queryText },
          }),
          signal: AbortSignal.timeout(DRASI_PROXY_TIMEOUT_MS),
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
          headers: { 'content-type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
          body: JSON.stringify({
            id: defaultName,
            spec: { kind: 'SSE', queries: queries.map(q => ({ id: q.id })) },
          }),
          signal: AbortSignal.timeout(DRASI_PROXY_TIMEOUT_MS),
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
        headers: { 'content-type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({
          id: reactionName,
          spec: { kind: 'Result', queries: [{ id: queryId }] },
        }),
        signal: AbortSignal.timeout(DRASI_PROXY_TIMEOUT_MS),
      })
      refetchDrasi()
    } catch {
      // Non-fatal; next poll surfaces the error.
    }
  }, [isLive, liveData, refetchDrasi, drasiProxyTarget, drasiResourcePath])

  const deleteResource = useCallback((
    kind: 'source' | 'query' | 'reaction',
    id: string,
    name: string,
  ) => {
    setPendingConfirm({
      title: t('drasi.deleteConfirmTitle'),
      message: t('drasi.deleteConfirm', { name }),
      onConfirm: async () => {
        if (isLive && liveData) {
          try {
            await fetch(`/api/drasi/proxy${drasiResourcePath(kind)}/${encodeURIComponent(id)}?${drasiProxyTarget()}`, {
              method: 'DELETE',
              signal: AbortSignal.timeout(DRASI_PROXY_TIMEOUT_MS),
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
      },
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
    // Depend on lengths, not array references. `sources/queries/reactions`
    // are recreated every render by useMemo consumers in pipelineData, so
    // including the arrays themselves triggered this effect every render
    // and drove React's update-depth limit — see GA4 error
    // "Maximum update depth exceeded" on / from 2026-04-14. The effect
    // only needs to re-run when the *set* of nodes changes (so new
    // children mount and their refs become observable); a length change
    // is a safe proxy for that, and `selectedQueryId` catches active-path
    // changes that share the same node count.
  }, [sources.length, queries.length, reactions.length, selectedQueryId, liveResults.length])

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
      {/* Drasi connection selector + flow selector — top strip. Always
          visible so the user can switch between configured Drasi installs
          (gear opens CRUD modal) and focus on a single flow at a time.
          Server select is capped in width so the Flow select + Consume
          button stay anchored to the left-hand group and don't disappear
          off the right edge of wide cards. */}
      <div className="shrink-0 mb-4 flex items-center gap-2 flex-wrap">
        <Server className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
        <select
          value={activeConnection?.id ?? ''}
          onChange={e => setActive(e.target.value)}
          className="min-w-[160px] max-w-[260px] px-2 py-1 text-[11px] bg-slate-950 border border-slate-700 rounded text-white focus:border-cyan-500 focus:outline-hidden"
          aria-label={t('drasi.connectionsTitle')}
        >
          <option value="">{t('drasi.noActiveConnection')}</option>
          {drasiConnections.map(c => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.mode === 'server' ? ' · server' : ' · platform'}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setShowConnectionsModal(true)}
          className="shrink-0 w-6 h-6 flex items-center justify-center rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-muted-foreground hover:text-cyan-300"
          aria-label={t('drasi.manageConnections')}
          title={t('drasi.manageConnections')}
        >
          <Settings className="w-3 h-3" />
        </button>
        {/* Flow (connected component) selector — derived from the graph, not
            fetched. Only visible when there's more than one flow OR when one
            is already selected (so the user can clear it). */}
        {(flows.length > 1 || selectedFlowId !== FLOW_ID_ALL) && (
          <>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground shrink-0 ml-1">{t('drasi.flowLabel')}</span>
            <select
              value={selectedFlowId}
              onChange={e => setSelectedFlowId(e.target.value)}
              className="shrink-0 min-w-[140px] max-w-[220px] px-2 py-1 text-[11px] bg-slate-950 border border-slate-700 rounded text-white focus:border-cyan-500 focus:outline-hidden"
              aria-label={t('drasi.flowLabel')}
            >
              <option value={FLOW_ID_ALL}>{t('drasi.flowAllResources')}</option>
              {flows.map(f => (
                <option key={f.id} value={f.id}>{f.label}</option>
              ))}
            </select>
          </>
        )}
        {/* "Consume stream" lives in the header strip as well as each
            query's results-table header — the in-table placement is easy
            to miss, so this gives it a guaranteed discoverable home. */}
        <button
          type="button"
          onClick={() => setShowStreamSamples(true)}
          className="shrink-0 ml-auto px-2 py-1 text-[10px] rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-muted-foreground hover:text-cyan-300 flex items-center gap-1.5"
          aria-label={t('drasi.consumeStreamTitle')}
          title={t('drasi.consumeStreamTitle')}
        >
          <Code2 className="w-3 h-3" />
          {t('drasi.consumeStream')}
        </button>
      </div>
      {/* Install Drasi CTA — shown only when no live connection is active.
          Deep-links to the existing console-kb install mission. */}
      {!isLive && (
        <div className="shrink-0 mb-2 p-2 rounded border border-cyan-500/30 bg-cyan-500/5 flex flex-wrap items-center justify-between gap-y-2 gap-3">
          <div className="min-w-0">
            <div className="text-xs font-semibold text-cyan-300 truncate">{t('drasi.installDrasiTitle')}</div>
            <div className="text-[10px] text-muted-foreground truncate">{t('drasi.installDrasiDescription')}</div>
          </div>
          <button
            type="button"
            onClick={() => navigate(getMissionRoute('install-drasi'))}
            className="shrink-0 px-2.5 py-1 text-[11px] rounded bg-cyan-600 hover:bg-cyan-500 text-white flex items-center gap-1.5"
          >
            <Rocket className="w-3 h-3" />
            {t('drasi.installDrasiButton')}
          </button>
        </div>
      )}
      {/* Pipeline KPIs strip */}
      <div className="shrink-0 grid grid-cols-2 @md:grid-cols-4 gap-2 mb-2">
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

          {/* Sources — col 1, rows 2..n. No slice: the grid expands
              vertically as the user adds sources, matching the queries
              and reactions columns. */}
          {sources.map((source, i) => (
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
                  onExpand={() => setExpandedNode({ id: query.id, name: query.name, kind: query.language, type: 'query', extra: { sources: (query.sourceIds || []).join(', ') || '(none)' } })}
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
                        <div className="flex items-center gap-1">
                          {/* drasi-platform has no built-in per-query SSE stream;
                              offer a one-click Result reaction create so the
                              results table starts receiving deltas. */}
                          {isLive && liveData?.mode === 'platform' && !reactions.some(r => r.queryIds.includes(query.id) && r.kind === 'SSE') && (
                            <button
                              type="button"
                              onClick={e => { e.stopPropagation(); createResultReactionForQuery(query.id) }}
                              className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-600/20 hover:bg-cyan-600/40 border border-cyan-500/40 text-cyan-300 flex items-center gap-1"
                              title={t('drasi.enableLiveResultsHint')}
                            >
                              <Zap className="w-2.5 h-2.5" />
                              {t('drasi.enableLiveResults')}
                            </button>
                          )}
                          {/* "Consume this stream" — opens the code sample
                              drawer showing how to subscribe in 6 languages. */}
                          <button
                            type="button"
                            onClick={e => { e.stopPropagation(); setShowStreamSamples(true) }}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-muted-foreground hover:text-cyan-300 flex items-center gap-1"
                            title={t('drasi.consumeStreamTitle')}
                          >
                            <Code2 className="w-2.5 h-2.5" />
                            {t('drasi.consumeStream')}
                          </button>
                        </div>
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
                onExpand={() => setExpandedNode({ id: reaction.id, name: reaction.name, kind: reaction.kind, type: 'reaction', extra: { queries: (reaction.queryIds || []).join(', ') || '(none)' } })}
                onDelete={() => deleteResource('reaction', reaction.id, reaction.name)}
                onHoverEnter={() => setHoveredNodeId(reaction.id)}
                onHoverLeave={() => setHoveredNodeId(null)}
              />
            </div>
          ))}
        </div>

        <AnimatePresence>
          {selectedRow && <RowDetailDrawer row={selectedRow} onClose={() => setSelectedRow(null)} />}
          {showStreamSamples && (
            <StreamSampleDrawer
              endpoint={buildStreamEndpoint(activeConnection, liveData, selectedQueryId)}
              isDemo={!isLive}
              onClose={() => setShowStreamSamples(false)}
            />
          )}
          {showConnectionsModal && (
            <ConnectionsModal
              connections={drasiConnections}
              activeId={activeConnection?.id ?? ''}
              onSelect={id => { setActive(id); setShowConnectionsModal(false) }}
              onAdd={addConnection}
              onUpdate={updateConnection}
              onRequestRemove={(id, name) => setPendingConfirm({
                title: t('drasi.deleteConnectionTitle'),
                message: t('drasi.deleteConnectionConfirm', { name }),
                onConfirm: () => removeConnection(id),
              })}
              onClose={() => setShowConnectionsModal(false)}
            />
          )}
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
        {/* Themed confirm dialog — shared by every destructive action in
            the card. Replaces the browser-chrome window.confirm() calls. */}
        <ConfirmDialog
          isOpen={pendingConfirm !== null}
          title={pendingConfirm?.title ?? ''}
          message={pendingConfirm?.message ?? ''}
          confirmLabel={t('actions.delete')}
          variant="danger"
          onConfirm={() => {
            pendingConfirm?.onConfirm()
            setPendingConfirm(null)
          }}
          onClose={() => setPendingConfirm(null)}
        />
      </div>
    </div>
  )
}
