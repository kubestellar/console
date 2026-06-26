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
 *   DrasiTypes.ts                    — shared types and interfaces
 *   DrasiConstants.ts                — shared constants and palette values
 *   DrasiDemoData.ts                 — themed demo pipelines and row generators
 *   DrasiFlowUtils.ts                — union-find flow discovery (computeFlows)
 *   DrasiNodeCard.tsx                — NodeCard, NodeControls, StatusDot, icons
 *   DrasiFlowLine.tsx                — FlowLine SVG component with animated dots
 *   DrasiResultsTable.tsx            — ResultsTable, KPIBox
 *   DrasiModals.tsx                  — card modal components
 *   DrasiStreamSamples.tsx           — stream sample drawer
 *   DrasiReactiveGraph.constants.ts  — local layout style constants
 *   DrasiReactiveGraph.utils.ts      — local endpoint and proxy helpers
 *   DrasiReactiveGraphSections.tsx   — extracted orchestration sub-components
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useModalState } from '../../../lib/modals'
import { useReportCardDataState } from '../CardDataContext'
import { useDrasiConnections } from '../../../hooks/useDrasiConnections'
import { useDrasiQueryStream } from '../../../hooks/useDrasiQueryStream'
import { useDrasiResources } from '../../../hooks/useDrasiResources'
import { DRASI_PROXY_TIMEOUT_MS, FLOW_ANIMATION_INTERVAL_MS } from './DrasiConstants'
import { demoThemeForConnection, generateDemoData } from './DrasiDemoData'
import { computeFlows, FLOW_ID_ALL } from './DrasiFlowUtils'
import {
  DrasiHeaderControls,
  DrasiInstallBanner,
  DrasiKpiStrip,
  DrasiOverlays,
  DrasiPipelineCanvas,
} from './DrasiReactiveGraphSections'
import {
  buildDrasiProxyTarget,
  buildStreamEndpoint,
  getDrasiResourcePath,
  type DrasiResourceKind,
} from './DrasiReactiveGraph.utils'
import type {
  DrasiPipelineData,
  DrasiQuery,
  DrasiSource,
  ExpandedNodeDetails,
  FlowLineState,
  LiveResultRow,
  MeasuredRects,
  NodeRect,
  QueryConfig,
  SourceConfig,
} from './DrasiTypes'
import { rectsEqual } from './DrasiTypes'

