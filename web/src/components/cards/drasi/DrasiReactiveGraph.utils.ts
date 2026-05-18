import type { DrasiConnection } from '../../../hooks/useDrasiConnections'
import { DEMO_STREAM_ENDPOINT } from './DrasiConstants'

export type DrasiResourceKind = 'source' | 'query' | 'reaction'

export function buildStreamEndpoint(
  connection: DrasiConnection | null,
  liveData: { mode: 'server' | 'platform'; instanceId: string | null } | null,
  queryId: string,
): string {
  if (!connection || !liveData || connection.isDemoSeed) return DEMO_STREAM_ENDPOINT
  if (connection.mode === 'server' && connection.url && liveData.instanceId) {
    const base = connection.url.replace(/\/+$/, '')
    return `${base}/api/v1/instances/${liveData.instanceId}/queries/${encodeURIComponent(queryId)}/events/stream`
  }
  return `http://<your-result-reaction>.drasi-system.svc/v1/queries/${encodeURIComponent(queryId)}/events/stream`
}

export function buildDrasiProxyTarget(activeConnection: DrasiConnection | null): string {
  if (!activeConnection) return ''
  if (activeConnection.mode === 'server' && activeConnection.url) {
    return `target=server&url=${encodeURIComponent(activeConnection.url)}`
  }
  return `target=platform&cluster=${encodeURIComponent(activeConnection.cluster || '')}`
}

export function getDrasiResourcePath(
  mode: 'server' | 'platform' | null | undefined,
  kind: DrasiResourceKind,
): string {
  if (!mode) return ''
  const isServer = mode === 'server'
  const prefix = isServer ? '/api/v1' : '/v1'
  switch (kind) {
    case 'source': return `${prefix}/sources`
    case 'query': return `${prefix}/${isServer ? 'queries' : 'continuousQueries'}`
    case 'reaction': return `${prefix}/reactions`
  }
}
