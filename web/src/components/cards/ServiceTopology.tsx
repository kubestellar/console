import { useState, useMemo, useCallback } from 'react'
import { ZoomIn, ZoomOut, Maximize2, ArrowRight } from 'lucide-react'
import { ClusterBadge } from '../ui/ClusterBadge'
import { StatusBadge } from '../ui/StatusBadge'
import { Skeleton } from '../ui/Skeleton'
import type { TopologyNode, TopologyEdge, TopologyHealthStatus } from '../../types/topology'
import { useReportCardDataState } from './CardDataContext'
import { useTopology } from '../../hooks/useTopology'
import { Button } from '../ui/Button'
import { useTranslation } from 'react-i18next'

// Color mapping for node types
const getNodeColor = (type: TopologyNode['type'], health: TopologyHealthStatus) => {
  if (health === 'unhealthy') return 'bg-red-500'
  if (health === 'degraded') return 'bg-yellow-500'

  switch (type) {
    case 'cluster': return 'bg-purple-500'
    case 'service': return 'bg-blue-500'
    case 'gateway': return 'bg-green-500'
    case 'external': return 'bg-gray-500'
    default: return 'bg-gray-500'
  }
}

const getEdgeColor = (type: TopologyEdge['type'], health: TopologyHealthStatus) => {
  if (health === 'unhealthy') return 'stroke-red-400'
  if (health === 'degraded') return 'stroke-yellow-400'

  switch (type) {
    case 'mcs-export': return 'stroke-cyan-400'
    case 'mcs-import': return 'stroke-cyan-400'
    case 'http-route': return 'stroke-purple-400'
    case 'grpc-route': return 'stroke-green-400'
    case 'internal': return 'stroke-gray-400'
    default: return 'stroke-gray-400'
  }
}

interface ServiceTopologyProps {
  config?: Record<string, unknown>
}

