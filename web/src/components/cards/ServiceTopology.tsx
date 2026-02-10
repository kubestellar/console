import { useState, useMemo, useCallback } from 'react'
import { ZoomIn, ZoomOut, Maximize2, ArrowRight } from 'lucide-react'
import { ClusterBadge } from '../ui/ClusterBadge'
import type { TopologyNode, TopologyEdge, TopologyHealthStatus } from '../../types/topology'
import { useReportCardDataState } from './CardDataContext'

// Demo topology data
const DEMO_NODES: TopologyNode[] = [
  // Clusters
  { id: 'cluster:us-east-1', type: 'cluster', label: 'us-east-1', cluster: 'us-east-1', health: 'healthy' },
  { id: 'cluster:us-west-2', type: 'cluster', label: 'us-west-2', cluster: 'us-west-2', health: 'healthy' },
  { id: 'cluster:eu-central-1', type: 'cluster', label: 'eu-central-1', cluster: 'eu-central-1', health: 'healthy' },
  // Services in us-east-1
  { id: 'service:us-east-1:production:api-gateway', type: 'service', label: 'api-gateway', cluster: 'us-east-1', namespace: 'production', health: 'healthy', metadata: { exported: true, endpoints: 3 } },
  { id: 'service:us-east-1:production:auth-service', type: 'service', label: 'auth-service', cluster: 'us-east-1', namespace: 'production', health: 'healthy', metadata: { exported: true, endpoints: 2 } },
  { id: 'service:us-east-1:production:user-service', type: 'service', label: 'user-service', cluster: 'us-east-1', namespace: 'production', health: 'healthy', metadata: { endpoints: 4 } },
  // Services in us-west-2
  { id: 'service:us-west-2:production:api-gateway', type: 'service', label: 'api-gateway', cluster: 'us-west-2', namespace: 'production', health: 'healthy', metadata: { imported: true, sourceCluster: 'us-east-1' } },
  { id: 'service:us-west-2:infrastructure:cache-redis', type: 'service', label: 'cache-redis', cluster: 'us-west-2', namespace: 'infrastructure', health: 'healthy', metadata: { exported: true, endpoints: 1 } },
  // Services in eu-central-1
  { id: 'service:eu-central-1:production:auth-service', type: 'service', label: 'auth-service', cluster: 'eu-central-1', namespace: 'production', health: 'healthy', metadata: { imported: true, sourceCluster: 'us-east-1' } },
  { id: 'service:eu-central-1:production:payment-processor', type: 'service', label: 'payment-processor', cluster: 'eu-central-1', namespace: 'production', health: 'degraded', metadata: { endpoints: 0 } },
  // Gateways
  { id: 'gateway:us-east-1:gateway-system:prod-gateway', type: 'gateway', label: 'prod-gateway', cluster: 'us-east-1', namespace: 'gateway-system', health: 'healthy', metadata: { gatewayClass: 'istio', addresses: ['34.102.136.180'] } },
  { id: 'gateway:us-west-2:gateway-system:api-gateway', type: 'gateway', label: 'api-gateway', cluster: 'us-west-2', namespace: 'gateway-system', health: 'healthy', metadata: { gatewayClass: 'envoy-gateway', addresses: ['10.0.0.50'] } },
]

const DEMO_EDGES: TopologyEdge[] = [
  // MCS cross-cluster connections
  { id: 'mcs:api-gateway:east-west', source: 'service:us-east-1:production:api-gateway', target: 'service:us-west-2:production:api-gateway', type: 'mcs-export', label: 'MCS', health: 'healthy', animated: true },
  { id: 'mcs:auth:east-eu', source: 'service:us-east-1:production:auth-service', target: 'service:eu-central-1:production:auth-service', type: 'mcs-export', label: 'MCS', health: 'healthy', animated: true },
  // Internal connections
  { id: 'internal:api-user:east', source: 'service:us-east-1:production:api-gateway', target: 'service:us-east-1:production:user-service', type: 'internal', health: 'healthy', animated: false },
  { id: 'internal:api-auth:east', source: 'service:us-east-1:production:api-gateway', target: 'service:us-east-1:production:auth-service', type: 'internal', health: 'healthy', animated: false },
  // Gateway routes
  { id: 'route:prod-gateway:api', source: 'gateway:us-east-1:gateway-system:prod-gateway', target: 'service:us-east-1:production:api-gateway', type: 'http-route', label: 'HTTPRoute', health: 'healthy', animated: true },
  { id: 'route:api-gateway:west', source: 'gateway:us-west-2:gateway-system:api-gateway', target: 'service:us-west-2:production:api-gateway', type: 'http-route', label: 'HTTPRoute', health: 'healthy', animated: true },
]

