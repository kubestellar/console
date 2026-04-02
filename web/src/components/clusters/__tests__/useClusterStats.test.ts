/**
 * useClusterStats Hook Tests
 */
import { describe, it, expect } from 'vitest'
import { useClusterStats } from '../useClusterStats'

describe('useClusterStats', () => {
  it('exports useClusterStats hook', () => {
    expect(useClusterStats).toBeDefined()
    expect(typeof useClusterStats).toBe('function')
  })
})
