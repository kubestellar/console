import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { ChaosMeshStatus } from './index'

const mockUseChaosMeshStatus = vi.fn()

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: (ns: string) => ({
    t: (key: string) => key,
  }),
}))

vi.mock('./useChaosMeshStatus', () => ({
  useChaosMeshStatus: () => mockUseChaosMeshStatus(),
}))

vi.mock('../../ui/Skeleton', () => ({
  SkeletonList: () => <div data-testid="skeleton-list" />,
  SkeletonStats: () => <div data-testid="skeleton-stats" />,
}))

vi.mock('../../../lib/cards/CardComponents', () => ({
  MetricTile: ({ label, value }: { label: string; value: number }) => (
    <div data-testid="metric-tile">
      <span>{label}</span>: <span>{value}</span>
    </div>
  ),
}))

function setup(overrides?: Record<string, unknown>) {
  mockUseChaosMeshStatus.mockReturnValue({
    data: {
      summary: { totalExperiments: 0, running: 0, finished: 0, failed: 0 },
      experiments: [],
      workflows: [],
      health: 'not-installed',
    },
    isRefreshing: false,
    error: false,
    consecutiveFailures: 0,
    showSkeleton: false,
    showEmptyState: false,
    isDemoData: false,
    ...overrides,
  })
}

describe('ChaosMeshStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders skeleton when showSkeleton is true', () => {
    setup({ showSkeleton: true })
    render(<ChaosMeshStatus />)

    expect(screen.getByTestId('skeleton-stats')).toBeTruthy()
    expect(screen.getByTestId('skeleton-list')).toBeTruthy()
  })

  it('renders error state when error is true', () => {
    setup({ error: true, showEmptyState: false })
    render(<ChaosMeshStatus />)

    expect(screen.getByText('chaosMeshStatus.fetchError')).toBeTruthy()
  })

  it('renders empty state when showEmptyState is true', () => {
    setup({ error: false, showEmptyState: true })
    render(<ChaosMeshStatus />)

    expect(screen.getByText('chaosMeshStatus.notInstalled')).toBeTruthy()
    expect(screen.getByText('chaosMeshStatus.notInstalledHint')).toBeTruthy()
  })

  it('renders summary metrics when data is available', () => {
    setup({
      data: {
        summary: { totalExperiments: 10, running: 3, finished: 5, failed: 2 },
        experiments: [],
        workflows: [],
        health: 'degraded',
      },
      showSkeleton: false,
      showEmptyState: false,
    })
    render(<ChaosMeshStatus />)

    expect(screen.getByText('chaosMeshStatus.totalExperiments')).toBeTruthy()
    expect(screen.getByText('chaosMeshStatus.running')).toBeTruthy()
    expect(screen.getByText('chaosMeshStatus.finished')).toBeTruthy()
    expect(screen.getByText('chaosMeshStatus.failed')).toBeTruthy()
  })

  it('renders no experiments message when experiments array is empty', () => {
    setup({
      data: {
        summary: { totalExperiments: 0, running: 0, finished: 0, failed: 0 },
        experiments: [],
        workflows: [],
        health: 'healthy',
      },
      showSkeleton: false,
      showEmptyState: false,
    })
    render(<ChaosMeshStatus />)

    expect(screen.getByText('chaosMeshStatus.noExperiments')).toBeTruthy()
  })

  it('renders experiments table when experiments data is available', () => {
    setup({
      data: {
        summary: { totalExperiments: 1, running: 1, finished: 0, failed: 0 },
        experiments: [
          {
            name: 'test-experiment',
            namespace: 'chaos-mesh',
            kind: 'PodChaos',
            phase: 'Running',
            startTime: '2024-01-01T00:00:00Z',
          },
        ],
        workflows: [],
        health: 'healthy',
      },
      showSkeleton: false,
      showEmptyState: false,
    })
    render(<ChaosMeshStatus />)

    expect(screen.getByText('test-experiment')).toBeTruthy()
    expect(screen.getByText('chaos-mesh')).toBeTruthy()
    expect(screen.getByText('PodChaos')).toBeTruthy()
    expect(screen.getByText('Running')).toBeTruthy()
  })

  it('renders workflows section when workflows data is available', () => {
    setup({
      data: {
        summary: { totalExperiments: 0, running: 0, finished: 0, failed: 0 },
        experiments: [],
        workflows: [
          {
            name: 'test-workflow',
            namespace: 'chaos-mesh',
            phase: 'Running',
            progress: '2/5',
          },
        ],
        health: 'healthy',
      },
      showSkeleton: false,
      showEmptyState: false,
    })
    render(<ChaosMeshStatus />)

    expect(screen.getByText('chaosMeshStatus.sectionWorkflows')).toBeTruthy()
    expect(screen.getByText('test-workflow')).toBeTruthy()
    expect(screen.getByText('2/5')).toBeTruthy()
  })

  it('does not render workflows section when workflows array is empty', () => {
    setup({
      data: {
        summary: { totalExperiments: 1, running: 1, finished: 0, failed: 0 },
        experiments: [
          {
            name: 'test-experiment',
            namespace: 'default',
            kind: 'PodChaos',
            phase: 'Running',
            startTime: '2024-01-01T00:00:00Z',
          },
        ],
        workflows: [],
        health: 'healthy',
      },
      showSkeleton: false,
      showEmptyState: false,
    })
    render(<ChaosMeshStatus />)

    expect(screen.queryByText('chaosMeshStatus.sectionWorkflows')).toBeNull()
  })

  it('renders demo badge when isDemoData is true', () => {
    setup({
      data: {
        summary: { totalExperiments: 1, running: 1, finished: 0, failed: 0 },
        experiments: [],
        workflows: [],
        health: 'healthy',
      },
      isDemoData: true,
    })
    render(<ChaosMeshStatus />)

    expect(screen.getByText('Demo')).toBeTruthy()
  })
})
