import { describe, it, expect } from 'vitest'
import { AiGenerationPanel } from './AiGenerationPanel'

describe('AiGenerationPanel Component', () => {
  it('exports AiGenerationPanel component', () => {
    expect(AiGenerationPanel).toBeDefined()
    expect(typeof AiGenerationPanel).toBe('function')
  })
})
