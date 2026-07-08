import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { Mission } from '../../../../hooks/useMissions'
import { MissionSidebar, MissionSidebarToggle } from '../MissionSidebar'

const closeSidebar = vi.fn()
const expandSidebar = vi.fn()
const openSidebar = vi.fn()
const setFullScreen = vi.fn()
const setVisibleMissionCount = vi.fn()
const setActiveMission = vi.fn()
const dismissMission = vi.fn()
const cancelMission = vi.fn()
const minimizeSidebar = vi.fn()
const startMission = vi.fn()
const saveMission = vi.fn()
const runSavedMission = vi.fn()
const sendMessage = vi.fn()
const toggleMissionCollapse = vi.fn()
const setShowNewMission = vi.fn()
const setShowBrowser = vi.fn()
const setShowMissionControl = vi.fn()
const setMissionControlFreshSessionToken = vi.fn()
const setHistoricalMissionId = vi.fn()
const setPendingKubaraChart = vi.fn()
const setPendingReviewPlan = vi.fn()
const setShowOrbitDialog = vi.fn()
const setOrbitDialogPrefill = vi.fn()
const setNewMissionPrompt = vi.fn()
const setShowSavedToast = vi.fn()
const setToastCountdown = vi.fn()
const setViewingMission = vi.fn()
const setViewingMissionRaw = vi.fn()
const setPendingDismissMissionId = vi.fn()
const setPendingRunMissionId = vi.fn()
const setIsDirectImporting = vi.fn()
const setShowSaveResolutionDialog = vi.fn()
const setResolutionPanelView = vi.fn()
const setMissionSearchQuery = vi.fn()
const setShowHistoryPanel = vi.fn()
const toggleHistoryPanel = vi.fn()
const setLastPanelView = vi.fn()
const handleResizeStart = vi.fn()

let mockIsMobile = false
let mockIsModalOpen = false
let mockUseMissionsState = {
  missions: [] as Mission[],
  isSidebarOpen: false,
  openSidebar,
}

function createMission(overrides: Partial<Mission> = {}): Mission {
  const now = new Date('2026-01-01T00:00:00Z')

  return {
    id: 'mission-1',
    title: 'Repair cluster',
    description: 'Fix the broken policy pipeline',
    type: 'repair',
    status: 'running',
    messages: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

const mockSidebarState = {
  missions: [createMission()],
  activeMission: null as Mission | null,
  isSidebarOpen: true,
  isSidebarMinimized: false,
  isFullScreen: false,
  setActiveMission,
  closeSidebar,
  dismissMission,
  cancelMission,
  minimizeSidebar,
  expandSidebar,
  setFullScreen,
  selectedAgent: 'claude-sonnet-4.6',
  startMission,
  saveMission,
  runSavedMission,
  openSidebar,
  sendMessage,
  collapsedMissions: new Set<string>(),
  toggleMissionCollapse,
  visibleMissionCount: 10,
  setVisibleMissionCount,
  showNewMission: false,
  setShowNewMission,
  showBrowser: false,
  setShowBrowser,
  showMissionControl: false,
  setShowMissionControl,
  missionControlFreshSessionToken: undefined as number | undefined,
  setMissionControlFreshSessionToken,
  historicalMissionId: undefined as string | undefined,
  setHistoricalMissionId,
  pendingKubaraChart: undefined as string | undefined,
  setPendingKubaraChart,
  pendingReviewPlan: undefined as string | undefined,
  setPendingReviewPlan,
  showOrbitDialog: false,
  setShowOrbitDialog,
  orbitDialogPrefill: undefined as { clusters?: string[] } | undefined,
  setOrbitDialogPrefill,
  newMissionPrompt: '',
  setNewMissionPrompt,
  showSavedToast: null as string | null,
  setShowSavedToast,
  toastCountdown: 0,
  setToastCountdown,
  viewingMission: null,
  setViewingMission,
  viewingMissionRaw: false,
  setViewingMissionRaw,
  pendingDismissMissionId: null as string | null,
  setPendingDismissMissionId,
  pendingRunMissionId: null as string | null,
  setPendingRunMissionId,
  isDirectImporting: false,
  setIsDirectImporting,
  showSaveResolutionDialog: false,
  setShowSaveResolutionDialog,
  resolutionPanelView: 'history' as 'history' | 'related',
  setResolutionPanelView,
  missionSearchQuery: '',
  setMissionSearchQuery,
  showHistoryPanel: false,
  setShowHistoryPanel,
  toggleHistoryPanel,
  lastPanelView: 'dashboard' as 'dashboard' | 'history',
  setLastPanelView,
  newMissionInputRef: { current: null },
  toastIntervalRef: { current: null },
  browserHistoryEntryRef: { current: null },
  allResolutions: [],
  relatedResolutions: [],
  savedMissions: [],
  missionControlRuns: [],
  activeMissions: [createMission()],
  visibleActiveMissions: [createMission()],
  hasMoreMissions: false,
  listTotalMissions: 1,
  needsAttention: 2,
  runningMissions: [createMission()],
  runningMissionPreview: createMission(),
  runningCount: 1,
}

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string; count?: number }) => options?.defaultValue ?? (typeof options?.count === 'number' ? `${options.count}` : key),
  }),
}))

