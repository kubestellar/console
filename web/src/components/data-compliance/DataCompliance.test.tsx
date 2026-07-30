import React from 'react'
import { describe, it, expect } from 'vitest'
import { DataCompliance } from './DataCompliance'

describe('DataCompliance Component', () => {
  it('exports DataCompliance component', () => {
    expect(DataCompliance).toBeDefined()
    expect(typeof DataCompliance).toBe('function')
  })
})
