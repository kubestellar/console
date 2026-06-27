import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { NotificationConfig } from '../../../../types/alerts'
import { EmailNotificationSettings } from '../EmailNotificationSettings'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

const createProps = (overrides: Partial<React.ComponentProps<typeof EmailNotificationSettings>> = {}) => ({
  config: {} as NotificationConfig,
  updateConfig: vi.fn(),
  testResult: null,
  setTestResult: vi.fn(),
  testNotification: vi.fn().mockResolvedValue(undefined),
  isLoading: false,
  ...overrides,
})

describe('EmailNotificationSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows an inline error for an invalid SMTP port and avoids updating config', () => {
    const props = createProps()

    render(<EmailNotificationSettings {...props} />)

    fireEvent.change(screen.getByLabelText('settings.notifications.email.smtpPort'), {
      target: { value: '70000' },
    })

    expect(screen.getByRole('alert')).toHaveTextContent('settings.notifications.email.invalidSmtpPort')
    expect(props.updateConfig).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'settings.notifications.email.testNotification' })).toBeDisabled()
  })

  it('requires email settings before sending a test notification', () => {
    const props = createProps()

    render(<EmailNotificationSettings {...props} />)

    fireEvent.click(screen.getByRole('button', { name: 'settings.notifications.email.testNotification' }))

    expect(props.setTestResult).toHaveBeenCalledWith({
      type: 'email',
      success: false,
      message: 'settings.notifications.email.configureFirst',
    })
  })

  it('sends a test email when the configuration is complete', async () => {
    const props = createProps({
      config: {
        emailSMTPHost: 'smtp.example.com',
        emailSMTPPort: 2525,
        emailFrom: 'alerts@example.com',
        emailTo: 'team@example.com',
        emailUsername: 'mailer',
        emailPassword: 'secret',
      },
    })

    render(<EmailNotificationSettings {...props} />)

    fireEvent.click(screen.getByRole('button', { name: 'settings.notifications.email.testNotification' }))

    await waitFor(() => {
      expect(props.testNotification).toHaveBeenCalledWith('email', {
        emailSMTPHost: 'smtp.example.com',
        emailSMTPPort: 2525,
        emailFrom: 'alerts@example.com',
        emailTo: 'team@example.com',
        emailUsername: 'mailer',
        emailPassword: 'secret',
      })
    })

    expect(props.setTestResult).toHaveBeenNthCalledWith(1, null)
    expect(props.setTestResult).toHaveBeenNthCalledWith(2, {
      type: 'email',
      success: true,
      message: 'settings.notifications.email.testSuccess',
    })
  })
})
