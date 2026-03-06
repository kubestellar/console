import { describe, it, expect } from 'vitest'
import { AccessibleStatusBadge } from './AccessibleStatus'

describe('AccessibleStatus Component', () => {
  it('exports AccessibleStatusBadge component', () => {
    expect(AccessibleStatusBadge).toBeDefined()
    expect(typeof AccessibleStatusBadge).toBe('function')
  })
})
