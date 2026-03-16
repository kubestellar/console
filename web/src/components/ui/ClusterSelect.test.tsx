import { describe, it, expect } from 'vitest'
import { ClusterSelect } from './ClusterSelect'

describe('ClusterSelect Component', () => {
  it('exports ClusterSelect component', () => {
    expect(ClusterSelect).toBeDefined()
    expect(typeof ClusterSelect).toBe('function')
  })
})
