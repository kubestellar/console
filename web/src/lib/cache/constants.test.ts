import { describe, expect, it } from 'vitest'
import { CONSECUTIVE_FAILURE_THRESHOLD as thresholdFromConstants } from './constants'
import { CONSECUTIVE_FAILURE_THRESHOLD as thresholdFromBarrel } from './index'

describe('src/lib/cache/constants.ts', () => {
  it('exports the shared consecutive failure threshold with the previous hardcoded value', () => {
    expect(thresholdFromConstants).toBe(3)
  })

  it('exports a positive integer threshold', () => {
    expect(thresholdFromConstants).toBeGreaterThan(0)
    expect(Number.isInteger(thresholdFromConstants)).toBe(true)
  })

  it('matches the barrel export from src/lib/cache/index.ts', () => {
    expect(thresholdFromBarrel).toBe(thresholdFromConstants)
  })
})
