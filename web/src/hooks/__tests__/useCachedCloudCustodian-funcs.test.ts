/**
 * Tests for the pure helper functions exported via __testables
 * from useCachedCloudCustodian.ts.
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../lib/constants/network', () => ({
  FETCH_DEFAULT_TIMEOUT_MS: 5000,
  LOCAL_AGENT_HTTP_URL: 'http://localhost:8585',
}))

vi.mock('../useDemoMode', () => ({
  useDemoMode: () => ({ isDemoMode: false }),
  isDemoModeForced: false,
}))

vi.mock('../../lib/cache', () => ({
  useCache: vi.fn(() => ({
    data: null,
    isLoading: false,
    isRefreshing: false,
    isDemoFallback: false,
    error: null,
    isFailed: false,
    consecutiveFailures: 0,
    lastRefresh: null,
    refetch: vi.fn(),
  })),
}))

import { __testables } from '../useCachedCloudCustodian'
import type {
  CustodianPolicy,
  CustodianSeverityCounts,
} from '../../lib/demo/cloud-custodian'

const { summarize, deriveHealth, mergeSeverityCounts, buildCloudCustodianStatus } =
  __testables

// ---------------------------------------------------------------------------
// summarize
// ---------------------------------------------------------------------------

describe('summarize', () => {
  it('returns zeroes for an empty array', () => {
    const result = summarize([])
    expect(result).toEqual({
      totalPolicies: 0,
      successfulPolicies: 0,
      failedPolicies: 0,
      dryRunPolicies: 0,
    })
  })

  it('counts failed policies (failCount > 0)', () => {
    const policies: CustodianPolicy[] = [
      makePolicy({ failCount: 3, dryRunCount: 0, successCount: 10 }),
    ]
    const result = summarize(policies)
    expect(result.failedPolicies).toBe(1)
    expect(result.successfulPolicies).toBe(0)
    expect(result.dryRunPolicies).toBe(0)
  })

  it('counts dry-run policies (dryRunCount > 0, failCount === 0)', () => {
    const policies: CustodianPolicy[] = [
      makePolicy({ failCount: 0, dryRunCount: 5, successCount: 0 }),
    ]
    const result = summarize(policies)
    expect(result.dryRunPolicies).toBe(1)
    expect(result.failedPolicies).toBe(0)
    expect(result.successfulPolicies).toBe(0)
  })

  it('counts successful policies (both failCount and dryRunCount are 0)', () => {
    const policies: CustodianPolicy[] = [
      makePolicy({ failCount: 0, dryRunCount: 0, successCount: 15 }),
    ]
    const result = summarize(policies)
    expect(result.successfulPolicies).toBe(1)
    expect(result.failedPolicies).toBe(0)
    expect(result.dryRunPolicies).toBe(0)
  })

  it('prioritizes failed over dry-run (failCount > 0 and dryRunCount > 0)', () => {
    const policies: CustodianPolicy[] = [
      makePolicy({ failCount: 1, dryRunCount: 2 }),
    ]
    const result = summarize(policies)
    expect(result.failedPolicies).toBe(1)
    expect(result.dryRunPolicies).toBe(0)
  })

  it('counts a mix of policies correctly', () => {
    const policies: CustodianPolicy[] = [
      makePolicy({ failCount: 0, dryRunCount: 0 }), // successful
      makePolicy({ failCount: 2, dryRunCount: 0 }), // failed
      makePolicy({ failCount: 0, dryRunCount: 3 }), // dry-run
      makePolicy({ failCount: 0, dryRunCount: 0 }), // successful
      makePolicy({ failCount: 1, dryRunCount: 1 }), // failed (priority)
    ]
    const result = summarize(policies)
    expect(result.totalPolicies).toBe(5)
    expect(result.successfulPolicies).toBe(2)
    expect(result.failedPolicies).toBe(2)
    expect(result.dryRunPolicies).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// deriveHealth
// ---------------------------------------------------------------------------

describe('deriveHealth', () => {
  const NO_VIOLATIONS: CustodianSeverityCounts = { critical: 0, high: 0, medium: 0, low: 0 }

  it('returns not-installed for empty policies', () => {
    expect(deriveHealth([], NO_VIOLATIONS)).toBe('not-installed')
  })

  it('returns healthy when no failures and no critical/high violations', () => {
    const policies: CustodianPolicy[] = [
      makePolicy({ failCount: 0 }),
    ]
    expect(deriveHealth(policies, NO_VIOLATIONS)).toBe('healthy')
  })

  it('returns degraded when a policy has failures', () => {
    const policies: CustodianPolicy[] = [
      makePolicy({ failCount: 1 }),
    ]
    expect(deriveHealth(policies, NO_VIOLATIONS)).toBe('degraded')
  })

  it('returns degraded when critical violations exist', () => {
    const policies: CustodianPolicy[] = [
      makePolicy({ failCount: 0 }),
    ]
    const violations: CustodianSeverityCounts = { critical: 1, high: 0, medium: 0, low: 0 }
    expect(deriveHealth(policies, violations)).toBe('degraded')
  })

  it('returns degraded when high violations exist', () => {
    const policies: CustodianPolicy[] = [
      makePolicy({ failCount: 0 }),
    ]
    const violations: CustodianSeverityCounts = { critical: 0, high: 3, medium: 0, low: 0 }
    expect(deriveHealth(policies, violations)).toBe('degraded')
  })

  it('returns healthy when only medium/low violations exist', () => {
    const policies: CustodianPolicy[] = [
      makePolicy({ failCount: 0 }),
    ]
    const violations: CustodianSeverityCounts = { critical: 0, high: 0, medium: 10, low: 5 }
    expect(deriveHealth(policies, violations)).toBe('healthy')
  })
})

// ---------------------------------------------------------------------------
// mergeSeverityCounts
// ---------------------------------------------------------------------------

describe('mergeSeverityCounts', () => {
  it('returns all zeroes for undefined input', () => {
    expect(mergeSeverityCounts(undefined)).toEqual({
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    })
  })

  it('returns all zeroes for empty partial', () => {
    expect(mergeSeverityCounts({})).toEqual({
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    })
  })

  it('fills missing fields with 0', () => {
    expect(mergeSeverityCounts({ critical: 5 })).toEqual({
      critical: 5,
      high: 0,
      medium: 0,
      low: 0,
    })
  })

  it('passes through all provided values', () => {
    const input = { critical: 1, high: 2, medium: 3, low: 4 }
    expect(mergeSeverityCounts(input)).toEqual(input)
  })
})

// ---------------------------------------------------------------------------
// buildCloudCustodianStatus
// ---------------------------------------------------------------------------

describe('buildCloudCustodianStatus', () => {
  const NO_VIOLATIONS: CustodianSeverityCounts = { critical: 0, high: 0, medium: 0, low: 0 }

  it('builds a complete status object', () => {
    const policies: CustodianPolicy[] = [makePolicy({ failCount: 0 })]
    const topResources = [{ id: 'arn:aws:ec2:i-123', type: 'ec2-instance', actionCount: 3 }]
    const result = buildCloudCustodianStatus(policies, topResources, NO_VIOLATIONS, '0.9.25')

    expect(result.health).toBe('healthy')
    expect(result.version).toBe('0.9.25')
    expect(result.policies).toBe(policies)
    expect(result.topResources).toBe(topResources)
    expect(result.violationsBySeverity).toBe(NO_VIOLATIONS)
    expect(result.summary.totalPolicies).toBe(1)
    expect(result.lastCheckTime).toBeDefined()
  })

  it('returns not-installed for empty policies', () => {
    const result = buildCloudCustodianStatus([], [], NO_VIOLATIONS, 'unknown')
    expect(result.health).toBe('not-installed')
  })

  it('returns degraded when policies have failures', () => {
    const policies: CustodianPolicy[] = [makePolicy({ failCount: 2 })]
    const result = buildCloudCustodianStatus(policies, [], NO_VIOLATIONS, '0.9.25')
    expect(result.health).toBe('degraded')
  })

  it('computes summary from policies', () => {
    const policies: CustodianPolicy[] = [
      makePolicy({ failCount: 0, dryRunCount: 0 }),
      makePolicy({ failCount: 1, dryRunCount: 0 }),
    ]
    const result = buildCloudCustodianStatus(policies, [], NO_VIOLATIONS, '0.9.25')
    expect(result.summary.totalPolicies).toBe(2)
    expect(result.summary.successfulPolicies).toBe(1)
    expect(result.summary.failedPolicies).toBe(1)
  })

  it('sets lastCheckTime to a valid ISO string', () => {
    const result = buildCloudCustodianStatus([], [], NO_VIOLATIONS, 'unknown')
    expect(() => new Date(result.lastCheckTime)).not.toThrow()
    expect(new Date(result.lastCheckTime).toISOString()).toBe(result.lastCheckTime)
  })
})

// ---------------------------------------------------------------------------
// Helpers — factory functions for test data
// ---------------------------------------------------------------------------

function makePolicy(overrides?: Partial<CustodianPolicy>): CustodianPolicy {
  return {
    name: 'test-policy',
    resource: 'aws.ec2',
    provider: 'aws',
    mode: 'pull',
    successCount: 10,
    failCount: 0,
    dryRunCount: 0,
    resourcesMatched: 5,
    lastRunAt: new Date().toISOString(),
    ...overrides,
  }
}
