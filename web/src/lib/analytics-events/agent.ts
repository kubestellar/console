import { send, setAnalyticsUserProperties } from '../analytics-core'
import {
  CAPABILITY_CHAT,
  CAPABILITY_TOOL_EXEC,
  type ProviderSummary,
} from '../analytics-types'

// ── kc-agent Connection ─────────────────────────────────────────────

export function emitAgentConnected(version: string, clusterCount: number) {
  send('ksc_agent_connected', { agent_version: version, cluster_count: clusterCount })
}

export function emitAgentDisconnected() {
  send('ksc_agent_disconnected')
}

export function emitClusterInventory(counts: {
  total: number
  healthy: number
  unhealthy: number
  unreachable: number
  distributions: Record<string, number>
}) {
  const distParams: Record<string, string | number> = {}
  for (const [dist, count] of Object.entries(counts.distributions)) {
    distParams[`dist_${dist}`] = count
  }

  send('ksc_cluster_inventory', {
    cluster_count: counts.total,
    healthy_count: counts.healthy,
    unhealthy_count: counts.unhealthy,
    unreachable_count: counts.unreachable,
    ...distParams,
  })
  setAnalyticsUserProperties({ cluster_count: String(counts.total) })
}

export function emitAgentProvidersDetected(providers: ProviderSummary[]) {
  if (!providers || providers.length === 0) return

  const cliProviders = (providers || [])
    .filter(p => (p.capabilities & CAPABILITY_TOOL_EXEC) !== 0)
    .map(p => p.name)
  const apiProviders = (providers || [])
    .filter(p => (p.capabilities & CAPABILITY_TOOL_EXEC) === 0 && (p.capabilities & CAPABILITY_CHAT) !== 0)
    .map(p => p.name)

  send('ksc_agent_providers_detected', {
    provider_count: providers.length,
    cli_providers: cliProviders.join(',') || 'none',
    api_providers: apiProviders.join(',') || 'none',
    cli_count: cliProviders.length,
    api_count: apiProviders.length,
  })
}

// ── Agent Configuration ─────────────────────────────────────────────

export function emitApiKeyConfigured(provider: string) {
  send('ksc_api_key_configured', { provider })
}

export function emitApiKeyRemoved(provider: string) {
  send('ksc_api_key_removed', { provider })
}

// ── Cluster Lifecycle ────────────────────────────────────────────────

export function emitClusterCreated(clusterName: string, authType: string) {
  send('ksc_cluster_created', { cluster_name: clusterName, auth_type: authType })
}

export function emitClusterAction(action: string, clusterName: string) {
  send('ksc_cluster_action', { action, cluster_name: clusterName })
}

export function emitClusterStatsDrillDown(statType: string) {
  send('ksc_cluster_stats_drill_down', { stat_type: statType })
}
