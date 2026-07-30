import React from 'react'
import { describe, it, expect } from 'vitest'
import { Arcade } from './Arcade'

describe('Arcade Component', () => {
  it('exports Arcade component', () => {
    expect(Arcade).toBeDefined()
    expect(typeof Arcade).toBe('function')
  })
})
