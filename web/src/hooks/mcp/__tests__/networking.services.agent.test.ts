import { describe, it, expect } from 'vitest'
import { useServices } from '../networking'

describe('networking services agent', () => {
  it('exports useServices hook', () => {
    expect(typeof useServices).toBe('function')
  })
})
