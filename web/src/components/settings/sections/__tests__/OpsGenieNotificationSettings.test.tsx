import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { NotificationConfig } from '../../../../types/alerts'
import { OpsGenieNotificationSettings } from '../OpsGenieNotificationSettings'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
}))

const createProps = (overrides: Partial<React.ComponentProps<typeof OpsGenieNotificationSettings>> = {}) => ({
  config: {} as NotificationConfig,
  updateConfig: vi.fn(),
  testResult: null,
  setTestResult: vi.fn(),
  testNotification: vi.fn().mockResolvedValue(undefined),
  isLoading: false,
  ...overrides,
})

describe('OpsGenieNotificationSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('requires an API key before running a test notification', () => {
    const props = createProps()

    render(<OpsGenieNotificationSettings {...props} />)

    fireEvent.click(screen.getByRole('button', { name: 'Test OpsGenie' }))

    expect(props.setTestResult).toHaveBeenCalledWith({
      type: 'opsgenie',
      success: false,
      message: 'settings.notifications.opsgenie.apiKeyRequired',
    })
  })

  it('sends a test notification when the API key is configured', async () => {
    const props = createProps({
      config: { opsgenieApiKey: 'ops-key' },
    })

    render(<OpsGenieNotificationSettings {...props} />)

    fireEvent.click(screen.getByRole('button', { name: 'Test OpsGenie' }))

    await waitFor(() => {
      expect(props.testNotification).toHaveBeenCalledWith('opsgenie', { opsgenieApiKey: 'ops-key' })
    })

    expect(props.setTestResult).toHaveBeenNthCalledWith(1, null)
    expect(props.setTestResult).toHaveBeenNthCalledWith(2, {
      type: 'opsgenie',
      success: true,
      message: 'settings.notifications.opsgenie.testSuccess',
    })
  })
})
