/**
 * CNI Status Hook — Data fetching for the cni_status card.
 *
 * Keeps the public hook contract stable while sharing the common fetchJson helper.
 * Domain logic (parsing, health derivation) remains in pure helper functions.
 */

import { createCardCachedHook, type CardCachedHookResult } from '../lib/cache/createCardCachedHook'
import { fetchJson } from '../lib/fetchJson'
import {
  CNI_DEMO_DATA,
  type CniHealth,
  type CniNodeStatus,
  type CniPlugin,
  type CniStats,
  type CniStatusData,
  type CniSummary,
} from '../lib/demo/cni'

// ---------------------------------------------------------------------------
// Constants (no magic numbers)
// ---------------------------------------------------------------------------

const CACHE_KEY = 'cni-status'
const CNI_STATUS_ENDPOINT = '/api/cni/status'

const DEFAULT_PLUGIN: CniPlugin = 'unknown'
const DEFAULT_PLUGIN_VERSION = 'unknown'
const DEFAULT_POD_CIDR = ''
const DEFAULT_SERVICE_CIDR = ''
const DEFAULT_COUNT = 0

const EMPTY_STATS: CniStats = {
  activePlugin: DEFAULT_PLUGIN,
  pluginVersion: DEFAULT_PLUGIN_VERSION,
  podNetworkCidr: DEFAULT_POD_CIDR,
  serviceNetworkCidr: DEFAULT_SERVICE_CIDR,
  nodeCount: DEFAULT_COUNT,
  nodesCniReady: DEFAULT_COUNT,
  networkPolicyCount: DEFAULT_COUNT,
  servicesWithNetworkPolicy: DEFAULT_COUNT,
  totalServices: DEFAULT_COUNT,
  podsWithIp: DEFAULT_COUNT,
  totalPods: DEFAULT_COUNT,
}

const EMPTY_SUMMARY: CniSummary = {
  activePlugin: DEFAULT_PLUGIN,
  pluginVersion: DEFAULT_PLUGIN_VERSION,
  podNetworkCidr: DEFAULT_POD_CIDR,
  nodesCniReady: DEFAULT_COUNT,
  nodeCount: DEFAULT_COUNT,
  networkPolicyCount: DEFAULT_COUNT,
  servicesWithNetworkPolicy: DEFAULT_COUNT,
}

const INITIAL_DATA: CniStatusData = {
  health: 'not-installed',
  nodes: [],
  stats: EMPTY_STATS,
  summary: EMPTY_SUMMARY,
  lastCheckTime: new Date().toISOString(),
}

// ---------------------------------------------------------------------------
// Internal types (shape of the future /api/cni/status response)
// ---------------------------------------------------------------------------

interface CniStatusResponse {
  activePlugin?: CniPlugin
  pluginVersion?: string
  podNetworkCidr?: string
  serviceNetworkCidr?: string
  nodes?: CniNodeStatus[]
  stats?: Partial<CniStats>
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function summarize(stats: CniStats): CniSummary {
  return {
    activePlugin: stats.activePlugin,
    pluginVersion: stats.pluginVersion,
    podNetworkCidr: stats.podNetworkCidr,
    nodesCniReady: stats.nodesCniReady,
    nodeCount: stats.nodeCount,
    networkPolicyCount: stats.networkPolicyCount,
    servicesWithNetworkPolicy: stats.servicesWithNetworkPolicy,
  }
}

function deriveHealth(stats: CniStats, nodes: CniNodeStatus[]): CniHealth {
  if (stats.activePlugin === 'unknown' && nodes.length === 0) {
    return 'not-installed'
  }
  const hasUnreadyNode = nodes.some(n => n.state !== 'ready')
  if (hasUnreadyNode) return 'degraded'
  if (stats.nodeCount > 0 && stats.nodesCniReady < stats.nodeCount) {
    return 'degraded'
  }
  return 'healthy'
}

function buildCniStatus(stats: CniStats, nodes: CniNodeStatus[]): CniStatusData {
  return {
    health: deriveHealth(stats, nodes),
    nodes,
    stats,
    summary: summarize(stats),
    lastCheckTime: new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Fetcher
// ---------------------------------------------------------------------------

async function fetchCniStatus(): Promise<CniStatusData> {
  const result = await fetchJson<CniStatusResponse>(CNI_STATUS_ENDPOINT)

  if (result.failed) {
    throw new Error('Unable to fetch CNI status')
  }

  const body = result.data
  const nodes = Array.isArray(body?.nodes) ? body.nodes : []
  const stats: CniStats = {
    activePlugin: body?.stats?.activePlugin ?? body?.activePlugin ?? DEFAULT_PLUGIN,
    pluginVersion:
      body?.stats?.pluginVersion ?? body?.pluginVersion ?? DEFAULT_PLUGIN_VERSION,
    podNetworkCidr:
      body?.stats?.podNetworkCidr ?? body?.podNetworkCidr ?? DEFAULT_POD_CIDR,
    serviceNetworkCidr:
      body?.stats?.serviceNetworkCidr ?? body?.serviceNetworkCidr ?? DEFAULT_SERVICE_CIDR,
    nodeCount: body?.stats?.nodeCount ?? nodes.length,
    nodesCniReady:
      body?.stats?.nodesCniReady ?? nodes.filter(n => n.state === 'ready').length,
    networkPolicyCount: body?.stats?.networkPolicyCount ?? DEFAULT_COUNT,
    servicesWithNetworkPolicy: body?.stats?.servicesWithNetworkPolicy ?? DEFAULT_COUNT,
    totalServices: body?.stats?.totalServices ?? DEFAULT_COUNT,
    podsWithIp: body?.stats?.podsWithIp ?? DEFAULT_COUNT,
    totalPods: body?.stats?.totalPods ?? DEFAULT_COUNT,
  }

  return buildCniStatus(stats, nodes)
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export type UseCachedCniResult = CardCachedHookResult<CniStatusData>

export const useCachedCni = createCardCachedHook<CniStatusData>({
  key: CACHE_KEY,
  category: 'services',
  initialData: INITIAL_DATA,
  demoData: CNI_DEMO_DATA,
  persist: true,
  fetcher: fetchCniStatus,
  hasAnyData: data => (data.health === 'not-installed' ? true : (data.nodes ?? []).length > 0),
})

// ---------------------------------------------------------------------------
// Exported testables — pure functions for unit testing
// ---------------------------------------------------------------------------

export const __testables = {
  summarize,
  deriveHealth,
  buildCniStatus,
}
