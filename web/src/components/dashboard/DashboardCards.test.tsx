import { describe, it, expect } from 'vitest'
import { DashboardCards } from './DashboardCards'
import { DashboardHealthIndicator } from './DashboardHealthIndicator'

describe('DashboardCards Component', () => {
  it('exports DashboardCards component', () => {
    expect(DashboardCards).toBeDefined()
    expect(typeof DashboardCards).toBe('function')
  })

  it('has health indicator support', () => {
    expect(DashboardHealthIndicator).toBeDefined()
    expect(typeof DashboardHealthIndicator).toBe('function')
  })
})
