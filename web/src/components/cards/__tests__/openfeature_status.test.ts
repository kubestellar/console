import { describe, it, expect } from 'vitest'
import {
  OPENFEATURE_DEMO_DATA,
  type OpenFeatureHealth,
  type OpenFeatureProviderStatus,
  type OpenFeatureFlagType,
} from '../openfeature_status/demoData'

describe('OPENFEATURE_DEMO_DATA', () => {
  it('is defined', () => {
    expect(OPENFEATURE_DEMO_DATA).toBeDefined()
  })

  it('has valid health status', () => {
    const validHealth: OpenFeatureHealth[] = ['healthy', 'degraded', 'not-installed', 'unknown']
    expect(validHealth).toContain(OPENFEATURE_DEMO_DATA.health)
  })

  it('has providers array with entries', () => {
    expect(Array.isArray(OPENFEATURE_DEMO_DATA.providers)).toBe(true)
    expect(OPENFEATURE_DEMO_DATA.providers.length).toBeGreaterThan(0)
  })

  it('each provider has required fields', () => {
    const validStatus: OpenFeatureProviderStatus[] = ['healthy', 'degraded', 'unhealthy']
    for (const prov of OPENFEATURE_DEMO_DATA.providers) {
      expect(typeof prov.name).toBe('string')
      expect(validStatus).toContain(prov.status)
      expect(typeof prov.evaluations).toBe('number')
      expect(typeof prov.cacheHitRate).toBe('number')
    }
  })

  it('has flags array with entries', () => {
    expect(Array.isArray(OPENFEATURE_DEMO_DATA.flags)).toBe(true)
    expect(OPENFEATURE_DEMO_DATA.flags.length).toBeGreaterThan(0)
  })

  it('each flag has required fields', () => {
    const validTypes: OpenFeatureFlagType[] = ['boolean', 'string', 'number', 'json']
    for (const flag of OPENFEATURE_DEMO_DATA.flags) {
      expect(typeof flag.key).toBe('string')
      expect(validTypes).toContain(flag.type)
      expect(typeof flag.enabled).toBe('boolean')
      expect(typeof flag.defaultVariant).toBe('string')
      expect(typeof flag.variants).toBe('number')
      expect(typeof flag.evaluations).toBe('number')
    }
  })

  it('has featureFlags stats with required fields', () => {
    expect(typeof OPENFEATURE_DEMO_DATA.featureFlags.total).toBe('number')
    expect(typeof OPENFEATURE_DEMO_DATA.featureFlags.enabled).toBe('number')
    expect(typeof OPENFEATURE_DEMO_DATA.featureFlags.disabled).toBe('number')
    expect(typeof OPENFEATURE_DEMO_DATA.featureFlags.errorRate).toBe('number')
  })

  it('featureFlags enabled + disabled <= total', () => {
    const { total, enabled, disabled } = OPENFEATURE_DEMO_DATA.featureFlags
    expect(enabled + disabled).toBeLessThanOrEqual(total)
  })

  it('has totalEvaluations count', () => {
    expect(typeof OPENFEATURE_DEMO_DATA.totalEvaluations).toBe('number')
    expect(OPENFEATURE_DEMO_DATA.totalEvaluations).toBeGreaterThan(0)
  })
})
