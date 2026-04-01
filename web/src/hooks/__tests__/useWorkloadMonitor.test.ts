import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

vi.mock('../useMCP', () => ({
  usePodIssues: vi.fn(() => ({ issues: [], isLoading: false })),
  useDeploymentIssues: vi.fn(() => ({ issues: [], isLoading: false })),
  usePods: vi.fn(() => ({ pods: [], isLoading: false })),
}))

import { useWorkloadMonitor } from '../useWorkloadMonitor'

describe('useWorkloadMonitor', () => {
  it('returns expected shape', () => {
    const { result } = renderHook(() => useWorkloadMonitor())
    expect(result.current).toHaveProperty('isLoading')
  })
})
