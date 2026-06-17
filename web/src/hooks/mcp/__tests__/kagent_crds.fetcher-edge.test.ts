import { describe, it, expect } from 'vitest'
import { useKagentCRDAgents } from '../kagent_crds'

describe('kagent crds fetcher edge', () => {
  it('hook is exposed for optional cluster/namespace usage', () => {
    expect(typeof useKagentCRDAgents).toBe('function')
  })
})