export function DrasiReactiveGraph() {
  const { t } = useTranslation()
  const {
    data: drasiData,
    isRefreshing,
    isDemoData,
    isFailed,
    consecutiveFailures,
    refetch: refetchDrasi,
  } = useDrasiResources()

  useReportCardDataState({
    isDemoData,
    isRefreshing,
    isFailed,
    consecutiveFailures,
    hasData: drasiData !== null,
  })

  const [selectedQueryId, setSelectedQueryId] = useState<string>('q-top-losers')
  const [pinnedQueryId, setPinnedQueryId] = useState<string | null>(null)
  const [stoppedNodeIds, setStoppedNodeIds] = useState<Set<string>>(new Set())
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)
  const [expandedNode, setExpandedNode] = useState<ExpandedNodeDetails | null>(null)
  const [configuringSource, setConfiguringSource] = useState<DrasiSource | 'new' | null>(null)
  const [configuringQuery, setConfiguringQuery] = useState<DrasiQuery | 'new' | null>(null)
  const [selectedRow, setSelectedRow] = useState<LiveResultRow | null>(null)
  const {
    connections: drasiConnections,
    activeConnection,
    addConnection,
    updateConnection,
    removeConnection,
    setActive,
  } = useDrasiConnections()

  const demoThemeId = useMemo(
    () => demoThemeForConnection(activeConnection?.isDemoSeed ? activeConnection.id : undefined),
    [activeConnection],
  )
  const [demoPipelineData, setDemoPipelineData] = useState<DrasiPipelineData>(() => generateDemoData(demoThemeId))

  useEffect(() => {
    if (!isDemoData || !drasiData) return
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      setDemoPipelineData({
        sources: [...(drasiData.sources || [])],
        queries: [...(drasiData.queries || [])],
        reactions: [...(drasiData.reactions || [])],
        liveResults: [...(drasiData.liveResults || [])],
      })
    })
    return () => {
      cancelled = true
    }
  }, [drasiData, isDemoData])

  useEffect(() => {
    if (!isDemoData) return
    const interval = setInterval(() => {
      setDemoPipelineData(prev => {
        const fresh = generateDemoData(demoThemeId)
        return { ...prev, liveResults: fresh.liveResults }
      })
    }, FLOW_ANIMATION_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [demoThemeId, isDemoData])

  const isLive = !isDemoData && drasiData !== null
  const liveData = isLive ? drasiData : null
  const { isOpen: showConnectionsModal, open: openConnectionsModal, close: closeConnectionsModal } = useModalState()
  const { isOpen: showStreamSamples, open: openStreamSamples, close: closeStreamSamples } = useModalState()
  const [pendingConfirm, setPendingConfirm] = useState<{
    title: string
    message: string
    onConfirm: () => void
  } | null>(null)
  const [selectedFlowId, setSelectedFlowId] = useState<string>(FLOW_ID_ALL)

  const streamSubscription = useDrasiQueryStream({
    mode: isLive ? (liveData?.mode ?? null) : null,
    drasiServerUrl: activeConnection?.mode === 'server' ? activeConnection.url : undefined,
    instanceId: liveData?.instanceId ?? null,
    queryId: isLive ? selectedQueryId : null,
    paused: stoppedNodeIds.has(selectedQueryId),
  })

  const rawPipelineData = useMemo<DrasiPipelineData>(() => {
    if (isLive && liveData) {
      const liveResults = streamSubscription.results.length > 0
        ? streamSubscription.results
        : liveData.liveResults
      return { ...liveData, liveResults }
    }
    return demoPipelineData
  }, [demoPipelineData, isLive, liveData, streamSubscription.results])

  const flows = useMemo(
    () => computeFlows(rawPipelineData.sources, rawPipelineData.queries, rawPipelineData.reactions),
    [rawPipelineData.sources, rawPipelineData.queries, rawPipelineData.reactions],
  )

  const pipelineData = useMemo<DrasiPipelineData>(() => {
    if (selectedFlowId === FLOW_ID_ALL) return rawPipelineData
    const flow = flows.find(item => item.id === selectedFlowId)
    if (!flow) return rawPipelineData
    return {
      ...rawPipelineData,
      sources: rawPipelineData.sources.filter(source => flow.sourceIds.has(source.id)),
      queries: rawPipelineData.queries.filter(query => flow.queryIds.has(query.id)),
      reactions: rawPipelineData.reactions.filter(reaction => flow.reactionIds.has(reaction.id)),
    }
  }, [rawPipelineData, flows, selectedFlowId])

  const { sources, queries, reactions, liveResults } = pipelineData

  useEffect(() => {
    if (selectedFlowId === FLOW_ID_ALL || flows.some(flow => flow.id === selectedFlowId)) return
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) setSelectedFlowId(FLOW_ID_ALL)
    })
    return () => {
      cancelled = true
    }
  }, [flows, selectedFlowId])

  useEffect(() => {
    if (queries.length === 0 || queries.find(query => query.id === selectedQueryId)) return
    const nextQueryId = pinnedQueryId && queries.find(query => query.id === pinnedQueryId)
      ? pinnedQueryId
      : queries[0].id
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) setSelectedQueryId(nextQueryId)
    })
    return () => {
      cancelled = true
    }
  }, [pinnedQueryId, queries, selectedQueryId])

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

  const drasiProxyTarget = useCallback(() => buildDrasiProxyTarget(activeConnection), [activeConnection])
  const drasiResourcePath = useCallback(
    (kind: DrasiResourceKind): string => getDrasiResourcePath(liveData?.mode, kind),
    [liveData?.mode],
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
    if (sourceId === null) {
      setDemoPipelineData(prev => ({
        ...prev,
        sources: [...prev.sources, { id: config.name, name: config.name, kind: config.kind, status: 'ready' }],
      }))
      return
    }
    setDemoPipelineData(prev => ({
      ...prev,
      sources: prev.sources.map(source => (
        source.id === sourceId
          ? { ...source, name: config.name, kind: config.kind }
          : source
      )),
    }))
  }, [drasiProxyTarget, drasiResourcePath, isLive, liveData, refetchDrasi])

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
      setDemoPipelineData(prev => ({
        ...prev,
        queries: [...prev.queries, {
          id: config.name,
          name: config.name,
          language: config.language,
          status: 'ready',
          sourceIds: [],
          queryText: config.queryText,
        }],
      }))
      return
    }
    setDemoPipelineData(prev => ({
      ...prev,
      queries: prev.queries.map(query => (
        query.id === queryId
          ? { ...query, name: config.name, language: config.language, queryText: config.queryText }
          : query
      )),
    }))
  }, [drasiProxyTarget, drasiResourcePath, isLive, liveData, refetchDrasi])

  const createDefaultReaction = useCallback(async () => {
    const defaultName = `reaction-${Date.now().toString(36).slice(-5)}`
    if (isLive && liveData) {
      try {
        await fetch(`/api/drasi/proxy${drasiResourcePath('reaction')}?${drasiProxyTarget()}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
          body: JSON.stringify({
            id: defaultName,
            spec: { kind: 'SSE', queries: queries.map(query => ({ id: query.id })) },
          }),
          signal: AbortSignal.timeout(DRASI_PROXY_TIMEOUT_MS),
        })
        refetchDrasi()
      } catch {
        // Non-fatal; next poll surfaces the error.
      }
      return
    }
    setDemoPipelineData(prev => ({
      ...prev,
      reactions: [...prev.reactions, {
        id: defaultName,
        name: defaultName,
        kind: 'SSE',
        status: 'ready',
        queryIds: prev.queries.map(query => query.id),
      }],
    }))
  }, [drasiProxyTarget, drasiResourcePath, isLive, liveData, queries, refetchDrasi])

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
  }, [drasiProxyTarget, drasiResourcePath, isLive, liveData, refetchDrasi])

  const deleteResource = useCallback((kind: 'source' | 'query' | 'reaction', id: string, name: string) => {
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
        setDemoPipelineData(prev => {
          if (kind === 'source') return { ...prev, sources: prev.sources.filter(source => source.id !== id) }
          if (kind === 'query') return { ...prev, queries: prev.queries.filter(query => query.id !== id) }
          return { ...prev, reactions: prev.reactions.filter(reaction => reaction.id !== id) }
        })
      },
    })
  }, [drasiProxyTarget, drasiResourcePath, isLive, liveData, refetchDrasi, t])

  const containerRef = useRef<HTMLDivElement | null>(null)
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

  const [rects, setRects] = useState<MeasuredRects>({
    sources: {},
    queries: {},
    reactions: {},
    container: { width: 0, height: 0 },
  })

  useLayoutEffect(() => {
    function measure() {
      const containerEl = containerRef.current
      if (!containerEl) return
      const cRect = containerEl.getBoundingClientRect()
      const toNodeRect = (el: HTMLElement): NodeRect => {
        const rect = el.getBoundingClientRect()
        return {
          left: rect.left - cRect.left,
          right: rect.right - cRect.left,
          top: rect.top - cRect.top,
          bottom: rect.bottom - cRect.top,
          centerY: (rect.top + rect.bottom) / 2 - cRect.top,
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
      setRects(prev => (rectsEqual(prev, newRects) ? prev : newRects))
    }

    measure()
    const observer = new ResizeObserver(measure)
    if (containerRef.current) observer.observe(containerRef.current)
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
  }, [sources.length, queries.length, reactions.length, selectedQueryId, liveResults.length])

  const paths = useMemo(() => {
    const items: Array<{ key: string; d: string; dashed: boolean; active: boolean; delay: number }> = []
    if (!rects.container.width) return items

    const sourceRects = sources.map(source => rects.sources[source.id]).filter(Boolean)
    const queryRects = queries.map(query => rects.queries[query.id]).filter(Boolean)
    const reactionRects = reactions.map(reaction => rects.reactions[reaction.id]).filter(Boolean)

    if (sourceRects.length === 0 || queryRects.length === 0) return items

    const srcRight = Math.max(...sourceRects.map(rect => rect.right))
    const qLeft = Math.min(...queryRects.map(rect => rect.left))
    const trunk1X = (srcRight + qLeft) / 2
    const trunk1Top = Math.min(sourceRects[0].centerY, queryRects[0].centerY)
    const trunk1Bottom = Math.max(
      sourceRects[sourceRects.length - 1].centerY,
      queryRects[queryRects.length - 1].centerY,
    )
    items.push({ key: 'trunk1', d: `M ${trunk1X} ${trunk1Top} L ${trunk1X} ${trunk1Bottom}`, dashed: false, active: true, delay: 0 })

    sources.forEach((source, index) => {
      const rect = rects.sources[source.id]
      if (!rect) return
      const isActive = !stoppedNodeIds.has(source.id) && source.status === 'ready'
      items.push({
        key: `s-${source.id}`,
        d: `M ${rect.right} ${rect.centerY} L ${trunk1X} ${rect.centerY}`,
        dashed: !isActive,
        active: isActive,
        delay: index * 0.2,
      })
    })

    queries.forEach((query, index) => {
      const rect = rects.queries[query.id]
      if (!rect) return
      const isActive = !stoppedNodeIds.has(query.id) && query.status === 'ready'
      items.push({
        key: `q-in-${query.id}`,
        d: `M ${trunk1X} ${rect.centerY} L ${rect.left} ${rect.centerY}`,
        dashed: !isActive,
        active: isActive,
        delay: 0.3 + index * 0.2,
      })
    })

    if (reactionRects.length > 0) {
      const rxLeft = Math.min(...reactionRects.map(rect => rect.left))
      const allRights = queries
        .map(query => rects.queries[query.id])
        .filter(Boolean)
        .map(rect => rect.right)
      const qRight = allRights.length > 0 ? Math.max(...allRights) : rxLeft - 24
      const trunk2X = Math.min(qRight + 12, rxLeft - 12)
      const trunk2Top = Math.min(queryRects[0].centerY, reactionRects[0].centerY)
      const trunk2Bottom = Math.max(
        queryRects[queryRects.length - 1].centerY,
        reactionRects[reactionRects.length - 1].centerY,
      )
      items.push({ key: 'trunk2', d: `M ${trunk2X} ${trunk2Bottom} L ${trunk2X} ${trunk2Top}`, dashed: false, active: true, delay: 0 })

      queries.forEach((query, index) => {
        const rect = rects.queries[query.id]
        if (!rect) return
        const isActive = !stoppedNodeIds.has(query.id) && query.status === 'ready'
        items.push({
          key: `q-out-${query.id}`,
          d: `M ${rect.right} ${rect.centerY} L ${trunk2X} ${rect.centerY}`,
          dashed: !isActive,
          active: isActive,
          delay: 0.5 + index * 0.2,
        })
      })

      reactions.forEach((reaction, index) => {
        const rect = rects.reactions[reaction.id]
        if (!rect) return
        const isActive = !stoppedNodeIds.has(reaction.id) && reaction.status === 'ready'
        items.push({
          key: `r-${reaction.id}`,
          d: `M ${trunk2X} ${rect.centerY} L ${rect.left} ${rect.centerY}`,
          dashed: !isActive,
          active: isActive,
          delay: 0.7 + index * 0.2,
        })
      })
    }

    return items
  }, [queries, reactions, rects, sources, stoppedNodeIds])

  const connectedNodeIds = useCallback((hoverId: string): Set<string> => {
    const keep = new Set<string>()
    const source = sources.find(item => item.id === hoverId)
    if (source) {
      for (const query of queries) {
        if (query.sourceIds.includes(source.id)) {
          keep.add(query.id)
          for (const reaction of reactions) {
            if (reaction.queryIds.includes(query.id)) keep.add(reaction.id)
          }
        }
      }
      return keep
    }

    const query = queries.find(item => item.id === hoverId)
    if (query) {
      for (const sourceId of query.sourceIds) keep.add(sourceId)
      for (const reaction of reactions) {
        if (reaction.queryIds.includes(query.id)) keep.add(reaction.id)
      }
      return keep
    }

    const reaction = reactions.find(item => item.id === hoverId)
    if (reaction) {
      for (const queryId of reaction.queryIds) {
        keep.add(queryId)
        const target = queries.find(item => item.id === queryId)
        if (target) {
          for (const sourceId of target.sourceIds) keep.add(sourceId)
        }
      }
    }
    return keep
  }, [queries, reactions, sources])

  const connectedLineKeys = useMemo<Set<string> | null>(() => {
    if (!hoveredNodeId) return null
    const keep = new Set<string>()
    const source = sources.find(item => item.id === hoveredNodeId)
    if (source) {
      keep.add(`s-${source.id}`)
      keep.add('trunk1')
      for (const query of queries) {
        if (query.sourceIds.includes(source.id)) keep.add(`q-in-${query.id}`)
      }
      return keep
    }

    const query = queries.find(item => item.id === hoveredNodeId)
    if (query) {
      keep.add(`q-in-${query.id}`)
      keep.add(`q-out-${query.id}`)
      keep.add('trunk1')
      keep.add('trunk2')
      for (const sourceId of query.sourceIds) {
        if (sources.some(sourceItem => sourceItem.id === sourceId)) keep.add(`s-${sourceId}`)
      }
      for (const reaction of reactions) {
        if (reaction.queryIds.includes(query.id)) keep.add(`r-${reaction.id}`)
      }
      return keep
    }

    const reaction = reactions.find(item => item.id === hoveredNodeId)
    if (reaction) {
      keep.add(`r-${reaction.id}`)
      keep.add('trunk2')
      for (const queryId of reaction.queryIds) {
        if (queries.some(queryItem => queryItem.id === queryId)) keep.add(`q-out-${queryId}`)
      }
      return keep
    }

    return null
  }, [hoveredNodeId, queries, reactions, sources])

  function lineStateFor(pathKey: string): FlowLineState {
    if (pathKey === 'trunk1' || pathKey === 'trunk2') {
      const anyActive = queries.some(query => !stoppedNodeIds.has(query.id) && query.status === 'ready')
      return anyActive ? 'active' : 'idle'
    }
    if (pathKey.startsWith('s-')) {
      const id = pathKey.slice(2)
      const source = sources.find(item => item.id === id)
      if (!source) return 'idle'
      if (stoppedNodeIds.has(id)) return 'stopped'
      if (source.status === 'error') return 'error'
      return source.status === 'ready' ? 'active' : 'idle'
    }
    if (pathKey.startsWith('q-in-') || pathKey.startsWith('q-out-')) {
      const id = pathKey.replace(/^q-(in|out)-/, '')
      const query = queries.find(item => item.id === id)
      if (!query) return 'idle'
      if (stoppedNodeIds.has(id)) return 'stopped'
      if (query.status === 'error') return 'error'
      return query.status === 'ready' ? 'active' : 'idle'
    }
    if (pathKey.startsWith('r-')) {
      const id = pathKey.slice(2)
      const reaction = reactions.find(item => item.id === id)
      if (!reaction) return 'idle'
      if (stoppedNodeIds.has(id)) return 'stopped'
      if (reaction.status === 'error') return 'error'
      return reaction.status === 'ready' ? 'active' : 'idle'
    }
    return 'active'
  }

  const kpis = useMemo(() => {
    const total = liveResults.length
    const sourceCount = sources.length
    const reactionCount = reactions.filter(reaction => !stoppedNodeIds.has(reaction.id) && reaction.status === 'ready').length
    return {
      eventsPerSec: isLive ? streamSubscription.results.length : Math.max(1, Math.round(total / 3)),
      matchRate: total,
      activeReactions: reactionCount,
      activeSources: sourceCount,
    }
  }, [isLive, liveResults.length, reactions, sources, stoppedNodeIds, streamSubscription.results.length])

  return (
    <div className="h-full w-full flex flex-col p-3 overflow-hidden relative">
      <DrasiHeaderControls
        activeConnection={activeConnection}
        drasiConnections={drasiConnections}
        flows={flows}
        selectedFlowId={selectedFlowId}
        onSelectConnection={setActive}
        onOpenConnectionsModal={openConnectionsModal}
        onSelectFlow={setSelectedFlowId}
        onOpenStreamSamples={openStreamSamples}
      />
      <DrasiInstallBanner isLive={isLive} />
      <DrasiKpiStrip kpis={kpis} />
      <DrasiPipelineCanvas
        containerRef={containerRef}
        rects={rects}
        paths={paths}
        lineStateFor={lineStateFor}
        connectedLineKeys={connectedLineKeys}
        sources={sources}
        queries={queries}
        reactions={reactions}
        liveResults={liveResults}
        isLive={isLive}
        liveMode={liveData?.mode}
        selectedQueryId={selectedQueryId}
        pinnedQueryId={pinnedQueryId}
        stoppedNodeIds={stoppedNodeIds}
        hoveredNodeId={hoveredNodeId}
        connectedNodeIds={connectedNodeIds}
        setSourceEl={setSourceEl}
        setQueryEl={setQueryEl}
        setReactionEl={setReactionEl}
        onSelectQuery={handleQueryClick}
        onToggleStopped={toggleStopped}
        onTogglePin={togglePin}
        onExpandNode={setExpandedNode}
        onConfigureSource={setConfiguringSource}
        onConfigureQuery={setConfiguringQuery}
        onDeleteResource={deleteResource}
        onHoverNode={setHoveredNodeId}
        onSelectRow={setSelectedRow}
        onOpenStreamSamples={openStreamSamples}
        onCreateResultReactionForQuery={createResultReactionForQuery}
        onCreateDefaultReaction={createDefaultReaction}
      />
      <DrasiOverlays
        selectedRow={selectedRow}
        onCloseSelectedRow={() => setSelectedRow(null)}
        showStreamSamples={showStreamSamples}
        streamEndpoint={buildStreamEndpoint(activeConnection, isLive ? liveData : null, selectedQueryId)}
        isDemoData={!isLive}
        onCloseStreamSamples={closeStreamSamples}
        showConnectionsModal={showConnectionsModal}
        connections={drasiConnections}
        activeConnectionId={activeConnection?.id ?? ''}
        onSelectConnection={setActive}
        onAddConnection={addConnection}
        onUpdateConnection={updateConnection}
        onRequestRemoveConnection={(id, name) => setPendingConfirm({
          title: t('drasi.deleteConnectionTitle'),
          message: t('drasi.deleteConnectionConfirm', { name }),
          onConfirm: () => removeConnection(id),
        })}
        onCloseConnectionsModal={closeConnectionsModal}
        expandedNode={expandedNode}
        onCloseExpandedNode={() => setExpandedNode(null)}
        configuringSource={configuringSource}
        onSaveSourceConfig={config => saveSourceConfig(configuringSource === 'new' ? null : configuringSource?.id ?? null, config)}
        onCloseSourceConfig={() => setConfiguringSource(null)}
        configuringQuery={configuringQuery}
        onSaveQueryConfig={config => saveQueryConfig(configuringQuery === 'new' ? null : configuringQuery?.id ?? null, config)}
        onCloseQueryConfig={() => setConfiguringQuery(null)}
        pendingConfirm={pendingConfirm}
        onConfirmPending={() => {
          pendingConfirm?.onConfirm()
          setPendingConfirm(null)
        }}
        onClosePendingConfirm={() => setPendingConfirm(null)}
      />
    </div>
  )
}

export default DrasiReactiveGraph
