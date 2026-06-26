import { describe, it, expect } from 'vitest'
import { AgentSetupDialog } from './AgentSetupDialog'

describe('AgentSetupDialog Component', () => {
  it('exports AgentSetupDialog component', () => {
    expect(AgentSetupDialog).toBeDefined()
    expect(typeof AgentSetupDialog).toBe('function')
  })
})
