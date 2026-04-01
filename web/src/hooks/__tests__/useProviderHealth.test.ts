import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

vi.mock('../useLocalAgent', () => ({
  isAgentUnavailable: vi.fn(() => true),
  reportAgentDataSuccess: vi.fn(),
  reportAgentDataError: vi.fn(),
}))

vi.mock('../useDemoMode', () => ({
  getDemoMode: vi.fn(() => true),
  useDemoMode: vi.fn(() => ({ isDemoMode: true })),
}))

vi.mock('../../lib/constants/network', () => ({
  FETCH_DEFAULT_TIMEOUT_MS: 10000,
  QUICK_ABORT_TIMEOUT_MS: 2000,
}))

import { useProviderHealth } from '../useProviderHealth'

describe('useProviderHealth', () => {
  it('returns expected shape', () => {
    const { result } = renderHook(() => useProviderHealth())
    expect(result.current).toHaveProperty('providers')
    expect(Array.isArray(result.current.providers || [])).toBe(true)
  })
})
