import { describe, it, expect } from 'vitest'
import { ClusterFilterDropdown } from './ClusterFilterDropdown'

describe('ClusterFilterDropdown Component', () => {
  it('exports ClusterFilterDropdown component', () => {
    expect(ClusterFilterDropdown).toBeDefined()
    expect(typeof ClusterFilterDropdown).toBe('function')
  })
})
