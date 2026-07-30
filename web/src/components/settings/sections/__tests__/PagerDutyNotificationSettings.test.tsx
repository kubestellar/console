import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { NotificationConfig } from '../../../../types/alerts'
import { PagerDutyNotificationSettings } from '../PagerDutyNotificationSettings'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
}))

const createProps = (overrides: Partial<React.ComponentProps<typeof PagerDutyNotificationSettings>> = {}) => ({
  config: {} as NotificationConfig,
  updateConfig: vi.fn(),
  testResult: null,
  setTestResult: vi.fn(),
  testNotification: vi.fn().mockResolvedValue(undefined),
  isLoading: false,
  ...overrides,
})

describe('PagerDutyNotificationSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('requires a routing key before running a test notification', () => {
    const props = createProps()

    render(<PagerDutyNotificationSettings {...props} />)

    fireEvent.click(screen.getByRole('button', { name: 'Test PagerDuty' }))

    expect(props.setTestResult).toHaveBeenCalledWith({
      type: 'pagerduty',
      success: false,
      message: 'settings.notifications.pagerduty.routingKeyRequired',
    })
  })

  it('sends a test notification when the routing key is configured', async () => {
    const props = createProps({
      config: { pagerdutyRoutingKey: 'routing-key' },
    })

    render(<PagerDutyNotificationSettings {...props} />)

    fireEvent.click(screen.getByRole('button', { name: 'Test PagerDuty' }))

    await waitFor(() => {
      expect(props.testNotification).toHaveBeenCalledWith('pagerduty', { pagerdutyRoutingKey: 'routing-key' })
    })

    expect(props.setTestResult).toHaveBeenNthCalledWith(1, null)
    expect(props.setTestResult).toHaveBeenNthCalledWith(2, {
      type: 'pagerduty',
      success: true,
      message: 'settings.notifications.pagerduty.testSuccess',
    })
  })
})
