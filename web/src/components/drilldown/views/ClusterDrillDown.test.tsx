import { describe, it, expect } from 'vitest'
import * as ClusterDrillDownModule from './ClusterDrillDown'
import * as ClusterDrillDownEventsTabModule from './ClusterDrillDownEventsTab'
import * as ClusterDrillDownResourceTreeModule from './ClusterDrillDownResourceTree'

describe('ClusterDrillDown Component', () => {
  it('exports ClusterDrillDown component', () => {
    expect(ClusterDrillDownModule.ClusterDrillDown).toBeDefined()
    expect(typeof ClusterDrillDownModule.ClusterDrillDown).toBe('function')
  })

  it('exports extracted tab components', () => {
    expect(ClusterDrillDownEventsTabModule.ClusterDrillDownEventsTab).toBeDefined()
    expect(typeof ClusterDrillDownEventsTabModule.ClusterDrillDownEventsTab).toBe('function')
    expect(ClusterDrillDownResourceTreeModule.ClusterDrillDownResourceTree).toBeDefined()
    expect(typeof ClusterDrillDownResourceTreeModule.ClusterDrillDownResourceTree).toBe('function')
  })
})
