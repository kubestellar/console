import { describe, it, expect } from 'vitest'
import * as DashboardCardsModule from './DashboardCards'
import * as DashboardHealthIndicatorModule from './DashboardHealthIndicator'

describe('DashboardCards Component', () => {
  it('exports DashboardCards component', () => {
    expect(DashboardCardsModule.DashboardCards).toBeDefined()
    expect(typeof DashboardCardsModule.DashboardCards).toBe('function')
  })

  it('has health indicator support', () => {
    expect(DashboardHealthIndicatorModule.DashboardHealthIndicator).toBeDefined()
    expect(typeof DashboardHealthIndicatorModule.DashboardHealthIndicator).toBe('function')
  })
})
