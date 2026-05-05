import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ThanosStatus } from '../index'
import * as CardDataContext from '../../CardDataContext'
import { useCachedThanosStatus, type ThanosStatus } from '../../../../hooks/useCachedThanosStatus'

// Mock dependencies at the top
vi.mock('../../../../hooks/useCachedThanosStatus', () => ({
    useCachedThanosStatus: vi.fn(() => ({
        data: {
            targets: [
                { name: 'test-target-1', health: 'up', lastScrape: new Date().toISOString() },
                { name: 'test-target-2', health: 'down', lastScrape: new Date().toISOString() },
            ],
            storeGateways: [
                { name: 'store-1', health: 'healthy', minTime: '', maxTime: new Date().toISOString() },
            ],
            queryHealth: 'degraded' as const,
            lastCheckTime: new Date().toISOString(),
        },
        isLoading: false,
        isRefreshing: false,
        isDemoFallback: false,
        error: null,
        isFailed: false,
        consecutiveFailures: 0,
        lastRefresh: Date.now(),
        refetch: vi.fn(),
    }))
}))

vi.mock('../../CardDataContext', () => ({
    useCardLoadingState: vi.fn(() => ({
        showSkeleton: false,
        showEmptyState: false,
        hasData: true,
        isRefreshing: false,
        loadingTimedOut: false
    })),
    useReportCardDataState: vi.fn()
}))

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
    }),
}))

describe('ThanosStatus Component', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('renders correctly with mocked data', () => {
        render(<ThanosStatus />)
        expect(screen.getByText(/degraded/i)).toBeTruthy()
        expect(screen.getByText('1/2')).toBeTruthy()
        expect(screen.getByText('test-target-1')).toBeTruthy()
    })

    it('shows skeleton when loading state is active', () => {
        vi.mocked(CardDataContext.useCardLoadingState).mockReturnValue({
            showSkeleton: true,
            showEmptyState: false,
            hasData: false,
            isRefreshing: false,
            loadingTimedOut: false
        })

        const { container } = render(<ThanosStatus />)
        const skeletons = container.querySelectorAll('.animate-pulse')
        expect(skeletons.length).toBeGreaterThan(0)
    })

    it('renders empty state when requested', () => {
        vi.mocked(CardDataContext.useCardLoadingState).mockReturnValue({
            showSkeleton: false,
            showEmptyState: true,
            hasData: false,
            isRefreshing: false,
            loadingTimedOut: false
        })

        render(<ThanosStatus />)
        expect(screen.getByText(/noTargets/i)).toBeTruthy()
    })

    it('shows error message on failure', () => {
        vi.mocked(CardDataContext.useCardLoadingState).mockReturnValue({
            showSkeleton: false,
            showEmptyState: true,
            hasData: false,
            isRefreshing: false,
            loadingTimedOut: false
        })

        vi.mocked(useCachedThanosStatus).mockReturnValue({
            data: null as unknown as ThanosStatus,
            isFailed: true,
            isLoading: false,
            isRefreshing: false,
            isDemoFallback: false,
            error: 'Fetch failed',
            consecutiveFailures: 3,
            lastRefresh: Date.now(),
            refetch: vi.fn()
        })

        render(<ThanosStatus />)
        expect(screen.getByText(/fetchError/i)).toBeTruthy()
    })
})
