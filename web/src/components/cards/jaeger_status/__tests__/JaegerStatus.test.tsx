import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import React from 'react'

// Mock i18next
vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string) => k }),
    Trans: ({ children }: { children: React.ReactNode }) => children,
}))

// Mock the cached-data hook
const mockUseCachedJaegerStatus = vi.fn()
vi.mock('../../../../hooks/useCachedData', () => ({
    useCachedJaegerStatus: () => mockUseCachedJaegerStatus(),
}))

// Mock useGlobalFilters — the card itself calls selectedClusters; cardHooks.useCardData
// also uses this hook internally and needs a fuller shape (customFilter, filter helpers, ...).
vi.mock('../../../../hooks/useGlobalFilters', () => ({
    useGlobalFilters: () => ({
        selectedClusters: [],
        setSelectedClusters: vi.fn(),
        toggleCluster: vi.fn(),
        selectAllClusters: vi.fn(),
        deselectAllClusters: vi.fn(),
        isAllClustersSelected: true,
        isClustersFiltered: false,
        availableClusters: [],
        clusterInfoMap: {},
        clusterGroups: [],
        addClusterGroup: vi.fn(),
        updateClusterGroup: vi.fn(),
        deleteClusterGroup: vi.fn(),
        selectClusterGroup: vi.fn(),
        selectedSeverities: [],
        setSelectedSeverities: vi.fn(),
        toggleSeverity: vi.fn(),
        selectAllSeverities: vi.fn(),
        deselectAllSeverities: vi.fn(),
        isAllSeveritiesSelected: true,
        isSeveritiesFiltered: false,
        selectedStatuses: [],
        setSelectedStatuses: vi.fn(),
        toggleStatus: vi.fn(),
        selectAllStatuses: vi.fn(),
        deselectAllStatuses: vi.fn(),
        isAllStatusesSelected: true,
        isStatusesFiltered: false,
        selectedDistributions: [],
        toggleDistribution: vi.fn(),
        selectAllDistributions: vi.fn(),
        deselectAllDistributions: vi.fn(),
        isAllDistributionsSelected: true,
        isDistributionsFiltered: false,
        availableDistributions: [],
        customFilter: '',
        setCustomFilter: vi.fn(),
        clearCustomFilter: vi.fn(),
        hasCustomFilter: false,
        isFiltered: false,
        clearAllFilters: vi.fn(),
        savedFilterSets: [],
        saveCurrentFilters: vi.fn(),
        applySavedFilterSet: vi.fn(),
        deleteSavedFilterSet: vi.fn(),
        activeFilterSetId: null,
        filterByCluster: <T,>(items: T[]) => items,
        filterBySeverity: <T,>(items: T[]) => items,
        filterByStatus: <T,>(items: T[]) => items,
        filterByCustomText: <T,>(items: T[]) => items,
        filterItems: <T,>(items: T[]) => items,
    }),
}))

vi.mock('../../../../hooks/useDrillDown', () => ({
    useDrillDownActions: () => ({ drillToNode: vi.fn() }),
}))

// Mock useCardLoadingState from CardDataContext (the actual import path used by index.tsx)
vi.mock('../../CardDataContext', () => ({
    useCardLoadingState: () => ({
        showSkeleton: false,
        showEmptyState: false,
        hasData: true,
        isRefreshing: false,
    }),
    useReportCardDataState: vi.fn(),
}))

// Mock useCardData from lib/cards — the card imports it as `from '../../../lib/cards'`,
// which re-exports from `lib/cards/cardHooks.ts`.
vi.mock('../../../../lib/cards', async (importOriginal) => {
    const actual = (await importOriginal()) as Record<string, unknown>
    return {
        ...actual,
        useCardData: (items: unknown[]) => ({
            items: items || [],
            totalItems: (items || []).length,
            currentPage: 1,
            totalPages: 1,
            itemsPerPage: 4,
            goToPage: vi.fn(),
            setItemsPerPage: vi.fn(),
            needsPagination: false,
            sorting: {
                sortBy: 'name',
                setSortBy: vi.fn(),
                sortDirection: 'asc' as const,
                setSortDirection: vi.fn(),
            },
            containerRef: { current: null },
            containerStyle: {},
        }),
    }
})

// Mock CardControls and other UI components to avoid dependency issues
vi.mock('../../../ui/CardControls', () => ({
    CardControls: () => <div data-testid="card-controls" />,
}))

vi.mock('../../../ui/StatusBadge', () => ({
    StatusBadge: ({ children }: { children: React.ReactNode }) => <span data-testid="status-badge">{children}</span>,
}))

vi.mock('../../../ui/RefreshIndicator', () => ({
    RefreshIndicator: () => <div data-testid="refresh-indicator" />,
}))

import { JaegerStatus } from '../index'

describe('JaegerStatus', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        // Use unique numeric values for each metric so getByText('<number>')
        // resolves to exactly one element in the rendered DOM.
        mockUseCachedJaegerStatus.mockReturnValue({
            data: {
                status: 'Healthy',
                version: '1.57.0',
                collectors: {
                    count: 1,
                    status: 'Healthy',
                    items: [{ name: 'col-1', status: 'Healthy', version: '1.57.0', cluster: 'cl1' }]
                },
                query: { status: 'Healthy' },
                metrics: {
                    servicesCount: 11,
                    tracesLastHour: 101,
                    dependenciesCount: 6,
                    avgLatencyMs: 13,
                    p95LatencyMs: 23,
                    p99LatencyMs: 33,
                    spansDroppedLastHour: 7,
                    avgQueueLength: 14,
                }
            },
            isLoading: false,
            isRefreshing: false,
            isDemoData: false,
            isFailed: false,
            consecutiveFailures: 0,
            lastRefresh: Date.now(),
            refetch: vi.fn(),
        })
    })

    it('renders Jaeger title and metrics', async () => {
        render(<JaegerStatus />)
        expect(await screen.findByText('jaeger.title')).toBeInTheDocument()
        // servicesCount: 11 — unique value, rendered in the MetricTile for jaeger.services
        expect(screen.getByText('11')).toBeInTheDocument()
    })

    it('renders health KPIs', async () => {
        render(<JaegerStatus />)
        expect(await screen.findByText('jaeger.dropped')).toBeInTheDocument()
        // spansDroppedLastHour: 7 — unique value, rendered in the KPIField for jaeger.dropped
        expect(screen.getByText('7')).toBeInTheDocument()
    })

    it('renders collectors list', async () => {
        render(<JaegerStatus />)
        expect(await screen.findByText('col-1')).toBeInTheDocument()
    })
})
