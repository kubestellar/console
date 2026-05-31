import { beforeEach, describe, expect, it, vi } from 'vitest'

const STELLAR_CHAT_TIMEOUT_MS = 300_000
const STELLAR_DIGEST_WINDOW_HOURS = 24

const { mockApi } = vi.hoisted(() => ({
  mockApi: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}))

vi.mock('../../lib/api', () => ({
  api: mockApi,
}))

import { api } from '../../lib/api'
import type { StellarAction, StellarOperationalState } from '../../types/stellar'
import {
  askStellar,
  approveStellarAction,
  getStellarActions,
  getStellarDigest,
  getStellarMissions,
  getStellarNotifications,
  getStellarState,
  getStellarTasks,
  markStellarNotificationRead,
  rejectStellarAction,
  stellarApi,
} from '../stellar'

const mockGet = vi.mocked(api.get)
const mockPost = vi.mocked(api.post)
const mockDelete = vi.mocked(api.delete)

interface AuthErrorCase {
  label: string
  value: Error | string
}

const AUTH_ERROR_CASES: AuthErrorCase[] = [
  { label: 'Unauthenticated', value: new Error('Unauthenticated') },
  { label: 'No authentication token', value: new Error('No authentication token') },
  { label: 'unauthorized', value: new Error('unauthorized') },
  { label: '403', value: '403 Forbidden' },
]

function createAction(id = 'action-1'): StellarAction {
  return {
    id,
    description: 'Restart pod',
    actionType: 'restart',
    parameters: {},
    cluster: 'east',
    status: 'approved',
    createdBy: 'dev-user',
    createdAt: '2026-05-27T10:00:00Z',
  }
}

function expectSafeState(result: StellarOperationalState): void {
  expect(result.generatedAt).toEqual(expect.any(String))
  expect(result.clustersWatching).toEqual([])
  expect(result.eventCounts).toEqual({ critical: 0, warning: 0, info: 0 })
  expect(result.recentEvents).toEqual([])
  expect(result.unreadAlerts).toBe(0)
  expect(result.activeMissionIds).toEqual([])
  expect(result.pendingActionIds).toEqual([])
}

