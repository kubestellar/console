import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { MissionSidebar, MissionSidebarToggle } from '../MissionSidebar'

interface MockMissionState {
  missions: Array<{ status: string }>
  activeMission: null
  isSidebarOpen: boolean
  isSidebarMinimized: boolean
  isFullScreen: boolean
  setActiveMission: ReturnType<typeof vi.fn>
  closeSidebar: ReturnType<typeof vi.fn>
  dismissMission: ReturnType<typeof vi.fn>
  cancelMission: ReturnType<typeof vi.fn>
  minimizeSidebar: ReturnType<typeof vi.fn>
  expandSidebar: ReturnType<typeof vi.fn>
  setFullScreen: ReturnType<typeof vi.fn>
  selectedAgent: string
  startMission: ReturnType<typeof vi.fn>
  saveMission: ReturnType<typeof vi.fn>
  runSavedMission: ReturnType<typeof vi.fn>
  openSidebar: ReturnType<typeof vi.fn>
  sendMessage: ReturnType<typeof vi.fn>
}

let mockMissionState: MockMissionState
let mockIsMobile = false

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string; count?: number }) => options?.defaultValue ?? key,
  }),
}))

vi.mock('../../../../hooks/useMissions', () => ({
  useMissions: () => mockMissionState,
  isActiveMission: (mission: { status: string }) => mission.status === 'running' || mission.status === 'waiting_input' || mission.status === 'blocked',
}))

vi.mock('../../../../hooks/useMobile', () => ({
  useMobile: () => ({ isMobile: mockIsMobile }),
}))

vi.mock('../../../../hooks/useResolutions', () => ({
  useResolutions: () => ({
    findSimilarResolutions: vi.fn(() => []),
    allResolutions: [],
  }),
  detectIssueSignature: vi.fn(() => null),
}))

vi.mock('../../../../lib/cn', () => ({
  cn: (...args: Array<string | false | null | undefined>) => args.filter(Boolean).join(' '),
}))

vi.mock('../../../agent/AgentSelector', () => ({
  AgentSelector: () => <div data-testid="agent-selector" />,
}))

vi.mock('../../../ui/LogoWithStar', () => ({
  LogoWithStar: () => <div data-testid="logo-with-star" />,
}))

