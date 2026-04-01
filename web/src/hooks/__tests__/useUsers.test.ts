import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

vi.mock('../../lib/api', () => ({
  api: { get: vi.fn(() => Promise.resolve({ data: [] })) },
}))

vi.mock('../../lib/constants', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual,
  STORAGE_KEY_TOKEN: 'kc-auth-token',
} })

import { useUsers } from '../useUsers'

describe('useUsers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns expected shape', () => {
    const { result } = renderHook(() => useUsers())
    expect(result.current).toHaveProperty('isLoading')
  })
})
