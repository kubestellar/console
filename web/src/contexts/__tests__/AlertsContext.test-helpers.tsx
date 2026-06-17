import { afterEach, beforeEach, vi } from 'vitest'
import { act } from '@testing-library/react'
import type { ReactNode } from 'react'
import { AlertsProvider, useAlertsContext } from '../AlertsContext'
import type { Alert, AlertRule } from '../../types/alerts'

export const alertsTestState = {
  mockIsDemoMode: false,
  mockMCPData: {
    gpuNodes: [] as Array<{ cluster: string; gpuCount: number; gpuAllocated: number }>,
    podIssues: [] as Array<{ name: string; cluster?: string; namespace?: string; status?: string; restarts?: number; reason?: string; issues?: string[] }>,
    clusters: [] as Array<{ name: string; healthy?: boolean; reachable?: boolean; nodeCount?: number; server?: string; errorType?: string; errorMessage?: string; lastSeen?: string; issues?: string[] }>,
    isLoading: false,
    error: null as string | null,
  },
}

const alertsHoistedMocks = vi.hoisted(() => ({
  mockStartMission: vi.fn(() => 'mock-mission-id'),
  mockUseDemoMode: vi.fn(() => ({ isDemoMode: false })),
  mockSendNotificationWithDeepLink: vi.fn(),
}))

export const mockStartMission = alertsHoistedMocks.mockStartMission
export const mockUseDemoMode = alertsHoistedMocks.mockUseDemoMode
export const mockSendNotificationWithDeepLink = alertsHoistedMocks.mockSendNotificationWithDeepLink

vi.mock('../../hooks/mcp/shared', () => ({
  agentFetch: (...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?])),
  clusterCacheRef: { clusters: [] },
  REFRESH_INTERVAL_MS: 120_000,
  CLUSTER_POLL_INTERVAL_MS: 60_000,
  reportAgentDataError: () => {},
  reportAgentDataSuccess: () => {},
}))

vi.mock('../AlertsDataFetcher', () => ({
  __esModule: true,
  default: ({ onData }: { onData: (data: typeof alertsTestState.mockMCPData) => void }) => {
    const { useEffect } = require('react')
    useEffect(() => {
      onData(alertsTestState.mockMCPData)
    }, [onData])
    return null
  },
}))

vi.mock('../../hooks/useMissions', () => ({
  useMissions: vi.fn(() => ({ startMission: alertsHoistedMocks.mockStartMission })),
}))

vi.mock('../../hooks/useDemoMode', () => ({
  useDemoMode: alertsHoistedMocks.mockUseDemoMode,
}))

vi.mock('../../hooks/useDeepLink', () => ({
  sendNotificationWithDeepLink: alertsHoistedMocks.mockSendNotificationWithDeepLink,
}))

vi.mock('../notifications', () => ({
  shouldDispatchBrowserNotification: vi.fn(() => true),
  isClusterUnreachable: vi.fn(() => false),
  dispatchNotification: vi.fn(),
  sendNotifications: vi.fn(),
  sendBatchedNotifications: vi.fn(),
  getNotificationCooldown: vi.fn(() => 300000),
  PERSISTENT_CLUSTER_CONDITIONS: new Set(['certificate_error', 'cluster_unreachable']),
}))

vi.mock('../../lib/runbooks/builtins', () => ({
  findRunbookForCondition: vi.fn(() => undefined),
}))

vi.mock('../../lib/runbooks/executor', () => ({
  executeRunbook: vi.fn(() => Promise.resolve({ enrichedPrompt: null, stepResults: [] })),
}))

vi.mock('../../lib/utils/concurrency', () => ({
  settledWithConcurrency: vi.fn((fns: (() => Promise<unknown>)[]) => Promise.allSettled(fns.map(fn => fn()))),
}))

export function wrapper({ children }: { children: ReactNode }) {
  return <AlertsProvider>{children}</AlertsProvider>
}

export function makeAlert(overrides: Partial<Alert> = {}): Alert {
  return {
    id: overrides.id ?? `alert-${Math.random().toString(36).slice(2)}`,
    ruleId: overrides.ruleId ?? 'rule-1',
    ruleName: overrides.ruleName ?? 'Test Rule',
    severity: overrides.severity ?? 'warning',
    status: overrides.status ?? 'firing',
    message: overrides.message ?? 'Test alert message',
    details: overrides.details ?? {},
    firedAt: overrides.firedAt ?? new Date().toISOString(),
    resolvedAt: overrides.resolvedAt,
    ...overrides,
  }
}

export function makeRule(overrides: Partial<Omit<AlertRule, 'id' | 'createdAt' | 'updatedAt'>> = {}): Omit<AlertRule, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    name: overrides.name ?? 'Test Rule',
    description: overrides.description ?? 'A test rule',
    enabled: overrides.enabled ?? true,
    condition: overrides.condition ?? { type: 'gpu_usage', threshold: 90 },
    severity: overrides.severity ?? 'warning',
    channels: overrides.channels ?? [{ type: 'browser', enabled: true, config: {} }],
    aiDiagnose: overrides.aiDiagnose ?? false,
  }
}

const MCP_DATA_FLUSH_MS = 20

export async function flushTimers() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(MCP_DATA_FLUSH_MS)
    await Promise.resolve()
    await Promise.resolve()
  })
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.restoreAllMocks()
  vi.clearAllMocks()
  localStorage.clear()
  alertsTestState.mockIsDemoMode = false
  alertsTestState.mockMCPData = { gpuNodes: [], podIssues: [], clusters: [], isLoading: false, error: null }
  mockStartMission.mockReturnValue('mock-mission-id')
  mockUseDemoMode.mockImplementation(() => ({ isDemoMode: alertsTestState.mockIsDemoMode }))
  mockSendNotificationWithDeepLink.mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'debug').mockImplementation(() => {})
  vi.stubGlobal('Notification', { permission: 'granted', requestPermission: vi.fn() })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

export { AlertsProvider, useAlertsContext }
export type { Alert, AlertRule }
