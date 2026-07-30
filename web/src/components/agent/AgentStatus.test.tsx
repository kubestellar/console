import React from 'react'
import { describe, it, expect } from 'vitest'
import { AgentStatus, AgentInstallBanner } from './AgentStatus'

describe('AgentStatus Components', () => {
  it('exports AgentStatus component', () => {
    expect(AgentStatus).toBeDefined()
    expect(typeof AgentStatus).toBe('function')
  })

  it('exports AgentInstallBanner component', () => {
    expect(AgentInstallBanner).toBeDefined()
    expect(typeof AgentInstallBanner).toBe('function')
  })
})
