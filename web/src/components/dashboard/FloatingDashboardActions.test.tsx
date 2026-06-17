import { describe, it, expect } from 'vitest'
import { FloatingDashboardActions } from './FloatingDashboardActions'
import { DashboardHealthIndicator } from './DashboardHealthIndicator'

describe('FloatingDashboardActions Component', () => {
  it('exports FloatingDashboardActions component', () => {
    expect(FloatingDashboardActions).toBeDefined()
    expect(typeof FloatingDashboardActions).toBe('function')
  })

  it('has health indicator support', () => {
    expect(DashboardHealthIndicator).toBeDefined()
    expect(typeof DashboardHealthIndicator).toBe('function')
  })
})
