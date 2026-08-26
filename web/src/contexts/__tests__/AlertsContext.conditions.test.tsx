import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAlertsContext } from '../AlertsContext'
import type { Alert, AlertRule } from '../../types/alerts'
import { flushTimers, setMockMCPData, wrapper } from './alerts-context/testUtils'

describe('AlertsContext condition evaluation', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    localStorage.clear()
    setMockMCPData({ gpuNodes: [], podIssues: [], clusters: [], isLoading: false, error: null })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'debug').mockImplementation(() => {})
  })

  it('fires and resolves memory_pressure alerts', async () => {
    const rule: AlertRule = { id: 'mp-rule', name: 'Memory Pressure', description: '', enabled: true, condition: { type: 'memory_pressure' }, severity: 'critical', channels: [], aiDiagnose: false, createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' }
    localStorage.setItem('kc_alert_rules', JSON.stringify([rule]))
    setMockMCPData({ gpuNodes: [], podIssues: [], clusters: [{ name: 'mem-cluster', healthy: true, nodeCount: 3, issues: ['MemoryPressure on worker-2'] }], isLoading: false, error: null })
    const { result } = renderHook(() => useAlertsContext(), { wrapper })
    await flushTimers(); await act(async () => { result.current.evaluateConditions() })
    expect(result.current.alerts.filter(a => a.ruleId === 'mp-rule')).toHaveLength(1)

    const firingAlert: Alert = { id: 'mp-firing', ruleId: 'mp-rule', ruleName: 'Memory Pressure', severity: 'critical', status: 'firing', message: 'MemoryPressure on worker-2', details: {}, firedAt: '2024-01-01T00:00:00Z', cluster: 'mem-cluster' }
    localStorage.setItem('kc_alerts', JSON.stringify([firingAlert]))
    setMockMCPData({ gpuNodes: [], podIssues: [], clusters: [{ name: 'mem-cluster', healthy: true, nodeCount: 3, issues: [] }], isLoading: false, error: null })
    const next = renderHook(() => useAlertsContext(), { wrapper })
    await flushTimers(); await act(async () => { next.result.current.evaluateConditions() })
    expect(next.result.current.alerts.find(a => a.id === 'mp-firing')?.status).toBe('resolved')
  })

  it('handles certificate and cluster unreachable conditions', async () => {
    const rules: AlertRule[] = [
      { id: 'cert-rule', name: 'Certificate Error', description: '', enabled: true, condition: { type: 'certificate_error' }, severity: 'critical', channels: [], aiDiagnose: false, createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
      { id: 'cu-rule', name: 'Cluster Unreachable', description: '', enabled: true, condition: { type: 'cluster_unreachable' }, severity: 'critical', channels: [], aiDiagnose: false, createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
    ]
    localStorage.setItem('kc_alert_rules', JSON.stringify(rules))
    setMockMCPData({ gpuNodes: [], podIssues: [], clusters: [{ name: 'cert-cluster', healthy: false, nodeCount: 1, errorType: 'certificate', errorMessage: 'x509: certificate expired' }, { name: 'dead-cluster', healthy: false, reachable: false, nodeCount: 0, errorType: 'timeout', errorMessage: 'dial timeout' }], isLoading: false, error: null })
    const { result } = renderHook(() => useAlertsContext(), { wrapper })
    await flushTimers(); await act(async () => { result.current.evaluateConditions() })
    expect(result.current.alerts.some(a => a.ruleId === 'cert-rule')).toBe(true)
    expect(result.current.alerts.some(a => a.ruleId === 'cu-rule')).toBe(true)
  })

  it('handles dns, pod namespace, gpu cluster and zero gpu cases', async () => {
    const rules: AlertRule[] = [
      { id: 'dns-rule', name: 'DNS Failure', description: '', enabled: true, condition: { type: 'dns_failure' }, severity: 'critical', channels: [], aiDiagnose: false, createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
      { id: 'pod-ns-rule', name: 'Pod Crash NS', description: '', enabled: true, condition: { type: 'pod_crash', threshold: 3, namespaces: ['production'] }, severity: 'warning', channels: [], aiDiagnose: false, createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
      { id: 'gpu-cluster-rule', name: 'GPU Usage Filtered', description: '', enabled: true, condition: { type: 'gpu_usage', threshold: 80, clusters: ['target-cluster'] }, severity: 'critical', channels: [], aiDiagnose: false, createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
    ]
    localStorage.setItem('kc_alert_rules', JSON.stringify(rules))
    setMockMCPData({ gpuNodes: [{ cluster: 'target-cluster', gpuCount: 10, gpuAllocated: 9 }], podIssues: [{ name: 'coredns-abc123', cluster: 'dns-cluster', namespace: 'kube-system', status: 'CrashLoopBackOff', restarts: 5, issues: ['OOMKilled'] }, { name: 'pod-in-prod', cluster: 'prod', namespace: 'production', status: 'CrashLoopBackOff', restarts: 10 }], clusters: [{ name: 'dns-cluster', healthy: true, nodeCount: 3 }, { name: 'prod', healthy: true, nodeCount: 3 }, { name: 'target-cluster', healthy: true, nodeCount: 1 }], isLoading: false, error: null })
    const { result } = renderHook(() => useAlertsContext(), { wrapper })
    await flushTimers(); await act(async () => { result.current.evaluateConditions() })
    expect(result.current.alerts.some(a => a.ruleId === 'dns-rule')).toBe(true)
    expect(result.current.alerts.some(a => a.ruleId === 'pod-ns-rule')).toBe(true)
    expect(result.current.alerts.some(a => a.ruleId === 'gpu-cluster-rule')).toBe(true)
  })
})
