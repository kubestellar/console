/**
 * Tests for the pure helper functions exported via __testables
 * from useCachedOpenfeature.ts.
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

import { __testables } from '../useCachedOpenfeature'
import type {
  OpenFeatureFlag,
  OpenFeatureProvider,
} from '../../components/cards/openfeature_status/demoData'

const { rollupFlagStats, sumProviderEvaluations, deriveHealth, buildOpenFeatureStatus } =
  __testables

// ---------------------------------------------------------------------------
// rollupFlagStats
// ---------------------------------------------------------------------------

describe('rollupFlagStats', () => {
  it('returns zeroes for an empty array', () => {
    const result = rollupFlagStats([])
    expect(result).toEqual({ total: 0, enabled: 0, disabled: 0, errorRate: 0 })
  })

  it('counts enabled and disabled flags correctly', () => {
    const flags: OpenFeatureFlag[] = [
      makeFlag({ enabled: true }),
      makeFlag({ enabled: false }),
      makeFlag({ enabled: true }),
      makeFlag({ enabled: true }),
    ]
    const result = rollupFlagStats(flags)
    expect(result.total).toBe(4)
    expect(result.enabled).toBe(3)
    expect(result.disabled).toBe(1)
    expect(result.errorRate).toBe(0)
  })

  it('counts all disabled when none are enabled', () => {
    const flags: OpenFeatureFlag[] = [
      makeFlag({ enabled: false }),
      makeFlag({ enabled: false }),
    ]
    const result = rollupFlagStats(flags)
    expect(result.total).toBe(2)
    expect(result.enabled).toBe(0)
    expect(result.disabled).toBe(2)
  })

  it('counts all enabled when none are disabled', () => {
    const flags: OpenFeatureFlag[] = [
      makeFlag({ enabled: true }),
      makeFlag({ enabled: true }),
    ]
    const result = rollupFlagStats(flags)
    expect(result.enabled).toBe(2)
    expect(result.disabled).toBe(0)
  })

  it('handles a single flag', () => {
    const result = rollupFlagStats([makeFlag({ enabled: true })])
    expect(result.total).toBe(1)
    expect(result.enabled).toBe(1)
    expect(result.disabled).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// sumProviderEvaluations
// ---------------------------------------------------------------------------

describe('sumProviderEvaluations', () => {
  it('returns 0 for an empty array', () => {
    expect(sumProviderEvaluations([])).toBe(0)
  })

  it('sums evaluations across providers', () => {
    const providers: OpenFeatureProvider[] = [
      makeProvider({ evaluations: 100 }),
      makeProvider({ evaluations: 250 }),
      makeProvider({ evaluations: 50 }),
    ]
    expect(sumProviderEvaluations(providers)).toBe(400)
  })

  it('returns the value for a single provider', () => {
    expect(sumProviderEvaluations([makeProvider({ evaluations: 42 })])).toBe(42)
  })
})

// ---------------------------------------------------------------------------
// deriveHealth
// ---------------------------------------------------------------------------

describe('deriveHealth', () => {
  it('returns not-installed when both providers and flags are empty', () => {
    expect(deriveHealth([], [])).toBe('not-installed')
  })

  it('returns healthy when all providers are healthy', () => {
    const providers: OpenFeatureProvider[] = [
      makeProvider({ status: 'healthy' }),
      makeProvider({ status: 'healthy' }),
    ]
    expect(deriveHealth(providers, [makeFlag()])).toBe('healthy')
  })

  it('returns degraded when a provider is unhealthy', () => {
    const providers: OpenFeatureProvider[] = [
      makeProvider({ status: 'healthy' }),
      makeProvider({ status: 'unhealthy' }),
    ]
    expect(deriveHealth(providers, [makeFlag()])).toBe('degraded')
  })

  it('returns degraded when a provider is degraded', () => {
    const providers: OpenFeatureProvider[] = [
      makeProvider({ status: 'degraded' }),
    ]
    expect(deriveHealth(providers, [])).toBe('degraded')
  })

  it('returns healthy with flags but no providers', () => {
    expect(deriveHealth([], [makeFlag()])).toBe('healthy')
  })

  it('returns healthy with providers but no flags', () => {
    expect(deriveHealth([makeProvider({ status: 'healthy' })], [])).toBe('healthy')
  })
})

// ---------------------------------------------------------------------------
// buildOpenFeatureStatus
// ---------------------------------------------------------------------------

describe('buildOpenFeatureStatus', () => {
  it('builds a complete status object', () => {
    const providers: OpenFeatureProvider[] = [makeProvider({ status: 'healthy' })]
    const flags: OpenFeatureFlag[] = [makeFlag({ enabled: true })]
    const featureFlags = { total: 1, enabled: 1, disabled: 0, errorRate: 0 }
    const totalEvaluations = 500

    const result = buildOpenFeatureStatus(providers, flags, featureFlags, totalEvaluations)

    expect(result.health).toBe('healthy')
    expect(result.providers).toBe(providers)
    expect(result.flags).toBe(flags)
    expect(result.featureFlags).toBe(featureFlags)
    expect(result.totalEvaluations).toBe(totalEvaluations)
    expect(result.lastCheckTime).toBeDefined()
  })

  it('returns not-installed when no providers and no flags', () => {
    const result = buildOpenFeatureStatus([], [], { total: 0, enabled: 0, disabled: 0, errorRate: 0 }, 0)
    expect(result.health).toBe('not-installed')
  })

  it('returns degraded when a provider is unhealthy', () => {
    const providers: OpenFeatureProvider[] = [makeProvider({ status: 'unhealthy' })]
    const flags: OpenFeatureFlag[] = [makeFlag()]
    const result = buildOpenFeatureStatus(providers, flags, { total: 1, enabled: 1, disabled: 0, errorRate: 0 }, 100)
    expect(result.health).toBe('degraded')
  })

  it('sets lastCheckTime to a valid ISO string', () => {
    const result = buildOpenFeatureStatus([], [], { total: 0, enabled: 0, disabled: 0, errorRate: 0 }, 0)
    expect(() => new Date(result.lastCheckTime)).not.toThrow()
    expect(new Date(result.lastCheckTime).toISOString()).toBe(result.lastCheckTime)
  })
})

// ---------------------------------------------------------------------------
// Helpers — factory functions for test data
// ---------------------------------------------------------------------------

function makeFlag(overrides?: Partial<OpenFeatureFlag>): OpenFeatureFlag {
  return {
    key: 'test-flag',
    type: 'boolean',
    enabled: true,
    defaultVariant: 'on',
    variants: 2,
    provider: 'flagd',
    evaluations: 100,
    ...overrides,
  }
}

function makeProvider(overrides?: Partial<OpenFeatureProvider>): OpenFeatureProvider {
  return {
    name: 'test-provider',
    status: 'healthy',
    evaluations: 100,
    cacheHitRate: 90,
    ...overrides,
  }
}
