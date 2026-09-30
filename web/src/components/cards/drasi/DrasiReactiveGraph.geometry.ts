/**
 * Layout-measurement and flow-line geometry logic for DrasiReactiveGraph.
 *
 * Extracted from DrasiReactiveGraph.tsx to keep the main component focused
 * on data orchestration. Owns the ResizeObserver-driven node measurement,
 * SVG path computation between sources → queries → reactions, and the
 * hover-highlight lookups used by DrasiPipelineCanvas.
 */
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type {
  DrasiQuery,
  DrasiReaction,
  DrasiSource,
  FlowLineState,
  MeasuredRects,
  NodeRect,
} from './DrasiTypes'
import { rectsEqual } from './DrasiTypes'

interface UseDrasiGraphGeometryArgs {
  sources: DrasiSource[]
  queries: DrasiQuery[]
  reactions: DrasiReaction[]
  stoppedNodeIds: Set<string>
  hoveredNodeId: string | null
  selectedQueryId: string
  liveResultsLength: number
}

export interface DrasiFlowPath {
  key: string
  d: string
  dashed: boolean
  active: boolean
  delay: number
}

export function useDrasiGraphGeometry({
  sources,
  queries,
  reactions,
  stoppedNodeIds,
  hoveredNodeId,
  selectedQueryId,
  liveResultsLength,
}: UseDrasiGraphGeometryArgs) {
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
  }, [sources.length, queries.length, reactions.length, selectedQueryId, liveResultsLength])

  const paths = useMemo<DrasiFlowPath[]>(() => {
    const items: DrasiFlowPath[] = []
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

  const lineStateFor = useCallback((pathKey: string): FlowLineState => {
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
  }, [queries, reactions, sources, stoppedNodeIds])

  return {
    containerRef,
    setSourceEl,
    setQueryEl,
    setReactionEl,
    rects,
    paths,
    connectedNodeIds,
    connectedLineKeys,
    lineStateFor,
  }
}
