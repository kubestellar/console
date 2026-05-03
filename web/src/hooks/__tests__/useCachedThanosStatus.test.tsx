import { vi } from 'vitest'

// vi.hoisted ensures mockUseCacheFn is available when vi.mock() is hoisted
const { mockUseCacheFn } = vi.hoisted(() => {
    const mockUseCacheFn = vi.fn().mockImplementation(
        (options: { demoData?: unknown; getDemoData?: () => unknown }) => ({
            data: typeof options.getDemoData === 'function' ? options.getDemoData() : options.demoData,
            isLoading: false,
            isRefreshing: false,
            isDemoFallback: true,
            error: null,
            isFailed: false,
            consecutiveFailures: 0,
            lastRefresh: Date.now(),
            refetch: vi.fn(),
        })
    )
    return { mockUseCacheFn }
})

vi.mock('@/lib/cache', async (importOriginal) => {
    const actual = await importOriginal() as Record<string, unknown>
    return {
        ...actual,
        useCache: mockUseCacheFn,
        createCachedHook: (_config: unknown) => () => mockUseCacheFn(_config),
    }
})

import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useCachedThanosStatus } from '../useCachedThanosStatus'

describe('useCachedThanosStatus Hook', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('provides the correct hook interface', () => {
        const { result } = renderHook(() => useCachedThanosStatus())

        expect(result.current).toHaveProperty('data')
        expect(result.current).toHaveProperty('isLoading')
        expect(result.current).toHaveProperty('isDemoFallback')
        expect(result.current.isDemoFallback).toBe(true)
    })

    it('initializes with mock data', () => {
        const { result } = renderHook(() => useCachedThanosStatus())
        expect(result.current.data.targets.length).toBeGreaterThan(0)
        expect(result.current.data.storeGateways.length).toBeGreaterThan(0)
    })
})
