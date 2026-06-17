import { describe, it, expect } from 'vitest'
import { createMergedStatValueGetter } from '../useUniversalStats'

describe('useUniversalStats runtime', () => {
  it('returns unavailable fallback when both getters miss', () => {
    const merged = createMergedStatValueGetter(() => ({ value: undefined }), () => undefined)
    expect(merged('x').value).toBe('-')
  })
})
