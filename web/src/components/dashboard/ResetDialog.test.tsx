import { describe, it, expect } from 'vitest'
import { ResetDialog } from './ResetDialog'

describe('ResetDialog Component', () => {
  it('exports ResetDialog component', () => {
    expect(ResetDialog).toBeDefined()
    expect(typeof ResetDialog).toBe('function')
  })
})
