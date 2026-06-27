import React from 'react'
import { describe, it, expect } from 'vitest'
import { Marketplace } from './Marketplace'

describe('Marketplace Component', () => {
  it('exports Marketplace component', () => {
    expect(Marketplace).toBeDefined()
    expect(typeof Marketplace).toBe('function')
  })
})
