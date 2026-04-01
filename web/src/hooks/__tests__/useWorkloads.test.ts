import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

vi.mock('../useMCP', () => ({
  usePods: vi.fn(() => ({ pods: [], isLoading: false })),
  usePodIssues: vi.fn(() => ({ issues: [], isLoading: false })),
  useDeploymentIssues: vi.fn(() => ({ issues: [], isLoading: false })),
}))

import { useWorkloads } from '../useWorkloads'

describe('useWorkloads', () => {
  it('returns expected shape', () => {
    const { result } = renderHook(() => useWorkloads())
    expect(result.current).toHaveProperty('isLoading')
  })
})
