import { useMemo, type RefObject } from 'react'
import { AnimatePresence } from 'framer-motion'
import { Code2, Plus, Rocket, Search, Server, Settings, Zap } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getMissionRoute } from '../../../config/routes'
import { ConfirmDialog } from '../../../lib/modals'
import type { DrasiConnection } from '../../../hooks/useDrasiConnections'
import {
  KPI_LABEL_EVENTS_PER_SEC,
  KPI_LABEL_REACTIONS,
  KPI_LABEL_RESULT_ROWS,
  KPI_LABEL_SOURCES,
  NODE_MAX_WIDTH_PX,
  QUERY_MAX_WIDTH_PX,
  TRUNK2_WIDTH_PX,
} from './DrasiConstants'
import { FlowLine } from './DrasiFlowLine'
import { FLOW_ID_ALL, type Flow } from './DrasiFlowUtils'
import {
  ConnectionsModal,
  ExpandModal,
  QueryConfigModal,
  RowDetailDrawer,
  SourceConfigModal,
} from './DrasiModals'
import { NodeCard, ReactionIconEl, SourceIconEl } from './DrasiNodeCard'
import {
  DRASI_REACTIVE_GRAPH_QUERY_HEADER_STYLE,
  DRASI_REACTIVE_GRAPH_REACTION_HEADER_STYLE,
  DRASI_REACTIVE_GRAPH_SOURCE_HEADER_STYLE,
} from './DrasiReactiveGraph.constants'
import { StreamSampleDrawer } from './DrasiStreamSamples'
import { KPIBox, ResultsTable } from './DrasiResultsTable'
import type {
  DrasiPipelineData,
  DrasiQuery,
  DrasiSource,
  ExpandedNodeDetails,
  FlowLineState,
  LiveResultRow,
  MeasuredRects,
  QueryConfig,
  SourceConfig,
} from './DrasiTypes'

interface DrasiHeaderControlsProps {
  activeConnection: DrasiConnection | null
  drasiConnections: DrasiConnection[]
  flows: Flow[]
  selectedFlowId: string
  onSelectConnection: (id: string) => void
  onOpenConnectionsModal: () => void
  onSelectFlow: (id: string) => void
  onOpenStreamSamples: () => void
}

