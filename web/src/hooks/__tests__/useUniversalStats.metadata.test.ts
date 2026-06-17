import { describe, it, expect } from 'vitest'
import { createMergedStatValueGetter } from '../useUniversalStats'

describe('useUniversalStats metadata', () => {
  it('preserves dashboard isDemo metadata', () => {
    const merged = createMergedStatValueGetter(() => ({ value: '-', isDemo: true }), () => ({ value: 1 }))
    expect(merged('events').isDemo).toBe(true)
  })
})
