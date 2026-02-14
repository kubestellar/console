import { describe, it, expect } from 'vitest'
import * as ClusterStatusBadgeModule from './ClusterStatusBadge'

describe('ClusterStatusBadge Component', () => {
  it('exports ClusterStatusBadge component', () => {
    expect(ClusterStatusBadgeModule.ClusterStatusBadge).toBeDefined()
    expect(typeof ClusterStatusBadgeModule.ClusterStatusBadge).toBe('function')
  })
})
