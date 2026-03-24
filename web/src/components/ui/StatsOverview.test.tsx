import { describe, it, expect } from 'vitest'
import { StatsOverview, formatStatNumber } from './StatsOverview'

describe('StatsOverview Component', () => {
  it('exports StatsOverview component', () => {
    expect(StatsOverview).toBeDefined()
    expect(typeof StatsOverview).toBe('function')
  })

  it('formatStatNumber formats health-related counts correctly', () => {
    expect(typeof formatStatNumber).toBe('function')
    // Health counts like cluster counts, node counts, pod counts
    expect(formatStatNumber(0)).toBe('0')
    expect(formatStatNumber(5)).toBe('5')
    expect(formatStatNumber(10_000)).toBe('10.0K')
    expect(formatStatNumber(1_000_000)).toBe('1.0M')
  })
})
