import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

vi.mock('../useLocalAgent', () => ({
  isAgentUnavailable: vi.fn(() => true),
}))

vi.mock('../../lib/constants', () => ({
  LOCAL_AGENT_HTTP_URL: 'http://localhost:8585',
}))

vi.mock('../../lib/constants/network', () => ({
  FETCH_DEFAULT_TIMEOUT_MS: 10000,
}))

import { useDiagnoseRepairLoop } from '../useDiagnoseRepairLoop'

describe('useDiagnoseRepairLoop', () => {
  it('returns expected shape', () => {
    const { result } = renderHook(() => useDiagnoseRepairLoop())
    expect(result.current).toHaveProperty('isRunning')
    expect(result.current.isRunning).toBe(false)
  })
})
