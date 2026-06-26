import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'

const mockUseContourStatus = vi.fn()

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('../useContourStatus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../useContourStatus')>()
  return {
    ...actual,
    useContourStatus: () => mockUseContourStatus(),
  }
})

vi.mock('../../../ui/Skeleton', () => ({
  Skeleton: () => <div data-testid="skeleton" />,
  SkeletonList: () => <div data-testid="skeleton-list" />,
  SkeletonStats: () => <div data-testid="skeleton-stats" />,
}))

vi.mock('../../../../lib/cards/CardComponents', () => ({
  MetricTile: ({ label, value }: { label: string; value: number | string }) => (
    <div data-testid="metric-tile">
      <span>{label}</span>: <span>{value}</span>
    </div>
  ),
}))

import { ContourStatus } from '../index'
import { CONTOUR_DEMO_DATA } from '../demoData'
import { __testables, type UseContourStatusResult } from '../useContourStatus'

const validProxy = {
  name: 'app-proxy',
  namespace: 'default',
  cluster: 'dev',
  fqdn: 'app.example.com',
  status: 'Valid' as const,
  conditions: [] as string[],
}

const HEALTHY_DATA = __testables.buildContourStatus(
  [validProxy],
  { total: 2, ready: 2, notReady: 0 },
)

function setup(overrides?: Partial<UseContourStatusResult>) {
  mockUseContourStatus.mockReturnValue({
    data: HEALTHY_DATA,
    error: false,
    consecutiveFailures: 0,
    showSkeleton: false,
    showEmptyState: false,
    isDemoData: false,
    ...overrides,
  })
}

describe('ContourStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders skeleton when showSkeleton is true', () => {
    setup({ showSkeleton: true })
    render(<ContourStatus />)

    expect(screen.getByTestId('skeleton-stats')).toBeTruthy()
    expect(screen.getByTestId('skeleton-list')).toBeTruthy()
  })

  it('renders fetch error when error and showEmptyState are true', () => {
    setup({ error: true, showEmptyState: true })
    render(<ContourStatus />)

    expect(screen.getByText('contourStatus.fetchError')).toBeTruthy()
  })

  it('renders not-installed state when health is not-installed', () => {
    setup({
      data: __testables.buildContourStatus([], { total: 0, ready: 0, notReady: 0 }),
    })
    render(<ContourStatus />)

    expect(screen.getByText('contourStatus.notInstalled')).toBeTruthy()
    expect(screen.getByText('contourStatus.notInstalledHint')).toBeTruthy()
  })

  it('renders healthy live data with proxy metrics and list', () => {
    setup()
    render(<ContourStatus />)

    expect(screen.getByText('contourStatus.healthy')).toBeTruthy()
    expect(screen.getByText('contourStatus.totalProxies')).toBeTruthy()
    expect(screen.getByText('contourStatus.sectionProxies')).toBeTruthy()
    expect(screen.getByText('app-proxy')).toBeTruthy()
  })

  it('renders degraded badge when health is degraded', () => {
    setup({ data: CONTOUR_DEMO_DATA })
    render(<ContourStatus />)

    expect(screen.getByText('contourStatus.degraded')).toBeTruthy()
    expect(screen.getByText('staging-proxy')).toBeTruthy()
  })

  it('renders demo badge when isDemoData is true', () => {
    setup({ data: CONTOUR_DEMO_DATA, isDemoData: true })
    render(<ContourStatus />)

    expect(screen.getByText('contourStatus.demo')).toBeTruthy()
  })
})
