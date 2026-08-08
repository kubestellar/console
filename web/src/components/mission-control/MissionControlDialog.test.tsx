import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MissionControlDialog } from './MissionControlDialog'
import type { MissionControlState } from './types'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('../ui/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}))

vi.mock('../../hooks/useMissions', () => ({
  useMissions: () => ({
    startMission: vi.fn(),
    openSidebar: vi.fn(),
  }),
}))

vi.mock('./FixerDefinitionPanel', () => ({
  FixerDefinitionPanel: () => <div data-testid="fixer-definition-panel">Define phase</div>,
}))

vi.mock('./ClusterAssignmentPanel', () => ({
  ClusterAssignmentPanel: () => <div data-testid="cluster-assignment-panel">Assign phase</div>,
}))

vi.mock('./FlightPlanBlueprint', () => ({
  default: () => <div data-testid="flight-plan-blueprint">Blueprint phase</div>,
}))

vi.mock('./LaunchSequence', () => ({
  LaunchSequence: () => <div data-testid="launch-sequence">Launch phase</div>,
}))

vi.mock('./RequestApprovalModal', () => ({
  RequestApprovalModal: () => null,
}))

vi.mock('../../lib/safeLazy', () => ({
  safeLazy: (loader: () => Promise<unknown>) => React.lazy(loader as never),
}))

const baseState: MissionControlState = {
  phase: 'define',
  title: '',
  description: '',
  overlay: 'architecture',
  deployMode: 'phased',
  targetClusters: [],
  aiStreaming: false,
  launchProgress: [],
  projects: [],
  assignments: [],
  phases: [],
}

let mockState: MissionControlState
const mcMocks = {
  setDescription: vi.fn(),
  setTitle: vi.fn(),
  setTargetClusters: vi.fn(),
  askAIForSuggestions: vi.fn(),
  addProject: vi.fn(),
  removeProject: vi.fn(),
  updateProjectPriority: vi.fn(),
  replaceProject: vi.fn(),
  askAIForAssignments: vi.fn(),
  autoAssignProjects: vi.fn(),
  setAssignment: vi.fn(),
  moveProjectToCluster: vi.fn(),
  setPhase: vi.fn((phase: MissionControlState['phase']) => {
    mockState = { ...mockState, phase }
  }),
  setOverlay: vi.fn(),
  setDeployMode: vi.fn(),
  setDryRun: vi.fn(),
  updateLaunchProgress: vi.fn(),
  setGroundControlDashboardId: vi.fn(),
  reset: vi.fn(),
  hydrateFromPlan: vi.fn(),
  loadHistoricalSession: vi.fn(() => false),
  acknowledgeStaleClusters: vi.fn(),
}

vi.mock('./useMissionControl', () => ({
  useMissionControl: () => ({
    state: mockState,
    installedProjects: new Set(),
    installedOnCluster: new Map(),
    planningMission: false,
    staleClusterNames: [],
    ...mcMocks,
  }),
  consumePersistQuotaBanner: () => null,
}))

vi.mock('./missionPlanCodec', () => ({
  decodePlan: vi.fn(),
  planToState: vi.fn(),
}))

beforeEach(() => {
  mockState = { ...baseState }
  vi.clearAllMocks()
})

describe('MissionControlDialog', () => {
  it('does not render when closed', () => {
    render(<MissionControlDialog open={false} onClose={vi.fn()} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renders the dialog with the define phase when open', () => {
    render(<MissionControlDialog open={true} onClose={vi.fn()} />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByTestId('fixer-definition-panel')).toBeInTheDocument()
  })

  it('calls onClose when the backdrop close button ("Back to Dashboard") is clicked', () => {
    const onClose = vi.fn()
    render(<MissionControlDialog open={true} onClose={onClose} />)

    fireEvent.click(screen.getByText('Back to Dashboard'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when the close ("X") button is clicked', () => {
    const onClose = vi.fn()
    render(<MissionControlDialog open={true} onClose={onClose} />)

    fireEvent.click(screen.getByTestId('mission-control-cancel'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not advance the stepper to a phase beyond what has been reached', () => {
    render(<MissionControlDialog open={true} onClose={vi.fn()} />)

    // Phase 2 ("Chart Course") button should be disabled since the user
    // hasn't advanced past phase 1 yet.
    const phase2 = screen.getByTestId('mission-control-phase-2')
    expect(phase2).toBeDisabled()

    fireEvent.click(phase2)
    expect(mcMocks.setPhase).not.toHaveBeenCalled()
  })

  it('renders the assign phase panel when state.phase is "assign"', () => {
    mockState = { ...baseState, phase: 'assign', projects: [
      {
        name: 'prometheus',
        displayName: 'Prometheus',
        category: 'Observability',
        maturity: 'graduated',
        priority: 'required',
        reason: 'Metrics',
        dependencies: [],
      },
    ] }

    render(<MissionControlDialog open={true} onClose={vi.fn()} />)
    expect(screen.getByTestId('cluster-assignment-panel')).toBeInTheDocument()
  })

  it('renders the launch sequence when phase is "launching"', () => {
    mockState = { ...baseState, phase: 'launching' }

    render(<MissionControlDialog open={true} onClose={vi.fn()} />)
    expect(screen.getByTestId('launch-sequence')).toBeInTheDocument()
  })

  it('shows the DRY RUN badge when state.isDryRun is true', () => {
    mockState = { ...baseState, isDryRun: true }

    render(<MissionControlDialog open={true} onClose={vi.fn()} />)
    expect(screen.getByText('DRY RUN')).toBeInTheDocument()
  })
})
