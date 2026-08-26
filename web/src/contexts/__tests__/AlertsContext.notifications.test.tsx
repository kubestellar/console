import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { AlertRule } from '../../types/alerts'
import { useAlertsContext } from '../AlertsContext'
import { flushTimers, setMockMCPData, wrapper } from './alerts-context/testUtils'

describe('AlertsContext notifications', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    localStorage.clear()
    setMockMCPData({ gpuNodes: [], podIssues: [], clusters: [], isLoading: false, error: null })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'debug').mockImplementation(() => {})
  })

  it('sends browser notification for disk pressure', async () => {
    const { sendNotificationWithDeepLink: mockSendNotif } = await import('../../hooks/useDeepLink')
    const rule: AlertRule = { id: 'dp-notif-rule', name: 'Disk Pressure Notif', description: '', enabled: true, condition: { type: 'disk_pressure' }, severity: 'critical', channels: [{ type: 'browser', enabled: true, config: {} }], aiDiagnose: false, createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' }
    localStorage.setItem('kc_alert_rules', JSON.stringify([rule]))
    setMockMCPData({ gpuNodes: [], podIssues: [], clusters: [{ name: 'dp-cluster', healthy: true, nodeCount: 2, issues: ['DiskPressure on worker-node-1'] }], isLoading: false, error: null })
    const { result } = renderHook(() => useAlertsContext(), { wrapper })
    await flushTimers(); await act(async () => { result.current.evaluateConditions() })
    expect(mockSendNotif).toHaveBeenCalled()
  })
})
