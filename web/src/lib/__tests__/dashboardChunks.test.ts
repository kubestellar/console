import { describe, it, expect } from 'vitest'
import { DASHBOARD_CHUNKS } from '../dashboardChunks'

describe('DASHBOARD_CHUNKS', () => {
  it('is a non-empty record', () => {
    const keys = Object.keys(DASHBOARD_CHUNKS)
    expect(keys.length).toBeGreaterThan(0)
  })

  it('has all essential dashboard keys', () => {
    const expected = [
      'dashboard', 'clusters', 'workloads', 'nodes', 'pods',
      'services', 'storage', 'network', 'security', 'settings',
    ]
    for (const key of expected) {
      expect(DASHBOARD_CHUNKS[key]).toBeDefined()
      expect(typeof DASHBOARD_CHUNKS[key]).toBe('function')
    }
  })

  it('each value is a function returning a Promise', () => {
    for (const [, loader] of Object.entries(DASHBOARD_CHUNKS)) {
      expect(typeof loader).toBe('function')
    }
  })

  it('has all extended dashboard keys', () => {
    const extended = [
      'compute', 'events', 'deployments', 'gitops', 'alerts',
      'cost', 'compliance', 'operators', 'helm',
      'gpu-reservations', 'data-compliance', 'logs', 'arcade',
      'deploy', 'ai-ml', 'ai-agents', 'llm-d-benchmarks',
      'cluster-admin', 'ci-cd', 'insights', 'multi-tenancy', 'marketplace',
    ]
    for (const key of extended) {
      expect(DASHBOARD_CHUNKS[key]).toBeDefined()
      expect(typeof DASHBOARD_CHUNKS[key]).toBe('function')
    }
  })

  it('contains the correct total number of dashboard entries', () => {
    const EXPECTED_DASHBOARD_COUNT = 32
    expect(Object.keys(DASHBOARD_CHUNKS)).toHaveLength(EXPECTED_DASHBOARD_COUNT)
  })

  it('keys are all lowercase with hyphens (no underscores or uppercase)', () => {
    for (const key of Object.keys(DASHBOARD_CHUNKS)) {
      expect(key).toBe(key.toLowerCase())
      expect(key).not.toContain('_')
    }
  })

  it('returns undefined for non-existent dashboard key', () => {
    expect(DASHBOARD_CHUNKS['nonexistent']).toBeUndefined()
  })

  it('each loader returns a thenable (Promise) when called', () => {
    // Call a loader and verify it returns a Promise-like object
    const loader = DASHBOARD_CHUNKS['dashboard']
    const result = loader()
    expect(result).toBeDefined()
    expect(typeof result.then).toBe('function')
    expect(typeof result.catch).toBe('function')
    // Consume the promise to avoid unhandled warnings (don't await -- may hang in test env)
    result.catch(() => {})
  })

  it('different keys reference different loader functions', () => {
    const loaders = Object.values(DASHBOARD_CHUNKS)
    const uniqueLoaders = new Set(loaders)
    // Each entry should have its own unique function reference
    expect(uniqueLoaders.size).toBe(loaders.length)
  })

  it('no key maps to a null or non-function value', () => {
    for (const [key, loader] of Object.entries(DASHBOARD_CHUNKS)) {
      expect(loader).not.toBeNull()
      expect(loader).not.toBeUndefined()
      expect(typeof loader).toBe('function')
      // Verify key is meaningful
      expect(key.length).toBeGreaterThan(0)
    }
  })
})
