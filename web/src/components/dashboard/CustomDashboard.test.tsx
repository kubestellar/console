import { describe, it, expect } from 'vitest'
import * as CustomDashboardModule from './CustomDashboard'
import * as DashboardHealthIndicatorModule from './DashboardHealthIndicator'

describe('CustomDashboard Component', () => {
  it('exports CustomDashboard component', () => {
    expect(CustomDashboardModule.CustomDashboard).toBeDefined()
    expect(typeof CustomDashboardModule.CustomDashboard).toBe('function')
  })

  it('has health indicator support', () => {
    expect(DashboardHealthIndicatorModule.DashboardHealthIndicator).toBeDefined()
    expect(typeof DashboardHealthIndicatorModule.DashboardHealthIndicator).toBe('function')
  })
})
