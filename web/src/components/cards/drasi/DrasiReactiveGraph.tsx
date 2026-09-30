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
 *   DrasiReactiveGraph.state.ts      — connection/demo-data orchestration + CRUD handlers
 *   DrasiReactiveGraph.geometry.ts   — node measurement, flow paths, hover lookups
 *   DrasiReactiveGraphSections.tsx   — extracted orchestration sub-components
 */
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useReportCardDataState } from '../CardDataContext'
import { useDrasiResources } from '../../../hooks/useDrasiResources'
import { Skeleton } from '../../ui/Skeleton'
import { useDrasiReactiveGraphState } from './DrasiReactiveGraph.state'
import { useDrasiGraphGeometry } from './DrasiReactiveGraph.geometry'
import {
  DrasiHeaderControls,
  DrasiInstallBanner,
  DrasiKpiStrip,
  DrasiOverlays,
  DrasiPipelineCanvas,
} from './DrasiReactiveGraphSections'
import { buildStreamEndpoint } from './DrasiReactiveGraph.utils'

export function DrasiReactiveGraph() {
  const { t } = useTranslation()
  const {
    data: drasiData,
    isLoading,
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

  if (isLoading && !drasiData) {
    return (
      <div className="h-full flex flex-col p-3 gap-3">
        <div className="flex items-center justify-between">
          <Skeleton variant="rounded" width={200} height={32} />
          <Skeleton variant="rounded" width={120} height={32} />
        </div>
        <div className="grid grid-cols-4 gap-2">
          <Skeleton variant="rounded" height={48} />
          <Skeleton variant="rounded" height={48} />
          <Skeleton variant="rounded" height={48} />
          <Skeleton variant="rounded" height={48} />
        </div>
        <div className="flex-1 flex items-center justify-center">
          <Skeleton variant="rounded" width="90%" height="80%" className="max-h-96" />
        </div>
      </div>
    )
  }

  const {
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
  } = useDrasiReactiveGraphState({ isDemoData, drasiData, refetchDrasi, t })

  const {
    containerRef,
    setSourceEl,
    setQueryEl,
    setReactionEl,
    rects,
    paths,
    connectedNodeIds,
    connectedLineKeys,
    lineStateFor,
  } = useDrasiGraphGeometry({
    sources,
    queries,
    reactions,
    stoppedNodeIds,
    hoveredNodeId,
    selectedQueryId,
    liveResultsLength: liveResults.length,
  })

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
