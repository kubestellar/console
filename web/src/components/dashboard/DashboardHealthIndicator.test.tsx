import { describe, it, expect } from 'vitest'
import * as DashboardHealthIndicatorModule from './DashboardHealthIndicator'

describe('DashboardHealthIndicator Component', () => {
  it('exports DashboardHealthIndicator component', () => {
    expect(DashboardHealthIndicatorModule.DashboardHealthIndicator).toBeDefined()
    expect(typeof DashboardHealthIndicatorModule.DashboardHealthIndicator).toBe('function')
  })
})
