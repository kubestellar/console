import { describe, it, expect } from 'vitest'
import * as DashboardModule from './Dashboard'

describe('Dashboard Component', () => {
  it('exports Dashboard component', () => {
    expect(DashboardModule.Dashboard).toBeDefined()
    expect(typeof DashboardModule.Dashboard).toBe('function')
  })
})
