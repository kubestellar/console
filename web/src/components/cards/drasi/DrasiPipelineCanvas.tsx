import { useMemo, type RefObject } from 'react'
import { Code2, Plus, Search, Zap } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  NODE_MAX_WIDTH_PX,
  QUERY_MAX_WIDTH_PX,
  TRUNK2_WIDTH_PX,
} from './DrasiConstants'
import { FlowLine } from './DrasiFlowLine'
import { NodeCard, ReactionIconEl, SourceIconEl } from './DrasiNodeCard'
import {
  DRASI_REACTIVE_GRAPH_QUERY_HEADER_STYLE,
  DRASI_REACTIVE_GRAPH_REACTION_HEADER_STYLE,
  DRASI_REACTIVE_GRAPH_SOURCE_HEADER_STYLE,
} from './DrasiReactiveGraph.constants'
import { ResultsTable } from './DrasiResultsTable'
import type {
  DrasiPipelineData,
  DrasiQuery,
  DrasiSource,
  ExpandedNodeDetails,
  FlowLineState,
  LiveResultRow,
  MeasuredRects,
} from './DrasiTypes'

interface DrasiPipelineCanvasProps {
  containerRef: RefObject<HTMLDivElement | null>
  rects: MeasuredRects
  paths: Array<{ key: string; d: string; dashed: boolean; active: boolean; delay: number }>
  lineStateFor: (pathKey: string) => FlowLineState
  connectedLineKeys: Set<string> | null
  sources: DrasiPipelineData['sources']
  queries: DrasiPipelineData['queries']
  reactions: DrasiPipelineData['reactions']
  liveResults: LiveResultRow[]
  isLive: boolean
  liveMode: 'server' | 'platform' | null | undefined
  selectedQueryId: string
  pinnedQueryId: string | null
  stoppedNodeIds: Set<string>
  hoveredNodeId: string | null
  connectedNodeIds: (hoverId: string) => Set<string>
  setSourceEl: (id: string) => (el: HTMLDivElement | null) => void
  setQueryEl: (id: string) => (el: HTMLDivElement | null) => void
  setReactionEl: (id: string) => (el: HTMLDivElement | null) => void
  onSelectQuery: (queryId: string) => void
  onToggleStopped: (nodeId: string) => void
  onTogglePin: (queryId: string) => void
  onExpandNode: (node: ExpandedNodeDetails) => void
  onConfigureSource: (source: DrasiSource | 'new') => void
  onConfigureQuery: (query: DrasiQuery | 'new') => void
  onDeleteResource: (kind: 'source' | 'query' | 'reaction', id: string, name: string) => void
  onHoverNode: (nodeId: string | null) => void
  onSelectRow: (row: LiveResultRow) => void
  onOpenStreamSamples: () => void
  onCreateResultReactionForQuery: (queryId: string) => void
  onCreateDefaultReaction: () => void
}

