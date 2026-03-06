import { describe, it, expect } from 'vitest'
import { ClusterBadge } from './ClusterBadge'

describe('ClusterBadge Component', () => {
  it('exports ClusterBadge component', () => {
    expect(ClusterBadge).toBeDefined()
    expect(typeof ClusterBadge).toBe('function')
  })
})
