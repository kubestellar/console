import { describe, it, expect } from 'vitest'
import * as AgentSelectorModule from './AgentSelector'

describe('AgentSelector Component', () => {
  it('exports AgentSelector component', () => {
    expect(AgentSelectorModule.AgentSelector).toBeDefined()
    expect(typeof AgentSelectorModule.AgentSelector).toBe('function')
  })
})
