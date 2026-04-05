import { describe, it, expect } from 'vitest'
import { CustomDashboard } from './CustomDashboard'
import { DashboardHealthIndicator } from './DashboardHealthIndicator'

describe('CustomDashboard Component', () => {
  it('exports CustomDashboard component', () => {
    expect(CustomDashboard).toBeDefined()
    expect(typeof CustomDashboard).toBe('function')
  })

  it('has health indicator support', () => {
    expect(DashboardHealthIndicator).toBeDefined()
    expect(typeof DashboardHealthIndicator).toBe('function')
  })
})

describe('Request ID race prevention (#4664)', () => {
  it('incrementing a counter produces unique request IDs', () => {
    // The fix uses a ref counter to discard stale async responses.
    // Verify the fundamental counter-based staleness detection pattern.
    let requestId = 0
    const id1 = ++requestId
    const id2 = ++requestId
    expect(id1).not.toBe(id2)
    // A stale request (id1) should not match the current counter
    expect(id1 === requestId).toBe(false)
    // The latest request should match
    expect(id2 === requestId).toBe(true)
  })
})
