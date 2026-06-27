import React from 'react'
import { describe, it, expect } from 'vitest'
import { Compute } from './Compute'

describe('Compute Component', () => {
  it('exports Compute component', () => {
    expect(Compute).toBeDefined()
    expect(typeof Compute).toBe('function')
  })
})
