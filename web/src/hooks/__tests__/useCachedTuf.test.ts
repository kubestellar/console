import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

const mockUseCache = vi.fn()
vi.mock('../../lib/cache', () => ({
    createCachedHook: vi.fn(),
    useCache: (args: any) => mockUseCache(args),
    createCachedHook: (_config: unknown) => () => mockUseCache(_config),
}))

const mockIsDemoMode = vi.fn(() => false)
vi.mock('../useDemoMode', () => ({
    createCachedHook: vi.fn(),
    useDemoMode: () => ({ isDemoMode: mockIsDemoMode() }),
    isDemoModeForced: () => false,
    canToggleDemoMode: () => true,
    isNetlifyDeployment: () => false,
    isDemoToken: () => false,
    hasRealToken: () => true,
    setDemoToken: vi.fn(),
    getDemoMode: () => false,
    setGlobalDemoMode: vi.fn(),
}))

import { useCachedTuf, __testables } from '../useCachedTuf'
import { TUF_DEMO_DATA, type TufRole } from '../../lib/demo/tuf'

const { deriveStatus, summarize, deriveHealth, buildTufStatus, EXPIRING_SOON_WINDOW_MS } = __testables

const makeRole = (overrides: Partial<TufRole> = {}): TufRole => ({
    name: 'root',
    version: 1,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    threshold: 1,
    keyCount: 1,
    status: 'signed',
    ...overrides,
})

const makeCacheResult = (overrides: Record<string, unknown> = {}) => ({
    data: { health: 'not-installed', specVersion: 'unknown', repository: '', roles: [], summary: { totalRoles: 0, signedRoles: 0, expiredRoles: 0, expiringSoonRoles: 0 }, lastCheckTime: '' },
    isLoading: false,
    isRefreshing: false,
    isDemoFallback: false,
    error: null,
    isFailed: false,
    consecutiveFailures: 0,
    lastRefresh: 123456789,
    refetch: vi.fn(),
    ...overrides,
})

describe('useCachedTuf', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockIsDemoMode.mockReturnValue(false)
        mockUseCache.mockReturnValue(makeCacheResult())
    })

    it('returns data from cache when not in demo mode', () => {
        const { result } = renderHook(() => useCachedTuf())
        expect(result.current.data.health).toBe('not-installed')
        expect(result.current.isDemoFallback).toBe(false)
    })

    it('returns demo data when demo mode is enabled', () => {
        mockIsDemoMode.mockReturnValue(true)
        mockUseCache.mockReturnValue(makeCacheResult({ data: TUF_DEMO_DATA, isDemoFallback: true }))
        const { result } = renderHook(() => useCachedTuf())
        expect(result.current.isDemoFallback).toBe(true)
        expect(result.current.data.roles.length).toBeGreaterThan(0)
    })

    it('respects isLoading state', () => {
        mockUseCache.mockReturnValue(makeCacheResult({ isLoading: true, lastRefresh: null }))
        const { result } = renderHook(() => useCachedTuf())
        expect(result.current.isLoading).toBe(true)
    })
})

describe('__testables.deriveStatus', () => {
    const NOW = Date.now()

    it('returns unsigned for unsigned roles', () => {
        expect(deriveStatus(makeRole({ status: 'unsigned' }), NOW)).toBe('unsigned')
    })

    it('returns expired when expiresAt is in the past', () => {
        const pastDate = new Date(NOW - 1000).toISOString()
        expect(deriveStatus(makeRole({ expiresAt: pastDate, status: 'signed' }), NOW)).toBe('expired')
    })

    it('returns expiring-soon within the window', () => {
        const soonDate = new Date(NOW + EXPIRING_SOON_WINDOW_MS / 2).toISOString()
        expect(deriveStatus(makeRole({ expiresAt: soonDate, status: 'signed' }), NOW)).toBe('expiring-soon')
    })

    it('returns signed when well in the future', () => {
        const futureDate = new Date(NOW + EXPIRING_SOON_WINDOW_MS * 2).toISOString()
        expect(deriveStatus(makeRole({ expiresAt: futureDate, status: 'signed' }), NOW)).toBe('signed')
    })

    it('returns original status for invalid date', () => {
        expect(deriveStatus(makeRole({ expiresAt: 'not-a-date', status: 'signed' }), NOW)).toBe('signed')
    })
})

describe('__testables.summarize', () => {
    it('returns zeroed summary for empty roles', () => {
        const s = summarize([])
        expect(s.totalRoles).toBe(0)
        expect(s.signedRoles).toBe(0)
    })

    it('counts roles by status', () => {
        const roles = [
            makeRole({ status: 'signed' }),
            makeRole({ status: 'expired' }),
            makeRole({ status: 'expiring-soon' }),
        ]
        const s = summarize(roles)
        expect(s.totalRoles).toBe(3)
        expect(s.signedRoles).toBe(1)
        expect(s.expiredRoles).toBe(1)
        expect(s.expiringSoonRoles).toBe(1)
    })
})

describe('__testables.deriveHealth', () => {
    it('returns not-installed for empty roles', () => {
        expect(deriveHealth([])).toBe('not-installed')
    })

    it('returns healthy when all roles signed', () => {
        expect(deriveHealth([makeRole()])).toBe('healthy')
    })

    it('returns degraded when any role is expired', () => {
        expect(deriveHealth([makeRole(), makeRole({ status: 'expired' })])).toBe('degraded')
    })

    it('returns degraded when any role is unsigned', () => {
        expect(deriveHealth([makeRole({ status: 'unsigned' })])).toBe('degraded')
    })

    it('returns degraded when any role is expiring-soon', () => {
        expect(deriveHealth([makeRole({ status: 'expiring-soon' })])).toBe('degraded')
    })
})

describe('__testables.buildTufStatus', () => {
    it('builds complete status from roles', () => {
        const roles = [makeRole({ name: 'root' }), makeRole({ name: 'targets' })]
        const status = buildTufStatus(roles, '1.0.31', 'https://tuf.example.com')
        expect(status.specVersion).toBe('1.0.31')
        expect(status.repository).toBe('https://tuf.example.com')
        expect(status.roles).toHaveLength(2)
        expect(status.health).toBe('healthy')
    })

    it('returns not-installed for empty roles', () => {
        expect(buildTufStatus([], '1.0.31', '').health).toBe('not-installed')
    })
})
