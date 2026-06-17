import { describe, it, expect } from 'vitest'
import * as hooks from '../kagent_crds'

describe('kagent crds hooks', () => {
  it('keeps hook surface available for MCP consumers', () => {
    expect(hooks).toHaveProperty('useKagentCRDAgents')
    expect(hooks).toHaveProperty('useKagentCRDTools')
    expect(hooks).toHaveProperty('useKagentCRDModels')
    expect(hooks).toHaveProperty('useKagentCRDMemories')
  })
})
