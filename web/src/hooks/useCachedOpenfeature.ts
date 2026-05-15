/**
 * OpenFeature Status Hook — Data fetching for the openfeature_status card.
 *
 * Uses createCardCachedHook factory for zero-boilerplate caching.
 * Domain logic (parsing, health derivation) remains in pure helper functions.
 */

import { createCardCachedHook, type CardCachedHookResult } from '../lib/cache/createCardCachedHook'
import { fetchJson } from '../lib/fetchJson'
import {
  OPENFEATURE_DEMO_DATA,
  type OpenFeatureFlag,
  type OpenFeatureFlagStats,
  type OpenFeatureProvider,
  type OpenFeatureStatusData,
} from '../components/cards/openfeature_status/demoData'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_KEY = 'openfeature-status'
const OPENFEATURE_STATUS_ENDPOINT = '/api/openfeature/status'
const DEFAULT_ERROR_RATE_PCT = 0
const DEFAULT_TOTAL_EVALUATIONS = 0

const EMPTY_FLAG_STATS: OpenFeatureFlagStats = {
  total: 0,
  enabled: 0,
  disabled: 0,
  errorRate: DEFAULT_ERROR_RATE_PCT,
}

const INITIAL_DATA: OpenFeatureStatusData = {
  health: 'not-installed',
  providers: [],
  flags: [],
  featureFlags: EMPTY_FLAG_STATS,
  totalEvaluations: DEFAULT_TOTAL_EVALUATIONS,
  lastCheckTime: new Date().toISOString(),
}

// ---------------------------------------------------------------------------
// Internal types (shape of the future /api/openfeature/status response)
// ---------------------------------------------------------------------------

interface OpenFeatureStatusResponse {
  providers?: OpenFeatureProvider[]
  flags?: OpenFeatureFlag[]
  featureFlags?: Partial<OpenFeatureFlagStats>
  totalEvaluations?: number
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function rollupFlagStats(flags: OpenFeatureFlag[]): OpenFeatureFlagStats {
  let enabled = 0
  let disabled = 0
  for (const flag of flags ?? []) {
    if (flag?.enabled) {
      enabled++
    } else {
      disabled++
    }
  }
  return {
    total: (flags ?? []).length,
    enabled,
    disabled,
    errorRate: DEFAULT_ERROR_RATE_PCT,
  }
}

function sumProviderEvaluations(providers: OpenFeatureProvider[]): number {
  let total = 0
  for (const provider of providers ?? []) {
    total += provider?.evaluations ?? 0
  }
  return total
}

function deriveHealth(
  providers: OpenFeatureProvider[],
  flags: OpenFeatureFlag[],
): OpenFeatureStatusData['health'] {
  const providerList = providers ?? []
  const flagList = flags ?? []
  if (providerList.length === 0 && flagList.length === 0) {
    return 'not-installed'
  }
  const hasUnhealthy = providerList.some(
    p => p.status === 'unhealthy' || p.status === 'degraded',
  )
  return hasUnhealthy ? 'degraded' : 'healthy'
}

function buildOpenFeatureStatus(
  providers: OpenFeatureProvider[],
  flags: OpenFeatureFlag[],
  featureFlags: OpenFeatureFlagStats,
  totalEvaluations: number,
): OpenFeatureStatusData {
  return {
    health: deriveHealth(providers, flags),
    providers,
    flags,
    featureFlags,
    totalEvaluations,
    lastCheckTime: new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Fetcher
// ---------------------------------------------------------------------------

async function fetchOpenFeatureStatus(): Promise<OpenFeatureStatusData> {
  const result = await fetchJson<OpenFeatureStatusResponse>(OPENFEATURE_STATUS_ENDPOINT)

  if (result.failed) {
    throw new Error('Unable to fetch OpenFeature status')
  }

  const body = result.data
  const providers = Array.isArray(body?.providers) ? body.providers : []
  const flags = Array.isArray(body?.flags) ? body.flags : []
  const rolled = rollupFlagStats(flags)
  const featureFlags: OpenFeatureFlagStats = {
    total: body?.featureFlags?.total ?? rolled.total,
    enabled: body?.featureFlags?.enabled ?? rolled.enabled,
    disabled: body?.featureFlags?.disabled ?? rolled.disabled,
    errorRate: body?.featureFlags?.errorRate ?? DEFAULT_ERROR_RATE_PCT,
  }
  const totalEvaluations =
    body?.totalEvaluations ?? sumProviderEvaluations(providers)

  return buildOpenFeatureStatus(providers, flags, featureFlags, totalEvaluations)
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export const useCachedOpenfeature = createCardCachedHook<OpenFeatureStatusData>({
  key: CACHE_KEY,
  category: 'services',
  initialData: INITIAL_DATA,
  demoData: OPENFEATURE_DEMO_DATA,
  fetcher: fetchOpenFeatureStatus,
  hasAnyData: (data) =>
    data.health === 'not-installed'
      ? true
      : (data.providers ?? []).length > 0 || (data.flags ?? []).length > 0,
})

export type UseCachedOpenfeatureResult = CardCachedHookResult<OpenFeatureStatusData>

// ---------------------------------------------------------------------------
// Exported testables — pure functions for unit testing
// ---------------------------------------------------------------------------

export const __testables = {
  rollupFlagStats,
  sumProviderEvaluations,
  deriveHealth,
  buildOpenFeatureStatus,
}
