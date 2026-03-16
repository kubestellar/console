import { describe, it, expect } from 'vitest'
import { DashboardDropZone } from './DashboardDropZone'

describe('DashboardDropZone Component', () => {
  it('exports DashboardDropZone component', () => {
    expect(DashboardDropZone).toBeDefined()
    expect(typeof DashboardDropZone).toBe('function')
  })
})
