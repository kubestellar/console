import { describe, it, expect } from 'vitest'
import * as StatsOverviewModule from './StatsOverview'

describe('StatsOverview Component', () => {
  it('exports StatsOverview component', () => {
    expect(StatsOverviewModule.StatsOverview).toBeDefined()
    expect(typeof StatsOverviewModule.StatsOverview).toBe('function')
  })
})
