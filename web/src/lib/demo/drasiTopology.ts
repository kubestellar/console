/**
 * Drasi Topology — Demo Data & Type Definitions
 *
 * Models source→query→reaction connection topology for the
 * dashboard topology summary card.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DrasiNodeStatus = 'ready' | 'error' | 'pending'

export interface DrasiTopologyNode {
  id: string
  name: string
  type: 'source' | 'query' | 'reaction'
  status: DrasiNodeStatus
  kind: string
}

export interface DrasiTopologyEdge {
  from: string
  to: string
}

export interface DrasiTopologyData {
  nodes: DrasiTopologyNode[]
  edges: DrasiTopologyEdge[]
  totalSources: number
  totalQueries: number
  totalReactions: number
  connectedPairs: number
  orphanedNodes: number
}

// ---------------------------------------------------------------------------
// Demo data factory
// ---------------------------------------------------------------------------

export function generateDrasiTopology(): DrasiTopologyData {
  const nodes: DrasiTopologyNode[] = [
    { id: 'src-pg-orders', name: 'pg-orders', type: 'source', status: 'ready', kind: 'PostgreSQL' },
    { id: 'src-cosmos-users', name: 'cosmos-users', type: 'source', status: 'ready', kind: 'CosmosDB' },
    { id: 'src-http-prices', name: 'http-prices', type: 'source', status: 'error', kind: 'HTTP' },
    { id: 'src-pg-inventory', name: 'pg-inventory', type: 'source', status: 'ready', kind: 'PostgreSQL' },
    { id: 'q-fraud-detect', name: 'fraud-detect', type: 'query', status: 'ready', kind: 'Cypher' },
    { id: 'q-stock-alert', name: 'stock-alert', type: 'query', status: 'ready', kind: 'Cypher' },
    { id: 'q-low-inventory', name: 'low-inventory', type: 'query', status: 'ready', kind: 'GQL' },
    { id: 'q-price-change', name: 'price-change', type: 'query', status: 'error', kind: 'Cypher' },
    { id: 'r-sse-dashboard', name: 'sse-dashboard', type: 'reaction', status: 'ready', kind: 'SSE' },
    { id: 'r-webhook-alert', name: 'webhook-alert', type: 'reaction', status: 'ready', kind: 'Webhook' },
    { id: 'r-kafka-stream', name: 'kafka-stream', type: 'reaction', status: 'pending', kind: 'Kafka' },
  ]

  const edges: DrasiTopologyEdge[] = [
    { from: 'src-pg-orders', to: 'q-fraud-detect' },
    { from: 'src-cosmos-users', to: 'q-fraud-detect' },
    { from: 'src-http-prices', to: 'q-stock-alert' },
    { from: 'src-http-prices', to: 'q-price-change' },
    { from: 'src-pg-inventory', to: 'q-low-inventory' },
    { from: 'q-fraud-detect', to: 'r-webhook-alert' },
    { from: 'q-stock-alert', to: 'r-sse-dashboard' },
    { from: 'q-low-inventory', to: 'r-kafka-stream' },
    { from: 'q-price-change', to: 'r-sse-dashboard' },
  ]

  const sources = nodes.filter(n => n.type === 'source')
  const queries = nodes.filter(n => n.type === 'query')
  const reactions = nodes.filter(n => n.type === 'reaction')

  const connectedIds = new Set([...edges.map(e => e.from), ...edges.map(e => e.to)])
  const orphanedNodes = nodes.filter(n => !connectedIds.has(n.id)).length

  return {
    nodes,
    edges,
    totalSources: sources.length,
    totalQueries: queries.length,
    totalReactions: reactions.length,
    connectedPairs: edges.length,
    orphanedNodes,
  }
}
