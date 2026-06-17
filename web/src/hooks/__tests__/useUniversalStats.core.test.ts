import { describe, it, expect } from 'vitest'
import { createMergedStatValueGetter } from '../useUniversalStats'

describe('useUniversalStats core', () => {
  it('prefers dashboard value when available', () => {
    const merged = createMergedStatValueGetter(() => ({ value: 3 }), () => ({ value: 5 }))
    expect(merged('clusters').value).toBe(3)
  })
})
