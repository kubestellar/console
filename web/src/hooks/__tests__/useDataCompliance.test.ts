import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

vi.mock('../useMCP', () => ({
  useClusters: vi.fn(() => ({ clusters: [], isLoading: false })),
}))

vi.mock('../useDemoMode', () => ({
  useDemoMode: vi.fn(() => ({ isDemoMode: true })),
}))

vi.mock('../useCertManager', () => ({
  useCertManager: vi.fn(() => ({
    status: { installed: false, totalCertificates: 0, validCertificates: 0, expiringSoon: 0, expired: 0 },
    isLoading: false,
  })),
}))

vi.mock('../../lib/kubectlProxy', () => ({
  kubectlProxy: { exec: vi.fn() },
}))

vi.mock('../../lib/utils/concurrency', () => ({
  settledWithConcurrency: vi.fn(),
}))

vi.mock('../../lib/modeTransition', () => ({
  registerRefetch: vi.fn(() => vi.fn()),
  registerCacheReset: vi.fn(),
  unregisterCacheReset: vi.fn(),
}))

import { useDataCompliance } from '../useDataCompliance'

describe('useDataCompliance', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('returns demo posture in demo mode', () => {
    const { result } = renderHook(() => useDataCompliance())
    expect(result.current.posture).toHaveProperty('totalSecrets')
    expect(result.current.posture).toHaveProperty('rbacPolicies')
    expect(result.current.isDemoData).toBe(true)
  })

  it('returns compliance scores', () => {
    const { result } = renderHook(() => useDataCompliance())
    expect(result.current.scores).toHaveProperty('overallScore')
    expect(result.current.scores).toHaveProperty('encryptionScore')
    expect(result.current.scores).toHaveProperty('rbacScore')
    expect(result.current.scores).toHaveProperty('certScore')
  })

  it('refetch is callable', () => {
    const { result } = renderHook(() => useDataCompliance())
    expect(typeof result.current.refetch).toBe('function')
  })
})
