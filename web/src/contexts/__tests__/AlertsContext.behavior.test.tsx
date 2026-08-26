import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { Alert, AlertRule } from '../../types/alerts'
import { useAlertsContext } from '../AlertsContext'
import { flushTimers, mockStartMission, setMockMCPData, wrapper } from './alerts-context/testUtils'

describe('AlertsContext behavior', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    localStorage.clear()
    mockStartMission.mockClear()
    setMockMCPData({ gpuNodes: [], podIssues: [], clusters: [], isLoading: false, error: null })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'debug').mockImplementation(() => {})
  })

  it('deduplicates unchanged alerts', async () => {
    const rule: AlertRule = { id: 'dedup-same', name: 'Dedup Same', description: '', enabled: true, condition: { type: 'gpu_usage', threshold: 80 }, severity: 'critical', channels: [], aiDiagnose: false, createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' }
    localStorage.setItem('kc_alert_rules', JSON.stringify([rule]))
    setMockMCPData({ gpuNodes: [{ cluster: 'gpu-cluster', gpuCount: 10, gpuAllocated: 9 }], podIssues: [], clusters: [{ name: 'gpu-cluster', healthy: true, nodeCount: 1 }], isLoading: false, error: null })
    const { result } = renderHook(() => useAlertsContext(), { wrapper })
    await flushTimers(); await act(async () => { result.current.evaluateConditions() })
    const firstCount = result.current.alerts.length
    await act(async () => { result.current.evaluateConditions() })
    expect(result.current.alerts.length).toBe(firstCount)
  })

  it('survives quota exceeded and periodic evaluation cycles', async () => {
    const alerts: Alert[] = Array.from({ length: 5 }, (_, i) => ({ id: `quota-${i}`, ruleId: 'r1', ruleName: 'A', severity: 'warning', status: 'firing', message: `alert ${i}`, details: {}, firedAt: '2024-01-01T00:00:00Z' }))
    localStorage.setItem('kc_alerts', JSON.stringify(alerts))
    const originalSetItem = localStorage.setItem.bind(localStorage)
    vi.spyOn(localStorage, 'setItem').mockImplementation((key: string, value: string) => { if (key === 'kc_alerts') throw new DOMException('quota exceeded', 'QuotaExceededError'); return originalSetItem(key, value) })
    const { result } = renderHook(() => useAlertsContext(), { wrapper })
    act(() => { result.current.deleteAlert('quota-0') })
    await act(async () => { vi.advanceTimersByTime(31100) })
    expect(result.current.isEvaluating).toBe(false)
  })
})
