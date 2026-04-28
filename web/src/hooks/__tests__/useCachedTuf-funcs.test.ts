/**
 * Tests for the pure helper functions and fetcher function exported via
 * __testables / useCache capture from useCachedTuf.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { mockAuthFetch, mockUseCache } = vi.hoisted(() => ({
  mockAuthFetch: vi.fn(),
  mockUseCache: vi.fn(() => ({
    data: null,
    isLoading: false,
    isRefreshing: false,
    isDemoFallback: false,
    error: null,
    isFailed: false,
    consecutiveFailures: 0,
    lastRefresh: null,
    refetch: vi.fn(),
  })),
}))
vi.mock('../../lib/api', () => ({
    createCachedHook: vi.fn(), authFetch: mockAuthFetch }))
vi.mock('../../lib/cache', () => ({
    createCachedHook: vi.fn(), useCache: (...args: unknown[]) => mockUseCache(...args), createCachedHook: (_config: unknown) => () => mockUseCache(_config) }))

vi.mock('../../lib/constants/network', () => ({
    createCachedHook: vi.fn(),
  FETCH_DEFAULT_TIMEOUT_MS: 5000,
}))

vi.mock('../../lib/constants/time', () => ({
    createCachedHook: vi.fn(),
  MS_PER_DAY: 86400000,
}))

import { useCachedTuf, __testables } from '../useCachedTuf'

const {
  deriveStatus,
  summarize,
  deriveHealth,
  buildTufStatus,
  EXPIRING_SOON_WINDOW_MS,
} = __testables

// ---------------------------------------------------------------------------
// deriveStatus
// ---------------------------------------------------------------------------

describe('deriveStatus', () => {
  it('returns unsigned when role status is unsigned', () => {
    const role = { name: 'targets', status: 'unsigned' as const, version: 1, expiresAt: '2099-01-01T00:00:00Z', signedAt: '2024-01-01T00:00:00Z', keyId: 'abc' }
    expect(deriveStatus(role, Date.now())).toBe('unsigned')
  })

  it('returns expired when expiresAt is in the past', () => {
    const role = { name: 'root', status: 'signed' as const, version: 1, expiresAt: '2020-01-01T00:00:00Z', signedAt: '2019-01-01T00:00:00Z', keyId: 'abc' }
    expect(deriveStatus(role, Date.now())).toBe('expired')
  })

  it('returns expiring-soon when within the window', () => {
    const soonMs = Date.now() + EXPIRING_SOON_WINDOW_MS / 2
    const role = { name: 'snapshot', status: 'signed' as const, version: 1, expiresAt: new Date(soonMs).toISOString(), signedAt: '2024-01-01T00:00:00Z', keyId: 'abc' }
    expect(deriveStatus(role, Date.now())).toBe('expiring-soon')
  })

  it('returns signed when expiry is far in the future', () => {
    const role = { name: 'timestamp', status: 'signed' as const, version: 1, expiresAt: '2099-01-01T00:00:00Z', signedAt: '2024-01-01T00:00:00Z', keyId: 'abc' }
    expect(deriveStatus(role, Date.now())).toBe('signed')
  })
})

// ---------------------------------------------------------------------------
// summarize
// ---------------------------------------------------------------------------

describe('summarize (tuf)', () => {
  it('returns zeros for empty roles', () => {
    const result = summarize([])
    expect(result.totalRoles).toBe(0)
    expect(result.signedRoles).toBe(0)
    expect(result.expiredRoles).toBe(0)
    expect(result.expiringSoonRoles).toBe(0)
  })

  it('counts roles by status', () => {
    const roles = [
      { name: 'root', status: 'signed' as const, version: 1, expiresAt: '', signedAt: '', keyId: '' },
      { name: 'targets', status: 'expired' as const, version: 1, expiresAt: '', signedAt: '', keyId: '' },
      { name: 'snapshot', status: 'expiring-soon' as const, version: 1, expiresAt: '', signedAt: '', keyId: '' },
    ]
    const result = summarize(roles)
    expect(result.totalRoles).toBe(3)
    expect(result.signedRoles).toBe(1)
    expect(result.expiredRoles).toBe(1)
    expect(result.expiringSoonRoles).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// deriveHealth
// ---------------------------------------------------------------------------

describe('deriveHealth (tuf)', () => {
  it('returns not-installed for empty roles', () => {
    expect(deriveHealth([])).toBe('not-installed')
  })

  it('returns healthy when all roles are signed', () => {
    const roles = [
      { name: 'root', status: 'signed' as const, version: 1, expiresAt: '', signedAt: '', keyId: '' },
    ]
    expect(deriveHealth(roles)).toBe('healthy')
  })

  it('returns degraded when any role is expired', () => {
    const roles = [
      { name: 'root', status: 'signed' as const, version: 1, expiresAt: '', signedAt: '', keyId: '' },
      { name: 'targets', status: 'expired' as const, version: 1, expiresAt: '', signedAt: '', keyId: '' },
    ]
    expect(deriveHealth(roles)).toBe('degraded')
  })

  it('returns degraded when any role is expiring-soon', () => {
    const roles = [
      { name: 'root', status: 'expiring-soon' as const, version: 1, expiresAt: '', signedAt: '', keyId: '' },
    ]
    expect(deriveHealth(roles)).toBe('degraded')
  })
})

// ---------------------------------------------------------------------------
// buildTufStatus
// ---------------------------------------------------------------------------

describe('buildTufStatus', () => {
  it('builds full status with roles', () => {
    const roles = [
      { name: 'root', status: 'signed' as const, version: 1, expiresAt: '2099-01-01T00:00:00Z', signedAt: '2024-01-01T00:00:00Z', keyId: 'abc' },
    ]
    const result = buildTufStatus(roles, '1.0.31', 'https://tuf.example.com')
    expect(result.health).toBe('healthy')
    expect(result.specVersion).toBe('1.0.31')
    expect(result.repository).toBe('https://tuf.example.com')
    expect(result.roles).toHaveLength(1)
    expect(result.lastCheckTime).toBeTruthy()
  })

  it('returns not-installed for empty roles', () => {
    const result = buildTufStatus([], 'unknown', '')
    expect(result.health).toBe('not-installed')
    expect(result.summary.totalRoles).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Fetcher (via useCache capture)
// ---------------------------------------------------------------------------

describe('fetchTufStatus (fetcher)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function captureFetcher(): () => Promise<unknown> {
    renderHook(() => useCachedTuf())
    const config = mockUseCache.mock.calls[0]?.[0] as { fetcher: () => Promise<unknown> }
    return config.fetcher
  }

  it('returns parsed data on success', async () => {
    const validResponse = {
      specVersion: '1.0.31',
      repository: 'https://tuf.example.com',
      roles: [
        { name: 'root', status: 'signed', version: 1, expiresAt: '2099-01-01T00:00:00Z', signedAt: '2024-01-01T00:00:00Z', keyId: 'abc' },
      ],
    }
    mockAuthFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(validResponse),
    })

    const fetcher = captureFetcher()
    const result = await fetcher() as { health: string; specVersion: string; roles: unknown[] }
    expect(result.health).toBe('healthy')
    expect(result.specVersion).toBe('1.0.31')
    expect(result.roles).toHaveLength(1)
  })

  it('returns not-installed for 404 status', async () => {
    mockAuthFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
    })

    const fetcher = captureFetcher()
    const result = await fetcher() as { health: string }
    expect(result.health).toBe('not-installed')
  })

  it('returns not-installed for 401 status', async () => {
    mockAuthFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
    })

    const fetcher = captureFetcher()
    const result = await fetcher() as { health: string }
    expect(result.health).toBe('not-installed')
  })

  it('returns not-installed for 503 status', async () => {
    mockAuthFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
    })

    const fetcher = captureFetcher()
    const result = await fetcher() as { health: string }
    expect(result.health).toBe('not-installed')
  })

  it('throws on non-whitelisted error status', async () => {
    mockAuthFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    })

    const fetcher = captureFetcher()
    await expect(fetcher()).rejects.toThrow('HTTP 500')
  })

  it('throws on network error', async () => {
    mockAuthFetch.mockRejectedValueOnce(new Error('Network error'))

    const fetcher = captureFetcher()
    await expect(fetcher()).rejects.toThrow('Network error')
  })

  it('returns not-installed when JSON parse fails', async () => {
    mockAuthFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.reject(new SyntaxError('Unexpected token <')),
    })

    const fetcher = captureFetcher()
    const result = await fetcher() as { health: string }
    expect(result.health).toBe('not-installed')
  })
})
