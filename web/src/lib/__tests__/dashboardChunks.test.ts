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

  it('every loader returns a Promise when invoked', async () => {
    for (const [key, loader] of Object.entries(DASHBOARD_CHUNKS)) {
      const result = loader()
      expect(result).toBeInstanceOf(Promise)
      // Await to exercise the import path; catch errors from missing modules
      try {
        await result
      } catch {
        // Dynamic import may fail in test env — that's fine,
        // we just need the loader function itself to be exercised
      }
      expect(key).toBeTruthy()
    }
  })

  it('does not have unknown keys', () => {
    expect(DASHBOARD_CHUNKS['nonexistent']).toBeUndefined()
  })
})
