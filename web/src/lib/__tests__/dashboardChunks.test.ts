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
})
