/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MissionControlDialog } from '../MissionControlDialog'
import { useMissionControl } from '../useMissionControl'
import { decodePlan } from '../missionPlanCodec'

// Mock useMissionControl
vi.mock('../useMissionControl', () => ({
  useMissionControl: vi.fn(),
  consumePersistQuotaBanner: vi.fn(() => null),
}))

// Mock missionPlanCodec
vi.mock('../missionPlanCodec', () => ({
  decodePlan: vi.fn(),
  planToState: vi.fn(p => p),
}))

// Mock other dependencies
vi.mock('../../../lib/modals/useModalNavigation', () => ({
  useModalFocusTrap: vi.fn(),
  useModalNavigation: vi.fn(),
}))

vi.mock('../../../lib/auth', () => ({
  useAuth: vi.fn(() => ({
    token: 'mock-token',
    user: { github_login: 'test-user' },
  })),
}))

vi.mock('../../ui/Toast', () => ({
  useToast: vi.fn(() => ({ showToast: vi.fn() })),
}))

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}))

// Mock sub-panels to avoid deep rendering issues in integration test
vi.mock('../FixerDefinitionPanel', () => ({
  FixerDefinitionPanel: () => <div data-testid="phase-define">Define Panel</div>,
}))
vi.mock('../ClusterAssignmentPanel', () => ({
  ClusterAssignmentPanel: () => <div data-testid="phase-assign">Assign Panel</div>,
}))
vi.mock('../LaunchSequence', () => ({
  LaunchSequence: () => <div data-testid="phase-launching">Launch Sequence</div>,
}))

describe('MissionControlDialog', () => {
  const mockMC = {
    state: {
      phase: 'define',
      title: 'Test Mission',
      projects: [],
      assignments: [],
      targetClusters: [],
      aiStreaming: false,
      phases: [],
      launchProgress: [],
    },
    setPhase: vi.fn(),
    setTitle: vi.fn(),
    reset: vi.fn(),
    addProject: vi.fn(),
    staleClusterNames: [],
    acknowledgeStaleClusters: vi.fn(),
    hydrateFromPlan: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useMissionControl).mockReturnValue(mockMC as any)
  })

  it('renders nothing when closed', () => {
    const { container } = render(
      <MissionControlDialog open={false} onClose={vi.fn()} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders Phase 1 by default when opened', () => {
    render(<MissionControlDialog open={true} onClose={vi.fn()} />)
    expect(screen.getByTestId('mission-control-dialog')).toBeDefined()
    expect(screen.getByTestId('phase-define')).toBeDefined()
  })

  it('calls setPhase when clicking Next', () => {
    // Provide a project so canAdvance is true
    const mcWithProjects = {
      ...mockMC,
      state: { ...mockMC.state, projects: [{ name: 'falco' }] }
    }
    vi.mocked(useMissionControl).mockReturnValue(mcWithProjects as any)

    render(<MissionControlDialog open={true} onClose={vi.fn()} />)
    
    const nextBtn = screen.getByText('Next')
    fireEvent.click(nextBtn)
    expect(mcWithProjects.setPhase).toHaveBeenCalledWith('assign')
  })

  it('navigates via stepper', () => {
    render(<MissionControlDialog open={true} onClose={vi.fn()} />)
    
    const step2 = screen.getByTestId('mission-control-phase-2')
    // Should be disabled because we haven't reached it yet (highestReached = 0)
    expect(step2).toHaveProperty('disabled', true)
  })

  it('pre-populates project when initialKubaraChart is provided', () => {
    render(
      <MissionControlDialog 
        open={true} 
        onClose={vi.fn()} 
        initialKubaraChart="falco-operator" 
      />
    )
    
    expect(mockMC.addProject).toHaveBeenCalledWith(expect.objectContaining({
      name: 'falco-operator',
      userAdded: true
    }))
  })

  it('shows stale cluster warning when mc returns stale names', () => {
    const mcWithStale = {
      ...mockMC,
      staleClusterNames: ['old-cluster']
    }
    vi.mocked(useMissionControl).mockReturnValue(mcWithStale as any)

    render(<MissionControlDialog open={true} onClose={vi.fn()} />)
    
    // Check if acknowledge was called
    expect(mcWithStale.acknowledgeStaleClusters).toHaveBeenCalled()
  })

  it('hydrates state from reviewPlanEncoded', () => {
    const mockPlan = { title: 'Shared Plan', projects: [] }
    vi.mocked(decodePlan).mockReturnValue(mockPlan as any)

    render(
      <MissionControlDialog 
        open={true} 
        onClose={vi.fn()} 
        reviewPlanEncoded="base64data" 
      />
    )
    
    expect(decodePlan).toHaveBeenCalledWith('base64data')
    expect(mockMC.hydrateFromPlan).toHaveBeenCalledWith(mockPlan)
    expect(screen.getByText('REVIEW')).toBeDefined()
  })
})
