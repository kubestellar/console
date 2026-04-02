import { describe, it, expect } from 'vitest'
import { AIActionBar } from './AIActionBar'

describe('AIActionBar Component', () => {
  it('exports AIActionBar component', () => {
    expect(AIActionBar).toBeDefined()
    expect(typeof AIActionBar).toBe('function')
  })
})
