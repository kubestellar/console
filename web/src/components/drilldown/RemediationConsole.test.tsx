import { describe, it, expect } from 'vitest'
import * as RemediationConsoleModule from './RemediationConsole'

describe('RemediationConsole Component', () => {
  it('exports RemediationConsole component', () => {
    expect(RemediationConsoleModule.RemediationConsole).toBeDefined()
    expect(typeof RemediationConsoleModule.RemediationConsole).toBe('function')
  })
})
