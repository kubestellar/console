import { describe, it, expect } from 'vitest'
import { createMergedStatValueGetter } from '../useUniversalStats'

describe('useUniversalStats demo actions', () => {
  it('falls back to universal value when dashboard emits dash', () => {
    const merged = createMergedStatValueGetter(() => ({ value: '-' }), () => ({ value: 9 }))
    expect(merged('pods').value).toBe(9)
  })
})
