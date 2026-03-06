import { describe, it, expect } from 'vitest'
import { StatsOverview } from './StatsOverview'

describe('StatsOverview Component', () => {
  it('exports StatsOverview component', () => {
    expect(StatsOverview).toBeDefined()
    expect(typeof StatsOverview).toBe('function')
  })
})
