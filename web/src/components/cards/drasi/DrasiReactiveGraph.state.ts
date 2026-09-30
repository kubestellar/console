/**
 * Data-orchestration hook for DrasiReactiveGraph.
 *
 * Extracted from DrasiReactiveGraph.tsx to isolate connection/demo-data
 * merging, flow filtering, query selection, and the source/query/reaction
 * CRUD handlers (which proxy to the live Drasi API or mutate the demo
 * dataset) from the presentational component.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { TFunction } from 'i18next'
import { useModalState } from '../../../lib/modals'
import { useDrasiConnections } from '../../../hooks/useDrasiConnections'
import { useDrasiQueryStream } from '../../../hooks/useDrasiQueryStream'
import type { DrasiResourceData } from '../../../hooks/useDrasiResources'
import { DRASI_PROXY_TIMEOUT_MS, FLOW_ANIMATION_INTERVAL_MS } from './DrasiConstants'
import { demoThemeForConnection, generateDemoData } from './DrasiDemoData'
import { computeFlows, FLOW_ID_ALL } from './DrasiFlowUtils'
import { buildDrasiProxyTarget, getDrasiResourcePath, type DrasiResourceKind } from './DrasiReactiveGraph.utils'
import type {
  DrasiPipelineData,
  DrasiQuery,
  DrasiSource,
  ExpandedNodeDetails,
  LiveResultRow,
  QueryConfig,
  SourceConfig,
} from './DrasiTypes'

interface UseDrasiReactiveGraphStateArgs {
  isDemoData: boolean
  drasiData: DrasiResourceData | null
  refetchDrasi: () => void
  t: TFunction
}

export function useDrasiReactiveGraphState({ isDemoData, drasiData, refetchDrasi, t }: UseDrasiReactiveGraphStateArgs) {
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

  const deleteResource = useCallback((kind: DrasiResourceKind, id: string, name: string) => {
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

  return {
    selectedQueryId,
    pinnedQueryId,
    stoppedNodeIds,
    hoveredNodeId,
    setHoveredNodeId,
    expandedNode,
    setExpandedNode,
    configuringSource,
    setConfiguringSource,
    configuringQuery,
    setConfiguringQuery,
    selectedRow,
    setSelectedRow,
    drasiConnections,
    activeConnection,
    addConnection,
    updateConnection,
    removeConnection,
    setActive,
    isLive,
    liveData,
    showConnectionsModal,
    openConnectionsModal,
    closeConnectionsModal,
    showStreamSamples,
    openStreamSamples,
    closeStreamSamples,
    pendingConfirm,
    setPendingConfirm,
    selectedFlowId,
    setSelectedFlowId,
    flows,
    sources,
    queries,
    reactions,
    liveResults,
    streamSubscription,
    handleQueryClick,
    toggleStopped,
    togglePin,
    saveSourceConfig,
    saveQueryConfig,
    createDefaultReaction,
    createResultReactionForQuery,
    deleteResource,
  }
}
