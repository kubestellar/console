import React from 'react'
import { describe, it, expect } from 'vitest'
import { Storage } from './Storage'

describe('Storage Component', () => {
  it('exports Storage component', () => {
    expect(Storage).toBeDefined()
    expect(typeof Storage).toBe('function')
  })
})
