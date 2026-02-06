import { describe, it, expect } from 'vitest'
import * as DashboardCardsModule from './DashboardCards'

describe('DashboardCards Component', () => {
  it('exports DashboardCards component', () => {
    expect(DashboardCardsModule.DashboardCards).toBeDefined()
    expect(typeof DashboardCardsModule.DashboardCards).toBe('function')
  })
})
