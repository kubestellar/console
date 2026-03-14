// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FluentdStatus } from '../FluentdStatus'
import type { FluentdStatus as FluentdStatusData } from '../useFluentdStatus'

const mockUseFluentdStatus = vi.fn()

vi.mock('../useFluentdStatus', () => ({
  useFluentdStatus: () => mockUseFluentdStatus(),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, secondArg?: unknown) => {
      if (typeof secondArg === 'string') {
        return secondArg
      }
      return key
    },
  }),
}))

const BASE_DATA: FluentdStatusData = {
  health: 'healthy',
  pods: { ready: 2, total: 2 },
  bufferUtilization: 0,
  eventsPerSecond: 4.2,
  retryCount: 0,
  outputPlugins: [
    {
      name: 'elasticsearch-output',
      type: 'elasticsearch',
      status: 'healthy',
      emitCount: 1234,
      errorCount: 0,
    },
  ],
  lastCheckTime: new Date().toISOString(),
}

describe('FluentdStatus', () => {
  beforeEach(() => {
    mockUseFluentdStatus.mockReset()
  })

  it('renders skeleton when loading state is active', () => {
    mockUseFluentdStatus.mockReturnValue({
      data: BASE_DATA,
      loading: true,
      isRefreshing: false,
      isDemoFallback: false,
      error: false,
      consecutiveFailures: 0,
      showSkeleton: true,
      showEmptyState: false,
    })

    const { container } = render(<FluentdStatus />)
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument()
  })

  it('renders not-installed message when Fluentd is not detected', () => {
    mockUseFluentdStatus.mockReturnValue({
      data: { ...BASE_DATA, health: 'not-installed', pods: { ready: 0, total: 0 } },
      loading: false,
      isRefreshing: false,
      isDemoFallback: false,
      error: false,
      consecutiveFailures: 0,
      showSkeleton: false,
      showEmptyState: false,
    })

    render(<FluentdStatus />)
    expect(screen.getByText('Fluentd not detected')).toBeVisible()
  })

  it('renders loaded metric and plugin content', () => {
    mockUseFluentdStatus.mockReturnValue({
      data: BASE_DATA,
      loading: false,
      isRefreshing: false,
      isDemoFallback: false,
      error: false,
      consecutiveFailures: 0,
      showSkeleton: false,
      showEmptyState: false,
    })

    render(<FluentdStatus />)
    expect(screen.getByText('Pods')).toBeVisible()
    expect(screen.getByText('elasticsearch-output')).toBeVisible()
  })
})