export function DrasiHeaderControls({
  activeConnection,
  drasiConnections,
  flows,
  selectedFlowId,
  onSelectConnection,
  onOpenConnectionsModal,
  onSelectFlow,
  onOpenStreamSamples,
}: DrasiHeaderControlsProps) {
  const { t } = useTranslation()

  return (
    <div className="shrink-0 mb-4 flex items-center gap-2 flex-wrap">
      <Server className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
      <select
        value={activeConnection?.id ?? ''}
        onChange={e => onSelectConnection(e.target.value)}
        className="min-w-[160px] max-w-[260px] px-2 py-1 text-[11px] bg-slate-950 border border-slate-700 rounded text-white focus:border-cyan-500 focus:outline-hidden"
        aria-label={t('drasi.connectionsTitle')}
      >
        <option value="">{t('drasi.noActiveConnection')}</option>
        {drasiConnections.map(connection => (
          <option key={connection.id} value={connection.id}>
            {connection.name}
            {connection.mode === 'server' ? ' · server' : ' · platform'}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={onOpenConnectionsModal}
        className="shrink-0 w-6 h-6 flex items-center justify-center rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-muted-foreground hover:text-cyan-300"
        aria-label={t('drasi.manageConnections')}
        title={t('drasi.manageConnections')}
      >
        <Settings className="w-3 h-3" />
      </button>
      {(flows.length > 1 || selectedFlowId !== FLOW_ID_ALL) && (
        <>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground shrink-0 ml-1">{t('drasi.flowLabel')}</span>
          <select
            value={selectedFlowId}
            onChange={e => onSelectFlow(e.target.value)}
            className="shrink-0 min-w-[140px] max-w-[220px] px-2 py-1 text-[11px] bg-slate-950 border border-slate-700 rounded text-white focus:border-cyan-500 focus:outline-hidden"
            aria-label={t('drasi.flowLabel')}
          >
            <option value={FLOW_ID_ALL}>{t('drasi.flowAllResources')}</option>
            {flows.map(flow => (
              <option key={flow.id} value={flow.id}>{flow.label}</option>
            ))}
          </select>
        </>
      )}
      <button
        type="button"
        onClick={onOpenStreamSamples}
        className="shrink-0 ml-auto px-2 py-1 text-[10px] rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-muted-foreground hover:text-cyan-300 flex items-center gap-1.5"
        aria-label={t('drasi.consumeStreamTitle')}
        title={t('drasi.consumeStreamTitle')}
      >
        <Code2 className="w-3 h-3" />
        {t('drasi.consumeStream')}
      </button>
    </div>
  )
}

export function DrasiInstallBanner({ isLive }: { isLive: boolean }) {
  const { t } = useTranslation()
  const navigate = useNavigate()

  if (isLive) return null

  return (
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
  )
}

export function DrasiKpiStrip({
  kpis,
}: {
  kpis: { eventsPerSec: number; matchRate: number; activeSources: number; activeReactions: number }
}) {
  return (
    <div className="shrink-0 grid grid-cols-2 @md:grid-cols-4 gap-2 mb-2">
      <KPIBox label={KPI_LABEL_EVENTS_PER_SEC} value={kpis.eventsPerSec} accent="emerald" />
      <KPIBox label={KPI_LABEL_RESULT_ROWS} value={kpis.matchRate} accent="cyan" />
      <KPIBox label={KPI_LABEL_SOURCES} value={kpis.activeSources} accent="emerald" />
      <KPIBox label={KPI_LABEL_REACTIONS} value={kpis.activeReactions} accent="emerald" />
    </div>
  )
}

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
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Sources</span>
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
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Continuous Queries</span>
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
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Reactions</span>
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
                            className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-600/20 hover:bg-cyan-600/40 border border-cyan-500/40 text-cyan-300 flex items-center gap-1"
                            title={t('drasi.enableLiveResultsHint')}
                          >
                            <Zap className="w-2.5 h-2.5" />
                            {t('drasi.enableLiveResults')}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={event => { event.stopPropagation(); onOpenStreamSamples() }}
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

interface DrasiOverlaysProps {
  selectedRow: LiveResultRow | null
  onCloseSelectedRow: () => void
  showStreamSamples: boolean
  streamEndpoint: string
  isDemoData: boolean
  onCloseStreamSamples: () => void
  showConnectionsModal: boolean
  connections: DrasiConnection[]
  activeConnectionId: string
  onSelectConnection: (id: string) => void
  onAddConnection: (connection: Omit<DrasiConnection, 'id' | 'createdAt'>) => DrasiConnection
  onUpdateConnection: (id: string, patch: Partial<Omit<DrasiConnection, 'id' | 'createdAt'>>) => void
  onRequestRemoveConnection: (id: string, name: string) => void
  onCloseConnectionsModal: () => void
  expandedNode: ExpandedNodeDetails | null
  onCloseExpandedNode: () => void
  configuringSource: DrasiSource | 'new' | null
  onSaveSourceConfig: (config: SourceConfig) => void
  onCloseSourceConfig: () => void
  configuringQuery: DrasiQuery | 'new' | null
  onSaveQueryConfig: (config: QueryConfig) => void
  onCloseQueryConfig: () => void
  pendingConfirm: { title: string; message: string; onConfirm: () => void } | null
  onConfirmPending: () => void
  onClosePendingConfirm: () => void
}

export function DrasiOverlays({
  selectedRow,
  onCloseSelectedRow,
  showStreamSamples,
  streamEndpoint,
  isDemoData,
  onCloseStreamSamples,
  showConnectionsModal,
  connections,
  activeConnectionId,
  onSelectConnection,
  onAddConnection,
  onUpdateConnection,
  onRequestRemoveConnection,
  onCloseConnectionsModal,
  expandedNode,
  onCloseExpandedNode,
  configuringSource,
  onSaveSourceConfig,
  onCloseSourceConfig,
  configuringQuery,
  onSaveQueryConfig,
  onCloseQueryConfig,
  pendingConfirm,
  onConfirmPending,
  onClosePendingConfirm,
}: DrasiOverlaysProps) {
  const { t } = useTranslation()

  return (
    <>
      <AnimatePresence>
        {selectedRow && <RowDetailDrawer row={selectedRow} onClose={onCloseSelectedRow} />}
        {showStreamSamples && (
          <StreamSampleDrawer
            endpoint={streamEndpoint}
            isDemoData={isDemoData}
            onClose={onCloseStreamSamples}
          />
        )}
        {showConnectionsModal && (
          <ConnectionsModal
            connections={connections}
            activeId={activeConnectionId}
            onSelect={id => { onSelectConnection(id); onCloseConnectionsModal() }}
            onAdd={onAddConnection}
            onUpdate={onUpdateConnection}
            onRequestRemove={onRequestRemoveConnection}
            onClose={onCloseConnectionsModal}
          />
        )}
        {expandedNode && <ExpandModal node={expandedNode} onClose={onCloseExpandedNode} />}
        {configuringSource && (
          <SourceConfigModal
            source={configuringSource === 'new' ? null : configuringSource}
            onSave={onSaveSourceConfig}
            onClose={onCloseSourceConfig}
          />
        )}
        {configuringQuery && (
          <QueryConfigModal
            query={configuringQuery === 'new' ? null : configuringQuery}
            onSave={onSaveQueryConfig}
            onClose={onCloseQueryConfig}
          />
        )}
      </AnimatePresence>
      <ConfirmDialog
        isOpen={pendingConfirm !== null}
        title={pendingConfirm?.title ?? ''}
        message={pendingConfirm?.message ?? ''}
        confirmLabel={t('actions.delete')}
        variant="danger"
        onConfirm={onConfirmPending}
        onClose={onClosePendingConfirm}
      />
    </>
  )
}
