/**
 * useClusterFiltering Hook Tests
 */
import { describe, it, expect } from 'vitest'
import * as mod from '../useClusterFiltering'

describe('useClusterFiltering', () => {
  it('exports useClusterFiltering hook', () => {
    expect(mod.useClusterFiltering).toBeDefined()
    expect(typeof mod.useClusterFiltering).toBe('function')
  })
})
