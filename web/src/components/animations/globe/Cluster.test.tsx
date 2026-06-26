import { describe, it, expect } from 'vitest'
import Cluster from './Cluster'

describe('Cluster Component', () => {
  it('exports Cluster component as default', () => {
    expect(Cluster).toBeDefined()
    expect(typeof Cluster).toBe('function')
  })
})
