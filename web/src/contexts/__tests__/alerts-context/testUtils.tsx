import React from 'react'
import { act } from '@testing-library/react'
import { vi } from 'vitest'
import type { ReactNode } from 'react'

export const mockStartMission = vi.fn(() => 'mission-123')
let mockMCPDataInternal = { gpuNodes: [], podIssues: [], clusters: [], isLoading: false, error: null } as {
  gpuNodes: Array<{ cluster: string; gpuCount: number; gpuAllocated: number }>
  podIssues: Array<{ name: string; cluster?: string; namespace?: string; status?: string; restarts?: number; reason?: string; issues?: string[] }>
  clusters: Array<{ name: string; healthy?: boolean; reachable?: boolean; nodeCount?: number; server?: string; errorType?: string; errorMessage?: string; lastSeen?: string; issues?: string[] }>
  isLoading: boolean
  error: string | null
}

export function setMockMCPData(value: typeof mockMCPDataInternal) { mockMCPDataInternal = value }
export function getMockMCPData() { return mockMCPDataInternal }

vi.mock('../../hooks/useMissions', () => ({ useMissions: () => ({ startMission: mockStartMission }) }))
vi.mock('../../hooks/useDemoMode', async importOriginal => ({ ...(await importOriginal<typeof import('../../hooks/useDemoMode')>()), useDemoMode: () => ({ isDemoMode: false, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() }), getDemoMode: vi.fn(() => false) }))
vi.mock('../../hooks/useDeepLink', () => ({ sendNotificationWithDeepLink: vi.fn() }))
vi.mock('../notifications', () => ({ shouldDispatchBrowserNotification: vi.fn(() => true), isClusterUnreachable: vi.fn(() => false), dispatchNotification: vi.fn(), sendNotifications: vi.fn(), sendBatchedNotifications: vi.fn(), getNotificationCooldown: vi.fn(() => 300000), PERSISTENT_CLUSTER_CONDITIONS: new Set(['certificate_error', 'cluster_unreachable']) }))
vi.mock('../../lib/runbooks/builtins', () => ({ findRunbookForCondition: vi.fn(() => undefined) }))
vi.mock('../../lib/runbooks/executor', () => ({ executeRunbook: vi.fn(() => Promise.resolve({ enrichedPrompt: null, stepResults: [] })) }))
vi.mock('../../lib/utils/concurrency', () => ({ settledWithConcurrency: vi.fn((fns: (() => Promise<unknown>)[]) => Promise.allSettled(fns.map(fn => fn()))) }))
vi.mock('../AlertsDataFetcher', () => ({ __esModule: true, default: ({ onData }: { onData: (d: typeof mockMCPDataInternal) => void }) => { const { useEffect } = require('react'); useEffect(() => { onData(mockMCPDataInternal) }, [onData]); return null } }))

import { AlertsProvider } from '../AlertsContext'
export function wrapper({ children }: { children: ReactNode }) { return <AlertsProvider>{children}</AlertsProvider> }
export const MCP_DATA_FLUSH_MS = 20
export async function flushTimers() { await act(async () => { await vi.advanceTimersByTimeAsync(MCP_DATA_FLUSH_MS); await Promise.resolve(); await Promise.resolve() }) }
