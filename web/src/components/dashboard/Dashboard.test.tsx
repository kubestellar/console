import { describe, it, expect } from 'vitest'
import { Dashboard } from './Dashboard'
import { DashboardHealthIndicator } from './DashboardHealthIndicator'

describe('Dashboard Component', () => {
  it('exports Dashboard component', () => {
    expect(Dashboard).toBeDefined()
    expect(typeof Dashboard).toBe('function')
  })

  it('has health indicator support', () => {
    expect(DashboardHealthIndicator).toBeDefined()
    expect(typeof DashboardHealthIndicator).toBe('function')
  })
})
