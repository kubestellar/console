import { describe, it, expect } from 'vitest'
import * as ClusterDrillDownModule from './ClusterDrillDown'

describe('ClusterDrillDown Component', () => {
  it('exports ClusterDrillDown component', () => {
    expect(ClusterDrillDownModule.ClusterDrillDown).toBeDefined()
    expect(typeof ClusterDrillDownModule.ClusterDrillDown).toBe('function')
  })
})
