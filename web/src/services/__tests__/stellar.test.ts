import { describe, it, expect, vi, beforeEach } from 'vitest'
import { api } from '../../lib/api'
import {
  stellarApi,
  getStellarState,
  getStellarNotifications,
  getStellarActions,
} from '../stellar'
import type { StellarOperationalState } from '../../types/stellar'

// Mock the API module with hoisted mock variables to resolve reference issues
const { mockApi } = vi.hoisted(() => ({
  mockApi: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  }
}))

vi.mock('../../lib/api', () => ({
  api: mockApi,
}))

// Helper to create auth errors
const makeAuthError = (msg: string) => {
  const err = new Error(msg)
  if (msg === 'UnauthenticatedError') {
    err.name = 'UnauthenticatedError'
  }
  return err
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('stellarApi — isAuthError & getState error handling', () => {
  it('getState returns safe default when api.get rejects with "Unauthenticated" message', async () => {
    const authErr = makeAuthError('Unauthenticated access')
    mockApi.get.mockRejectedValueOnce(authErr)

    const result = await stellarApi.getState()
    expect(result.clustersWatching).toEqual([])
    expect(result.unreadAlerts).toBe(0)
  })

  it('getState returns safe default when api.get rejects with "No authentication token" message', async () => {
    const authErr = makeAuthError('No authentication token in request')
    mockApi.get.mockRejectedValueOnce(authErr)

    const result = await stellarApi.getState()
    expect(result.clustersWatching).toEqual([])
    expect(result.unreadAlerts).toBe(0)
  })

  it('getState returns safe default when api.get rejects with error name "UnauthenticatedError"', async () => {
    const authErr = makeAuthError('UnauthenticatedError')
    mockApi.get.mockRejectedValueOnce(authErr)

    const result = await stellarApi.getState()
    expect(result.clustersWatching).toEqual([])
    expect(result.unreadAlerts).toBe(0)
  })

  it('getState throws when api.get rejects with non-auth error and fallbackOnError=false', async () => {
    const dbErr = new Error('Database connection failed')
    mockApi.get.mockRejectedValueOnce(dbErr)

    await expect(stellarApi.getState({ fallbackOnError: false })).rejects.toThrow('Database connection failed')
  })

  it('getState returns safe default for non-auth error when fallbackOnError=true (default)', async () => {
    const dbErr = new Error('Database connection failed')
    mockApi.get.mockRejectedValueOnce(dbErr)

    const result = await stellarApi.getState()
    expect(result.clustersWatching).toEqual([])
    expect(result.unreadAlerts).toBe(0)
  })
})

describe('stellarApi.getState', () => {
  it('returns parsed data on success', async () => {
    const mockState: StellarOperationalState = {
      generatedAt: '2026-05-27T10:00:00Z',
      clustersWatching: ['cluster-1'],
      eventCounts: { critical: 2, warning: 1, info: 5 },
      recentEvents: [],
      unreadAlerts: 3,
      activeMissionIds: ['mission-1'],
      pendingActionIds: ['action-1'],
    }
    mockApi.get.mockResolvedValueOnce({ data: mockState })

    const result = await stellarApi.getState()
    expect(result).toEqual(mockState)
    expect(mockApi.get).toHaveBeenCalledWith('/api/stellar/state', { timeout: undefined, signal: undefined })
  })

  it('passes timeout and signal options to api.get', async () => {
    const controller = new AbortController()
    mockApi.get.mockResolvedValueOnce({ data: {} })

    await stellarApi.getState({ timeout: 5000, signal: controller.signal })
    expect(mockApi.get).toHaveBeenCalledWith('/api/stellar/state', { timeout: 5000, signal: controller.signal })
  })

  it('safe default contains required fields', async () => {
    mockApi.get.mockRejectedValueOnce(new Error('Some error'))

    const result = await stellarApi.getState()
    expect(result).toHaveProperty('generatedAt')
    expect(result.clustersWatching).toEqual([])
    expect(result.eventCounts).toEqual({ critical: 0, warning: 0, info: 0 })
    expect(result.recentEvents).toEqual([])
    expect(result.unreadAlerts).toBe(0)
    expect(result.activeMissionIds).toEqual([])
    expect(result.pendingActionIds).toEqual([])
  })
})

describe('stellarApi.getNotifications', () => {
  it('returns items array on success', async () => {
    const mockNotifications = [{ id: '1', title: 'Notification 1' }]
    mockApi.get.mockResolvedValueOnce({ data: { items: mockNotifications } })

    const result = await stellarApi.getNotifications()
    expect(result).toEqual(mockNotifications)
    expect(mockApi.get).toHaveBeenCalledWith('/api/stellar/notifications?limit=50')
  })

  it('returns empty array on auth error', async () => {
    mockApi.get.mockRejectedValueOnce(makeAuthError('Unauthenticated'))

    const result = await stellarApi.getNotifications()
    expect(result).toEqual([])
  })

  it('returns empty array on non-auth error', async () => {
    mockApi.get.mockRejectedValueOnce(new Error('Internal server error'))

    const result = await stellarApi.getNotifications()
    expect(result).toEqual([])
  })

  it('appends unread=true param when unreadOnly=true', async () => {
    mockApi.get.mockResolvedValueOnce({ data: { items: [] } })

    await stellarApi.getNotifications(10, true)
    expect(mockApi.get).toHaveBeenCalledWith('/api/stellar/notifications?limit=10&unread=true')
  })

  it('returns empty array (not null) when api response has no items field — array safety', async () => {
    mockApi.get.mockResolvedValueOnce({ data: {} })

    const result = await stellarApi.getNotifications()
    expect(result).toEqual([])
  })
})

describe('stellarApi — Read endpoints (Missions, Tasks, Actions, Watches, AuditLog)', () => {
  // getMissions
  it('getMissions returns .items array from success response, and empty array on auth / non-auth error', async () => {
    const items = [{ id: 'mission-1' }]
    mockApi.get.mockResolvedValueOnce({ data: { items } })
    expect(await stellarApi.getMissions()).toEqual(items)

    mockApi.get.mockRejectedValueOnce(makeAuthError('Unauthenticated'))
    expect(await stellarApi.getMissions()).toEqual([])

    mockApi.get.mockRejectedValueOnce(new Error('Fatal'))
    expect(await stellarApi.getMissions()).toEqual([])
  })

  // getTasks
  it('getTasks returns .items array from success response, and empty array on auth / non-auth error', async () => {
    const items = [{ id: 'task-1' }]
    mockApi.get.mockResolvedValueOnce({ data: { items } })
    expect(await stellarApi.getTasks()).toEqual(items)

    mockApi.get.mockRejectedValueOnce(makeAuthError('Unauthenticated'))
    expect(await stellarApi.getTasks()).toEqual([])

    mockApi.get.mockRejectedValueOnce(new Error('Fatal'))
    expect(await stellarApi.getTasks()).toEqual([])
  })

  // getActions
  it('getActions returns .items array from success response, and empty array on auth / non-auth error', async () => {
    const items = [{ id: 'action-1' }]
    mockApi.get.mockResolvedValueOnce({ data: { items } })
    expect(await stellarApi.getActions('pending', 10)).toEqual(items)
    expect(mockApi.get).toHaveBeenCalledWith('/api/stellar/actions?limit=10&status=pending')

    mockApi.get.mockRejectedValueOnce(makeAuthError('Unauthenticated'))
    expect(await stellarApi.getActions()).toEqual([])

    mockApi.get.mockRejectedValueOnce(new Error('Fatal'))
    expect(await stellarApi.getActions()).toEqual([])
  })

  // getWatches
  it('getWatches returns .items array from success response, and empty array on auth / non-auth error', async () => {
    const items = [{ id: 'watch-1' }]
    mockApi.get.mockResolvedValueOnce({ data: { items } })
    expect(await stellarApi.getWatches()).toEqual(items)

    mockApi.get.mockRejectedValueOnce(makeAuthError('Unauthenticated'))
    expect(await stellarApi.getWatches()).toEqual([])

    mockApi.get.mockRejectedValueOnce(new Error('Fatal'))
    expect(await stellarApi.getWatches()).toEqual([])
  })

  // getAuditLog
  it('getAuditLog returns .items array from success response, and empty array on auth / non-auth error', async () => {
    const items = [{ id: 'audit-1' }]
    mockApi.get.mockResolvedValueOnce({ data: { items } })
    expect(await stellarApi.getAuditLog(5)).toEqual(items)
    expect(mockApi.get).toHaveBeenCalledWith('/api/stellar/audit?limit=5', { signal: undefined })

    mockApi.get.mockRejectedValueOnce(makeAuthError('Unauthenticated'))
    expect(await stellarApi.getAuditLog()).toEqual([])

    mockApi.get.mockRejectedValueOnce(new Error('Fatal'))
    expect(await stellarApi.getAuditLog()).toEqual([])
  })
})

describe('stellarApi — Digest & Providers fallback', () => {
  it('getDigest returns empty strings on auth error', async () => {
    mockApi.get.mockRejectedValueOnce(makeAuthError('Unauthenticated'))
    const result = await stellarApi.getDigest()
    expect(result).toEqual({ digest: '', model: '', provider: '' })
  })

  it('getProviders returns { global: [], user: [] } on auth error', async () => {
    mockApi.get.mockRejectedValueOnce(makeAuthError('Unauthenticated'))
    const result = await stellarApi.getProviders()
    expect(result).toEqual({ global: [], user: [] })
  })
})

describe('stellarApi — Write operations error propagation', () => {
  it('approveAction propagates error on api.post failure', async () => {
    const err = new Error('Action failed')
    mockApi.post.mockRejectedValueOnce(err)
    await expect(stellarApi.approveAction('id-1', 'token')).rejects.toThrow('Action failed')
  })

  it('rejectAction propagates error on api.post failure', async () => {
    const err = new Error('Reject failed')
    mockApi.post.mockRejectedValueOnce(err)
    await expect(stellarApi.rejectAction('id-1', 'reason')).rejects.toThrow('Reject failed')
  })

  it('ask propagates error on api.post failure', async () => {
    const err = new Error('AI failed')
    mockApi.post.mockRejectedValueOnce(err)
    await expect(stellarApi.ask({ prompt: 'test' })).rejects.toThrow('AI failed')
  })

  it('createTask propagates error on api.post failure', async () => {
    const err = new Error('Task creation failed')
    mockApi.post.mockRejectedValueOnce(err)
    await expect(stellarApi.createTask({ title: 'New Task' })).rejects.toThrow('Task creation failed')
  })

  it('executeAction propagates error on api.post failure', async () => {
    const err = new Error('Execution failed')
    mockApi.post.mockRejectedValueOnce(err)
    await expect(stellarApi.executeAction({ actionType: 'test', cluster: 'c1' })).rejects.toThrow('Execution failed')
  })
})

describe('Standalone wrapper functions', () => {
  it('getStellarState delegates to stellarApi.getState', async () => {
    const spy = vi.spyOn(stellarApi, 'getState').mockResolvedValueOnce({
      generatedAt: '123',
      clustersWatching: [],
      eventCounts: { critical: 0, warning: 0, info: 0 },
      recentEvents: [],
      unreadAlerts: 0,
      activeMissionIds: [],
      pendingActionIds: [],
    })

    const result = await getStellarState()
    expect(spy).toHaveBeenCalled()
    expect(result.generatedAt).toBe('123')
  })

  it('getStellarNotifications delegates to stellarApi.getNotifications', async () => {
    const spy = vi.spyOn(stellarApi, 'getNotifications').mockResolvedValueOnce([])

    await getStellarNotifications(10, true)
    expect(spy).toHaveBeenCalledWith(10, true)
  })

  it('getStellarActions delegates to stellarApi.getActions with status param', async () => {
    const spy = vi.spyOn(stellarApi, 'getActions').mockResolvedValueOnce([])

    await getStellarActions('pending', 20)
    expect(spy).toHaveBeenCalledWith('pending', 20)
  })
})
