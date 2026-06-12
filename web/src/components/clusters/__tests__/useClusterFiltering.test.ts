/**
 * useClusterFiltering Hook Tests
 */
import { describe, it, expect } from 'vitest'
import { useClusterFiltering } from '../useClusterFiltering'

describe('useClusterFiltering', () => {
  it('exports useClusterFiltering hook', () => {
    expect(useClusterFiltering).toBeDefined()
    expect(typeof useClusterFiltering).toBe('function')
  })
})
