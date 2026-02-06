import { describe, it, expect } from 'vitest'
import * as SetupInstructionsDialogModule from './SetupInstructionsDialog'

describe('SetupInstructionsDialog Component', () => {
  it('exports SetupInstructionsDialog component', () => {
    expect(SetupInstructionsDialogModule.SetupInstructionsDialog).toBeDefined()
    expect(typeof SetupInstructionsDialogModule.SetupInstructionsDialog).toBe('function')
  })
})
