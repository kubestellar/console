import React from 'react'
import { describe, it, expect } from 'vitest'
import { MultiTenancy } from './MultiTenancy'

describe('MultiTenancy Component', () => {
  it('exports MultiTenancy component', () => {
    expect(MultiTenancy).toBeDefined()
    expect(typeof MultiTenancy).toBe('function')
  })
})
