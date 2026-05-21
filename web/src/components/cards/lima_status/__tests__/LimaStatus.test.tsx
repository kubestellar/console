import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'

const mockUseLimaStatus = vi.fn()

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('../useLimaStatus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../useLimaStatus')>()
  return {
    ...actual,
    useLimaStatus: () => mockUseLimaStatus(),
  }
})

vi.mock('../../../ui/Skeleton', () => ({
  Skeleton: ({ height }: { height?: number }) => (
    <div data-testid="skeleton" data-height={height} />
  ),
}))

vi.mock('../../../../lib/cards/CardComponents', () => ({
  MetricTile: ({ label, value }: { label: string; value: number | string }) => (
    <div data-testid="metric-tile">
      <span>{label}</span>: <span>{value}</span>
    </div>
  ),
}))

import { LimaStatus } from '../LimaStatus'
import { LIMA_DEMO_DATA } from '../demoData'
import { __testables, type UseLimaStatusResult } from '../useLimaStatus'
import type { LimaInstance } from '../demoData'

const BASE_INSTANCE: LimaInstance = {
  name: 'lima-k3s',
  status: 'running',
  cpuCores: 4,
  memoryGB: 8,
  diskGB: 60,
  arch: 'x86_64',
  os: 'Ubuntu 22.04 LTS',
  limaVersion: '0.18.0',
  lastSeen: new Date().toISOString(),
}

const HEALTHY_DATA = __testables.buildLimaStatus([
  BASE_INSTANCE,
  { ...BASE_INSTANCE, name: 'lima-default' },
])

function setup(overrides?: Partial<UseLimaStatusResult>) {
  mockUseLimaStatus.mockReturnValue({
    data: HEALTHY_DATA,
    loading: false,
    isRefreshing: false,
    error: false,
    consecutiveFailures: 0,
    showSkeleton: false,
    showEmptyState: false,
    isDemoData: false,
    ...overrides,
  })
}

describe('LimaStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders skeleton when showSkeleton is true', () => {
    setup({ showSkeleton: true })
    render(<LimaStatus />)

    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0)
  })

  it('renders fetch error when error and showEmptyState are true', () => {
    setup({ error: true, showEmptyState: true })
    render(<LimaStatus />)

    expect(screen.getByText('lima.fetchError')).toBeTruthy()
  })

  it('renders not-detected state when health is not-detected', () => {
    setup({ data: __testables.buildLimaStatus([]) })
    render(<LimaStatus />)

    expect(screen.getByText('lima.notDetected')).toBeTruthy()
    expect(screen.getByText('lima.notDetectedHint')).toBeTruthy()
  })

  it('renders healthy live data with VM list and metrics', () => {
    setup()
    render(<LimaStatus />)

    expect(screen.getByText('lima.healthy')).toBeTruthy()
    expect(screen.getByText('lima.totalInstances')).toBeTruthy()
    expect(screen.getByText('lima.instances')).toBeTruthy()
    expect(screen.getByText('lima-k3s')).toBeTruthy()
    expect(screen.getByText('lima-default')).toBeTruthy()
  })

  it('renders degraded badge when health is degraded', () => {
    setup({ data: __testables.toDemoStatus(LIMA_DEMO_DATA) })
    render(<LimaStatus />)

    expect(screen.getByText('lima.degraded')).toBeTruthy()
    expect(screen.getByText('lima-test')).toBeTruthy()
  })

  it('renders demo badge when isDemoData is true', () => {
    setup({ data: __testables.toDemoStatus(LIMA_DEMO_DATA), isDemoData: true })
    render(<LimaStatus />)

    expect(screen.getByText('lima.demo')).toBeTruthy()
  })
})
