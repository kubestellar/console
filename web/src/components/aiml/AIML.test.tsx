import { describe, it, expect } from 'vitest'
import * as AIMLModule from './AIML'

describe('AIML Component', () => {
  it('exports AIML component', () => {
    expect(AIMLModule.AIML).toBeDefined()
    expect(typeof AIMLModule.AIML).toBe('function')
  })
})
