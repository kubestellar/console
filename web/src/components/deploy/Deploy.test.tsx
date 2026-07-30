import React from 'react'
import { describe, it, expect } from 'vitest'
import { Deploy } from './Deploy'

describe('Deploy Component', () => {
  it('exports Deploy component', () => {
    expect(Deploy).toBeDefined()
    expect(typeof Deploy).toBe('function')
  })
})
