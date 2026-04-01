import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

const mockUseAlerts = vi.fn()
const mockUseClusters = vi.fn()
const mockUsePodIssues = vi.fn()

vi.mock('../useAlerts', () => ({
  useAlerts: () => mockUseAlerts(),
}))

vi.mock('../useMCP', () => ({
  useClusters: () => mockUseClusters(),
  usePodIssues: () => mockUsePodIssues(),
}))

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
