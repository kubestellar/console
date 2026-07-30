import { getLocalAgentURL } from './agentFetch'

export { clusterCacheRef } from './clusterCacheRef'

export function resolveApiBase(): string {
  if (typeof window === 'undefined') return ''
  return window.location.origin
}

export function resolveMcpBase(): string {
  return `${resolveApiBase()}/api/mcp`
}

export function resolveAgentBase(): string {
  return getLocalAgentURL()
}
