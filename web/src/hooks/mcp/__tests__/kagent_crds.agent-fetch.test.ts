import { describe, it, expect } from 'vitest'
import { useKagentCRDAgents } from '../kagent_crds'

describe('kagent crds agent fetch', () => {
  it('exports useKagentCRDAgents hook', () => {
    expect(typeof useKagentCRDAgents).toBe('function')
  })
})