vi.mock('../../../../hooks/useMissions', () => ({
  useMissions: () => mockUseMissionsState,
  isActiveMission: (mission: { status: string }) => ['pending', 'running', 'waiting_input', 'blocked', 'cancelling'].includes(mission.status),
}))

vi.mock('../../../../hooks/useMobile', () => ({
  useMobile: () => ({ isMobile: mockIsMobile }),
}))

vi.mock('../../../../lib/demoMode', () => ({
  isDemoMode: () => false,
}))

vi.mock('../../../../lib/modals', () => ({
  isAnyModalOpen: () => mockIsModalOpen,
}))

vi.mock('../../../../lib/cn', () => ({
  cn: (...args: Array<string | false | null | undefined>) => args.filter(Boolean).join(' '),
}))

vi.mock('../useMissionSidebarState', () => ({
  useMissionSidebarState: () => mockSidebarState,
}))

vi.mock('../useSavedMissionItems', () => ({
  useSavedMissionItems: () => [],
}))

vi.mock('../useSidebarResize', () => ({
  useSidebarResize: () => ({
    sidebarWidth: 420,
    isResizing: false,
    isTablet: false,
    handleResizeStart,
  }),
}))

vi.mock('../useMissionSidebarDeepLinks', () => ({
  useDirectImport: vi.fn(),
  useMissionBrowserDeepLink: () => ({
    openMissionBrowser: vi.fn(),
    closeMissionBrowser: vi.fn(),
    deepLinkMission: null,
  }),
  useMissionControlDeepLink: vi.fn(),
}))

vi.mock('../MissionSidebarMinimized', () => ({
  MissionSidebarMinimized: ({ activeMissionsCount, runningCount, needsAttention, onExpand }: { activeMissionsCount: number; runningCount: number; needsAttention: number; onExpand: () => void }) => (
    <button type="button" onClick={onExpand}>
      minimized {activeMissionsCount}/{runningCount}/{needsAttention}
    </button>
  ),
}))

vi.mock('../MissionSidebarExpanded', () => ({
  MissionSidebarExpanded: () => <div data-testid="mission-sidebar-expanded">expanded sidebar</div>,
}))

vi.mock('../MissionSidebarDialogs', () => ({
  MissionSidebarDialogs: () => <div data-testid="mission-sidebar-dialogs" />,
}))

vi.mock('../../../ui/LogoWithStar', () => ({
  LogoWithStar: () => <div data-testid="logo-with-star" />,
}))

vi.mock('../../../ui/StatusBadge', () => ({
  StatusBadge: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

describe('MissionSidebar container', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsMobile = false
    mockIsModalOpen = false
    mockUseMissionsState = {
      missions: [createMission({ status: 'running' }), createMission({ id: 'mission-2', status: 'blocked' }), createMission({ id: 'mission-3', status: 'completed' })],
      isSidebarOpen: false,
      openSidebar,
    }
    Object.assign(mockSidebarState, {
      isSidebarOpen: true,
      isSidebarMinimized: false,
      isFullScreen: false,
      activeMission: null,
      needsAttention: 2,
      activeMissions: [createMission({ status: 'running' })],
      runningCount: 1,
    })
    document.documentElement.style.removeProperty('--mission-sidebar-width')
  })

  it('renders the minimized sidebar on desktop and forwards summary counts', () => {
    Object.assign(mockSidebarState, { isSidebarMinimized: true })

    render(
      <MemoryRouter>
        <MissionSidebar />
      </MemoryRouter>
    )

    expect(screen.getByRole('button', { name: 'minimized 1/1/2' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'minimized 1/1/2' }))
    expect(expandSidebar).toHaveBeenCalledTimes(1)
  })

  it('closes fullscreen first when escape is pressed', () => {
    Object.assign(mockSidebarState, { isFullScreen: true })

    render(
      <MemoryRouter>
        <MissionSidebar />
      </MemoryRouter>
    )

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(setFullScreen).toHaveBeenCalledWith(false)
    expect(closeSidebar).not.toHaveBeenCalled()
  })

  it('closes the sidebar on escape when not fullscreen and no modal is open', () => {
    render(
      <MemoryRouter>
        <MissionSidebar />
      </MemoryRouter>
    )

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(closeSidebar).toHaveBeenCalledTimes(1)
  })

  it('applies and cleans up the sidebar width CSS variable for desktop layout', () => {
    const { unmount } = render(
      <MemoryRouter>
        <MissionSidebar />
      </MemoryRouter>
    )

    expect(document.documentElement.style.getPropertyValue('--mission-sidebar-width')).toBe('420px')

    unmount()

    expect(document.documentElement.style.getPropertyValue('--mission-sidebar-width')).toBe('')
  })

  it('shows the launcher only when the sidebar is closed and opens it on click', () => {
    const { rerender } = render(
      <MemoryRouter>
        <MissionSidebarToggle />
      </MemoryRouter>
    )

    expect(screen.getByTestId('mission-sidebar-toggle')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('mission-sidebar-toggle'))
    expect(openSidebar).toHaveBeenCalledTimes(1)

    mockUseMissionsState = {
      ...mockUseMissionsState,
      isSidebarOpen: true,
    }

    rerender(
      <MemoryRouter>
        <MissionSidebarToggle />
      </MemoryRouter>
    )

    expect(screen.queryByTestId('mission-sidebar-toggle')).not.toBeInTheDocument()
  })
})
