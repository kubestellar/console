import { describe, it, expect } from 'vitest'
import * as FloatingDashboardActionsModule from './FloatingDashboardActions'
import * as DashboardHealthIndicatorModule from './DashboardHealthIndicator'

describe('FloatingDashboardActions Component', () => {
  it('exports FloatingDashboardActions component', () => {
    expect(FloatingDashboardActionsModule.FloatingDashboardActions).toBeDefined()
    expect(typeof FloatingDashboardActionsModule.FloatingDashboardActions).toBe('function')
  })

  it('has health indicator support', () => {
    expect(DashboardHealthIndicatorModule.DashboardHealthIndicator).toBeDefined()
    expect(typeof DashboardHealthIndicatorModule.DashboardHealthIndicator).toBe('function')
  })
})
