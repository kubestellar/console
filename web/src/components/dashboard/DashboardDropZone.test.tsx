import { describe, it, expect } from 'vitest'
import * as DashboardDropZoneModule from './DashboardDropZone'
import * as DashboardHealthIndicatorModule from './DashboardHealthIndicator'

describe('DashboardDropZone Component', () => {
  it('exports DashboardDropZone component', () => {
    expect(DashboardDropZoneModule.DashboardDropZone).toBeDefined()
    expect(typeof DashboardDropZoneModule.DashboardDropZone).toBe('function')
  })

  it('has health indicator support', () => {
    expect(DashboardHealthIndicatorModule.DashboardHealthIndicator).toBeDefined()
    expect(typeof DashboardHealthIndicatorModule.DashboardHealthIndicator).toBe('function')
  })
})
