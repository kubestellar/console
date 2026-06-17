import { describe, it, expect } from 'vitest'

const mod = await import('../kagent_crds')

describe('kagent crds fetcher', () => {
  it('module exports all CRD hooks', () => {
    expect(typeof mod.useKagentCRDAgents).toBe('function')
    expect(typeof mod.useKagentCRDTools).toBe('function')
    expect(typeof mod.useKagentCRDModels).toBe('function')
    expect(typeof mod.useKagentCRDMemories).toBe('function')
  })
})
