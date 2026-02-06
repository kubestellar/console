import { describe, it, expect } from 'vitest'
import * as CustomDashboardModule from './CustomDashboard'

describe('CustomDashboard Component', () => {
  it('exports CustomDashboard component', () => {
    expect(CustomDashboardModule.CustomDashboard).toBeDefined()
    expect(typeof CustomDashboardModule.CustomDashboard).toBe('function')
  })
})
