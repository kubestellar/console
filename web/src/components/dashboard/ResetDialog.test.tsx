import { describe, it, expect } from 'vitest'
import * as ResetDialogModule from './ResetDialog'

describe('ResetDialog Component', () => {
  it('exports ResetDialog component', () => {
    expect(ResetDialogModule.ResetDialog).toBeDefined()
    expect(typeof ResetDialogModule.ResetDialog).toBe('function')
  })
})