vi.mock('../../../ui/StatusBadge', () => ({
  StatusBadge: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock('../MissionListItem', () => ({
  MissionListItem: () => <div data-testid="mission-list-item" />,
}))

vi.mock('../MissionChat', () => ({
  MissionChat: () => <div data-testid="mission-chat" />,
}))

vi.mock('../../../missions/OrbitReminderBanner', () => ({
  OrbitReminderBanner: () => <div data-testid="orbit-reminder-banner" />,
}))

vi.mock('../../../missions/MissionTypeExplainer', () => ({
  MissionTypeExplainer: () => <div data-testid="mission-type-explainer" />,
}))

vi.mock('../../../mission-control/MissionControlDialog', () => ({
  MissionControlDialog: ({ open }: { open: boolean }) => open ? <div data-testid="mission-control-dialog" /> : null,
}))

vi.mock('../../../missions/MissionDetailView', () => ({
  MissionDetailView: () => <div data-testid="mission-detail-view" />,
}))

vi.mock('../../../missions/StandaloneOrbitDialog', () => ({
  StandaloneOrbitDialog: () => <div data-testid="standalone-orbit-dialog" />,
}))

vi.mock('../../../missions/ClusterSelectionDialog', () => ({
  ClusterSelectionDialog: () => <div data-testid="cluster-selection-dialog" />,
}))

vi.mock('../../../missions/ResolutionKnowledgePanel', () => ({
  ResolutionKnowledgePanel: () => <div data-testid="resolution-knowledge-panel" />,
}))

vi.mock('../../../missions/ResolutionHistoryPanel', () => ({
  ResolutionHistoryPanel: () => <div data-testid="resolution-history-panel" />,
}))

vi.mock('../../../missions/SaveResolutionDialog', () => ({
  SaveResolutionDialog: () => <div data-testid="save-resolution-dialog" />,
}))

beforeEach(() => {
  mockIsMobile = false
  mockMissionState = {
    missions: [],
    activeMission: null,
    isSidebarOpen: false,
    isSidebarMinimized: false,
    isFullScreen: false,
    setActiveMission: vi.fn(),
    closeSidebar: vi.fn(),
    dismissMission: vi.fn(),
    cancelMission: vi.fn(),
    minimizeSidebar: vi.fn(),
    expandSidebar: vi.fn(),
    setFullScreen: vi.fn(),
    selectedAgent: 'claude-sonnet-4.6',
    startMission: vi.fn(),
    saveMission: vi.fn(),
    runSavedMission: vi.fn(),
    openSidebar: vi.fn(),
    sendMessage: vi.fn(),
  }
})

describe('MissionSidebar visibility', () => {
  it('unmounts the panel when the sidebar is closed', () => {
    render(
      <MemoryRouter>
        <MissionSidebar />
        <MissionSidebarToggle />
      </MemoryRouter>
    )

    expect(screen.queryByTestId('mission-sidebar')).not.toBeInTheDocument()
    expect(screen.getByTestId('mission-sidebar-toggle')).toBeInTheDocument()
  })

  it('renders the panel when the sidebar is open', () => {
    mockMissionState.isSidebarOpen = true

    render(
      <MemoryRouter>
        <MissionSidebar />
      </MemoryRouter>
    )

    expect(screen.getByTestId('mission-sidebar')).toBeInTheDocument()
  })

  it('keeps the mobile launcher within the safe area', () => {
    mockIsMobile = true

    render(
      <MemoryRouter>
        <MissionSidebarToggle />
      </MemoryRouter>
    )

    const toggle = screen.getByTestId('mission-sidebar-toggle')
    expect(toggle.className).toContain('z-sticky')
    expect(toggle.className).toContain('bottom-[calc(1rem+env(safe-area-inset-bottom))]')
    expect(toggle.className).toContain('right-[calc(1rem+env(safe-area-inset-right))]')
    expect(toggle.className).toContain('max-w-[calc(100vw-2rem)]')
  })

  it('renders the Mission Control CTA with clipped custom button styling', () => {
    mockMissionState.isSidebarOpen = true

    render(
      <MemoryRouter>
        <MissionSidebar />
      </MemoryRouter>
    )

    const missionControlButton = screen.getByRole('button', {
      name: 'layout.missionSidebar.missionControl',
    })

    expect(missionControlButton.className).toContain('appearance-none')
    expect(missionControlButton.className).toContain('overflow-hidden')
    expect(missionControlButton.className).toContain('border-transparent')
  })

  it('opens a fresh Mission Control session from the add menu and clears the composer', () => {
    mockMissionState.isSidebarOpen = true

    render(
      <MemoryRouter>
        <MissionSidebar />
      </MemoryRouter>
    )

    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    fireEvent.click(screen.getByRole('button', { name: 'New Mission' }))

    expect(screen.getByPlaceholderText('missionSidebar.newMissionPlaceholder')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    fireEvent.click(screen.getByRole('button', { name: 'Mission Control' }))

    expect(screen.getByTestId('mission-control-dialog')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('missionSidebar.newMissionPlaceholder')).not.toBeInTheDocument()
  })

  it('starts a custom mission with the full prompt as the title', () => {
    mockMissionState.isSidebarOpen = true
    const prompt = 'Install OpenTelemetry Operator on the cluster and verify collector wiring stays intact'

    render(
      <MemoryRouter>
        <MissionSidebar />
      </MemoryRouter>
    )

    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    fireEvent.click(screen.getByRole('button', { name: 'New Mission' }))
    fireEvent.change(screen.getByPlaceholderText('missionSidebar.newMissionPlaceholder'), {
      target: { value: prompt },
    })
    fireEvent.click(screen.getByRole('button', { name: 'missionSidebar.start' }))

    expect(mockMissionState.startMission).toHaveBeenCalledWith({
      type: 'custom',
      title: prompt,
      description: prompt,
      initialPrompt: prompt,
      skipReview: true,
    })
  })
})
