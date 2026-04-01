import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

vi.mock('../useLocalAgent', () => ({
  useLocalAgent: vi.fn(() => ({ status: 'disconnected' })),
  isAgentUnavailable: vi.fn(() => true),
}))

vi.mock('../../lib/constants', () => ({
  LOCAL_AGENT_HTTP_URL: 'http://localhost:8585',
}))

vi.mock('../../lib/constants/network', () => ({
  FETCH_DEFAULT_TIMEOUT_MS: 10000,
}))

import { useLocalClusterTools } from '../useLocalClusterTools'

describe('useLocalClusterTools', () => {
  it('returns expected shape', () => {
    const { result } = renderHook(() => useLocalClusterTools())
    expect(result.current).toHaveProperty('isLoading')
  })
})
