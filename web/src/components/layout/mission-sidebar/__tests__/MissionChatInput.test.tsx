import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { Mission } from '../../../../hooks/useMissions'
import { MissionChatInput } from '../mission-chat/MissionChatInput'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  }),
}))

vi.mock('../../../../lib/cn', () => ({
  cn: (...args: Array<string | false | null | undefined>) => args.filter(Boolean).join(' '),
}))

vi.mock('../../../ui/FileAttachmentButton', () => ({
  FileAttachmentButton: () => <button type="button">attach</button>,
}))

vi.mock('../../../ui/MicrophoneButton', () => ({
  MicrophoneButton: ({ onTranscript }: { onTranscript: (text: string) => void }) => (
    <button type="button" onClick={() => onTranscript('voice update')}>mic</button>
  ),
}))

function createMission(overrides: Partial<Mission> = {}): Mission {
  const now = new Date('2026-01-01T00:00:00Z')

  return {
    id: 'mission-1',
    title: 'Fix cluster policies',
    description: 'Resolve policy conflicts',
    type: 'repair',
    status: 'completed',
    messages: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

const baseProps = {
  compactActionButtonClass: 'compact-btn',
  input: '',
  inputError: null,
  inputRef: { current: null },
  mission: createMission(),
  statusLabel: 'Completed',
  statusColor: 'text-green-400',
  onDismissMission: vi.fn(),
  onInputChange: vi.fn(),
  onKeyDown: vi.fn(),
  onMicrophoneTranscript: vi.fn(),
  onRetryMission: vi.fn(),
  onRetryPreflight: vi.fn(),
  onSend: vi.fn(),
}

describe('MissionChatInput', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the completed follow-up composer and handles user input actions', () => {
    render(
      <MissionChatInput
        {...baseProps}
        mission={createMission({ status: 'completed' })}
        input="follow-up"
      />
    )

    const input = screen.getByPlaceholderText('Ask a follow-up question...')
    fireEvent.change(input, { target: { value: 'updated follow-up' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.click(screen.getByText('mic'))

    const sendButton = screen.getAllByRole('button').find((button) => button.textContent === '')
    expect(sendButton).toBeDefined()
    if (sendButton) {
      fireEvent.click(sendButton)
    }

    expect(baseProps.onInputChange).toHaveBeenCalledWith('updated follow-up')
    expect(baseProps.onKeyDown).toHaveBeenCalled()
    expect(baseProps.onMicrophoneTranscript).toHaveBeenCalledWith('voice update')
    expect(baseProps.onSend).toHaveBeenCalled()
  })

  it('renders blocked mission recovery actions', () => {
    render(
      <MissionChatInput
        {...baseProps}
        mission={createMission({ status: 'blocked' })}
        statusLabel="Blocked"
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Retry Preflight Check' }))
    fireEvent.click(screen.getByRole('button', { name: /Dismiss Mission/ }))

    expect(baseProps.onRetryPreflight).toHaveBeenCalledTimes(1)
    expect(baseProps.onDismissMission).toHaveBeenCalledTimes(1)
  })

  it('shows failed mission retry controls only when there is a user message', () => {
    const missionWithUserMessage = createMission({
      status: 'failed',
      messages: [
        {
          id: 'user-1',
          role: 'user',
          content: 'Retry with the same plan',
          timestamp: new Date('2026-01-01T00:00:00Z'),
        },
      ],
    })

    const { rerender } = render(
      <MissionChatInput
        {...baseProps}
        mission={missionWithUserMessage}
        input="retry details"
        inputError="Message is too long"
        statusLabel="Failed"
      />
    )

    expect(screen.getByRole('button', { name: 'Retry Mission' })).toBeInTheDocument()
    expect(screen.getByText('Message is too long')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Retry Mission' }))
    expect(baseProps.onRetryMission).toHaveBeenCalledTimes(1)

    rerender(
      <MissionChatInput
        {...baseProps}
        mission={createMission({ status: 'failed', messages: [] })}
        statusLabel="Failed"
      />
    )

    expect(screen.queryByRole('button', { name: 'Retry Mission' })).not.toBeInTheDocument()
  })

  it('renders non-interactive waiting states for running and cancelling missions', () => {
    const { rerender } = render(
      <MissionChatInput
        {...baseProps}
        mission={createMission({ status: 'running' })}
      />
    )

    expect(screen.getByPlaceholderText('Waiting for agent to finish...')).toBeDisabled()

    rerender(
      <MissionChatInput
        {...baseProps}
        mission={createMission({ status: 'cancelling' })}
      />
    )

    expect(screen.getByText('Cancelling mission...')).toBeInTheDocument()
  })
})
