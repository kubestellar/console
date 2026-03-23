import { describe, it, expect } from 'vitest'
import { CustomDashboard } from './CustomDashboard'
import { DashboardHealthIndicator } from './DashboardHealthIndicator'

describe('CustomDashboard Component', () => {
  it('exports CustomDashboard component', () => {
    expect(CustomDashboard).toBeDefined()
    expect(typeof CustomDashboard).toBe('function')
  })

  it('has health indicator support', () => {
    expect(DashboardHealthIndicator).toBeDefined()
    expect(typeof DashboardHealthIndicator).toBe('function')
  })
})
