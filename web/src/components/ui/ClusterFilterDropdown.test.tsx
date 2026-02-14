import { describe, it, expect } from 'vitest'
import * as ClusterFilterDropdownModule from './ClusterFilterDropdown'

describe('ClusterFilterDropdown Component', () => {
  it('exports ClusterFilterDropdown component', () => {
    expect(ClusterFilterDropdownModule.ClusterFilterDropdown).toBeDefined()
    expect(typeof ClusterFilterDropdownModule.ClusterFilterDropdown).toBe('function')
  })
})
