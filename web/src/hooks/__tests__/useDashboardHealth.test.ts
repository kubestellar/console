import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

const mockUseAlerts = vi.fn()
const mockUseClusters = vi.fn()
const mockUsePodIssues = vi.fn()
const mockUseBackendHealth = vi.fn()
const mockUseLocalAgent = vi.fn()

vi.mock('../useAlerts', () => ({
  useAlerts: () => mockUseAlerts(),
}))

vi.mock('../useMCP', () => ({
  useClusters: () => mockUseClusters(),
  usePodIssues: () => mockUsePodIssues(),
}))

vi.mock('../useBackendHealth', () => ({
  useBackendHealth: () => mockUseBackendHealth(),
}))

vi.mock('../useLocalAgent', () => ({
  useLocalAgent: () => mockUseLocalAgent(),
}))

// Default all tests to a "connected" backend so pre-existing cases stay
// healthy. Individual tests override this for disconnected scenarios.
beforeEach(() => {
  mockUseBackendHealth.mockReturnValue({ status: 'connected' })
  mockUseLocalAgent.mockReturnValue({ status: 'connected', dataErrorCount: 0 })
})

import { useDashboardHealth } from '../useDashboardHealth'

describe('useDashboardHealth', () => {
  it('returns healthy when no alerts, clusters healthy, no pod issues', () => {
    mockUseAlerts.mockReturnValue({ activeAlerts: [] })
    mockUseClusters.mockReturnValue({ deduplicatedClusters: [{ healthy: true, reachable: true }], isLoading: false })
    mockUsePodIssues.mockReturnValue({ issues: [], isLoading: false })

    const { result } = renderHook(() => useDashboardHealth())
    expect(result.current.status).toBe('healthy')
    expect(result.current.message).toBe('All systems healthy')
    expect(result.current.criticalCount).toBe(0)
    expect(result.current.warningCount).toBe(0)
  })

  it('returns critical when critical alerts exist', () => {
    mockUseAlerts.mockReturnValue({
      activeAlerts: [
        { severity: 'critical' },
        { severity: 'critical' },
      ],
    })
    mockUseClusters.mockReturnValue({ deduplicatedClusters: [], isLoading: false })
    mockUsePodIssues.mockReturnValue({ issues: [], isLoading: false })

    const { result } = renderHook(() => useDashboardHealth())
    expect(result.current.status).toBe('critical')
    expect(result.current.criticalCount).toBe(2)
    expect(result.current.navigateTo).toBe('/alerts')
  })

  it('returns warning when warning alerts exist', () => {
    mockUseAlerts.mockReturnValue({
      activeAlerts: [{ severity: 'warning' }],
    })
    mockUseClusters.mockReturnValue({ deduplicatedClusters: [], isLoading: false })
    mockUsePodIssues.mockReturnValue({ issues: [], isLoading: false })

    const { result } = renderHook(() => useDashboardHealth())
    expect(result.current.status).toBe('warning')
    expect(result.current.warningCount).toBe(1)
  })

  it('counts unreachable clusters as critical', () => {
    mockUseAlerts.mockReturnValue({ activeAlerts: [] })
    mockUseClusters.mockReturnValue({
      deduplicatedClusters: [
        { healthy: true, reachable: true },
        { healthy: true, reachable: false },
      ],
      isLoading: false,
    })
    mockUsePodIssues.mockReturnValue({ issues: [], isLoading: false })

    const { result } = renderHook(() => useDashboardHealth())
    expect(result.current.criticalCount).toBe(1)
    expect(result.current.details).toContain('1 cluster offline')
  })

  it('counts unhealthy clusters as warning', () => {
    mockUseAlerts.mockReturnValue({ activeAlerts: [] })
    mockUseClusters.mockReturnValue({
      deduplicatedClusters: [
        { healthy: false, reachable: true },
      ],
      isLoading: false,
    })
    mockUsePodIssues.mockReturnValue({ issues: [], isLoading: false })

    const { result } = renderHook(() => useDashboardHealth())
    expect(result.current.warningCount).toBe(1)
    expect(result.current.details).toContain('1 cluster degraded')
  })

  it('counts crashing pods as warnings', () => {
    mockUseAlerts.mockReturnValue({ activeAlerts: [] })
    mockUseClusters.mockReturnValue({ deduplicatedClusters: [], isLoading: false })
    mockUsePodIssues.mockReturnValue({
      issues: [
        { reason: 'CrashLoopBackOff' },
        { reason: 'Error' },
        { reason: 'Pending' },
      ],
      isLoading: false,
    })

    const { result } = renderHook(() => useDashboardHealth())
    expect(result.current.warningCount).toBe(2)
    expect(result.current.details).toContain('2 pods failing')
  })

  it('flags disconnected backend as critical (issue #8162)', () => {
    mockUseBackendHealth.mockReturnValue({ status: 'disconnected' })
    mockUseAlerts.mockReturnValue({ activeAlerts: [] })
    mockUseClusters.mockReturnValue({ deduplicatedClusters: [], isLoading: false })
    mockUsePodIssues.mockReturnValue({ issues: [], isLoading: false })

    const { result } = renderHook(() => useDashboardHealth())
    expect(result.current.status).toBe('critical')
    expect(result.current.criticalCount).toBe(1)
    expect(result.current.details).toContain('Backend API unreachable')
    expect(result.current.navigateTo).toBe('/alerts')
  })

  it('ignores connecting backend status (not yet confirmed down)', () => {
    mockUseBackendHealth.mockReturnValue({ status: 'connecting' })
    mockUseAlerts.mockReturnValue({ activeAlerts: [] })
    mockUseClusters.mockReturnValue({ deduplicatedClusters: [{ healthy: true, reachable: true }], isLoading: false })
    mockUsePodIssues.mockReturnValue({ issues: [], isLoading: false })

    const { result } = renderHook(() => useDashboardHealth())
    expect(result.current.status).toBe('healthy')
    expect(result.current.criticalCount).toBe(0)
  })

  it('surfaces degraded local agent as page warning', () => {
    mockUseLocalAgent.mockReturnValue({ status: 'degraded', dataErrorCount: 3 })
    mockUseAlerts.mockReturnValue({ activeAlerts: [] })
    mockUseClusters.mockReturnValue({ deduplicatedClusters: [], isLoading: false })
    mockUsePodIssues.mockReturnValue({ issues: [], isLoading: false })

    const { result } = renderHook(() => useDashboardHealth())

    expect(result.current.status).toBe('warning')
    expect(result.current.message).toBe('Degraded')
    expect(result.current.details).toContain('Local agent degraded (3 errors)')
    expect(result.current.warningCount).toBe(1)
  })

  it('skips cluster/pod checks while loading', () => {
    mockUseAlerts.mockReturnValue({ activeAlerts: [] })
    mockUseClusters.mockReturnValue({
      deduplicatedClusters: [{ healthy: false, reachable: false }],
      isLoading: true,
    })
    mockUsePodIssues.mockReturnValue({
      issues: [{ reason: 'CrashLoopBackOff' }],
      isLoading: true,
    })

    const { result } = renderHook(() => useDashboardHealth())
    expect(result.current.status).toBe('healthy')
    expect(result.current.criticalCount).toBe(0)
    expect(result.current.warningCount).toBe(0)
  })
})
