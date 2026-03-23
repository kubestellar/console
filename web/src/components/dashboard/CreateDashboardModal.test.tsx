import { describe, it, expect } from 'vitest'
import { CreateDashboardModal } from './CreateDashboardModal'

describe('CreateDashboardModal Component', () => {
  it('exports CreateDashboardModal component', () => {
    expect(CreateDashboardModal).toBeDefined()
    expect(typeof CreateDashboardModal).toBe('function')
  })
})
