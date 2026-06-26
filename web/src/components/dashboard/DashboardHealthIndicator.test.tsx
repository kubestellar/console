import { describe, it, expect } from 'vitest'
import { DashboardHealthIndicator } from './DashboardHealthIndicator'

describe('DashboardHealthIndicator Component', () => {
  it('exports DashboardHealthIndicator component', () => {
    expect(DashboardHealthIndicator).toBeDefined()
    expect(typeof DashboardHealthIndicator).toBe('function')
  })
})
