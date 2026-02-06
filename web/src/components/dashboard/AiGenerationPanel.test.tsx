import { describe, it, expect } from 'vitest'
import * as AiGenerationPanelModule from './AiGenerationPanel'

describe('AiGenerationPanel Component', () => {
  it('exports AiGenerationPanel component', () => {
    expect(AiGenerationPanelModule.AiGenerationPanel).toBeDefined()
    expect(typeof AiGenerationPanelModule.AiGenerationPanel).toBe('function')
  })
})
