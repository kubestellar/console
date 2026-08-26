import React from 'react'
import { vi } from 'vitest'
import type { DynamicCardDefinition, DynamicCardDefinition_T1 } from '../../../../lib/dynamic-cards/types'

export const mockGetDynamicCard = vi.fn()
export const mockCompileCardCode = vi.fn()
export const mockCreateCardComponent = vi.fn()
export const mockShouldUseDemoData = vi.fn(() => false)
export const mockUseCardData = vi.fn()

vi.mock('../../../../lib/cache', () => {
  const React = require('react')
  return {
    useCache: ({ fetcher, initialData, enabled = true }: { fetcher: () => Promise<unknown>; initialData: unknown; enabled?: boolean }) => {
      const [data, setData] = React.useState(initialData)
      const [isLoading, setIsLoading] = React.useState(enabled)
      const [isFailed, setIsFailed] = React.useState(false)
      const [error, setError] = React.useState<string | null>(null)
      const fetcherRef = React.useRef(fetcher)
      fetcherRef.current = fetcher
      React.useEffect(() => {
        if (!enabled) { setIsLoading(false); return }
        let cancelled = false
        fetcherRef.current().then((result: unknown) => {
          if (!cancelled) { setData(result); setIsLoading(false) }
        }).catch((err: Error) => {
          if (!cancelled) { setIsFailed(true); setError(err.message); setIsLoading(false) }
        })
        return () => { cancelled = true }
      }, [enabled])
      return { data, isLoading, isFailed, isDemoFallback: false, error, consecutiveFailures: 0, refetch: async () => {} }
    },
  }
})

vi.mock('../../../../hooks/mcp/shared', () => ({
  agentFetch: (...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?])),
  clusterCacheRef: { clusters: [] },
  REFRESH_INTERVAL_MS: 120_000,
  CLUSTER_POLL_INTERVAL_MS: 60_000,
}))

vi.mock('../../../../lib/dynamic-cards/dynamicCardRegistry', () => ({ getDynamicCard: (...args: unknown[]) => mockGetDynamicCard(...args) }))
vi.mock('../../../../lib/dynamic-cards/compiler', () => ({ compileCardCode: (...args: unknown[]) => mockCompileCardCode(...args), createCardComponent: (...args: unknown[]) => mockCreateCardComponent(...args) }))
vi.mock('../../../../lib/constants', async importOriginal => ({ ...(await importOriginal<typeof import('../../../../lib/constants')>()), STORAGE_KEY_TOKEN: 'kc_token' }))
vi.mock('react-i18next', () => ({ initReactI18next: { type: '3rdParty', init: () => {} }, useTranslation: () => ({ t: (k: string) => k }) }))
vi.mock('../../../ui/Skeleton', () => ({ Skeleton: ({ variant }: { variant: string }) => <div data-testid={`skeleton-${variant}`} />, SkeletonCardWithRefresh: () => <div data-testid="skeleton-card-with-refresh" /> }))
vi.mock('../../../ui/Pagination', () => ({ Pagination: ({ currentPage, totalPages, onPageChange }: { currentPage: number; totalPages: number; onPageChange: (p: number) => void }) => <div data-testid="pagination"><span>Page {currentPage} of {totalPages}</span><button onClick={() => onPageChange(currentPage + 1)}>Next</button></div> }))
vi.mock('../../DynamicCardErrorBoundary', () => ({ DynamicCardErrorBoundary: ({ children }: { children: React.ReactNode }) => <div data-testid="error-boundary">{children}</div> }))
vi.mock('../../CardDataContext', () => ({ useCardDemoState: () => ({ shouldUseDemoData: mockShouldUseDemoData() }), useReportCardDataState: vi.fn() }))
vi.mock('../../../../lib/cards/cardHooks', () => ({ useCardData: (...args: unknown[]) => mockUseCardData(...args) }))

export function makeUseCardDataReturn(items: Record<string, unknown>[] = []) {
  return { items, totalItems: items.length, currentPage: 1, totalPages: 1, goToPage: vi.fn(), needsPagination: false, itemsPerPage: 10, filters: { search: '', setSearch: vi.fn() }, containerRef: { current: null }, containerStyle: {} }
}

export const BASE_T1_DEF: DynamicCardDefinition_T1 = {
  layout: 'list',
  columns: [{ field: 'name', label: 'Name' }],
  dataSource: 'static',
  staticData: [{ name: 'Alpha' }, { name: 'Beta' }],
  searchFields: ['name'],
  defaultLimit: 5,
  emptyMessage: 'Nothing here.',
}

export function makeT1Definition(overrides: Partial<DynamicCardDefinition> = {}): DynamicCardDefinition {
  return { id: 'card-t1', tier: 'tier1', cardDefinition: BASE_T1_DEF, ...overrides } as DynamicCardDefinition
}

export function makeT2Definition(overrides: Partial<DynamicCardDefinition> = {}): DynamicCardDefinition {
  return { id: 'card-t2', tier: 'tier2', sourceCode: 'export default function MyCard() { return <div>T2 Card</div> }', ...overrides } as DynamicCardDefinition
}
