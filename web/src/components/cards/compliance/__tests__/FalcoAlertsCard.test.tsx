import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FalcoAlertsCard } from '../FalcoAlertsCard'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

const mockUseDemoMode = vi.fn()
vi.mock('../../../../hooks/useDemoMode', () => ({
  useDemoMode: () => mockUseDemoMode(),
}))

const mockStartMission = vi.fn()
vi.mock('../../../../hooks/useMissions', () => ({
  useMissions: () => ({ startMission: mockStartMission }),
}))

const mockUseCardLoadingState = vi.fn()
vi.mock('../../CardDataContext', () => ({
  useCardLoadingState: (...args: unknown[]) => mockUseCardLoadingState(...args),
}))

const mockCheckKeyAndRun = vi.fn((fn: () => void) => fn())
vi.mock('../../console-missions/shared', () => ({
  useApiKeyCheck: () => ({
    showKeyPrompt: false,
    checkKeyAndRun: mockCheckKeyAndRun,
    goToSettings: vi.fn(),
    dismissPrompt: vi.fn(),
  }),
  ApiKeyPromptModal: () => null,
}))

vi.mock('../../../missions/ConfirmMissionPromptDialog', () => ({
  ConfirmMissionPromptDialog: ({
    open,
    onConfirm,
  }: {
    open: boolean
    onConfirm: (prompt: string) => void
  }) =>
    open ? (
      <button data-testid="confirm-mission" onClick={() => onConfirm('install falco')}>
        confirm
      </button>
    ) : null,
}))

vi.mock('../../multi-tenancy/missionLoader', () => ({
  loadMissionPrompt: vi.fn().mockResolvedValue('Install Falco prompt'),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setupDemoMode(isDemoMode: boolean) {
  mockUseDemoMode.mockReturnValue({ isDemoMode })
  mockUseCardLoadingState.mockReturnValue({})
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FalcoAlertsCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupDemoMode(false)
  })

  describe('demo alert list', () => {
    beforeEach(() => setupDemoMode(true))

    it('renders all demo alert messages', () => {
      render(<FalcoAlertsCard config={{}} />)
      expect(screen.getByText('Container escape attempt detected')).toBeInTheDocument()
      expect(screen.getByText('Privileged pod spawned')).toBeInTheDocument()
      expect(screen.getByText('Shell spawned in container')).toBeInTheDocument()
    })

    it('renders severity timestamps for each alert', () => {
      render(<FalcoAlertsCard config={{}} />)
      expect(screen.getByText('2m ago')).toBeInTheDocument()
      expect(screen.getByText('15m ago')).toBeInTheDocument()
      expect(screen.getByText('1h ago')).toBeInTheDocument()
    })

    it('applies critical severity styling', () => {
      render(<FalcoAlertsCard config={{}} />)
      const criticalRow = screen.getByText('Container escape attempt detected').closest('.rounded-lg')
      expect(criticalRow?.className).toMatch(/bg-red-500\/10/)
      expect(criticalRow?.className).toMatch(/text-red-400/)
    })

    it('applies warning severity styling', () => {
      render(<FalcoAlertsCard config={{}} />)
      const warningRow = screen.getByText('Privileged pod spawned').closest('.rounded-lg')
      expect(warningRow?.className).toMatch(/bg-yellow-500\/10/)
      expect(warningRow?.className).toMatch(/text-yellow-400/)
    })

    it('applies info severity styling', () => {
      render(<FalcoAlertsCard config={{}} />)
      const infoRow = screen.getByText('Shell spawned in container').closest('.rounded-lg')
      expect(infoRow?.className).toMatch(/bg-blue-500\/10/)
      expect(infoRow?.className).toMatch(/text-blue-400/)
    })

    it('renders severity icons for each alert row', () => {
      const { container } = render(<FalcoAlertsCard config={{}} />)
      const alertRows = container.querySelectorAll('.rounded-lg.text-xs')
      expect(alertRows.length).toBe(3)
    })
  })

  describe('empty / install state', () => {
    it('shows install prompt when not in demo mode', () => {
      render(<FalcoAlertsCard config={{}} />)
      expect(screen.getByText('cards:falcoAlerts.integration')).toBeInTheDocument()
      expect(screen.getByText('cards:falcoAlerts.noAlertsAvailable')).toBeInTheDocument()
      expect(screen.getByText('cards:falcoAlerts.installWithMission')).toBeInTheDocument()
    })

    it('does not render demo alerts when not in demo mode', () => {
      render(<FalcoAlertsCard config={{}} />)
      expect(screen.queryByText('Container escape attempt detected')).not.toBeInTheDocument()
    })
  })

  describe('useCardLoadingState integration', () => {
    it('passes isDemoData=true when demo mode is active', () => {
      setupDemoMode(true)
      render(<FalcoAlertsCard config={{}} />)
      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({ isDemoData: true, hasAnyData: true, isLoading: false }),
      )
    })

    it('passes isDemoData=false when live mode has no alerts', () => {
      setupDemoMode(false)
      render(<FalcoAlertsCard config={{}} />)
      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({ isDemoData: false, hasAnyData: false }),
      )
    })
  })

  describe('install mission flow', () => {
    it('opens mission confirm dialog after install button click', async () => {
      render(<FalcoAlertsCard config={{}} />)
      await userEvent.click(screen.getByText('cards:falcoAlerts.installWithMission'))
      expect(screen.getByTestId('confirm-mission')).toBeInTheDocument()
    })

    it('starts deploy mission when install is confirmed', async () => {
      render(<FalcoAlertsCard config={{}} />)
      await userEvent.click(screen.getByText('cards:falcoAlerts.installWithMission'))
      await userEvent.click(screen.getByTestId('confirm-mission'))
      expect(mockStartMission).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'deploy',
          title: 'cards:falcoAlerts.missionTitle',
        }),
      )
    })
  })
})
