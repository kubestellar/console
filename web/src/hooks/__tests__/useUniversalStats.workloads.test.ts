import { describe, it, expect } from 'vitest'
import { createMergedStatValueGetter } from '../useUniversalStats'

describe('useUniversalStats workloads', () => {
  it('keeps zero values from dashboard', () => {
    const merged = createMergedStatValueGetter(() => ({ value: 0 }), () => ({ value: 10 }))
    expect(merged('workloads').value).toBe(0)
  })
})
