import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { CiliumStatus } from '../index'
import React from 'react'

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string) => k }),
}))

const mockUseCachedCiliumStatus = vi.fn()
vi.mock('../../../../hooks/useCachedCiliumStatus', () => ({
    useCachedCiliumStatus: () => mockUseCachedCiliumStatus(),
}))

vi.mock('../../../../hooks/useGlobalFilters', () => ({
    useGlobalFilters: () => ({ selectedClusters: [] }),
}))

vi.mock('../../../../hooks/useDrillDown', () => ({
    useDrillDownActions: () => ({ drillToNode: vi.fn() }),
}))

vi.mock('../../CardDataContext', () => ({
    useCardLoadingState: () => ({ showSkeleton: false }),
}))

vi.mock('../../../../lib/cards', () => ({
    useCardData: (items: any) => ({
        items: items || [],
        currentPage: 1,
        totalPages: 1,
        totalItems: (items || []).length,
        itemsPerPage: 5,
        goToPage: vi.fn(),
        setItemsPerPage: vi.fn(),
        needsPagination: false,
        sorting: { sortBy: 'name', setSortBy: vi.fn(), sortDirection: 'asc', setSortDirection: vi.fn() },
        containerRef: { current: null },
        containerStyle: {},
    }),
    commonComparators: {
        string: () => vi.fn(),
        statusOrder: () => vi.fn(),
    },
    CardPaginationFooter: () => <div data-testid="pagination" />,
}))

vi.mock('../../ui/CardControls', () => ({
    CardControls: () => <div data-testid="card-controls" />,
}))

vi.mock('../../ui/StatusBadge', () => ({
    StatusBadge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}))

describe('CiliumStatus', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockUseCachedCiliumStatus.mockReturnValue({
            data: { status: 'Healthy', nodes: [], networkPolicies: 0, endpoints: 0, hubble: { enabled: false, flowsPerSecond: 0 } },
            isLoading: false,
            isRefreshing: false,
            isDemoData: false,
            isFailed: false,
            consecutiveFailures: 0,
            lastRefresh: Date.now(),
            refetch: vi.fn(),
        })
    })

    it('renders Cilium title and header', async () => {
        mockUseCachedCiliumStatus.mockReturnValue({
            data: { status: 'Healthy', nodes: [], networkPolicies: 10, endpoints: 20, hubble: { enabled: true, flowsPerSecond: 100 } },
            isLoading: false,
            isRefreshing: false,
            isDemoData: false,
            isFailed: false,
            consecutiveFailures: 0,
            lastRefresh: Date.now(),
            refetch: vi.fn(),
        })

        render(<CiliumStatus />)
        expect(screen.getByText('ciliumStatus.title')).toBeInTheDocument()
        expect(screen.getByText('ciliumStatus.healthy')).toBeInTheDocument()
    })

    it('renders node list', async () => {
        mockUseCachedCiliumStatus.mockReturnValue({
            data: {
                status: 'Healthy',
                nodes: [{ name: 'node-1', status: 'Healthy', version: '1.14.0' }],
                networkPolicies: 10,
                endpoints: 20,
                hubble: { enabled: true, flowsPerSecond: 100 }
            },
            isLoading: false,
            isRefreshing: false,
            isDemoData: false,
            isFailed: false,
            consecutiveFailures: 0,
            lastRefresh: Date.now(),
            refetch: vi.fn(),
        })

        render(<CiliumStatus />)

        await waitFor(() => {
            expect(screen.getByText('node-1')).toBeInTheDocument()
        })
        expect(screen.getByText('1.14.0')).toBeInTheDocument()
    })
})
