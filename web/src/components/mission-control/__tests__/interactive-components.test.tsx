/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AssignmentMatrix } from '../AssignmentMatrix'
import { ClusterAssignmentPanel } from '../ClusterAssignmentPanel'
import { LaunchSequence } from '../LaunchSequence'
import { RequestApprovalModal } from '../RequestApprovalModal'
import type { PayloadProject, MissionControlState } from '../types'
import type { ClusterInfo } from '../../../hooks/mcp/types'

// Mock hooks
vi.mock('../../../hooks/mcp/clusters', () => ({
  useClusters: vi.fn(() => ({
    deduplicatedClusters: [
      { name: 'cluster-1', healthy: true, reachable: true },
      { name: 'cluster-2', healthy: true, reachable: true },
    ],
    isLoading: false,
  })),
}))

vi.mock('../../../hooks/mcp/helm', () => ({
  useHelmReleases: vi.fn(() => ({
    releases: [],
    isLoading: false,
  })),
}))

vi.mock('../../../hooks/useMissions', () => ({
  useMissions: vi.fn(() => ({
    startMission: vi.fn(() => 'mission-123'),
    missions: [],
  })),
}))

vi.mock('../../../lib/auth', () => ({
  useAuth: vi.fn(() => ({ token: 'mock-token' })),
}))

vi.mock('../../ui/Toast', () => ({
  useToast: vi.fn(() => ({ showToast: vi.fn() })),
}))

// Mock framer-motion to avoid animation issues in tests
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement> & { children?: React.ReactNode }) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}))

// Mock useTranslation
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (str: string) => str,
  }),
}))

// Mock ReactMarkdown
vi.mock('react-markdown', () => ({
  default: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}))

// Mock missionLoader
vi.mock('../cards/multi-tenancy/missionLoader', () => ({
  loadMissionPrompt: vi.fn(() => Promise.resolve('mocked prompt')),
}))

// Mock fetch
global.fetch = vi.fn()

const mockProject: PayloadProject = {
  name: 'falco',
  displayName: 'Falco',
  reason: 'Security',
  category: 'Security',
  priority: 'required',
  dependencies: [],
}

const mockState: MissionControlState = {
  phase: 'assign',
  title: 'Test Mission',
  description: 'Test Description',
  projects: [mockProject],
  targetClusters: [],
  assignments: [],
  phases: [],
  launchProgress: [],
  aiStreaming: false,
}

describe('AssignmentMatrix', () => {
  it('renders clusters as columns and projects as rows', () => {
    render(
      <AssignmentMatrix
        projects={[mockProject]}
        clusters={[{ name: 'cluster-1' } as ClusterInfo]}
        assignments={[]}
        onToggle={vi.fn()}
      />
    )
    
    expect(screen.getByText('cluster-1')).toBeDefined()
    expect(screen.getByText('Falco')).toBeDefined()
  })

  it('calls onToggle when a cell button is clicked', () => {
    const onToggle = vi.fn()
    render(
      <AssignmentMatrix
        projects={[mockProject]}
        clusters={[{ name: 'cluster-1' } as ClusterInfo]}
        assignments={[]}
        onToggle={onToggle}
      />
    )
    
    const btn = screen.getByTitle('Assign project')
    fireEvent.click(btn)
    expect(onToggle).toHaveBeenCalledWith('cluster-1', 'falco', true)
  })
})

describe('ClusterAssignmentPanel', () => {
  it('switches between cards and matrix view', async () => {
    render(
      <ClusterAssignmentPanel
        state={mockState}
        onAskAI={vi.fn()}
        onAutoAssign={vi.fn()}
        onSetAssignment={vi.fn()}
        aiStreaming={false}
      />
    )
    
    await waitFor(() => {
      expect(screen.getByTestId('mission-control-cluster-cluster-1')).toBeDefined()
    })
    
    const matrixBtn = screen.getByTitle('Matrix view')
    fireEvent.click(matrixBtn)
    
    await waitFor(() => {
      expect(screen.getByText('Project')).toBeDefined() // Table header
    })
  })

  it('calls onAutoAssign when button clicked', async () => {
    const onAutoAssign = vi.fn()
    render(
      <ClusterAssignmentPanel
        state={mockState}
        onAskAI={vi.fn()}
        onAutoAssign={onAutoAssign}
        onSetAssignment={vi.fn()}
        aiStreaming={false}
      />
    )
    
    await waitFor(() => {
      const btn = screen.getByText('Auto-Assign')
      expect(btn).not.toBeDisabled()
      fireEvent.click(btn)
    })
    expect(onAutoAssign).toHaveBeenCalled()
  })
})

describe('LaunchSequence', () => {
  it('initializes progress and starts launch', async () => {
    const onUpdateProgress = vi.fn()
    const stateWithAssignments: MissionControlState = {
      ...mockState,
      assignments: [{ clusterName: 'cluster-1', projectNames: ['falco'], readiness: {}, warnings: [] }]
    }
    
    render(
      <LaunchSequence
        state={stateWithAssignments}
        onUpdateProgress={onUpdateProgress}
        onComplete={vi.fn()}
      />
    )
    
    // Fallback phase builder should create "Phase 1: Deploy"
    expect(screen.getByText('Phase 1: Deploy')).toBeDefined()
    
    await waitFor(() => {
      expect(onUpdateProgress).toHaveBeenCalled()
    })
  })
})

describe('RequestApprovalModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('validates repo format', () => {
    render(
      <RequestApprovalModal
        isOpen={true}
        onClose={vi.fn()}
        state={mockState}
        installedProjects={new Set()}
      />
    )
    
    const input = screen.getByPlaceholderText('org/repo')
    fireEvent.change(input, { target: { value: 'invalid-repo' } })
    expect(screen.getByText('Enter a valid repository in owner/repo format')).toBeDefined()
  })

  it('creates GitHub issue on submit', async () => {
    const mockFetch = vi.mocked(global.fetch)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ html_url: 'https://github.com/org/repo/issues/1' }),
    } as unknown as Response)

    render(
      <RequestApprovalModal
        isOpen={true}
        onClose={vi.fn()}
        state={mockState}
        installedProjects={new Set()}
      />
    )
    
    const input = screen.getByPlaceholderText('org/repo')
    fireEvent.change(input, { target: { value: 'org/repo' } })
    
    await waitFor(() => {
      const submitBtn = screen.getByText('Create Issue')
      expect(submitBtn).not.toBeDisabled()
      fireEvent.click(submitBtn)
    })
    
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/repos/org/repo/issues'),
        expect.objectContaining({ method: 'POST' })
      )
      expect(screen.getByText('View on GitHub')).toBeDefined()
    })
  })
})
