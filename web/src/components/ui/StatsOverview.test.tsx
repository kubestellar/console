import { describe, it, expect } from 'vitest'
import * as StatsOverviewModule from './StatsOverview'
import * as DashboardHealthModule from '../../hooks/useDashboardHealth'

describe('StatsOverview Component', () => {
  it('exports StatsOverview component', () => {
    expect(StatsOverviewModule.StatsOverview).toBeDefined()
    expect(typeof StatsOverviewModule.StatsOverview).toBe('function')
  })

  it('has health status support via useDashboardHealth hook', () => {
    expect(DashboardHealthModule.useDashboardHealth).toBeDefined()
    expect(typeof DashboardHealthModule.useDashboardHealth).toBe('function')
  })
})
