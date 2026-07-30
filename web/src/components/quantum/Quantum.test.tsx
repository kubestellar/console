import React from 'react'
import { describe, it, expect } from 'vitest'
import { Quantum } from './Quantum'

describe('Quantum Component', () => {
  it('exports Quantum component', () => {
    expect(Quantum).toBeDefined()
    expect(typeof Quantum).toBe('function')
  })
})
