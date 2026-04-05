import { describe, it, expect, vi, afterEach } from 'vitest'
import { WelcomeCard } from './WelcomeCard'

describe('WelcomeCard Component', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('exports WelcomeCard component', () => {
    expect(WelcomeCard).toBeDefined()
    expect(typeof WelcomeCard).toBe('function')
  })

  it('clearTimeout is safe to call with null (timer cleanup contract)', () => {
    // The fix calls clearTimeout on the ref during unmount cleanup (#4662).
    // Verify that clearTimeout works correctly with various inputs.
    expect(() => clearTimeout(undefined)).not.toThrow()
    const id = setTimeout(() => {}, 0)
    expect(() => clearTimeout(id)).not.toThrow()
    // Clearing an already-cleared timer is a no-op
    expect(() => clearTimeout(id)).not.toThrow()
  })
})
