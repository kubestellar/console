/// <reference types='@testing-library/jest-dom/vitest' />
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CloudEventsStatus } from '../CloudEventsStatus'
import type { UseCloudEventsStatusResult } from '../useCloudEventsStatus'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}))

vi.mock('../useCloudEventsStatus', () => ({
  useCloudEventsStatus: vi.fn(),
}))

import { useCloudEventsStatus } from '../useCloudEventsStatus'

const mockedUseCloudEventsStatus = vi.mocked(useCloudEventsStatus)

const BASE_RESULT: UseCloudEventsStatusResult = {
  data: {
    health: 'healthy',
    brokers: { total: 2, ready: 2, notReady: 0 },
    triggers: { total: 3, ready: 2, notReady: 1 },
    eventSources: { total: 2, ready: 1, failed: 1 },
    deliveries: { successful: 2, failed: 1, unknown: 0 },
    resources: [
      {
        name: 'orders-broker',
        namespace: 'eventing',
        cluster: 'dev-us-east',
        kind: 'Broker',
        state: 'ready',
        sink: 'order-sink',
        lastSeen: new Date().toISOString(),
      },
    ],
    lastCheckTime: new Date().toISOString(),
  },
  loading: false,
  isRefreshing: false,
  error: false,
  consecutiveFailures: 0,
  showSkeleton: false,
  showEmptyState: false,
}

describe('CloudEventsStatus', () => {
  it('renders skeleton state when loading', () => {
    mockedUseCloudEventsStatus.mockReturnValue({
      ...BASE_RESULT,
      showSkeleton: true,
    })

    const { container } = render(<CloudEventsStatus />)
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
  })

  it('renders not-installed state', () => {
    mockedUseCloudEventsStatus.mockReturnValue({
      ...BASE_RESULT,
      data: {
        ...BASE_RESULT.data,
        health: 'not-installed',
      },
    })

    render(<CloudEventsStatus />)
    expect(screen.getByText('cloudevents.notInstalled')).toBeInTheDocument()
    expect(screen.getByText('cloudevents.notInstalledHint')).toBeInTheDocument()
  })

  it('renders data state with metrics and resources', () => {
    mockedUseCloudEventsStatus.mockReturnValue(BASE_RESULT)

    render(<CloudEventsStatus />)
    expect(screen.getByText('cloudevents.brokers')).toBeInTheDocument()
    expect(screen.getByText('cloudevents.triggers')).toBeInTheDocument()
    expect(screen.getByText('cloudevents.sources')).toBeInTheDocument()
    expect(screen.getByText('orders-broker')).toBeInTheDocument()
  })
})
