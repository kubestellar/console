import { describe, it, expect } from 'vitest'
import { AIML } from './AIML'

describe('AIML Component', () => {
  it('exports AIML component', () => {
    expect(AIML).toBeDefined()
    expect(typeof AIML).toBe('function')
  })
})
