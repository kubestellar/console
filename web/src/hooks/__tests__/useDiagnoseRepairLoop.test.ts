import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

vi.mock('../useLocalAgent', () => ({
  isAgentUnavailable: vi.fn(() => true),
}))

vi.mock('../../lib/constants', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual,
  LOCAL_AGENT_HTTP_URL: 'http://localhost:8585',
} })

vi.mock('../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual,
  FETCH_DEFAULT_TIMEOUT_MS: 10000,
} })

import { useDiagnoseRepairLoop } from '../useDiagnoseRepairLoop'

describe('useDiagnoseRepairLoop', () => {
  it('returns expected shape', () => {
    const { result } = renderHook(() => useDiagnoseRepairLoop({ monitorType: 'pod-crash' }))
    expect(result.current).toHaveProperty('isRunning')
    expect(result.current.isRunning).toBe(false)
  })
})
