import { describe, it, expect } from 'vitest'
import { useKagentiSummary } from '../kagenti'

describe('kagenti error', () => {
  it('exports useKagentiSummary for aggregated error/loading handling', () => {
    expect(typeof useKagentiSummary).toBe('function')
  })
})
