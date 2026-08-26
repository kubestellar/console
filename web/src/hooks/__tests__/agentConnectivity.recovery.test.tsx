import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
vi.mock('../mcp/shared', () => ({
  agentFetch: (...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?])),
  clusterCacheRef: { clusters: [] },
  REFRESH_INTERVAL_MS: 120_000,
  CLUSTER_POLL_INTERVAL_MS: 60_000,
}))
vi.mock('../../hooks/useDemoMode', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../hooks/useDemoMode')>()),
  useDemoMode: () => ({ isDemoMode: false, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() }),
  getDemoMode: vi.fn(() => false),
  isDemoModeForced: false,
}))
vi.mock('../../lib/demoMode', () => ({
  isDemoMode: () => false,
  isNetlifyDeployment: false,
  isDemoModeForced: false,
}))
const mockEmitAgentConnected = vi.fn()
const mockEmitAgentDisconnected = vi.fn()
const mockEmitAgentProvidersDetected = vi.fn()
const mockEmitConversionStep = vi.fn()
vi.mock('../../lib/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/analytics')>()),
  emitAgentConnected: (...args: unknown[]) => mockEmitAgentConnected(...args),
  emitAgentDisconnected: (...args: unknown[]) => mockEmitAgentDisconnected(...args),
  emitAgentProvidersDetected: (...args: unknown[]) => mockEmitAgentProvidersDetected(...args),
  emitConversionStep: (...args: unknown[]) => mockEmitConversionStep(...args),
}
))
vi.mock('../../lib/utils/localStorage', () => ({
  safeGetItem: vi.fn(() => null),
  safeSetItem: vi.fn(),
}))
vi.mock('../../contexts/notifications', () => ({
  shouldDispatchBrowserNotification: vi.fn(() => false),
  isClusterUnreachable: vi.fn(() => false),
  sendNotifications: vi.fn(),
  sendBatchedNotifications: vi.fn(),
}))
vi.mock('../../contexts/alertStorage', () => ({
  ALERTS_KEY: 'kc_alerts',
  MAX_ALERTS: 500,
  loadNotifiedAlertKeys: vi.fn(() => new Map()),
  saveNotifiedAlertKeys: vi.fn(),
  loadFromStorage: vi.fn(() => []),
  saveToStorage: vi.fn(),
  saveAlerts: vi.fn(),
  STORAGE_KEY_AUTH_TOKEN: 'auth_token',
  FETCH_DEFAULT_TIMEOUT_MS: 10_000,
  DEFAULT_TEMPERATURE_THRESHOLD_F: 100,
  DEFAULT_WIND_SPEED_THRESHOLD_MPH: 40,
}))
vi.mock('../../contexts/alertRunbooks', () => ({
  findAndExecuteRunbook: vi.fn(() => Promise.resolve(null)),
}))
let useLocalAgent: typeof import('../useLocalAgent').useLocalAgent
let reportAgentDataError: typeof import('../useLocalAgent').reportAgentDataError
let reportAgentDataSuccess: typeof import('../useLocalAgent').reportAgentDataSuccess
let isAgentConnected: typeof import('../useLocalAgent').isAgentConnected
let isAgentUnavailable: typeof import('../useLocalAgent').isAgentUnavailable
let triggerAggressiveDetection: typeof import('../useLocalAgent').triggerAggressiveDetection
const POLL_INTERVAL = 5_000
const DISCONNECTED_POLL_INTERVAL = 60_000
const FAILURE_THRESHOLD = 2
const healthData = {
  status: 'ok',
  version: '1.0.0',
  clusters: 3,
  hasClaude: true,
  availableProviders: [{ name: 'claude', displayName: 'Claude', capabilities: 3 }],
}
async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
  })
}
function mockFetchOk(data = healthData) {
  ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(data),
  })
}
function mockFetchReject(msg = 'Connection refused') {
  ;(global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error(msg))
}
function mockFetchHang() {
  ;(global.fetch as ReturnType<typeof vi.fn>).mockImplementation(
    () => new Promise(() => {})
  )
}
function mockFetchStatus(status: number) {
  ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
    ok: false,
    status,
    json: () => Promise.resolve({}),
  })
}
async function driveToDisconnected() {
  mockFetchReject()
  await flushMicrotasks()
  for (let i = 1; i < FAILURE_THRESHOLD; i++) {
    await act(async () => { vi.advanceTimersByTime(POLL_INTERVAL) })
    await flushMicrotasks()
  }
}
describe('Agent Connectivity Failure Paths (#11591)', () => {
  beforeEach(async () => {
    vi.useFakeTimers()
    vi.resetModules()
    mockEmitAgentConnected.mockClear()
    mockEmitAgentDisconnected.mockClear()
    mockEmitAgentProvidersDetected.mockClear()
    mockEmitConversionStep.mockClear()
    vi.stubGlobal('fetch', vi.fn())
    const mod = await import('../useLocalAgent')
    useLocalAgent = mod.useLocalAgent
    reportAgentDataError = mod.reportAgentDataError
    reportAgentDataSuccess = mod.reportAgentDataSuccess
    isAgentConnected = mod.isAgentConnected
    isAgentUnavailable = mod.isAgentUnavailable
    triggerAggressiveDetection = mod.triggerAggressiveDetection
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })
  describe('degraded mode (health ok, data endpoints failing)', () => {
    it('3 data errors within 60s → degraded status', async () => {
      mockFetchOk()
      const { result } = renderHook(() => useLocalAgent())
      await flushMicrotasks()
      act(() => { reportAgentDataError('/clusters', 'HTTP 503') })
      act(() => { reportAgentDataError('/pods', 'HTTP 502') })
      act(() => { reportAgentDataError('/deployments', 'Timeout') })
      expect(result.current.status).toBe('degraded')
      expect(result.current.isDegraded).toBe(true)
      expect(result.current.isConnected).toBe(true)
    })
    it('isAgentConnected() returns true when degraded', async () => {
      mockFetchOk()
      renderHook(() => useLocalAgent())
      await flushMicrotasks()
      act(() => { reportAgentDataError('/a', 'err') })
      act(() => { reportAgentDataError('/b', 'err') })
      act(() => { reportAgentDataError('/c', 'err') })
      expect(isAgentConnected()).toBe(true)
    })
    it('isAgentUnavailable() returns false when degraded', async () => {
      mockFetchOk()
      renderHook(() => useLocalAgent())
      await flushMicrotasks()
      act(() => { reportAgentDataError('/a', 'err') })
      act(() => { reportAgentDataError('/b', 'err') })
      act(() => { reportAgentDataError('/c', 'err') })
      expect(isAgentUnavailable()).toBe(false)
    })
    it('data errors are tracked with timestamps and counted correctly', async () => {
      mockFetchOk()
      const { result } = renderHook(() => useLocalAgent())
      await flushMicrotasks()
      act(() => { reportAgentDataError('/ep1', 'error 1') })
      act(() => { reportAgentDataError('/ep2', 'error 2') })
      act(() => { reportAgentDataError('/ep3', 'error 3') })
      expect(result.current.dataErrorCount).toBeGreaterThanOrEqual(3)
      expect(result.current.lastDataError).toContain('/ep3')
    })
    it('data success recovers from degraded after errors age out', async () => {
      mockFetchOk()
      const { result } = renderHook(() => useLocalAgent())
      await flushMicrotasks()
      act(() => { reportAgentDataError('/a', 'err') })
      act(() => { reportAgentDataError('/b', 'err') })
      act(() => { reportAgentDataError('/c', 'err') })
      expect(result.current.status).toBe('degraded')
      mockFetchHang()
      await act(async () => { vi.advanceTimersByTime(61_000) })
      await flushMicrotasks()
      act(() => { reportAgentDataSuccess() })
      expect(result.current.status).toBe('connected')
      expect(result.current.dataErrorCount).toBe(0)
    })
    it('data errors while disconnected do not trigger degraded', async () => {
      mockFetchReject()
      const { result } = renderHook(() => useLocalAgent())
      await driveToDisconnected()
      expect(result.current.status).toBe('disconnected')
      act(() => { reportAgentDataError('/a', 'err') })
      act(() => { reportAgentDataError('/b', 'err') })
      act(() => { reportAgentDataError('/c', 'err') })
      expect(result.current.status).toBe('disconnected')
    })
  })
  describe('aggressive detection on user retry', () => {
    it('resets status to connecting during aggressive detection', async () => {
      const { result } = renderHook(() => useLocalAgent())
      await driveToDisconnected()
      expect(result.current.status).toBe('disconnected')
      await act(async () => {
        triggerAggressiveDetection()
      })
      await flushMicrotasks()
      expect(isAgentUnavailable()).toBe(false)
    })
    it('aggressive detection fires immediate health check', async () => {
      renderHook(() => useLocalAgent())
      await driveToDisconnected()
      const callsBefore = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.length
      mockFetchOk()
      await act(async () => {
        triggerAggressiveDetection()
      })
      await flushMicrotasks()
      expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(callsBefore)
    })
    it('aggressive detection uses 1s polling for burst window', async () => {
      renderHook(() => useLocalAgent())
      await driveToDisconnected()
      mockFetchReject()
      await act(async () => {
        triggerAggressiveDetection()
      })
      await flushMicrotasks()
      const callsAfterTrigger = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.length
      for (let i = 0; i < 3; i++) {
        await act(async () => { vi.advanceTimersByTime(1000) })
        await flushMicrotasks()
      }
      const callsAfter3s = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.length
      expect(callsAfter3s - callsAfterTrigger).toBeGreaterThanOrEqual(1)
    })
    it('aggressive detection falls back to slow polling after burst window', async () => {
      renderHook(() => useLocalAgent())
      await driveToDisconnected()
      mockFetchReject()
      await act(async () => {
        triggerAggressiveDetection()
      })
      await flushMicrotasks()
      await act(async () => { vi.advanceTimersByTime(11_000) })
      await flushMicrotasks()
      const callsAfterBurst = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.length
      await act(async () => { vi.advanceTimersByTime(10_000) })
      await flushMicrotasks()
      expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsAfterBurst)
    })
  })
  describe('interleaved failure types', () => {
    it('mixed connection refused and HTTP errors accumulate toward threshold', async () => {
      const { result } = renderHook(() => useLocalAgent())
      for (let i = 0; i < FAILURE_THRESHOLD; i++) {
        if (i % 2 === 0) {
          mockFetchReject('Connection refused')
        } else {
          mockFetchStatus(503)
        }
        await act(async () => { vi.advanceTimersByTime(POLL_INTERVAL) })
        await flushMicrotasks()
      }
      expect(result.current.status).toBe('disconnected')
    })
    it('a single success resets failure count entirely', async () => {
      const { result } = renderHook(() => useLocalAgent())
      mockFetchReject()
      await flushMicrotasks()
      for (let i = 1; i < FAILURE_THRESHOLD - 1; i++) {
        await act(async () => { vi.advanceTimersByTime(POLL_INTERVAL) })
        await flushMicrotasks()
      }
      expect(result.current.status).not.toBe('disconnected')
      mockFetchOk()
      await act(async () => { vi.advanceTimersByTime(POLL_INTERVAL) })
      await flushMicrotasks()
      expect(result.current.status).toBe('connected')
      mockFetchReject()
      for (let i = 0; i < FAILURE_THRESHOLD - 2; i++) {
        await act(async () => { vi.advanceTimersByTime(POLL_INTERVAL) })
        await flushMicrotasks()
      }
      expect(result.current.status).not.toBe('disconnected')
    })
  })
  describe('polling interval adaptation under failure', () => {
    it('switches to slow polling (60s) when disconnected', async () => {
      const { result } = renderHook(() => useLocalAgent())
      await driveToDisconnected()
      expect(result.current.status).toBe('disconnected')
      const callsAtDisconnect = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.length
      await act(async () => { vi.advanceTimersByTime(POLL_INTERVAL) })
      await flushMicrotasks()
      expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsAtDisconnect)
      await act(async () => { vi.advanceTimersByTime(DISCONNECTED_POLL_INTERVAL - POLL_INTERVAL) })
      await flushMicrotasks()
      expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(callsAtDisconnect)
    })
    it('restores fast polling (10s) on reconnection', async () => {
      const { result } = renderHook(() => useLocalAgent())
      await driveToDisconnected()
      mockFetchOk()
      await act(async () => { vi.advanceTimersByTime(DISCONNECTED_POLL_INTERVAL) })
      await flushMicrotasks()
      await act(async () => { vi.advanceTimersByTime(DISCONNECTED_POLL_INTERVAL) })
      await flushMicrotasks()
      expect(result.current.status).toBe('connected')
      const callsAfterReconnect = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.length
      await act(async () => { vi.advanceTimersByTime(POLL_INTERVAL) })
      await flushMicrotasks()
      expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(callsAfterReconnect)
    })
  })
  describe('connection event log', () => {
    it('logs connecting event on startup', async () => {
      mockFetchOk()
      const { result } = renderHook(() => useLocalAgent())
      await flushMicrotasks()
      const events = result.current.connectionEvents
      expect(events.some(e => e.type === 'connecting')).toBe(true)
    })
    it('logs connected event on success', async () => {
      mockFetchOk()
      const { result } = renderHook(() => useLocalAgent())
      await flushMicrotasks()
      const events = result.current.connectionEvents
      expect(events.some(e => e.type === 'connected')).toBe(true)
      expect(events.some(e => e.message.includes('Connected to local agent'))).toBe(true)
    })
    it('logs disconnected event on failure from connected state', async () => {
      mockFetchOk()
      const { result } = renderHook(() => useLocalAgent())
      await flushMicrotasks()
      mockFetchReject()
      for (let i = 0; i < FAILURE_THRESHOLD; i++) {
        await act(async () => { vi.advanceTimersByTime(POLL_INTERVAL) })
        await flushMicrotasks()
      }
      const events = result.current.connectionEvents
      expect(events.some(e => e.type === 'disconnected')).toBe(true)
      expect(events.some(e => e.message.includes('Lost connection'))).toBe(true)
    })
    it('logs error event when connecting and never succeeds', async () => {
      mockFetchReject()
      const { result } = renderHook(() => useLocalAgent())
      await driveToDisconnected()
      const events = result.current.connectionEvents
      expect(events.some(e => e.type === 'error')).toBe(true)
      expect(events.some(e => e.message.includes('not available'))).toBe(true)
    })
    it('events have timestamps', async () => {
      mockFetchOk()
      const { result } = renderHook(() => useLocalAgent())
      await flushMicrotasks()
      const events = result.current.connectionEvents
      expect(events.length).toBeGreaterThan(0)
      events.forEach(e => {
        expect(e.timestamp).toBeInstanceOf(Date)
      })
    })
    it('limits events to prevent memory growth', async () => {
      mockFetchOk()
      const { result } = renderHook(() => useLocalAgent())
      await flushMicrotasks()
      for (let cycle = 0; cycle < 30; cycle++) {
        mockFetchReject()
        for (let i = 0; i < FAILURE_THRESHOLD; i++) {
          await act(async () => { vi.advanceTimersByTime(POLL_INTERVAL) })
          await flushMicrotasks()
        }
        mockFetchOk()
        await act(async () => { vi.advanceTimersByTime(DISCONNECTED_POLL_INTERVAL) })
        await flushMicrotasks()
        await act(async () => { vi.advanceTimersByTime(DISCONNECTED_POLL_INTERVAL) })
        await flushMicrotasks()
      }
      expect(result.current.connectionEvents.length).toBeLessThanOrEqual(50)
    })
  })
  describe('install instructions', () => {
    it('provides install instructions when disconnected', async () => {
      const { result } = renderHook(() => useLocalAgent())
      await driveToDisconnected()
      expect(result.current.installInstructions).toBeDefined()
      expect(result.current.installInstructions.title).toBeTruthy()
      expect(result.current.installInstructions.steps.length).toBeGreaterThan(0)
      expect(result.current.installInstructions.benefits.length).toBeGreaterThan(0)
    })
    it('install instructions include actionable commands', async () => {
      mockFetchHang()
      const { result } = renderHook(() => useLocalAgent())
      const { steps } = result.current.installInstructions
      steps.forEach(step => {
        expect(step.title).toBeTruthy()
        expect(step.command).toBeTruthy()
      })
    })
  })
  describe('loading and error state exposure', () => {
    it('exposes connection type state to consumers', () => {
      const { result } = renderHook(() => useLocalAgent())
      expect(result.current).toHaveProperty('status')
      expect(['connected', 'disconnected', 'degraded', 'auth_error', 'connecting']).toContain(result.current.status)
    })
    it('exposes error state to consumers', () => {
      const { result } = renderHook(() => useLocalAgent())
      expect(result.current).toHaveProperty('error')
      expect(result.current.error === null || typeof result.current.error === 'string').toBe(true)
    })
  })
})
