import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

vi.mock('../useLocalAgent', () => ({
  useLocalAgent: vi.fn(() => ({ status: 'disconnected' })),
  isAgentUnavailable: vi.fn(() => true),
}))

vi.mock('../../lib/constants', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual,
  LOCAL_AGENT_HTTP_URL: 'http://localhost:8585',
  STORAGE_KEY_TOKEN: 'kc-auth-token',
} })

vi.mock('../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual, FETCH_DEFAULT_TIMEOUT_MS: 10000 }
})

import { useKagentBackend } from '../useKagentBackend'

describe('useKagentBackend', () => {
  it('returns expected shape', () => {
    const { result } = renderHook(() => useKagentBackend())
    expect(result.current).toHaveProperty('kagentAvailable')
  })
})
