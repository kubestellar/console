import { describe, it, expect } from 'vitest'
import { SetupInstructionsDialog } from './SetupInstructionsDialog'

describe('SetupInstructionsDialog Component', () => {
  it('exports SetupInstructionsDialog component', () => {
    expect(SetupInstructionsDialog).toBeDefined()
    expect(typeof SetupInstructionsDialog).toBe('function')
  })
})
