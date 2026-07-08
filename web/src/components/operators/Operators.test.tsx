import React from 'react'
/// <reference types='@testing-library/jest-dom/vitest' />
import type { ReactNode } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

let mockClusters: Array<{ name: string; reachable?: boolean }> | undefined = []
let mockSubscriptions:
  | Array<{ name: string; namespace: string; channel: string; cluster?: string; pendingUpgrade?: boolean }>
  | undefined = []
let mockOperators:
  | Array<{ name: string; namespace: string; version: string; status: string; cluster?: string }>
  | undefined = []
let mockClustersError: string | undefined
let mockSubscriptionsError: string | undefined
let mockOperatorsError: string | undefined
let mockCustomFilter = ''
let mockIsAllClustersSelected = true
const filterByStatusSpy = vi.fn((items: unknown[]) => items)

vi.mock('../../hooks/useMCP', () => ({
  useClusters: () => ({
    deduplicatedClusters: mockClusters,
    isLoading: false,
    isRefreshing: false,
    lastUpdated: null,
    refetch: vi.fn(),
    error: mockClustersError,
  }),
  useOperatorSubscriptions: () => ({
    subscriptions: mockSubscriptions,
    refetch: vi.fn(),
    error: mockSubscriptionsError,
  }),
  useOperators: () => ({
    operators: mockOperators,
    refetch: vi.fn(),
    error: mockOperatorsError,
  }),
}))

vi.mock('../../hooks/useGlobalFilters', () => ({
  useGlobalFilters: () => ({
    selectedClusters: ['cluster-a'],
    isAllClustersSelected: mockIsAllClustersSelected,
    filterByStatus: filterByStatusSpy,
    customFilter: mockCustomFilter,
  }),
}))

vi.mock('../../hooks/useDrillDown', () => ({
  useDrillDownActions: () => ({
    drillToAllOperators: vi.fn(),
    drillToAllClusters: vi.fn(),
  }),
}))

vi.mock('../../lib/dashboards/DashboardPage', () => ({
  DashboardPage: ({ title, hasData, getStatValue, children }: { title: string; hasData?: boolean; getStatValue: (blockId: string) => { value: number }; children?: ReactNode }) => (
    <div data-testid="dashboard-page" data-title={title} data-has-data={String(hasData)}>
      <span data-testid="operators-count">{String(getStatValue('operators').value)}</span>
      <span data-testid="subscriptions-count">{String(getStatValue('subscriptions').value)}</span>
      {children}
    </div>
  ),
}))

vi.mock('../ui/RotatingTip', () => ({
  RotatingTip: () => null,
}))

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}))

import { Operators } from './Operators'

describe('Operators Component', () => {
  beforeEach(() => {
    mockClusters = []
    mockSubscriptions = []
    mockOperators = []
    mockClustersError = undefined
    mockSubscriptionsError = undefined
    mockOperatorsError = undefined
    mockCustomFilter = ''
    mockIsAllClustersSelected = true
    filterByStatusSpy.mockClear()
    filterByStatusSpy.mockImplementation((items: unknown[]) => items)
  })

  it('renders without crashing when hook arrays are undefined and a filter is active', () => {
    mockClusters = undefined
    mockSubscriptions = undefined
    mockOperators = undefined
    mockCustomFilter = 'search-term'
    mockIsAllClustersSelected = false

    expect(() => render(<Operators />)).not.toThrow()
    expect(screen.getByTestId('dashboard-page')).toHaveAttribute('data-has-data', 'false')
    expect(screen.getByTestId('operators-count')).toHaveTextContent('0')
    expect(screen.getByTestId('subscriptions-count')).toHaveTextContent('0')
    expect(filterByStatusSpy).toHaveBeenCalledWith([])
  })

  it('still surfaces hook errors when guarded arrays are missing', () => {
    mockClusters = undefined
    mockSubscriptions = undefined
    mockOperators = undefined
    mockOperatorsError = 'operators API unavailable'

    render(<Operators />)

    expect(screen.getByTestId('dashboard-page')).toBeInTheDocument()
    expect(screen.getByText('common:operators.errorLoadingData')).toBeInTheDocument()
    expect(screen.getByText('operators API unavailable')).toBeInTheDocument()
  })
})
