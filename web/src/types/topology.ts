/**
 * Service Topology Types
 *
 * Types for representing service mesh topology across clusters,
 * including nodes (services/clusters) and edges (connections/traffic).
 */

// Node types in the topology graph
export type TopologyNodeType =
  | 'cluster'      // A Kubernetes cluster
  | 'service'      // A service within a cluster
  | 'gateway'      // A Gateway API gateway
  | 'external'     // External endpoint

// Edge types representing connections
export type TopologyEdgeType =
  | 'mcs-export'   // MCS ServiceExport connection
  | 'mcs-import'   // MCS ServiceImport connection
  | 'http-route'   // Gateway API HTTPRoute
  | 'grpc-route'   // Gateway API GRPCRoute
  | 'internal'     // Internal cluster connection

// Health status for nodes and edges
export type TopologyHealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unknown'

// Position for nodes in the graph
export interface Position {
  x: number
  y: number
}

// A node in the topology graph
export interface TopologyNode {
  id: string
  type: TopologyNodeType
  label: string
  cluster: string
  namespace?: string
  metadata?: {
    endpoints?: number
    status?: string
    gatewayClass?: string
    addresses?: string[]
    ports?: Array<{ port: number; protocol: string }>
    exported?: boolean
    imported?: boolean
    sourceCluster?: string
    dnsName?: string
    serviceName?: string
  }
  health: TopologyHealthStatus
  position?: Position
}

// An edge (connection) in the topology graph
export interface TopologyEdge {
  id: string
  source: string  // Node ID
  target: string  // Node ID
  type: TopologyEdgeType
  label?: string
  metadata?: {
    port?: number
    protocol?: string
    weight?: number
    hostnames?: string[]
  }
  health: TopologyHealthStatus
  animated?: boolean  // Whether to show traffic animation
}

// The complete topology graph
export interface TopologyGraph {
  nodes: TopologyNode[]
  edges: TopologyEdge[]
  clusters: string[]
  lastUpdated: number
}

// Cluster summary for the topology view
export interface TopologyClusterSummary {
  name: string
  nodeCount: number
  serviceCount: number
  gatewayCount: number
  exportCount: number
  importCount: number
  health: TopologyHealthStatus
}

// API response for topology data
export interface TopologyResponse {
  graph: TopologyGraph
  clusters: TopologyClusterSummary[]
  stats: {
    totalNodes: number
    totalEdges: number
    healthyConnections: number
    degradedConnections: number
  }
}

// Filter options for the topology view
export interface TopologyFilters {
  clusters?: string[]
  namespaces?: string[]
  nodeTypes?: TopologyNodeType[]
  edgeTypes?: TopologyEdgeType[]
  showHealthyOnly?: boolean
}

// Layout options for the topology visualization
export type TopologyLayout = 'force' | 'hierarchical' | 'circular' | 'clustered'

// View settings for the topology component
export interface TopologyViewSettings {
  layout: TopologyLayout
  showLabels: boolean
  showAnimations: boolean
  zoomLevel: number
  selectedNodeId?: string
  highlightedCluster?: string
}
