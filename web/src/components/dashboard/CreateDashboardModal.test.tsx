import { describe, it, expect } from 'vitest'
import * as CreateDashboardModalModule from './CreateDashboardModal'

describe('CreateDashboardModal Component', () => {
  it('exports CreateDashboardModal component', () => {
    expect(CreateDashboardModalModule.CreateDashboardModal).toBeDefined()
    expect(typeof CreateDashboardModalModule.CreateDashboardModal).toBe('function')
  })
})
