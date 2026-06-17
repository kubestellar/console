import { describe, it, expect } from 'vitest'
import { useKagentCRDTools, useKagentCRDModels, useKagentCRDMemories } from '../kagent_crds'

describe('kagent crds demo', () => {
  it('exports additional CRD hooks for demo/live usage', () => {
    expect(typeof useKagentCRDTools).toBe('function')
    expect(typeof useKagentCRDModels).toBe('function')
    expect(typeof useKagentCRDMemories).toBe('function')
  })
})
