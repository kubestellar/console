import React from 'react'
/// <reference types='@testing-library/jest-dom/vitest' />
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

import { NotificationChannelSelector } from './NotificationChannelSelector'
import type { AlertChannel } from '../../types/alerts'

const t = (key: string) => key

function makeChannel(overrides: Partial<AlertChannel> = {}): AlertChannel {
  return {
    type: 'browser',
    enabled: true,
    config: {},
    ...overrides,
  }
}

function baseProps(overrides: Partial<React.ComponentProps<typeof NotificationChannelSelector>> = {}) {
  return {
    channels: [makeChannel()],
    error: undefined,
    onAddChannel: vi.fn(),
    onRemoveChannel: vi.fn(),
    onUpdateChannel: vi.fn(),
    t,
    ...overrides,
  }
}

describe('NotificationChannelSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders an error banner when error is set', () => {
    render(<NotificationChannelSelector {...baseProps({ error: 'Slack webhook required' })} />)
    expect(screen.getByText('Slack webhook required')).toBeInTheDocument()
  })

  it('renders no error banner when error is undefined', () => {
    render(<NotificationChannelSelector {...baseProps({ error: undefined })} />)
    expect(screen.queryByText(/required/)).not.toBeInTheDocument()
  })

  it('calls onAddChannel with the correct channel type for each add button', () => {
    const onAddChannel = vi.fn()
    render(<NotificationChannelSelector {...baseProps({ onAddChannel })} />)

    fireEvent.click(screen.getByLabelText('Add browser notification channel'))
    fireEvent.click(screen.getByLabelText('Add Slack notification channel'))
    fireEvent.click(screen.getByLabelText('Add webhook notification channel'))
    fireEvent.click(screen.getByLabelText('Add PagerDuty notification channel'))
    fireEvent.click(screen.getByLabelText('Add OpsGenie notification channel'))

    expect(onAddChannel).toHaveBeenNthCalledWith(1, 'browser')
    expect(onAddChannel).toHaveBeenNthCalledWith(2, 'slack')
    expect(onAddChannel).toHaveBeenNthCalledWith(3, 'webhook')
    expect(onAddChannel).toHaveBeenNthCalledWith(4, 'pagerduty')
    expect(onAddChannel).toHaveBeenNthCalledWith(5, 'opsgenie')
  })

  it('renders one row per channel with a capitalized type label', () => {
    render(
      <NotificationChannelSelector
        {...baseProps({ channels: [makeChannel({ type: 'browser' }), makeChannel({ type: 'slack' })] })}
      />,
    )
    expect(screen.getByText('browser')).toBeInTheDocument()
    expect(screen.getByText('slack')).toBeInTheDocument()
  })

  it('toggles enabled/disabled state via the On/Off button', () => {
    const onUpdateChannel = vi.fn()
    render(
      <NotificationChannelSelector
        {...baseProps({ channels: [makeChannel({ enabled: true })], onUpdateChannel })}
      />,
    )
    const toggle = screen.getByLabelText('Disable browser channel')
    expect(toggle).toHaveTextContent('On')
    fireEvent.click(toggle)
    expect(onUpdateChannel).toHaveBeenCalledWith(0, { enabled: false })
  })

  it('hides the remove button when only one channel remains', () => {
    render(<NotificationChannelSelector {...baseProps({ channels: [makeChannel()] })} />)
    expect(screen.queryByLabelText('Remove browser channel')).not.toBeInTheDocument()
  })

  it('shows and wires the remove button when more than one channel exists', () => {
    const onRemoveChannel = vi.fn()
    render(
      <NotificationChannelSelector
        {...baseProps({
          channels: [makeChannel({ type: 'browser' }), makeChannel({ type: 'slack' })],
          onRemoveChannel,
        })}
      />,
    )
    fireEvent.click(screen.getByLabelText('Remove slack channel'))
    expect(onRemoveChannel).toHaveBeenCalledWith(1)
  })

  it('renders Slack-specific fields and updates config on change', () => {
    const onUpdateChannel = vi.fn()
    render(
      <NotificationChannelSelector
        {...baseProps({ channels: [makeChannel({ type: 'slack' })], onUpdateChannel })}
      />,
    )
    fireEvent.change(screen.getByPlaceholderText('alerts.slackWebhookUrlPlaceholder'), {
      target: { value: 'https://hooks.slack.com/services/x' },
    })
    expect(onUpdateChannel).toHaveBeenCalledWith(0, {
      config: { slackWebhookUrl: 'https://hooks.slack.com/services/x' },
    })
  })

  it('renders webhook-specific field and updates config on change', () => {
    const onUpdateChannel = vi.fn()
    render(
      <NotificationChannelSelector
        {...baseProps({ channels: [makeChannel({ type: 'webhook' })], onUpdateChannel })}
      />,
    )
    fireEvent.change(screen.getByPlaceholderText('alerts.webhookUrlPlaceholder'), {
      target: { value: 'https://example.com/hook' },
    })
    expect(onUpdateChannel).toHaveBeenCalledWith(0, { config: { webhookUrl: 'https://example.com/hook' } })
  })

  it('renders pagerduty-specific password field and updates config on change', () => {
    const onUpdateChannel = vi.fn()
    render(
      <NotificationChannelSelector
        {...baseProps({ channels: [makeChannel({ type: 'pagerduty' })], onUpdateChannel })}
      />,
    )
    const input = screen.getByPlaceholderText('alerts.pagerdutyRoutingKeyPlaceholder')
    expect(input).toHaveAttribute('type', 'password')
    fireEvent.change(input, { target: { value: 'routing-key-123' } })
    expect(onUpdateChannel).toHaveBeenCalledWith(0, { config: { pagerdutyRoutingKey: 'routing-key-123' } })
  })

  it('renders opsgenie-specific password field and updates config on change', () => {
    const onUpdateChannel = vi.fn()
    render(
      <NotificationChannelSelector
        {...baseProps({ channels: [makeChannel({ type: 'opsgenie' })], onUpdateChannel })}
      />,
    )
    const input = screen.getByPlaceholderText('alerts.opsgenieApiKeyPlaceholder')
    expect(input).toHaveAttribute('type', 'password')
    fireEvent.change(input, { target: { value: 'api-key-456' } })
    expect(onUpdateChannel).toHaveBeenCalledWith(0, { config: { opsgenieApiKey: 'api-key-456' } })
  })

  it('renders an empty channel list without crashing', () => {
    render(<NotificationChannelSelector {...baseProps({ channels: [] })} />)
    expect(screen.getByText('alerts.notificationChannels')).toBeInTheDocument()
  })
})
