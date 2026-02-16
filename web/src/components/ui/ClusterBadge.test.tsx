import { describe, it, expect } from 'vitest'
import * as ClusterBadgeModule from './ClusterBadge'

describe('ClusterBadge Component', () => {
  it('exports ClusterBadge component', () => {
    expect(ClusterBadgeModule.ClusterBadge).toBeDefined()
    expect(typeof ClusterBadgeModule.ClusterBadge).toBe('function')
  })
})
