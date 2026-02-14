import { describe, it, expect } from 'vitest'
import * as ClusterSelectModule from './ClusterSelect'

describe('ClusterSelect Component', () => {
  it('exports ClusterSelect component', () => {
    expect(ClusterSelectModule.ClusterSelect).toBeDefined()
    expect(typeof ClusterSelectModule.ClusterSelect).toBe('function')
  })
})
