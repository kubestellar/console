import { describe, it, expect } from 'vitest'
import * as SyncDialogModule from './SyncDialog'

describe('SyncDialog Component', () => {
  it('exports SyncDialog component', () => {
    expect(SyncDialogModule.SyncDialog).toBeDefined()
    expect(typeof SyncDialogModule.SyncDialog).toBe('function')
  })
})
