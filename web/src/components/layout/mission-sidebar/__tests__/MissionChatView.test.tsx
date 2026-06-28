import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { Mission } from '../../../../hooks/useMissions'
import { MAX_MESSAGE_SIZE_CHARS } from '../../../../lib/constants'
import { MissionChat } from '../MissionChat'

const missionActions = {
  sendMessage: vi.fn(),
  editAndResend: vi.fn(() => null),
  retryPreflight: vi.fn(),
  cancelMission: vi.fn(),
  rateMission: vi.fn(),
  setActiveMission: vi.fn(),
  dismissMission: vi.fn(),
  renameMission: vi.fn(),
  runSavedMission: vi.fn(),
  updateSavedMission: vi.fn(),
}

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  }),
}))

vi.mock('../../../../hooks/useMissions', () => ({
  useMissions: () => missionActions,
}))

vi.mock('../../../../lib/auth', () => ({
  useAuth: () => ({ user: null }),
}))

vi.mock('../../../../hooks/useDemoMode', () => ({
  useDemoMode: () => ({ isDemoMode: false, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() }),
}))

vi.mock('../../../../hooks/useResolutions', () => ({
  useResolutions: () => ({
    findSimilarResolutions: vi.fn(() => []),
    recordUsage: vi.fn(),
  }),
  detectIssueSignature: vi.fn(() => ({ type: 'Unknown' })),
}))

vi.mock('../../../../lib/demoMode', () => ({
  isNetlifyDeployment: false,
}))

vi.mock('../../../../lib/cn', () => ({
  cn: (...args: Array<string | false | null | undefined>) => args.filter(Boolean).join(' '),
}))

vi.mock('../../../../lib/modals', () => ({
  ConfirmDialog: ({ isOpen, onConfirm }: { isOpen: boolean; onConfirm: () => void }) => (
    isOpen ? <button type="button" onClick={onConfirm}>confirm delete</button> : null
  ),
}))

vi.mock('../../../ui/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}))

vi.mock('../../../../lib/download', () => ({
  downloadText: () => ({ ok: true }),
}))

vi.mock('../../../missions/SaveResolutionDialog', () => ({
  SaveResolutionDialog: () => null,
}))

vi.mock('../../../setup/SetupInstructionsDialog', () => ({
  SetupInstructionsDialog: ({ isOpen }: { isOpen: boolean }) => (
    isOpen ? <div>setup instructions</div> : null
  ),
}))

vi.mock('../mission-chat/MissionChatHeader', () => ({
  MissionChatHeader: ({
    isEditingTitle,
    editTitleValue,
    onStartEditingTitle,
    onEditTitleChange,
    onSaveTitle,
  }: {
    isEditingTitle: boolean
    editTitleValue: string
    onStartEditingTitle: () => void
    onEditTitleChange: (value: string) => void
    onSaveTitle: () => void
  }) => (
    <div>
      <button type="button" onClick={onStartEditingTitle}>rename mission</button>
      {isEditingTitle && (
        <>
          <input
            aria-label="mission title"
            value={editTitleValue}
            onChange={(event) => onEditTitleChange(event.target.value)}
          />
          <button type="button" onClick={onSaveTitle}>save title</button>
        </>
      )}
    </div>
  ),
}))

vi.mock('../mission-chat/MissionChatMessages', () => ({
  MissionChatMessages: () => <div data-testid="mission-chat-messages" />,
}))

vi.mock('../mission-chat/MissionChatInput', () => ({
  MissionChatInput: ({
    input,
    inputError,
    onInputChange,
    onRetryMission,
    onSend,
  }: {
    input: string
    inputError: string | null
    onInputChange: (value: string) => void
    onRetryMission: () => void
    onSend: () => void
  }) => (
    <div>
      <input
        aria-label="chat input"
        value={input}
        onChange={(event) => onInputChange(event.target.value)}
      />
      <button type="button" onClick={onSend}>send message</button>
      <button type="button" onClick={onRetryMission}>retry mission</button>
      {inputError ? <span>{inputError}</span> : null}
    </div>
  ),
}))

vi.mock('../mission-chat/MissionChatSidebar', () => ({
  MissionChatSidebar: () => <div data-testid="mission-chat-sidebar" />,
}))

function createMission(overrides: Partial<Mission> = {}): Mission {
  const now = new Date('2026-01-01T00:00:00Z')

  return {
    id: 'mission-1',
    title: 'Restore cluster health',
    description: 'Diagnose and fix the policy pipeline',
    type: 'repair',
    status: 'completed',
    messages: [
      {
        id: 'msg-user',
        role: 'user',
        content: 'Check cluster health',
        timestamp: now,
      },
    ],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

describe('MissionChat view logic', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('prevents oversize messages and surfaces an input error', () => {
    render(<MissionChat mission={createMission()} />)

    fireEvent.change(screen.getByLabelText('chat input'), {
      target: { value: 'x'.repeat(MAX_MESSAGE_SIZE_CHARS + 1) },
    })
    fireEvent.click(screen.getByRole('button', { name: 'send message' }))

    expect(missionActions.sendMessage).not.toHaveBeenCalled()
    expect(screen.getByText(/Message is too long/)).toBeInTheDocument()
  })

  it('retries a failed mission with the last user prompt', () => {
    const mission = createMission({
      status: 'failed',
      messages: [
        {
          id: 'assistant-1',
          role: 'assistant',
          content: 'Initial response',
          timestamp: new Date('2026-01-01T00:00:01Z'),
        },
        {
          id: 'user-2',
          role: 'user',
          content: 'Use the saved rollback plan',
          timestamp: new Date('2026-01-01T00:00:02Z'),
        },
      ],
    })

    render(<MissionChat mission={mission} />)
    fireEvent.click(screen.getByRole('button', { name: 'retry mission' }))

    expect(missionActions.sendMessage).toHaveBeenCalledWith('mission-1', 'Use the saved rollback plan')
  })

  it('renames the mission when the edited title is saved', () => {
    render(<MissionChat mission={createMission()} />)

    fireEvent.click(screen.getByRole('button', { name: 'rename mission' }))
    fireEvent.change(screen.getByLabelText('mission title'), { target: { value: 'New mission title' } })
    fireEvent.click(screen.getByRole('button', { name: 'save title' }))

    expect(missionActions.renameMission).toHaveBeenCalledWith('mission-1', 'New mission title')
  })

  it('opens setup instructions when a local agent disconnect message arrives', () => {
    const { rerender } = render(
      <MissionChat
        mission={createMission({
          status: 'waiting_input',
          messages: [
            {
              id: 'msg-user',
              role: 'user',
              content: 'Connect the agent',
              timestamp: new Date('2026-01-01T00:00:00Z'),
            },
          ],
        })}
      />
    )

    rerender(
      <MissionChat
        mission={createMission({
          status: 'waiting_input',
          updatedAt: new Date('2026-01-01T00:00:10Z'),
          messages: [
            {
              id: 'msg-user',
              role: 'user',
              content: 'Connect the agent',
              timestamp: new Date('2026-01-01T00:00:00Z'),
            },
            {
              id: 'msg-system',
              role: 'system',
              content: 'Local Agent Not Connected. Please install the local agent.',
              timestamp: new Date('2026-01-01T00:00:10Z'),
            },
          ],
        })}
      />
    )

    expect(screen.getByText('setup instructions')).toBeInTheDocument()
  })
})