const DEMO_STATS = {
  totalNodes: 12,
  totalEdges: 8,
  healthyConnections: 7,
  degradedConnections: 1,
  clusters: 3,
  services: 8,
  gateways: 2,
}

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
  useReportCardDataState({ hasData: true, isFailed: false, consecutiveFailures: 0 })
  const [zoom, setZoom] = useState(1)
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)

  // Group nodes by cluster for layout
  const nodesByCluster = useMemo(() => {
    const grouped: Record<string, TopologyNode[]> = {}
    DEMO_NODES.forEach(node => {
      if (!grouped[node.cluster]) {
        grouped[node.cluster] = []
      }
      grouped[node.cluster].push(node)
    })
    return grouped
  }, [])

  // Calculate node positions for simple visualization
  const nodePositions = useMemo(() => {
    const positions: Record<string, { x: number; y: number }> = {}
    const clusters = Object.keys(nodesByCluster)
    const clusterWidth = 100 / (clusters.length + 1)

    clusters.forEach((cluster, clusterIndex) => {
      const nodes = nodesByCluster[cluster]
      const clusterX = (clusterIndex + 1) * clusterWidth

      nodes.forEach((node, nodeIndex) => {
        const nodeY = 15 + (nodeIndex * 18)
        positions[node.id] = { x: clusterX, y: Math.min(nodeY, 85) }
      })
    })

    return positions
  }, [nodesByCluster])

  const handleZoomIn = useCallback(() => setZoom(z => Math.min(z + 0.2, 2)), [])
  const handleZoomOut = useCallback(() => setZoom(z => Math.max(z - 0.2, 0.5)), [])
  const handleResetZoom = useCallback(() => setZoom(1), [])

  const selectedNodeData = selectedNode ? DEMO_NODES.find(n => n.id === selectedNode) : null

  return (
    <div className="h-full flex flex-col min-h-card">
      {/* Header */}
      <div className="flex items-center justify-end mb-2">
        <div className="flex items-center gap-1">
          <button
            onClick={handleZoomOut}
            className="p-1 hover:bg-secondary rounded transition-colors text-muted-foreground hover:text-foreground"
            title="Zoom out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleResetZoom}
            className="p-1 hover:bg-secondary rounded transition-colors text-muted-foreground hover:text-foreground"
            title="Reset zoom"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleZoomIn}
            className="p-1 hover:bg-secondary rounded transition-colors text-muted-foreground hover:text-foreground"
            title="Zoom in"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="flex items-center gap-3 mb-2 text-[10px]">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-purple-500" />
          <span className="text-muted-foreground">{DEMO_STATS.clusters} clusters</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-blue-500" />
          <span className="text-muted-foreground">{DEMO_STATS.services} services</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-green-500" />
          <span className="text-muted-foreground">{DEMO_STATS.gateways} gateways</span>
        </div>
        <div className="flex items-center gap-1">
          <ArrowRight className="w-3 h-3 text-cyan-400" />
          <span className="text-muted-foreground">{DEMO_STATS.totalEdges} connections</span>
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
              <polygon points="0 0, 6 3, 0 6" className="fill-current text-gray-400" />
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
          {DEMO_EDGES.map(edge => {
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
          {DEMO_NODES.map(node => {
            const pos = nodePositions[node.id]
            if (!pos) return null

            const isSelected = selectedNode === node.id
            const isHovered = hoveredNode === node.id
            const colorClass = getNodeColor(node.type, node.health)
            const radius = node.type === 'cluster' ? 4 : 2.5

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
            <p className="text-muted-foreground text-[10px]">Namespace: {selectedNodeData.namespace}</p>
          )}
          {selectedNodeData.metadata && (
            <div className="flex flex-wrap gap-1 mt-1">
              {selectedNodeData.metadata.exported && (
                <span className="px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-400 text-[9px]">Exported</span>
              )}
              {selectedNodeData.metadata.imported && (
                <span className="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 text-[9px]">Imported</span>
              )}
              {selectedNodeData.metadata.gatewayClass && (
                <span className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400 text-[9px]">
                  {selectedNodeData.metadata.gatewayClass as string}
                </span>
              )}
              {typeof selectedNodeData.metadata.endpoints === 'number' && (
                <span className="px-1.5 py-0.5 rounded bg-secondary text-muted-foreground text-[9px]">
                  {selectedNodeData.metadata.endpoints} endpoints
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
