import type { TopologyNode, TopologyEdge, TopologyHealthStatus } from '../../types/topology'

// Color mapping for node types
export const getNodeColor = (type: TopologyNode['type'], health: TopologyHealthStatus) => {
  if (health === 'unhealthy') return 'bg-red-500'
  if (health === 'degraded') return 'bg-yellow-500'

  switch (type) {
    case 'cluster': return 'bg-purple-500'
    case 'service': return 'bg-blue-500'
    case 'gateway': return 'bg-green-500'
    case 'external': return 'bg-gray-400 dark:bg-gray-500'
    default: return 'bg-gray-400 dark:bg-gray-500'
  }
}

export const getEdgeColor = (type: TopologyEdge['type'], health: TopologyHealthStatus) => {
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

export interface ServiceTopologyProps {
  config?: Record<string, unknown>
}
