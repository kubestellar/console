/**
 * useClusterStats Hook Tests
 */
import { describe, it, expect } from 'vitest'
import * as mod from '../useClusterStats'

describe('useClusterStats', () => {
  it('exports useClusterStats hook', () => {
    expect(mod.useClusterStats).toBeDefined()
    expect(typeof mod.useClusterStats).toBe('function')
  })
})
