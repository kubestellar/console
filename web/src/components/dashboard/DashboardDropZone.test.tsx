import { describe, it, expect } from 'vitest'
import * as DashboardDropZoneModule from './DashboardDropZone'

describe('DashboardDropZone Component', () => {
  it('exports DashboardDropZone component', () => {
    expect(DashboardDropZoneModule.DashboardDropZone).toBeDefined()
    expect(typeof DashboardDropZoneModule.DashboardDropZone).toBe('function')
  })
})
