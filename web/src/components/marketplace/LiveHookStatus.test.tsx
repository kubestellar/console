import React from 'react'
import { describe, it, expect } from 'vitest'
import { LiveHookStatusPanel } from './LiveHookStatus'

describe('LiveHookStatusPanel', () => {
  it('exports LiveHookStatusPanel component', () => {
    expect(LiveHookStatusPanel).toBeDefined()
    expect(typeof LiveHookStatusPanel).toBe('function')
  })
})
