import { describe, it, expect } from 'vitest'
import * as AIActionBarModule from './AIActionBar'

describe('AIActionBar Component', () => {
  it('exports AIActionBar component', () => {
    expect(AIActionBarModule.AIActionBar).toBeDefined()
    expect(typeof AIActionBarModule.AIActionBar).toBe('function')
  })
})