beforeEach(() => {
  vi.restoreAllMocks()
  mockGet.mockReset()
  mockPost.mockReset()
  mockDelete.mockReset()
  vi.spyOn(console, 'debug').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

describe('stellarApi auth-aware read fallbacks', () => {
  describe.each(AUTH_ERROR_CASES)('$label errors', ({ value }) => {
    it('getState returns a safe default and logs a debug message', async () => {
      mockGet.mockRejectedValueOnce(value)

      const result = await stellarApi.getState()

      expectSafeState(result)
      expect(console.debug).toHaveBeenCalledWith('stellar: getState skipped (no auth token)')
      expect(console.error).not.toHaveBeenCalled()
    })
  })

  it('getState rethrows when fallbackOnError is false', async () => {
    mockGet.mockRejectedValueOnce(new Error('Network down'))

    await expect(stellarApi.getState({ fallbackOnError: false })).rejects.toThrow('Network down')
  })

  it('getState returns a safe default for non-auth errors when fallbackOnError is true', async () => {
    mockGet.mockRejectedValueOnce(new Error('Network down'))

    const result = await stellarApi.getState()

    expectSafeState(result)
    expect(console.error).toHaveBeenCalledWith('stellar: getState failed:', expect.any(Error))
  })

  it('getDigest returns empty strings on auth errors', async () => {
    mockGet.mockRejectedValueOnce(new Error('Unauthenticated'))

    await expect(stellarApi.getDigest()).resolves.toEqual({ digest: '', model: '', provider: '' })
    expect(console.debug).toHaveBeenCalledWith('stellar: getDigest skipped (no auth token)')
  })

  it('getDigest returns empty strings on non-auth errors', async () => {
    mockGet.mockRejectedValueOnce(new Error('Network down'))

    await expect(stellarApi.getDigest()).resolves.toEqual({ digest: '', model: '', provider: '' })
    expect(console.error).toHaveBeenCalledWith('stellar: getDigest failed:', expect.any(Error))
  })

  it('getProviders returns empty collections on auth errors', async () => {
    mockGet.mockRejectedValueOnce(new Error('No authentication token'))

    await expect(stellarApi.getProviders()).resolves.toEqual({ global: [], user: [] })
    expect(console.debug).toHaveBeenCalledWith('stellar: getProviders skipped (no auth token)')
  })

  it('getProviders returns empty collections on non-auth errors', async () => {
    mockGet.mockRejectedValueOnce(new Error('Network down'))

    await expect(stellarApi.getProviders()).resolves.toEqual({ global: [], user: [] })
    expect(console.error).toHaveBeenCalledWith('stellar: getProviders failed:', expect.any(Error))
  })
})

describe('stellarApi read endpoints', () => {
  it('getState calls the state endpoint with timeout and signal options', async () => {
    const controller = new AbortController()
    const state: StellarOperationalState = {
      generatedAt: '2026-05-27T10:00:00Z',
      clustersWatching: ['cluster-a'],
      eventCounts: { critical: 1, warning: 2, info: 3 },
      recentEvents: [],
      unreadAlerts: 4,
      activeMissionIds: ['mission-1'],
      pendingActionIds: ['action-1'],
    }
    mockGet.mockResolvedValueOnce({ data: state })

    await expect(stellarApi.getState({ timeout: 5_000, signal: controller.signal })).resolves.toEqual(state)
    expect(mockGet).toHaveBeenCalledWith('/api/stellar/state', { timeout: 5_000, signal: controller.signal })
  })

  it('getNotifications calls the notifications endpoint and returns items', async () => {
    const items = [{ id: 'notification-1' }]
    mockGet.mockResolvedValueOnce({ data: { items } })

    await expect(stellarApi.getNotifications()).resolves.toEqual(items)
    expect(mockGet).toHaveBeenCalledWith('/api/stellar/notifications?limit=50')
  })

  it('getNotifications includes unread=true when requested', async () => {
    mockGet.mockResolvedValueOnce({ data: { items: [] } })

    await stellarApi.getNotifications(10, true)

    expect(mockGet).toHaveBeenCalledWith('/api/stellar/notifications?limit=10&unread=true')
  })

  it('getNotifications returns an empty array when items is missing', async () => {
    mockGet.mockResolvedValueOnce({ data: {} })

    await expect(stellarApi.getNotifications()).resolves.toEqual([])
  })

  it('getMissions calls the missions endpoint and returns items', async () => {
    const items = [{ id: 'mission-1' }]
    mockGet.mockResolvedValueOnce({ data: { items } })

    await expect(stellarApi.getMissions(25)).resolves.toEqual(items)
    expect(mockGet).toHaveBeenCalledWith('/api/stellar/missions?limit=25')
  })

  it('getActions calls the actions endpoint and returns items', async () => {
    const items = [{ id: 'action-1' }]
    mockGet.mockResolvedValueOnce({ data: { items } })

    await expect(stellarApi.getActions('pending', 10)).resolves.toEqual(items)
    expect(mockGet).toHaveBeenCalledWith('/api/stellar/actions?limit=10&status=pending')
  })

  it('getTasks calls the tasks endpoint and returns items', async () => {
    const items = [{ id: 'task-1' }]
    mockGet.mockResolvedValueOnce({ data: { items } })

    await expect(stellarApi.getTasks()).resolves.toEqual(items)
    expect(mockGet).toHaveBeenCalledWith('/api/stellar/tasks')
  })

  it('getDigest calls the digest endpoint and returns the raw digest payload', async () => {
    const payload = { digest: 'Healthy', model: 'gpt-5', provider: 'openai' }
    mockGet.mockResolvedValueOnce({ data: payload })

    await expect(stellarApi.getDigest()).resolves.toEqual(payload)
    expect(mockGet).toHaveBeenCalledWith('/api/stellar/digest')
  })

  it('getProviders calls the providers endpoint and returns the provider lists', async () => {
    const payload = {
      global: [{ name: 'openai', displayName: 'OpenAI', model: 'gpt-5', available: true, latencyMs: 120, supportsStreaming: true }],
      user: [{ id: 'cfg-1', provider: 'openai', displayName: 'Personal', model: 'gpt-5', baseUrl: 'https://example.com', isDefault: true, isActive: true, lastLatency: 120 }],
    }
    mockGet.mockResolvedValueOnce({ data: payload })

    await expect(stellarApi.getProviders()).resolves.toEqual(payload)
    expect(mockGet).toHaveBeenCalledWith('/api/stellar/providers')
  })

  it('getWatches calls the watches endpoint and returns items', async () => {
    const items = [{ id: 'watch-1' }]
    mockGet.mockResolvedValueOnce({ data: { items } })

    await expect(stellarApi.getWatches()).resolves.toEqual(items)
    expect(mockGet).toHaveBeenCalledWith('/api/stellar/watches')
  })

  it('getAuditLog passes the signal and returns items', async () => {
    const controller = new AbortController()
    const items = [{ id: 'audit-1' }]
    mockGet.mockResolvedValueOnce({ data: { items } })

    await expect(stellarApi.getAuditLog(5, controller.signal)).resolves.toEqual(items)
    expect(mockGet).toHaveBeenCalledWith('/api/stellar/audit?limit=5', { signal: controller.signal })
  })

  it('getAuditLog returns an empty array when the signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    mockGet.mockRejectedValueOnce(new Error('Request aborted'))

    await expect(stellarApi.getAuditLog(50, controller.signal)).resolves.toEqual([])
    expect(console.debug).not.toHaveBeenCalled()
    expect(console.error).not.toHaveBeenCalled()
  })

  it('listSolves calls the solves endpoint and returns items', async () => {
    const items = [{ id: 'solve-1' }]
    mockGet.mockResolvedValueOnce({ data: { items } })

    await expect(stellarApi.listSolves(12)).resolves.toEqual(items)
    expect(mockGet).toHaveBeenCalledWith('/api/stellar/solves?limit=12')
  })

  it('listActivity calls the activity endpoint and returns items', async () => {
    const items = [{ id: 'activity-1' }]
    mockGet.mockResolvedValueOnce({ data: { items } })

    await expect(stellarApi.listActivity(8)).resolves.toEqual(items)
    expect(mockGet).toHaveBeenCalledWith('/api/stellar/activity?limit=8')
  })

  const emptyArrayReaders: Array<{ name: string; read: () => Promise<unknown[]> }> = [
    { name: 'getNotifications', read: () => stellarApi.getNotifications() },
    { name: 'getMissions', read: () => stellarApi.getMissions() },
    { name: 'getActions', read: () => stellarApi.getActions() },
    { name: 'getTasks', read: () => stellarApi.getTasks() },
    { name: 'getWatches', read: () => stellarApi.getWatches() },
    { name: 'getAuditLog', read: () => stellarApi.getAuditLog() },
    { name: 'listSolves', read: () => stellarApi.listSolves() },
    { name: 'listActivity', read: () => stellarApi.listActivity() },
  ]

  it.each(emptyArrayReaders)('$name returns [] on auth errors', async ({ read }) => {
    mockGet.mockRejectedValueOnce(new Error('Unauthenticated'))

    await expect(read()).resolves.toEqual([])
  })

  it.each(emptyArrayReaders)('$name returns [] on non-auth errors when fallbackOnError stays enabled', async ({ read }) => {
    mockGet.mockRejectedValueOnce(new Error('Network down'))

    await expect(read()).resolves.toEqual([])
  })
})

describe('stellarApi write endpoints', () => {
  it('ask posts to /api/stellar/ask with the long chat timeout', async () => {
    const request = { prompt: 'What changed?', cluster: 'west', provider: 'openai', model: 'gpt-5', history: [{ role: 'user', content: 'Hello' }] }
    const response = {
      answer: 'Everything is healthy.',
      executionId: 'exec-1',
      model: 'gpt-5',
      provider: 'openai',
      providerSource: 'request' as const,
      tokens: 42,
      durationMs: 900,
      watchCreated: false,
      watchId: '',
      state: {
        generatedAt: '2026-05-27T10:00:00Z',
        clustersWatching: [],
        eventCounts: { critical: 0, warning: 0, info: 0 },
        recentEvents: [],
        unreadAlerts: 0,
        activeMissionIds: [],
        pendingActionIds: [],
      },
    }
    mockPost.mockResolvedValueOnce({ data: response })

    await expect(stellarApi.ask(request)).resolves.toEqual(response)
    expect(mockPost).toHaveBeenCalledWith('/api/stellar/ask', request, { timeout: STELLAR_CHAT_TIMEOUT_MS })
  })

  it('approveAction posts to the approve endpoint', async () => {
    const action = createAction()
    mockPost.mockResolvedValueOnce({ data: action })

    await expect(stellarApi.approveAction('action/1', 'confirm-me')).resolves.toEqual(action)
    expect(mockPost).toHaveBeenCalledWith('/api/stellar/actions/action%2F1/approve', { confirmToken: 'confirm-me' })
  })

  it('rejectAction posts to the reject endpoint', async () => {
    const action = createAction()
    mockPost.mockResolvedValueOnce({ data: action })

    await expect(stellarApi.rejectAction('action/1', 'not safe')).resolves.toEqual(action)
    expect(mockPost).toHaveBeenCalledWith('/api/stellar/actions/action%2F1/reject', { reason: 'not safe' })
  })

  it('acknowledgeNotification posts to the read endpoint', async () => {
    mockPost.mockResolvedValueOnce({})

    await expect(stellarApi.acknowledgeNotification('notification/1')).resolves.toBeUndefined()
    expect(mockPost).toHaveBeenCalledWith('/api/stellar/notifications/notification%2F1/read', {})
  })

  it('investigateNotification posts to the investigate endpoint', async () => {
    const notification = { id: 'notification-1' }
    mockPost.mockResolvedValueOnce({ data: notification })

    await expect(stellarApi.investigateNotification('notification/1', 'collect logs')).resolves.toEqual(notification)
    expect(mockPost).toHaveBeenCalledWith('/api/stellar/notifications/notification%2F1/investigate', { investigationSummary: 'collect logs' })
  })

  it('resolveNotification posts to the resolve endpoint', async () => {
    const notification = { id: 'notification-1' }
    mockPost.mockResolvedValueOnce({ data: notification })

    await expect(stellarApi.resolveNotification('notification/1', 'fixed')).resolves.toEqual(notification)
    expect(mockPost).toHaveBeenCalledWith('/api/stellar/notifications/notification%2F1/resolve', { resolutionNote: 'fixed' })
  })

  it('dismissNotification posts to the dismiss endpoint', async () => {
    const notification = { id: 'notification-1' }
    mockPost.mockResolvedValueOnce({ data: notification })

    await expect(stellarApi.dismissNotification('notification/1', 'noise')).resolves.toEqual(notification)
    expect(mockPost).toHaveBeenCalledWith('/api/stellar/notifications/notification%2F1/dismiss', { dismissalReason: 'noise' })
  })

  it('createTask posts to the task collection endpoint', async () => {
    const payload = { title: 'Investigate outage', description: 'Look at events', priority: 1 }
    const task = { id: 'task-1' }
    mockPost.mockResolvedValueOnce({ data: task })

    await expect(stellarApi.createTask(payload)).resolves.toEqual(task)
    expect(mockPost).toHaveBeenCalledWith('/api/stellar/tasks', payload)
  })

  it('updateTaskStatus posts to the task status endpoint', async () => {
    mockPost.mockResolvedValueOnce({})

    await expect(stellarApi.updateTaskStatus('task/1', 'done')).resolves.toBeUndefined()
    expect(mockPost).toHaveBeenCalledWith('/api/stellar/tasks/task%2F1/status', { status: 'done' })
  })

  it('createAction posts to the actions endpoint', async () => {
    const payload = { description: 'Restart pod', actionType: 'restart', parameters: { force: true }, cluster: 'east', namespace: 'default' }
    const action = createAction()
    mockPost.mockResolvedValueOnce({ data: action })

    await expect(stellarApi.createAction(payload)).resolves.toEqual(action)
    expect(mockPost).toHaveBeenCalledWith('/api/stellar/actions', payload)
  })

  it('executeAction posts to the execute endpoint with the long chat timeout', async () => {
    const payload = { actionType: 'summarize', cluster: 'east', prompt: 'Summarize the cluster' }
    const response = { id: 'exec-1', status: 'completed', outcome: 'ok', model: 'gpt-5', provider: 'openai', duration: 123 }
    mockPost.mockResolvedValueOnce({ data: response })

    await expect(stellarApi.executeAction(payload)).resolves.toEqual(response)
    expect(mockPost).toHaveBeenCalledWith('/api/stellar/actions/execute', payload, { timeout: STELLAR_CHAT_TIMEOUT_MS })
  })

  it('createProvider posts to the providers endpoint', async () => {
    const payload = { provider: 'openai', displayName: 'OpenAI', apiKey: 'secret', model: 'gpt-5', baseUrl: 'https://example.com' }
    const provider = { id: 'cfg-1' }
    mockPost.mockResolvedValueOnce({ data: provider })

    await expect(stellarApi.createProvider(payload)).resolves.toEqual(provider)
    expect(mockPost).toHaveBeenCalledWith('/api/stellar/providers', payload)
  })

  it('testProvider posts to the provider test endpoint', async () => {
    const response = { available: true, latencyMs: 80 }
    mockPost.mockResolvedValueOnce({ data: response })

    await expect(stellarApi.testProvider('cfg/1')).resolves.toEqual(response)
    expect(mockPost).toHaveBeenCalledWith('/api/stellar/providers/cfg%2F1/test', {})
  })

  it('deleteProvider deletes the provider endpoint', async () => {
    mockDelete.mockResolvedValueOnce({})

    await expect(stellarApi.deleteProvider('cfg/1')).resolves.toBeUndefined()
    expect(mockDelete).toHaveBeenCalledWith('/api/stellar/providers/cfg%2F1')
  })

  it('setDefaultProvider posts to the default provider endpoint', async () => {
    mockPost.mockResolvedValueOnce({})

    await expect(stellarApi.setDefaultProvider('cfg/1')).resolves.toBeUndefined()
    expect(mockPost).toHaveBeenCalledWith('/api/stellar/providers/cfg%2F1/default', {})
  })

  it('resolveWatch posts to the resolve watch endpoint', async () => {
    mockPost.mockResolvedValueOnce({})

    await expect(stellarApi.resolveWatch('watch/1')).resolves.toBeUndefined()
    expect(mockPost).toHaveBeenCalledWith('/api/stellar/watches/watch%2F1/resolve', {})
  })

  it('dismissWatch deletes the watch endpoint', async () => {
    mockDelete.mockResolvedValueOnce({})

    await expect(stellarApi.dismissWatch('watch/1')).resolves.toBeUndefined()
    expect(mockDelete).toHaveBeenCalledWith('/api/stellar/watches/watch%2F1')
  })

  it('snoozeWatch posts to the snooze watch endpoint', async () => {
    mockPost.mockResolvedValueOnce({})

    await expect(stellarApi.snoozeWatch('watch/1', 15)).resolves.toBeUndefined()
    expect(mockPost).toHaveBeenCalledWith('/api/stellar/watches/watch%2F1/snooze', { minutes: 15 })
  })

  it('startSolve posts to the solve endpoint', async () => {
    const response = { solveId: 'solve-1', status: 'running', existing: false }
    mockPost.mockResolvedValueOnce({ data: response })

    await expect(stellarApi.startSolve('event-1')).resolves.toEqual(response)
    expect(mockPost).toHaveBeenCalledWith('/api/stellar/solve/event-1')
  })

  it('write methods propagate errors instead of swallowing them', async () => {
    mockPost.mockRejectedValueOnce(new Error('approve failed'))
    await expect(stellarApi.approveAction('action-1')).rejects.toThrow('approve failed')

    mockPost.mockRejectedValueOnce(new Error('reject failed'))
    await expect(stellarApi.rejectAction('action-1', 'no')).rejects.toThrow('reject failed')

    mockPost.mockRejectedValueOnce(new Error('ask failed'))
    await expect(stellarApi.ask({ prompt: 'Why?' })).rejects.toThrow('ask failed')
  })
})

describe('stellar.ts standalone exports', () => {
  it('getStellarState delegates to stellarApi.getState', async () => {
    const state: StellarOperationalState = {
      generatedAt: '2026-05-27T10:00:00Z',
      clustersWatching: [],
      eventCounts: { critical: 0, warning: 0, info: 0 },
      recentEvents: [],
      unreadAlerts: 0,
      activeMissionIds: [],
      pendingActionIds: [],
    }
    vi.spyOn(stellarApi, 'getState').mockResolvedValueOnce(state)

    await expect(getStellarState()).resolves.toEqual(state)
    expect(stellarApi.getState).toHaveBeenCalledWith()
  })

  it('getStellarNotifications delegates to stellarApi.getNotifications', async () => {
    vi.spyOn(stellarApi, 'getNotifications').mockResolvedValueOnce([])

    await getStellarNotifications(10, true)

    expect(stellarApi.getNotifications).toHaveBeenCalledWith(10, true)
  })

  it('markStellarNotificationRead delegates to stellarApi.acknowledgeNotification', async () => {
    vi.spyOn(stellarApi, 'acknowledgeNotification').mockResolvedValueOnce(undefined)

    await markStellarNotificationRead('notification-1')

    expect(stellarApi.acknowledgeNotification).toHaveBeenCalledWith('notification-1')
  })

  it('getStellarMissions delegates to stellarApi.getMissions', async () => {
    vi.spyOn(stellarApi, 'getMissions').mockResolvedValueOnce([])

    await getStellarMissions(12)

    expect(stellarApi.getMissions).toHaveBeenCalledWith(12)
  })

  it('getStellarActions delegates to stellarApi.getActions', async () => {
    vi.spyOn(stellarApi, 'getActions').mockResolvedValueOnce([])

    await getStellarActions('pending', 20)

    expect(stellarApi.getActions).toHaveBeenCalledWith('pending', 20)
  })

  it('getStellarTasks delegates to stellarApi.getTasks', async () => {
    vi.spyOn(stellarApi, 'getTasks').mockResolvedValueOnce([])

    await getStellarTasks()

    expect(stellarApi.getTasks).toHaveBeenCalledWith()
  })

  it('approveStellarAction delegates to stellarApi.approveAction', async () => {
    vi.spyOn(stellarApi, 'approveAction').mockResolvedValueOnce(createAction())

    await approveStellarAction('action-1', 'confirm-me')

    expect(stellarApi.approveAction).toHaveBeenCalledWith('action-1', 'confirm-me')
  })

  it('rejectStellarAction delegates to stellarApi.rejectAction', async () => {
    vi.spyOn(stellarApi, 'rejectAction').mockResolvedValueOnce(createAction())

    await rejectStellarAction('action-1', 'unsafe')

    expect(stellarApi.rejectAction).toHaveBeenCalledWith('action-1', 'unsafe')
  })

  it('askStellar delegates to stellarApi.ask', async () => {
    const response = {
      answer: 'All good',
      executionId: 'exec-1',
      model: 'gpt-5',
      provider: 'openai',
      providerSource: 'request' as const,
      tokens: 7,
      durationMs: 40,
      watchCreated: false,
      watchId: '',
      state: {
        generatedAt: '2026-05-27T10:00:00Z',
        clustersWatching: [],
        eventCounts: { critical: 0, warning: 0, info: 0 },
        recentEvents: [],
        unreadAlerts: 0,
        activeMissionIds: [],
        pendingActionIds: [],
      },
    }
    vi.spyOn(stellarApi, 'ask').mockResolvedValueOnce(response)

    await askStellar('What changed?', 'west')

    expect(stellarApi.ask).toHaveBeenCalledWith({ prompt: 'What changed?', cluster: 'west' })
  })

  it('getStellarDigest maps the raw digest into a StellarDigest payload', async () => {
    vi.spyOn(stellarApi, 'getDigest').mockResolvedValueOnce({ digest: 'Healthy', model: 'gpt-5', provider: 'openai' })

    const result = await getStellarDigest()

    expect(result).toEqual({
      generatedAt: expect.any(String),
      windowHours: STELLAR_DIGEST_WINDOW_HOURS,
      overallHealth: 'Healthy',
      incidents: [],
      changes: [],
      recommendedActions: [],
    })
  })
})
