import { describe, it, expect } from 'vitest'
import * as AgentStatusModule from './AgentStatus'

describe('AgentStatus Components', () => {
  it('exports AgentStatus component', () => {
    expect(AgentStatusModule.AgentStatus).toBeDefined()
    expect(typeof AgentStatusModule.AgentStatus).toBe('function')
  })

  it('exports AgentInstallBanner component', () => {
    expect(AgentStatusModule.AgentInstallBanner).toBeDefined()
    expect(typeof AgentStatusModule.AgentInstallBanner).toBe('function')
  })
})
