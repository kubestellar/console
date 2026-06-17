import { describe, it, expect } from 'vitest'
import { useIngresses } from '../networking'

describe('networking ingresses', () => {
  it('exports useIngresses hook', () => {
    expect(typeof useIngresses).toBe('function')
  })
})
