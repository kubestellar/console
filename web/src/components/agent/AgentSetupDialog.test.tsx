import { describe, it, expect } from 'vitest'
import * as AgentSetupDialogModule from './AgentSetupDialog'

describe('AgentSetupDialog Component', () => {
  it('exports AgentSetupDialog component', () => {
    expect(AgentSetupDialogModule.AgentSetupDialog).toBeDefined()
    expect(typeof AgentSetupDialogModule.AgentSetupDialog).toBe('function')
  })
})
