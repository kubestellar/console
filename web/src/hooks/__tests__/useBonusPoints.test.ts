import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Hoisted mock factories
// ---------------------------------------------------------------------------

const { mockUseAuth } = vi.hoisted(() => ({
  mockUseAuth: vi.fn(() => ({
    user: null as { github_login: string } | null,
    isAuthenticated: false,
  })),
}))

vi.mock('../../lib/auth', () => ({
  useAuth: () => mockUseAuth(),
}))

vi.mock('../../lib/constants', () => ({
  BACKEND_DEFAULT_URL: 'http://localhost:8080',
}))

vi.mock('../../lib/constants/network', () => ({
  FETCH_DEFAULT_TIMEOUT_MS: 5000,
}))

import { useBonusPoints } from '../useBonusPoints'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CACHE_KEY_PREFIX = 'bonus-points-cache'

function setCachedBonus(login: string, data: object, offset = 0) {
  localStorage.setItem(
    `${CACHE_KEY_PREFIX}:${login}`,
    JSON.stringify({ data, storedAt: Date.now() - offset }),
  )
}

function mockFetchBonus(data: object, status = 200) {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  })
}

function authenticatedUser(login = 'alice') {
  mockUseAuth.mockReturnValue({
    user: { github_login: login },
    isAuthenticated: true,
  })
}

const originalFetch = globalThis.fetch

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  mockUseAuth.mockReturnValue({ user: null, isAuthenticated: false })
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useBonusPoints — unauthenticated / demo user', () => {
  it('returns zero bonus points for unauthenticated user', () => {
    globalThis.fetch = vi.fn()
    const { result } = renderHook(() => useBonusPoints())
    expect(result.current.bonusPoints).toBe(0)
    expect(result.current.bonusEntries).toHaveLength(0)
  })

  it('does not fetch when user is null', () => {
    globalThis.fetch = vi.fn()
    renderHook(() => useBonusPoints())
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('does not fetch when user is demo-user', () => {
    mockUseAuth.mockReturnValue({ user: { github_login: 'demo-user' }, isAuthenticated: true })
    globalThis.fetch = vi.fn()
    renderHook(() => useBonusPoints())
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('returns isBonusLoading=false for unauthenticated user', () => {
    globalThis.fetch = vi.fn()
    const { result } = renderHook(() => useBonusPoints())
    expect(result.current.isBonusLoading).toBe(false)
  })
})

describe('useBonusPoints — successful fetch', () => {
  it('returns bonus points from API', async () => {
    authenticatedUser('bob')
    mockFetchBonus({ login: 'bob', total_bonus_points: 150, entries: [] })
    const { result } = renderHook(() => useBonusPoints())
    await waitFor(() => result.current.bonusPoints === 150)
    expect(result.current.bonusPoints).toBe(150)
  })

  it('returns bonus entries from API', async () => {
    authenticatedUser('bob')
    const entries = [{ issue_number: 1, points: 50, reason: 'PR fix', created_at: '2026-01-01', state: 'closed' }]
    mockFetchBonus({ login: 'bob', total_bonus_points: 50, entries })
    const { result } = renderHook(() => useBonusPoints())
    await waitFor(() => result.current.bonusEntries.length > 0)
    expect(result.current.bonusEntries).toHaveLength(1)
  })

  it('saves result to localStorage cache', async () => {
    authenticatedUser('alice')
    mockFetchBonus({ login: 'alice', total_bonus_points: 75, entries: [] })
    renderHook(() => useBonusPoints())
    await waitFor(() => localStorage.getItem(`${CACHE_KEY_PREFIX}:alice`) !== null)
    const cached = JSON.parse(localStorage.getItem(`${CACHE_KEY_PREFIX}:alice`)!)
    expect(cached.data.total_bonus_points).toBe(75)
  })

  it('exposes refreshBonus function', () => {
    globalThis.fetch = vi.fn()
    authenticatedUser()
    const { result } = renderHook(() => useBonusPoints())
    expect(typeof result.current.refreshBonus).toBe('function')
  })
})

describe('useBonusPoints — cache loading', () => {
  it('loads from cache when valid cache exists', () => {
    authenticatedUser('carol')
    const cachedData = { login: 'carol', total_bonus_points: 200, entries: [] }
    setCachedBonus('carol', cachedData)
    globalThis.fetch = vi.fn().mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useBonusPoints())
    expect(result.current.bonusPoints).toBe(200)
  })

  it('ignores expired cache (> 15 minutes old)', () => {
    authenticatedUser('dave')
    const cachedData = { login: 'dave', total_bonus_points: 100, entries: [] }
    setCachedBonus('dave', cachedData, 16 * 60 * 1000)
    mockFetchBonus({ login: 'dave', total_bonus_points: 0, entries: [] })
    renderHook(() => useBonusPoints())
    expect(globalThis.fetch).toHaveBeenCalled()
  })
})

describe('useBonusPoints — error handling', () => {
  it('handles 404 response (route unavailable) gracefully', async () => {
    authenticatedUser('eve')
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 })
    const { result } = renderHook(() => useBonusPoints())
    await waitFor(() => !result.current.isBonusLoading)
    expect(result.current.bonusPoints).toBe(0)
    expect(result.current.bonusEntries).toHaveLength(0)
  })

  it('does not throw on non-ok response (fail silently)', async () => {
    authenticatedUser('frank')
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 })
    const { result } = renderHook(() => useBonusPoints())
    await waitFor(() => !result.current.isBonusLoading)
    expect(result.current.bonusPoints).toBe(0)
  })

  it('does not throw on network error (fail silently)', async () => {
    authenticatedUser('grace')
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'))
    const { result } = renderHook(() => useBonusPoints())
    await waitFor(() => !result.current.isBonusLoading)
    expect(result.current.bonusPoints).toBe(0)
  })

  it('handles invalid JSON response (fail silently)', async () => {
    authenticatedUser('hank')
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => { throw new Error('bad json') },
    })
    const { result } = renderHook(() => useBonusPoints())
    await waitFor(() => !result.current.isBonusLoading)
    expect(result.current.bonusPoints).toBe(0)
  })
})
