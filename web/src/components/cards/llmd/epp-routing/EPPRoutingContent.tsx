import { DynamicCardErrorBoundary } from '../../DynamicCardErrorBoundary'
import { EPPRoutingConfig } from './EPPRoutingConfig'
import { EPPRoutingMetrics } from './EPPRoutingMetrics'
import { useEPPRoutingData } from './useEPPRoutingData'

function EPPRoutingInternal() {
  const {
    dynamicNodes,
    generatePath,
    getNodeWithMetrics,
    hoveredLink,
    isDemoMode,
    isExpanded,
    links,
    metrics,
    metricsHistory,
    nodeMetrics,
    onHoveredLinkChange,
    onSelectedNodeChange,
    selectedMetricTypes,
    selectedNode,
    selectedStack,
    showEmptyState,
    showParticles,
    toggleMetric,
    toggleShowParticles,
    toggleViewMode,
    uniqueId,
    viewMode,
  } = useEPPRoutingData()

  return (
    <div className="p-4 h-full flex-1 flex flex-col bg-linear-to-br from-background/50 to-secondary/30 relative">
      <EPPRoutingConfig
        isDemoMode={isDemoMode}
        metrics={metrics}
        onToggleParticles={toggleShowParticles}
        onToggleViewMode={toggleViewMode}
        selectedStack={selectedStack}
        showParticles={showParticles}
        viewMode={viewMode}
      />

      <EPPRoutingMetrics
        dynamicNodes={dynamicNodes}
        generatePath={generatePath}
        getNodeWithMetrics={getNodeWithMetrics}
        hoveredLink={hoveredLink}
        isExpanded={isExpanded}
        links={links}
        metricsHistory={metricsHistory}
        nodeMetrics={nodeMetrics}
        onHoveredLinkChange={onHoveredLinkChange}
        onSelectedNodeChange={onSelectedNodeChange}
        selectedMetricTypes={selectedMetricTypes}
        selectedNode={selectedNode}
        showEmptyState={showEmptyState}
        showParticles={showParticles}
        toggleMetric={toggleMetric}
        uniqueId={uniqueId}
        viewMode={viewMode}
      />
    </div>
  )
}

export function EPPRouting() {
  return (
    <DynamicCardErrorBoundary cardId="EPPRouting">
      <EPPRoutingInternal />
    </DynamicCardErrorBoundary>
  )
}

export default EPPRouting