export function DrasiPipelineCanvas({
  containerRef,
  rects,
  paths,
  lineStateFor,
  connectedLineKeys,
  sources,
  queries,
  reactions,
  liveResults,
  isLive,
  liveMode,
  selectedQueryId,
  pinnedQueryId,
  stoppedNodeIds,
  hoveredNodeId,
  connectedNodeIds,
  setSourceEl,
  setQueryEl,
  setReactionEl,
  onSelectQuery,
  onToggleStopped,
  onTogglePin,
  onExpandNode,
  onConfigureSource,
  onConfigureQuery,
  onDeleteResource,
  onHoverNode,
  onSelectRow,
  onOpenStreamSamples,
  onCreateResultReactionForQuery,
  onCreateDefaultReaction,
}: DrasiPipelineCanvasProps) {
  const { t } = useTranslation()
  const connectedNodes = useMemo(
    () => (hoveredNodeId ? connectedNodeIds(hoveredNodeId) : null),
    [connectedNodeIds, hoveredNodeId],
  )

  return (
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
        {paths.map(path => {
          const state = lineStateFor(path.key)
          const dimmed = connectedLineKeys !== null && !connectedLineKeys.has(path.key)
          return (
            <FlowLine
              key={path.key}
              lineKey={path.key}
              d={path.d}
              dashed={path.dashed}
              active={path.active}
              delay={path.delay}
              state={state}
              dimmed={dimmed}
            />
          )
        })}
      </svg>

      <div
        className="relative grid h-full gap-y-3"
        style={{
          gridTemplateColumns:
            `minmax(0, ${NODE_MAX_WIDTH_PX}px) minmax(40px, 1fr) ` +
            `minmax(0, ${QUERY_MAX_WIDTH_PX}px) minmax(40px, 1fr) ` +
            `${TRUNK2_WIDTH_PX}px minmax(0, ${NODE_MAX_WIDTH_PX}px)`,
          gridAutoRows: 'min-content',
          zIndex: 1,
        }}
      >
        <div className="flex items-center gap-1.5" style={DRASI_REACTIVE_GRAPH_SOURCE_HEADER_STYLE}>
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Sources</span>
          <button
            type="button"
            onClick={() => onConfigureSource('new')}
            className="w-4 h-4 flex items-center justify-center rounded bg-slate-700/40 hover:bg-emerald-500/30 border border-slate-600/40 hover:border-emerald-500/50 text-slate-400 hover:text-emerald-300 transition-colors"
            aria-label={t('drasi.addSource')}
            title={t('drasi.addSource')}
          >
            <Plus className="w-2.5 h-2.5" />
          </button>
        </div>
        <div className="flex items-center gap-1.5" style={DRASI_REACTIVE_GRAPH_QUERY_HEADER_STYLE}>
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Continuous Queries</span>
          <button
            type="button"
            onClick={() => onConfigureQuery('new')}
            className="w-4 h-4 flex items-center justify-center rounded bg-slate-700/40 hover:bg-cyan-500/30 border border-slate-600/40 hover:border-cyan-500/50 text-slate-400 hover:text-cyan-300 transition-colors"
            aria-label={t('drasi.addQuery')}
            title={t('drasi.addQuery')}
          >
            <Plus className="w-2.5 h-2.5" />
          </button>
        </div>
        <div className="flex items-center gap-1.5" style={DRASI_REACTIVE_GRAPH_REACTION_HEADER_STYLE}>
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Reactions</span>
          <button
            type="button"
            onClick={onCreateDefaultReaction}
            className="w-4 h-4 flex items-center justify-center rounded bg-slate-700/40 hover:bg-emerald-500/30 border border-slate-600/40 hover:border-emerald-500/50 text-slate-400 hover:text-emerald-300 transition-colors"
            aria-label={t('drasi.addReaction')}
            title={t('drasi.addReaction')}
          >
            <Plus className="w-2.5 h-2.5" />
          </button>
        </div>

        {sources.map((source, index) => (
          <div key={source.id} style={{ gridColumn: 1, gridRow: index + 2 }}>
            <NodeCard
              nodeRef={setSourceEl(source.id)}
              title={source.name}
              subtitle={source.kind}
              icon={<SourceIconEl kind={source.kind} />}
              status={source.status}
              accentColor="emerald"
              isStopped={stoppedNodeIds.has(source.id)}
              isDimmed={hoveredNodeId !== null && hoveredNodeId !== source.id && !connectedNodes?.has(source.id)}
              showGear
              showDelete
              onStop={() => onToggleStopped(source.id)}
              onExpand={() => onExpandNode({ id: source.id, name: source.name, kind: source.kind, type: 'source', extra: { status: source.status } })}
              onConfigure={() => onConfigureSource(source)}
              onDelete={() => onDeleteResource('source', source.id, source.name)}
              onHoverEnter={() => onHoverNode(source.id)}
              onHoverLeave={() => onHoverNode(null)}
            />
          </div>
        ))}

        {queries.map((query, index) => {
          const hasResults = query.id === selectedQueryId && !stoppedNodeIds.has(query.id) && liveResults.length > 0
          const hasReaction = reactions.some(reaction => reaction.queryIds.includes(query.id) && reaction.kind === 'SSE')
          return (
            <div
              key={query.id}
              style={{
                gridColumn: hasResults ? '3 / 5' : 3,
                gridRow: index + 2,
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
                isDimmed={hoveredNodeId !== null && hoveredNodeId !== query.id && !connectedNodes?.has(query.id)}
                showPin
                showGear
                showDelete
                onClick={() => onSelectQuery(query.id)}
                onStop={() => onToggleStopped(query.id)}
                onPin={() => onTogglePin(query.id)}
                onExpand={() => onExpandNode({
                  id: query.id,
                  name: query.name,
                  kind: query.language,
                  type: 'query',
                  extra: { sources: (query.sourceIds || []).join(', ') || '(none)' },
                })}
                onConfigure={() => onConfigureQuery(query)}
                onDelete={() => onDeleteResource('query', query.id, query.name)}
                onHoverEnter={() => onHoverNode(query.id)}
                onHoverLeave={() => onHoverNode(null)}
              >
                {hasResults && (
                  <ResultsTable
                    results={liveResults}
                    isDemoData={!isLive}
                    onRowClick={onSelectRow}
                    headerAction={
                      <div className="flex items-center gap-1">
                        {isLive && liveMode === 'platform' && !hasReaction && (
                          <button
                            type="button"
                            onClick={event => { event.stopPropagation(); onCreateResultReactionForQuery(query.id) }}
                            className="text-xs px-1.5 py-0.5 rounded bg-cyan-600/20 hover:bg-cyan-600/40 border border-cyan-500/40 text-cyan-300 flex items-center gap-1"
                            title={t('drasi.enableLiveResultsHint')}
                          >
                            <Zap className="w-2.5 h-2.5" />
                            {t('drasi.enableLiveResults')}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={event => { event.stopPropagation(); onOpenStreamSamples() }}
                          className="text-xs px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-muted-foreground hover:text-cyan-300 flex items-center gap-1"
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

        {reactions.map((reaction, index) => (
          <div key={reaction.id} style={{ gridColumn: 6, gridRow: index + 2 }}>
            <NodeCard
              nodeRef={setReactionEl(reaction.id)}
              title={reaction.name}
              subtitle={reaction.kind}
              icon={<ReactionIconEl kind={reaction.kind} />}
              status={reaction.status}
              accentColor="emerald"
              isStopped={stoppedNodeIds.has(reaction.id)}
              isDimmed={hoveredNodeId !== null && hoveredNodeId !== reaction.id && !connectedNodes?.has(reaction.id)}
              showDelete
              onStop={() => onToggleStopped(reaction.id)}
              onExpand={() => onExpandNode({
                id: reaction.id,
                name: reaction.name,
                kind: reaction.kind,
                type: 'reaction',
                extra: { queries: (reaction.queryIds || []).join(', ') || '(none)' },
              })}
              onDelete={() => onDeleteResource('reaction', reaction.id, reaction.name)}
              onHoverEnter={() => onHoverNode(reaction.id)}
              onHoverLeave={() => onHoverNode(null)}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
