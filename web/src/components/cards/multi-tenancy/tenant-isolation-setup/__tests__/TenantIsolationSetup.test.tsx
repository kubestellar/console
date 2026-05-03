import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const mockStartMission = vi.fn()
const mockCheckKeyAndRun = vi.fn(async (runner: () => Promise<void>) => runner())
const mockLoadMissionPrompt = vi.fn(async (_key: string, fallback: string) => `Loaded: ${fallback}`)

const mockData = {
  components: [
    { name: 'OVN-Kubernetes', key: 'ovn', detected: true, health: 'healthy' },
    { name: 'KubeFlex', key: 'kubeflex', detected: false, health: 'unknown' },
    { name: 'K3s', key: 'k3s', detected: true, health: 'healthy' },
    { name: 'KubeVirt', key: 'kubevirt', detected: true, health: 'healthy' },
  ],
  isolationLevels: [
    { type: 'Control-plane', status: 'ready', provider: 'KubeFlex + K3s' },
    { type: 'Data-plane', status: 'ready', provider: 'KubeVirt' },
    { type: 'Network', status: 'ready', provider: 'OVN-Kubernetes' },
  ],
  allReady: false,
  readyCount: 3,
  totalComponents: 4,
  isolationScore: 3,
  totalIsolationLevels: 3,
  isLoading: false,
  isDemoData: false,
}

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, defaultValue?: string) => defaultValue ?? _key,
  }),
}))

vi.mock('../../../../../hooks/useMissions', () => ({
  useMissions: () => ({
    startMission: mockStartMission,
    agents: [{ available: true }],
    selectedAgent: null,
  }),
}))

vi.mock('../../console-missions/shared', () => ({
  useApiKeyCheck: () => ({
    showKeyPrompt: false,
    checkKeyAndRun: mockCheckKeyAndRun,
    goToSettings: vi.fn(),
    dismissPrompt: vi.fn(),
  }),
  ApiKeyPromptModal: () => null,
}))

vi.mock('../../console-missions/shared.tsx', () => ({
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
    missionTitle,
    initialPrompt,
    onConfirm,
    onCancel,
  }: {
    open: boolean
    missionTitle: string
    initialPrompt: string
    onConfirm: (prompt: string) => void
    onCancel: () => void
  }) => (
    open
      ? (
        <div>
          <div data-testid="mission-title">{missionTitle}</div>
          <div data-testid="mission-prompt">{initialPrompt}</div>
          <button onClick={() => onConfirm('Edited prompt')}>Confirm Mission</button>
          <button onClick={onCancel}>Cancel Mission</button>
        </div>
        )
      : null
  ),
}))

vi.mock('../../CardDataContext', () => ({
  useCardLoadingState: () => ({
    showSkeleton: false,
  }),
}))

vi.mock('../useTenantIsolationSetup', () => ({
  useTenantIsolationSetup: () => mockData,
}))

vi.mock('../../missionLoader', () => ({
  loadMissionPrompt: (key: string, fallback: string) => mockLoadMissionPrompt(key, fallback),
}))

vi.mock('../../../../ui/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}))

const { TenantIsolationSetup } = await import('../TenantIsolationSetup')

describe('TenantIsolationSetup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders readiness details and install action for missing components', () => {
    render(<MemoryRouter><TenantIsolationSetup /></MemoryRouter>)

    expect(screen.getByText('Component Readiness (3/4)')).toBeInTheDocument()
    expect(screen.getByText('Isolation Levels (3/3)')).toBeInTheDocument()
    expect(screen.getByText('Configure Multi-Tenancy')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Install' })).toBeInTheDocument()
  })

  it('loads configure-all mission prompt when CTA is clicked', async () => {
    render(<MemoryRouter><TenantIsolationSetup /></MemoryRouter>)

    fireEvent.click(screen.getByText('Configure Multi-Tenancy'))

    await waitFor(() => {
      expect(mockLoadMissionPrompt).toHaveBeenCalledTimes(1)
    })

    expect(mockLoadMissionPrompt).toHaveBeenCalledWith(
      'multi-tenancy',
      expect.stringContaining('Configure the multi-tenancy framework'),
    )
    expect(mockStartMission).not.toHaveBeenCalled()
  })
})
