import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CrioStatus } from '../CrioStatus'

vi.mock('../useCrioStatus', () => ({
  useCrioStatus: vi.fn(),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

import { useCrioStatus } from '../useCrioStatus'

const BASE_DATA = {
  detected: true,
  totalNodes: 2,
  versions: { '1.30.0': 2 },
  health: 'healthy' as const,
  runtimeMetrics: {
    runningContainers: 10,
    pausedContainers: 1,
    stoppedContainers: 0,
  },
  imagePulls: {
    total: 12,
    successful: 12,
    failed: 0,
  },
  podSandboxes: {
    ready: 5,
    notReady: 0,
    total: 5,
  },
  recentImagePulls: [],
  lastCheckTime: new Date().toISOString(),
}

describe('CrioStatus', () => {
  it('renders skeleton when loading', () => {
    vi.mocked(useCrioStatus).mockReturnValue({
      data: BASE_DATA,
      loading: true,
      isRefreshing: false,
      error: false,
      consecutiveFailures: 0,
      showSkeleton: true,
      showEmptyState: false,
    })

    const { container } = render(<CrioStatus />)
    expect(container.querySelector('.animate-pulse')).toBeTruthy()
  })

  it('renders not installed state when CRI-O is not detected', () => {
    vi.mocked(useCrioStatus).mockReturnValue({
      data: {
        ...BASE_DATA,
        detected: false,
        health: 'not-installed',
        totalNodes: 0,
      },
      loading: false,
      isRefreshing: false,
      error: false,
      consecutiveFailures: 0,
      showSkeleton: false,
      showEmptyState: false,
    })

    render(<CrioStatus />)
    expect(screen.getByText('crio.notInstalled')).toBeTruthy()
  })

  it('renders data view when loaded', () => {
    vi.mocked(useCrioStatus).mockReturnValue({
      data: BASE_DATA,
      loading: false,
      isRefreshing: false,
      error: false,
      consecutiveFailures: 0,
      showSkeleton: false,
      showEmptyState: false,
    })

    render(<CrioStatus />)
    expect(screen.getByText('crio.healthy')).toBeTruthy()
    expect(screen.getByText('crio.totalNodes')).toBeTruthy()
  })
})
