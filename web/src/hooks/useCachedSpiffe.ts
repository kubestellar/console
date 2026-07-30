/**
 * SPIFFE Status Hook — Data fetching for the spiffe_status card.
 *
 * Uses createCardCachedHook factory for zero-boilerplate caching.
 * Domain logic (parsing, health derivation) remains in pure helper functions.
 */

import { createCardCachedHook, type CardCachedHookResult } from '../lib/cache/createCardCachedHook'
import { fetchJson } from '../lib/fetchJson'
import {
  SPIFFE_DEMO_DATA,
  type SpiffeFederatedDomain,
  type SpiffeRegistrationEntry,
  type SpiffeStats,
  type SpiffeStatusData,
  type SpiffeSummary,
} from '../components/cards/spiffe_status/demoData'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_KEY = 'spiffe-status'
const SPIFFE_STATUS_ENDPOINT = '/api/spiffe/status'
const DEFAULT_SERVER_VERSION = 'unknown'
const DEFAULT_TRUST_DOMAIN = ''

const EMPTY_STATS: SpiffeStats = {
  x509SvidCount: 0,
  jwtSvidCount: 0,
  registrationEntryCount: 0,
  agentCount: 0,
  serverVersion: DEFAULT_SERVER_VERSION,
}

const EMPTY_SUMMARY: SpiffeSummary = {
  trustDomain: DEFAULT_TRUST_DOMAIN,
  totalSvids: 0,
  totalFederatedDomains: 0,
  totalEntries: 0,
}

const INITIAL_DATA: SpiffeStatusData = {
  health: 'not-installed',
  entries: [],
  federatedDomains: [],
  stats: EMPTY_STATS,
  summary: EMPTY_SUMMARY,
  lastCheckTime: new Date().toISOString(),
}

// ---------------------------------------------------------------------------
// Internal types (shape of the future /api/spiffe/status response)
// ---------------------------------------------------------------------------

interface SpiffeStatusResponse {
  trustDomain?: string
  entries?: SpiffeRegistrationEntry[]
  federatedDomains?: SpiffeFederatedDomain[]
  stats?: Partial<SpiffeStats>
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function summarize(
  trustDomain: string,
  entries: SpiffeRegistrationEntry[],
  federatedDomains: SpiffeFederatedDomain[],
  stats: SpiffeStats,
): SpiffeSummary {
  return {
    trustDomain,
    totalSvids: stats.x509SvidCount + stats.jwtSvidCount,
    totalFederatedDomains: federatedDomains.length,
    totalEntries: entries.length,
  }
}

function deriveHealth(
  trustDomain: string,
  entries: SpiffeRegistrationEntry[],
  federatedDomains: SpiffeFederatedDomain[],
): SpiffeStatusData['health'] {
  if (!trustDomain && entries.length === 0) {
    return 'not-installed'
  }
  const hasFailedFederation = federatedDomains.some(d => d.status === 'failed')
  return hasFailedFederation ? 'degraded' : 'healthy'
}

function buildSpiffeStatus(
  trustDomain: string,
  entries: SpiffeRegistrationEntry[],
  federatedDomains: SpiffeFederatedDomain[],
  stats: SpiffeStats,
): SpiffeStatusData {
  return {
    health: deriveHealth(trustDomain, entries, federatedDomains),
    entries,
    federatedDomains,
    stats,
    summary: summarize(trustDomain, entries, federatedDomains, stats),
    lastCheckTime: new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Fetcher
// ---------------------------------------------------------------------------

async function fetchSpiffeStatus(): Promise<SpiffeStatusData> {
  const result = await fetchJson<SpiffeStatusResponse>(SPIFFE_STATUS_ENDPOINT)

  if (result.failed) {
    throw new Error('Unable to fetch SPIFFE status')
  }

  const body = result.data
  const trustDomain = body?.trustDomain ?? DEFAULT_TRUST_DOMAIN
  const entries = Array.isArray(body?.entries) ? body.entries : []
  const federatedDomains = Array.isArray(body?.federatedDomains)
    ? body.federatedDomains
    : []
  const stats: SpiffeStats = {
    x509SvidCount: body?.stats?.x509SvidCount ?? 0,
    jwtSvidCount: body?.stats?.jwtSvidCount ?? 0,
    registrationEntryCount: body?.stats?.registrationEntryCount ?? entries.length,
    agentCount: body?.stats?.agentCount ?? 0,
    serverVersion: body?.stats?.serverVersion ?? DEFAULT_SERVER_VERSION,
  }

  return buildSpiffeStatus(trustDomain, entries, federatedDomains, stats)
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export const useCachedSpiffe = createCardCachedHook<SpiffeStatusData>({
  key: CACHE_KEY,
  category: 'services',
  initialData: INITIAL_DATA,
  demoData: SPIFFE_DEMO_DATA,
  fetcher: fetchSpiffeStatus,
  hasAnyData: (data) =>
    data.health === 'not-installed' ? true : (data.entries ?? []).length > 0,
})

export type UseCachedSpiffeResult = CardCachedHookResult<SpiffeStatusData>

// ---------------------------------------------------------------------------
// Exported testables — pure functions for unit testing
// ---------------------------------------------------------------------------

export const __testables = {
  summarize,
  deriveHealth,
  buildSpiffeStatus,
}
