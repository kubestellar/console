import { describe, it, expect } from 'vitest'
import { useNetworkPolicies } from '../networking'

describe('networking policies', () => {
  it('exports useNetworkPolicies hook', () => {
    expect(typeof useNetworkPolicies).toBe('function')
  })
})
