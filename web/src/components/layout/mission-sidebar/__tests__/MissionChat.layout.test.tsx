import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MissionChat } from '../MissionChat'
import type { Mission } from '../../../../hooks/useMissionTypes'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  }),
}))

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

vi.mock('../../../../hooks/useMissions', () => ({
  useMissions: () => missionActions,
}))

vi.mock('../../../../lib/auth', () => ({
  useAuth: () => ({ user: null }),
}))

vi.mock('../../../../hooks/useDemoMode', () => ({
  useDemoMode: () => ({ isDemoMode: false }),
}))

vi.mock('../../../../lib/demoMode', () => ({
  isNetlifyDeployment: false,
}))

vi.mock('../../../../hooks/useResolutions', () => ({
  useResolutions: () => ({
    findSimilarResolutions: vi.fn(() => []),
    recordUsage: vi.fn(),
  }),
  detectIssueSignature: vi.fn(() => ({ type: 'Unknown' })),
}))

vi.mock('../../../../lib/cn', () => ({
  cn: (...args: Array<string | false | null | undefined>) => args.filter(Boolean).join(' '),
}))

vi.mock('../../../../lib/modals', () => ({
  ConfirmDialog: () => null,
}))

vi.mock('../../../ui/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}))

vi.mock('../../../../lib/download', () => ({
  downloadText: () => ({ ok: true }),
}))

vi.mock('../../../missions/PreflightFailure', () => ({
  PreflightFailure: () => <div data-testid="preflight-failure" />,
}))

vi.mock('../../../missions/SaveResolutionDialog', () => ({
  SaveResolutionDialog: () => null,
}))

vi.mock('../../../setup/SetupInstructionsDialog', () => ({
  SetupInstructionsDialog: () => null,
}))

vi.mock('../../../missions/OrbitSetupOffer', () => ({
  OrbitSetupOffer: () => <div data-testid="orbit-setup-offer" />,
}))

vi.mock('../../../missions/OrbitMonitorOffer', () => ({
  OrbitMonitorOffer: () => <div data-testid="orbit-monitor-offer" />,
}))

vi.mock('../../../ui/MicrophoneButton', () => ({
  MicrophoneButton: () => <button type="button">mic</button>,
}))

vi.mock('../../../ui/FileAttachmentButton', () => ({
  FileAttachmentButton: () => <button type="button">attach</button>,
}))

vi.mock('../TypingIndicator', () => ({
  TypingIndicator: () => <div data-testid="typing-indicator" />,
}))

vi.mock('../MemoizedMessage', () => ({
  MemoizedMessage: ({ msg }: { msg: { content: string } }) => <div>{msg.content}</div>,
}))

function createMission(overrides: Partial<Mission> = {}): Mission {
  const now = new Date('2026-05-15T00:00:00.000Z')

  return {
    id: 'mission-1',
    title: 'Install KubeStellar',
    description: 'Install and validate the control plane',
    type: 'deploy',
    status: 'completed',
    messages: [
      {
        id: 'msg-1',
        role: 'user',
        content: 'Please install KubeStellar',
        timestamp: now,
      },
      {
        id: 'msg-2',
        role: 'assistant',
        content: 'Installation completed successfully.',
        timestamp: now,
      },
    ],
    createdAt: now,
    updatedAt: now,
    importedFrom: {
      title: 'Install KubeStellar',
      description: 'Install KubeStellar mission',
      missionClass: 'install',
      cncfProject: 'KubeStellar',
      steps: [],
      tags: [],
    },
    ...overrides,
  }
}

describe('MissionChat layout', () => {
  it('keeps the composer pinned while completed mission extras stay in the scroll region', () => {
    render(<MissionChat mission={createMission()} />)

    const scrollRegion = screen.getByTestId('mission-chat-scroll-region')
    const composer = screen.getByTestId('mission-chat-composer')

    expect(scrollRegion.className).toContain('overflow-y-auto')
    expect(scrollRegion.parentElement?.className).toContain('min-h-0')
    expect(composer.className).toContain('sticky')
    expect(composer.className).toContain('bottom-0')
    expect(within(scrollRegion).getByTestId('orbit-setup-offer')).toBeInTheDocument()
    expect(within(composer).getByPlaceholderText('Ask a follow-up question...')).toBeInTheDocument()
    expect(within(composer).queryByTestId('orbit-setup-offer')).not.toBeInTheDocument()
  })
})
