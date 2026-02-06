import { describe, it, expect } from 'vitest'
import * as FloatingDashboardActionsModule from './FloatingDashboardActions'

describe('FloatingDashboardActions Component', () => {
  it('exports FloatingDashboardActions component', () => {
    expect(FloatingDashboardActionsModule.FloatingDashboardActions).toBeDefined()
    expect(typeof FloatingDashboardActionsModule.FloatingDashboardActions).toBe('function')
  })
})
