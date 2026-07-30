import React from 'react'
import { describe, it, expect } from 'vitest'
import { Insights } from './Insights'

describe('Insights Component', () => {
  it('exports Insights component', () => {
    expect(Insights).toBeDefined()
    expect(typeof Insights).toBe('function')
  })
})
