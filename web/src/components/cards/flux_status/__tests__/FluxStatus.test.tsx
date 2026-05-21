import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'

const mockUseFluxStatus = vi.fn()

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('../useFluxStatus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../useFluxStatus')>()
  return {
    ...actual,
    useFluxStatus: () => mockUseFluxStatus(),
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

import { FluxStatus } from '../index'
import { FLUX_DEMO_DATA } from '../demoData'
import { __testables, type UseFluxStatusResult } from '../useFluxStatus'
import type { FluxResourceStatus } from '../demoData'

const syncedSource: FluxResourceStatus = {
  kind: 'GitRepository',
  name: 'flux-system',
  namespace: 'flux-system',
  cluster: 'dev',
  ready: true,
}

const syncedKustomization: FluxResourceStatus = {
  kind: 'Kustomization',
  name: 'apps',
  namespace: 'flux-system',
  cluster: 'dev',
  ready: true,
}

const HEALTHY_DATA = __testables.buildFluxStatus(
  [syncedSource],
  [syncedKustomization],
  [],
)

function setup(overrides?: Partial<UseFluxStatusResult>) {
  mockUseFluxStatus.mockReturnValue({
    data: HEALTHY_DATA,
    error: false,
    consecutiveFailures: 0,
    showSkeleton: false,
    showEmptyState: false,
    isDemoData: false,
    ...overrides,
  })
}

describe('FluxStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders skeleton when showSkeleton is true', () => {
    setup({ showSkeleton: true })
    render(<FluxStatus />)

    expect(screen.getByTestId('skeleton-stats')).toBeTruthy()
    expect(screen.getByTestId('skeleton-list')).toBeTruthy()
  })

  it('renders fetch error when error and showEmptyState are true', () => {
    setup({ error: true, showEmptyState: true })
    render(<FluxStatus />)

    expect(screen.getByText('fluxStatus.fetchError')).toBeTruthy()
  })

  it('renders not-installed state when health is not-installed', () => {
    setup({
      data: __testables.buildFluxStatus([], [], []),
    })
    render(<FluxStatus />)

    expect(screen.getByText('fluxStatus.notInstalled')).toBeTruthy()
    expect(screen.getByText('fluxStatus.notInstalledHint')).toBeTruthy()
  })

  it('renders healthy live data with kustomization synced', () => {
    setup()
    render(<FluxStatus />)

    expect(screen.getByText('fluxStatus.healthy')).toBeTruthy()
    expect(screen.getByText('fluxStatus.kustomizations')).toBeTruthy()
    expect(screen.getByText('fluxStatus.sectionKustomizations')).toBeTruthy()
    expect(screen.getByText('apps')).toBeTruthy()
  })

  it('renders degraded state when kustomization sync failed', () => {
    setup({ data: FLUX_DEMO_DATA })
    render(<FluxStatus />)

    expect(screen.getByText('fluxStatus.degraded')).toBeTruthy()
    expect(screen.getByText('monitoring')).toBeTruthy()
  })

  it('renders demo badge when isDemoData is true', () => {
    setup({ data: FLUX_DEMO_DATA, isDemoData: true })
    render(<FluxStatus />)

    expect(screen.getByText('fluxStatus.demo')).toBeTruthy()
  })
})
