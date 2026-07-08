import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const mockDeleteResolution = vi.hoisted(() => vi.fn())
const mockShareResolution = vi.hoisted(() => vi.fn())

vi.mock('../../../lib/demoMode', () => ({
  isDemoMode: () => true, getDemoMode: () => true, isNetlifyDeployment: false,
  isDemoModeForced: false, canToggleDemoMode: () => true, setDemoMode: vi.fn(),
  toggleDemoMode: vi.fn(), subscribeDemoMode: () => () => {},
  isDemoToken: () => true, hasRealToken: () => false, setDemoToken: vi.fn(),
  isFeatureEnabled: () => true,
}))

vi.mock('../../../hooks/useDemoMode', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../hooks/useDemoMode')>()),
  getDemoMode: () => true, default: () => true,
  useDemoMode: () => ({ isDemoMode: true, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() }),
  hasRealToken: () => false, isDemoModeForced: false, isNetlifyDeployment: false,
  canToggleDemoMode: () => true, isDemoToken: () => true, setDemoToken: vi.fn(),
  setGlobalDemoMode: vi.fn(),
}))

vi.mock('../../../lib/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/analytics')>()),
  emitNavigate: vi.fn(), emitLogin: vi.fn(), emitEvent: vi.fn(), analyticsReady: Promise.resolve(),
  emitAddCardModalOpened: vi.fn(), emitCardExpanded: vi.fn(), emitCardRefreshed: vi.fn(),
}
))

vi.mock('../../../hooks/useTokenUsage', () => ({
  useTokenUsage: () => ({ usage: { total: 0, remaining: 0, used: 0 }, isLoading: false }),
  tokenUsageTracker: { getUsage: () => ({ total: 0, remaining: 0, used: 0 }), trackRequest: vi.fn(), getSettings: () => ({ enabled: false }) },
}))

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en', changeLanguage: vi.fn() } }),
  Trans: ({ children }: { children: React.ReactNode }) => children,
}))

vi.mock('../../../hooks/useResolutions', () => ({
  useResolutions: () => ({
    resolutions: [{
      id: 'resolution-1',
      missionId: 'mission-1',
      userId: 'user-1',
      title: 'Sample Resolution',
      visibility: 'private',
      issueSignature: { type: 'CrashLoopBackOff' },
      resolution: { summary: 'Restart the workload', steps: ['kubectl rollout restart deploy/app'] },
      context: {},
      effectiveness: { timesUsed: 1, timesSuccessful: 1 },
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    }],
    sharedResolutions: [],
    deleteResolution: mockDeleteResolution,
    shareResolution: mockShareResolution,
  }),
}))

vi.mock('../../../lib/cn', () => ({
  cn: (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' '),
}))

vi.mock('../../../lib/modals', () => ({
  ConfirmDialog: ({
    isOpen,
    title,
    message,
    confirmLabel,
    onConfirm,
  }: {
    isOpen: boolean
    title: string
    message: string
    confirmLabel: string
    onConfirm: () => void
  }) => isOpen ? (
    <div>
      <div>{title}</div>
      <div>{message}</div>
      <button onClick={onConfirm}>{confirmLabel}</button>
    </div>
  ) : null,
}))

import { ResolutionHistoryPanel } from '../ResolutionHistoryPanel'

describe('ResolutionHistoryPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders without crashing', () => {
    const { container } = render(<ResolutionHistoryPanel />)
    expect(container).toBeTruthy()
  })

  it('deletes a resolution using the current delete flow', async () => {
    const user = userEvent.setup()
    render(<ResolutionHistoryPanel />)

    await user.click(screen.getByLabelText('common.view'))
    await user.click(screen.getByTitle('actions.delete'))

    const confirmButton = screen.queryByRole('button', { name: 'resolutionHistoryPanel.deleteConfirmLabel' })

    if (confirmButton) {
      expect(mockDeleteResolution).not.toHaveBeenCalled()
      expect(screen.getByText('resolutionHistoryPanel.deleteTitle')).toBeInTheDocument()
      await user.click(confirmButton)
    }

    expect(mockDeleteResolution).toHaveBeenCalledWith('resolution-1')
  })
})
