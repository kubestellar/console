import { describe, it, expect } from 'vitest'
import * as CreateDashboardModalModule from './CreateDashboardModal'
import * as DashboardHealthIndicatorModule from './DashboardHealthIndicator'

describe('CreateDashboardModal Component', () => {
  it('exports CreateDashboardModal component', () => {
    expect(CreateDashboardModalModule.CreateDashboardModal).toBeDefined()
    expect(typeof CreateDashboardModalModule.CreateDashboardModal).toBe('function')
  })

  it('has health indicator support', () => {
    expect(DashboardHealthIndicatorModule.DashboardHealthIndicator).toBeDefined()
    expect(typeof DashboardHealthIndicatorModule.DashboardHealthIndicator).toBe('function')
  })
})
