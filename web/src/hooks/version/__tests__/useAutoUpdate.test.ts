/**
 * Tests for hooks/version/useAutoUpdate.ts
 *
 * Covers all branches of the four exported async functions:
 * - fetchAutoUpdateStatus: agent unavailable, ok response, non-ok response, network error
 * - syncAutoUpdateConfig: success, catch (silently ignored)
 * - triggerUpdate: success, 404, other non-ok, Error catch, non-Error catch, channel sent
 * - cancelUpdate: success, 409, 404, other non-ok, Error catch, non-Error catch
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing the module under test
// ---------------------------------------------------------------------------

vi.mock('../../../lib/constants/network', () => ({
  FETCH_DEFAULT_TIMEOUT_MS: 10_000,
}))

const mockAuthFetch = vi.fn()
vi.mock('../../../lib/api', () => ({
  authFetch: (...args: unknown[]) => mockAuthFetch(...args),
}))

const mockSafeJsonParse = vi.fn()
vi.mock('../../versionUtils', () => ({
  TRIGGER_UPDATE_TIMEOUT_MS: 30_000,
  CANCEL_UPDATE_TIMEOUT_MS: 5_000,
  safeJsonParse: (...args: unknown[]) => mockSafeJsonParse(...args),
}))

import {
  fetchAutoUpdateStatus,
  syncAutoUpdateConfig,
  triggerUpdate,
  cancelUpdate,
} from '../useAutoUpdate'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeOkResponse(body: unknown = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function makeResponse(status: number): Response {
  return new Response('{}', { status })
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// fetchAutoUpdateStatus
// ---------------------------------------------------------------------------

describe('fetchAutoUpdateStatus — agent not supported', () => {
  it('returns failure immediately when agentSupportsAutoUpdate is false', async () => {
    const result = await fetchAutoUpdateStatus(false)

    expect(result.success).toBe(false)
    expect(result.errorMessage).toBe('Could not reach kc-agent')
    expect(mockAuthFetch).not.toHaveBeenCalled()
  })
})

describe('fetchAutoUpdateStatus — network paths', () => {
  it('returns success with parsed data on ok response', async () => {
    const statusData = { phase: 'idle', channel: 'stable' }
    mockSafeJsonParse.mockResolvedValue(statusData)
    mockAuthFetch.mockResolvedValue(makeOkResponse())

    const result = await fetchAutoUpdateStatus(true)

    expect(result.success).toBe(true)
    expect(result.data).toEqual(statusData)
    expect(mockAuthFetch).toHaveBeenCalledWith(
      '/api/agent/auto-update/status',
      expect.objectContaining({ credentials: 'include' }),
    )
  })

  it('returns failure with status code on non-ok response', async () => {
    mockAuthFetch.mockResolvedValue(makeResponse(503))

    const result = await fetchAutoUpdateStatus(true)

    expect(result.success).toBe(false)
    expect(result.errorMessage).toBe('kc-agent returned 503')
  })

  it('returns failure with generic message on network error', async () => {
    mockAuthFetch.mockRejectedValue(new Error('timeout'))

    const result = await fetchAutoUpdateStatus(true)

    expect(result.success).toBe(false)
    expect(result.errorMessage).toBe('Could not reach kc-agent')
  })
})

// ---------------------------------------------------------------------------
// syncAutoUpdateConfig
// ---------------------------------------------------------------------------

describe('syncAutoUpdateConfig', () => {
  it('sends POST to /api/agent/auto-update/config with enabled and channel', async () => {
    mockAuthFetch.mockResolvedValue(makeOkResponse())

    await syncAutoUpdateConfig(true, 'stable')

    expect(mockAuthFetch).toHaveBeenCalledWith(
      '/api/agent/auto-update/config',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ enabled: true, channel: 'stable' }),
      }),
    )
  })

  it('works with enabled=false and unstable channel', async () => {
    mockAuthFetch.mockResolvedValue(makeOkResponse())

    await syncAutoUpdateConfig(false, 'unstable')

    const [, opts] = mockAuthFetch.mock.calls[0]
    expect(JSON.parse(opts.body as string)).toEqual({ enabled: false, channel: 'unstable' })
  })

  it('silently ignores network errors (agent may not be available)', async () => {
    mockAuthFetch.mockRejectedValue(new Error('Agent offline'))

    await expect(syncAutoUpdateConfig(false, 'stable')).resolves.toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// triggerUpdate
// ---------------------------------------------------------------------------

describe('triggerUpdate', () => {
  it('returns success on ok response', async () => {
    mockAuthFetch.mockResolvedValue(makeOkResponse())

    const result = await triggerUpdate('stable')

    expect(result.success).toBe(true)
    expect(result.error).toBeUndefined()
  })

  it('sends correct channel in request body', async () => {
    mockAuthFetch.mockResolvedValue(makeOkResponse())

    await triggerUpdate('unstable')

    expect(mockAuthFetch).toHaveBeenCalledWith(
      '/api/agent/auto-update/trigger',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ channel: 'unstable' }),
      }),
    )
  })

  it('returns descriptive error on 404 (agent does not support auto-update)', async () => {
    mockAuthFetch.mockResolvedValue(makeResponse(404))

    const result = await triggerUpdate('stable')

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/does not support auto-update/)
  })

  it('returns status error on other non-ok response', async () => {
    mockAuthFetch.mockResolvedValue(makeResponse(500))

    const result = await triggerUpdate('unstable')

    expect(result.success).toBe(false)
    expect(result.error).toBe('kc-agent returned 500')
  })

  it('returns error message from caught Error', async () => {
    mockAuthFetch.mockRejectedValue(new Error('connection refused'))

    const result = await triggerUpdate('stable')

    expect(result.success).toBe(false)
    expect(result.error).toBe('connection refused')
  })

  it('returns generic message for non-Error thrown values', async () => {
    mockAuthFetch.mockRejectedValue('unexpected string')

    const result = await triggerUpdate('stable')

    expect(result.success).toBe(false)
    expect(result.error).toBe('kc-agent not reachable')
  })
})

// ---------------------------------------------------------------------------
// cancelUpdate
// ---------------------------------------------------------------------------

describe('cancelUpdate', () => {
  it('returns success on ok response', async () => {
    mockAuthFetch.mockResolvedValue(makeOkResponse())

    const result = await cancelUpdate()

    expect(result.success).toBe(true)
    expect(result.error).toBeUndefined()
  })

  it('sends POST to /api/agent/auto-update/cancel', async () => {
    mockAuthFetch.mockResolvedValue(makeOkResponse())

    await cancelUpdate()

    expect(mockAuthFetch).toHaveBeenCalledWith(
      '/api/agent/auto-update/cancel',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('returns specific error on 409 (no update in progress)', async () => {
    mockAuthFetch.mockResolvedValue(makeResponse(409))

    const result = await cancelUpdate()

    expect(result.success).toBe(false)
    expect(result.error).toBe('No update in progress')
  })

  it('returns descriptive error on 404 (agent does not support cancel)', async () => {
    mockAuthFetch.mockResolvedValue(makeResponse(404))

    const result = await cancelUpdate()

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/does not support cancel/)
  })

  it('returns status error on other non-ok response', async () => {
    mockAuthFetch.mockResolvedValue(makeResponse(503))

    const result = await cancelUpdate()

    expect(result.success).toBe(false)
    expect(result.error).toBe('kc-agent returned 503')
  })

  it('returns error message from caught Error', async () => {
    mockAuthFetch.mockRejectedValue(new Error('connection refused'))

    const result = await cancelUpdate()

    expect(result.success).toBe(false)
    expect(result.error).toBe('connection refused')
  })

  it('returns generic message for non-Error thrown values', async () => {
    mockAuthFetch.mockRejectedValue(42)

    const result = await cancelUpdate()

    expect(result.success).toBe(false)
    expect(result.error).toBe('kc-agent not reachable')
  })
})
