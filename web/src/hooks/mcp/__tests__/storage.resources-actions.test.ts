import { describe, it, expect } from 'vitest'

const mod = await import('../storage')
const { getDemoResourceQuotas, getDemoLimitRanges } = mod.__storageTestables

describe('storage resources actions', () => {
  it('demo quota and limit-range payloads are available', () => {
    expect(getDemoResourceQuotas().length).toBeGreaterThan(0)
    expect(getDemoLimitRanges().length).toBeGreaterThan(0)
  })
})
