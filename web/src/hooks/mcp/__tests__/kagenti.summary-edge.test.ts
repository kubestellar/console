import { describe, it, expect } from 'vitest'
import { useKagentiSummary } from '../kagenti'

describe('kagenti summary edge', () => {
  it('summary hook remains exported', () => {
    expect(typeof useKagentiSummary).toBe('function')
  })
})