export function ServiceTopology({ config: _config }: ServiceTopologyProps) {
  const { t } = useTranslation(['cards', 'common'])
  const {
    graph,
    stats,
    isLoading,
    isFailed,
    consecutiveFailures,
    isDemoData,
  } = useTopology()

  useReportCardDataState({
    hasData: !!graph,
    isFailed,
    consecutiveFailures,
    isDemoData,
    isLoading,
  })

  const [zoom, setZoom] = useState(1)
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)

  // Use nodes and edges from the topology hook (guarded against undefined)
  const nodes = useMemo<TopologyNode[]>(() => graph?.nodes || [], [graph?.nodes])
  const edges = useMemo<TopologyEdge[]>(() => graph?.edges || [], [graph?.edges])

  // Derive stat counts from nodes when API stats don't include per-type breakdowns
  const derivedStats = useMemo(() => {
    const clusterCount = nodes.filter(n => n.type === 'cluster').length
    const serviceCount = nodes.filter(n => n.type === 'service').length
    const gatewayCount = nodes.filter(n => n.type === 'gateway').length
    const totalEdges = stats?.totalEdges ?? edges.length
    return { clusters: clusterCount, services: serviceCount, gateways: gatewayCount, totalEdges }
  }, [nodes, edges, stats])

  // Group nodes by cluster for layout
  const nodesByCluster = useMemo(() => {
    const grouped: Record<string, TopologyNode[]> = {}
    for (const node of nodes) {
      if (!grouped[node.cluster]) {
        grouped[node.cluster] = []
      }
      grouped[node.cluster].push(node)
    }
    return grouped
  }, [nodes])

  // Calculate node positions for simple visualization
  const nodePositions = useMemo(() => {
    const positions: Record<string, { x: number; y: number }> = {}
    const clusterKeys = Object.keys(nodesByCluster)
    const clusterWidth = 100 / (clusterKeys.length + 1)

    clusterKeys.forEach((cluster, clusterIndex) => {
      const clusterNodes = nodesByCluster[cluster] || []
      const clusterX = (clusterIndex + 1) * clusterWidth

      clusterNodes.forEach((node, nodeIndex) => {
        /** Vertical spacing between nodes within a cluster (percentage units) */
        const NODE_VERTICAL_SPACING = 18
        /** Starting vertical offset for the first node in a cluster */
        const NODE_VERTICAL_START = 15
        /** Maximum vertical position to prevent nodes from going off-screen */
        const NODE_MAX_Y = 85
        const nodeY = NODE_VERTICAL_START + (nodeIndex * NODE_VERTICAL_SPACING)
        positions[node.id] = { x: clusterX, y: Math.min(nodeY, NODE_MAX_Y) }
      })
    })

    return positions
  }, [nodesByCluster])

  const handleZoomIn = useCallback(() => setZoom(z => Math.min(z + 0.2, 2)), [])
  const handleZoomOut = useCallback(() => setZoom(z => Math.max(z - 0.2, 0.5)), [])
  const handleResetZoom = useCallback(() => setZoom(1), [])

  const selectedNodeData = selectedNode ? nodes.find(n => n.id === selectedNode) : null

  // Loading skeleton
  if (isLoading && nodes.length === 0) {
    return (
      <div className="h-full flex flex-col min-h-card p-2 space-y-2">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-3 w-2/3" />
        <Skeleton className="flex-1 w-full rounded-lg" />
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-card">
      {/* Header */}
      <div className="flex items-center justify-end mb-2">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            icon={<ZoomOut className="w-3.5 h-3.5" />}
            onClick={handleZoomOut}
            title={t('serviceTopology.zoomOut')}
            className="p-1 hover:bg-secondary rounded"
          />
          <Button
            variant="ghost"
            size="sm"
            icon={<Maximize2 className="w-3.5 h-3.5" />}
            onClick={handleResetZoom}
            title={t('serviceTopology.resetZoom')}
            className="p-1 hover:bg-secondary rounded"
          />
          <Button
            variant="ghost"
            size="sm"
            icon={<ZoomIn className="w-3.5 h-3.5" />}
            onClick={handleZoomIn}
            title={t('serviceTopology.zoomIn')}
            className="p-1 hover:bg-secondary rounded"
          />
        </div>
      </div>

      {/* Stats bar */}
      <div className="flex items-center gap-3 mb-2 text-2xs">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-purple-500" />
          <span className="text-muted-foreground">{t('serviceTopology.nClusters', { count: derivedStats.clusters })}</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-blue-500" />
          <span className="text-muted-foreground">{t('serviceTopology.nServices', { count: derivedStats.services })}</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-green-500" />
          <span className="text-muted-foreground">{t('serviceTopology.nGateways', { count: derivedStats.gateways })}</span>
        </div>
        <div className="flex items-center gap-1">
          <ArrowRight className="w-3 h-3 text-cyan-400" />
          <span className="text-muted-foreground">{t('serviceTopology.nConnections', { count: derivedStats.totalEdges })}</span>
        </div>
      </div>

      {/* Topology visualization */}
      <div className="flex-1 relative bg-secondary/30 rounded-lg overflow-hidden border border-border/50">
        <svg
          className="w-full h-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="xMidYMid meet"
          style={{ transform: `scale(${zoom})`, transformOrigin: 'center' }}
        >
          {/* Define arrow marker */}
          <defs>
            <marker
              id="arrowhead"
              markerWidth="6"
              markerHeight="6"
              refX="5"
              refY="3"
              orient="auto"
            >
              <polygon points="0 0, 6 3, 0 6" className="fill-current text-muted-foreground" />
            </marker>

            {/* Animated dash pattern for traffic */}
            <pattern id="animated-dash" patternUnits="userSpaceOnUse" width="8" height="1">
              <line x1="0" y1="0" x2="4" y2="0" className="stroke-current" strokeWidth="1">
                <animate
                  attributeName="x1"
                  from="0"
                  to="8"
                  dur="0.5s"
                  repeatCount="indefinite"
                />
                <animate
                  attributeName="x2"
                  from="4"
                  to="12"
                  dur="0.5s"
                  repeatCount="indefinite"
                />
              </line>
            </pattern>
          </defs>

          {/* Render edges */}
          {(edges).map(edge => {
            const sourcePos = nodePositions[edge.source]
            const targetPos = nodePositions[edge.target]
            if (!sourcePos || !targetPos) return null

            const isHighlighted = hoveredNode === edge.source || hoveredNode === edge.target
            const colorClass = getEdgeColor(edge.type, edge.health)

            return (
              <g key={edge.id}>
                <line
                  x1={sourcePos.x}
                  y1={sourcePos.y}
                  x2={targetPos.x}
                  y2={targetPos.y}
                  className={`${colorClass} ${isHighlighted ? 'opacity-100' : 'opacity-60'} transition-opacity`}
                  strokeWidth={isHighlighted ? 0.8 : 0.4}
                  strokeDasharray={edge.animated ? '2,2' : 'none'}
                  markerEnd="url(#arrowhead)"
                >
                  {edge.animated && (
                    <animate
                      attributeName="stroke-dashoffset"
                      from="0"
                      to="-4"
                      dur="0.5s"
                      repeatCount="indefinite"
                    />
                  )}
                </line>
                {edge.label && isHighlighted && (
                  <text
                    x={(sourcePos.x + targetPos.x) / 2}
                    y={(sourcePos.y + targetPos.y) / 2 - 1}
                    className="text-[2px] fill-muted-foreground"
                    textAnchor="middle"
                  >
                    {edge.label}
                  </text>
                )}
              </g>
            )
          })}

          {/* Render nodes */}
          {(nodes).map(node => {
            const pos = nodePositions[node.id]
            if (!pos) return null

            const isSelected = selectedNode === node.id
            const isHovered = hoveredNode === node.id
            const colorClass = getNodeColor(node.type, node.health)
            /** Radius for cluster-type nodes (larger to visually distinguish) */
            const CLUSTER_NODE_RADIUS = 4
            /** Radius for non-cluster nodes (services, gateways, external) */
            const DEFAULT_NODE_RADIUS = 2.5
            const radius = node.type === 'cluster' ? CLUSTER_NODE_RADIUS : DEFAULT_NODE_RADIUS

            return (
              <g
                key={node.id}
                className="cursor-pointer"
                onClick={() => setSelectedNode(isSelected ? null : node.id)}
                onMouseEnter={() => setHoveredNode(node.id)}
                onMouseLeave={() => setHoveredNode(null)}
              >
                {/* Node circle */}
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={radius}
                  className={`${colorClass} ${isSelected || isHovered ? 'opacity-100' : 'opacity-80'} transition-all`}
                  stroke={isSelected ? 'white' : 'transparent'}
                  strokeWidth={isSelected ? 0.5 : 0}
                />

                {/* Pulse animation for healthy nodes with traffic */}
                {node.health === 'healthy' && node.metadata?.exported && (
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r={radius}
                    className={`${colorClass} opacity-30`}
                    fill="none"
                    strokeWidth={0.3}
                  >
                    <animate
                      attributeName="r"
                      from={String(radius)}
                      to={String(radius + 2)}
                      dur="1.5s"
                      repeatCount="indefinite"
                    />
                    <animate
                      attributeName="opacity"
                      from="0.3"
                      to="0"
                      dur="1.5s"
                      repeatCount="indefinite"
                    />
                  </circle>
                )}

                {/* Node label */}
                <text
                  x={pos.x}
                  y={pos.y + radius + 2.5}
                  className={`text-[2px] fill-foreground ${isHovered || isSelected ? 'opacity-100' : 'opacity-70'}`}
                  textAnchor="middle"
                >
                  {node.label}
                </text>
              </g>
            )
          })}
        </svg>

        {/* Legend */}
        <div className="absolute bottom-2 left-2 flex flex-wrap gap-2 text-[9px]">
          <div className="flex items-center gap-1 bg-background/80 px-1.5 py-0.5 rounded">
            <div className="w-2 h-0.5 bg-cyan-400" />
            <span className="text-muted-foreground">MCS</span>
          </div>
          <div className="flex items-center gap-1 bg-background/80 px-1.5 py-0.5 rounded">
            <div className="w-2 h-0.5 bg-purple-400" />
            <span className="text-muted-foreground">HTTPRoute</span>
          </div>
          <div className="flex items-center gap-1 bg-background/80 px-1.5 py-0.5 rounded">
            <div className="w-2 h-0.5 bg-gray-400" />
            <span className="text-muted-foreground">Internal</span>
          </div>
        </div>
      </div>

      {/* Selected node details */}
      {selectedNodeData && (
        <div className="mt-2 p-2 bg-secondary/50 rounded-lg text-xs">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${getNodeColor(selectedNodeData.type, selectedNodeData.health)}`} />
              <span className="font-medium text-foreground">{selectedNodeData.label}</span>
              <span className="text-muted-foreground capitalize">({selectedNodeData.type})</span>
            </div>
            <ClusterBadge cluster={selectedNodeData.cluster} />
          </div>
          {selectedNodeData.namespace && (
            <p className="text-muted-foreground text-2xs">{t('common:common.namespace')}: {selectedNodeData.namespace}</p>
          )}
          {selectedNodeData.metadata && (
            <div className="flex flex-wrap gap-1 mt-1">
              {selectedNodeData.metadata.exported && (
                <StatusBadge color="cyan" size="xs">{t('serviceTopology.exported')}</StatusBadge>
              )}
              {selectedNodeData.metadata.imported && (
                <StatusBadge color="blue" size="xs">{t('serviceTopology.imported')}</StatusBadge>
              )}
              {selectedNodeData.metadata.gatewayClass && (
                <StatusBadge color="purple" size="xs">
                  {selectedNodeData.metadata.gatewayClass as string}
                </StatusBadge>
              )}
              {typeof selectedNodeData.metadata.endpoints === 'number' && (
                <span className="px-1.5 py-0.5 rounded bg-secondary text-muted-foreground text-[9px]">
                  {t('serviceTopology.nEndpoints', { count: selectedNodeData.metadata.endpoints as number })}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
