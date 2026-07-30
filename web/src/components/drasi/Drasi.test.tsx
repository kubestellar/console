import React from 'react'
import { describe, it, expect } from 'vitest'
import { Drasi } from './Drasi'

describe('Drasi Component', () => {
  it('exports Drasi component', () => {
    expect(Drasi).toBeDefined()
    expect(typeof Drasi).toBe('function')
  })
})
