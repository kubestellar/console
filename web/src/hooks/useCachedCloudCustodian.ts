/**
 * useCachedCloudCustodian — Cached hook for Cloud Custodian status.
 *
 * Follows the mandatory caching contract defined in CLAUDE.md:
 * - useCache with fetcher + demoData
 * - isDemoFallback guarded so it's false during loading
 * - Standard CachedHookResult return shape
 *
 * This is scaffolding — the card renders via demo fallback today. When a
 * real Cloud Custodian bridge lands (e.g. /api/cloud-custodian/status
 * surfacing parsed policy-run telemetry), the fetcher picks up live data
 * automatically with no component changes.
 */

import { useCache, type RefreshCategory, type CachedHookResult } from '../lib/cache'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../lib/constants/network'
import { authFetch } from '../lib/api'
import {
  CLOUD_CUSTODIAN_DEMO_DATA,
  type CloudCustodianStatusData,
  type CustodianHealth,
  type CustodianPolicy,
  type CustodianSeverityCounts,
  type CustodianTopResource,
} from '../lib/demo/cloud-custodian'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_KEY_CLOUD_CUSTODIAN = 'cloud-custodian-status'
const CLOUD_CUSTODIAN_STATUS_ENDPOINT = '/api/cloud-custodian/status'
const DEFAULT_CUSTODIAN_VERSION = 'unknown'

const NOT_FOUND_STATUS = 404

const EMPTY_SEVERITY_COUNTS: CustodianSeverityCounts = {
  critical: 0,
  high: 0,
  medium: 0,
  low: 0,
}

const INITIAL_DATA: CloudCustodianStatusData = {
  health: 'not-installed',
  version: DEFAULT_CUSTODIAN_VERSION,
  policies: [],
  topResources: [],
  violationsBySeverity: EMPTY_SEVERITY_COUNTS,
  summary: {
    totalPolicies: 0,
    successfulPolicies: 0,
    failedPolicies: 0,
    dryRunPolicies: 0,
  },
  lastCheckTime: new Date().toISOString(),
}

// ---------------------------------------------------------------------------
// Internal types (shape of the future /api/cloud-custodian/status response)
// ---------------------------------------------------------------------------

interface CloudCustodianStatusResponse {
  version?: string
  policies?: CustodianPolicy[]
  topResources?: CustodianTopResource[]
  violationsBySeverity?: Partial<CustodianSeverityCounts>
}

// ---------------------------------------------------------------------------
// Pure helpers (unit-testable)
// ---------------------------------------------------------------------------

function summarize(
  policies: CustodianPolicy[],
): CloudCustodianStatusData['summary'] {
  let successfulPolicies = 0
  let failedPolicies = 0
  let dryRunPolicies = 0
  for (const policy of policies ?? []) {
    if (policy.failCount > 0) failedPolicies += 1
    else if (policy.dryRunCount > 0) dryRunPolicies += 1
    else successfulPolicies += 1
  }
  return {
    totalPolicies: policies.length,
    successfulPolicies,
    failedPolicies,
    dryRunPolicies,
  }
}

function deriveHealth(
  policies: CustodianPolicy[],
  violations: CustodianSeverityCounts,
): CustodianHealth {
  if (policies.length === 0) return 'not-installed'
  const hasFailures = policies.some(p => p.failCount > 0)
  const hasCritical = violations.critical > 0 || violations.high > 0
  if (hasFailures || hasCritical) return 'degraded'
  return 'healthy'
}

function mergeSeverityCounts(
  partial: Partial<CustodianSeverityCounts> | undefined,
): CustodianSeverityCounts {
  return {
    critical: partial?.critical ?? 0,
    high: partial?.high ?? 0,
    medium: partial?.medium ?? 0,
    low: partial?.low ?? 0,
  }
}

function buildCloudCustodianStatus(
  policies: CustodianPolicy[],
  topResources: CustodianTopResource[],
  violations: CustodianSeverityCounts,
  version: string,
): CloudCustodianStatusData {
  return {
    health: deriveHealth(policies, violations),
    version,
    policies,
    topResources,
    violationsBySeverity: violations,
    summary: summarize(policies),
    lastCheckTime: new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Fetcher
// ---------------------------------------------------------------------------

async function fetchCloudCustodianStatus(): Promise<CloudCustodianStatusData> {
  const resp = await authFetch(CLOUD_CUSTODIAN_STATUS_ENDPOINT, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
  })

  if (!resp.ok) {
    if (resp.status === NOT_FOUND_STATUS) {
      // Endpoint not yet wired — surface "not-installed" so the cache layer
      // will fall back to demo data instead of flagging a hard failure.
      return buildCloudCustodianStatus(
        [],
        [],
        EMPTY_SEVERITY_COUNTS,
        DEFAULT_CUSTODIAN_VERSION,
      )
    }
    throw new Error(`HTTP ${resp.status}`)
  }

  const body = (await resp.json()) as CloudCustodianStatusResponse
  const policies = Array.isArray(body.policies) ? body.policies : []
  const topResources = Array.isArray(body.topResources) ? body.topResources : []
  const violations = mergeSeverityCounts(body.violationsBySeverity)
  const version = body.version ?? DEFAULT_CUSTODIAN_VERSION
  return buildCloudCustodianStatus(policies, topResources, violations, version)
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useCachedCloudCustodian(): CachedHookResult<CloudCustodianStatusData> {
  const result = useCache<CloudCustodianStatusData>({
    key: CACHE_KEY_CLOUD_CUSTODIAN,
    category: 'default' as RefreshCategory,
    initialData: INITIAL_DATA,
    demoData: CLOUD_CUSTODIAN_DEMO_DATA,
    persist: true,
    fetcher: fetchCloudCustodianStatus,
  })

  return {
    data: result.data,
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
    isDemoFallback: result.isDemoFallback,
    error: result.error,
    isFailed: result.isFailed,
    consecutiveFailures: result.consecutiveFailures,
    lastRefresh: result.lastRefresh,
    refetch: result.refetch,
  }
}

// ---------------------------------------------------------------------------
// Exported testables — pure functions for unit testing
// ---------------------------------------------------------------------------

export const __testables = {
  summarize,
  deriveHealth,
  mergeSeverityCounts,
  buildCloudCustodianStatus,
}
