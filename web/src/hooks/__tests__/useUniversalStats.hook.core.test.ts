import { describe, it, expect } from 'vitest'
import { useUniversalStats } from '../useUniversalStats'

describe('useUniversalStats hook core', () => {
  it('exports useUniversalStats hook', () => {
    expect(typeof useUniversalStats).toBe('function')
  })
})
