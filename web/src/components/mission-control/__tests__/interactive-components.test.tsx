/** @vitest-environment jsdom */
import type { HTMLAttributes, ReactNode } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AssignmentMatrix } from '../AssignmentMatrix'
import { ClusterAssignmentPanel } from '../ClusterAssignmentPanel'
import { LaunchSequence } from '../LaunchSequence'
import { RequestApprovalModal } from '../RequestApprovalModal'
import type { ClusterInfo } from '../../../hooks/mcp/types'
import type { PayloadProject, MissionControlState } from '../types'

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

type MotionDivProps = HTMLAttributes<HTMLDivElement> & { children?: ReactNode }
type ChildrenOnlyProps = { children?: ReactNode }

// Mock framer-motion to avoid animation issues in tests
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: MotionDivProps) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: ChildrenOnlyProps) => <>{children}</>,
}))

// Mock useTranslation
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (str: string) => str,
  }),
}))

// Mock ReactMarkdown
vi.mock('react-markdown', () => ({
  default: ({ children }: ChildrenOnlyProps) => <div>{children}</div>,
}))

// Mock missionLoader
vi.mock('../cards/multi-tenancy/missionLoader', () => ({
  loadMissionPrompt: vi.fn(() => Promise.resolve('mocked prompt')),
}))

// Mock fetch
global.fetch = vi.fn()

function createMockResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as Response
}

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

const mockCluster: ClusterInfo = {
  name: 'cluster-1',
  context: 'cluster-1',
}

describe('AssignmentMatrix', () => {
  it('renders clusters as columns and projects as rows', () => {
    render(
      <AssignmentMatrix
        projects={[mockProject]}
        clusters={[mockCluster]}
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
        clusters={[mockCluster]}
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

  it('keeps the panel loading until auto-assign resolves', async () => {
    let resolveAutoAssign: (() => void) | undefined
    const onAutoAssign = vi.fn(() => new Promise<void>((resolve) => {
      resolveAutoAssign = resolve
    }))

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
      expect(screen.getByTestId('mission-control-cluster-cluster-1')).toBeDefined()
    })

    fireEvent.click(screen.getByText('Auto-Assign'))

    expect(onAutoAssign).toHaveBeenCalled()
    expect(await screen.findByText('Assigning...')).toBeDefined()
    expect(screen.getByText('Auto-assigning projects to clusters...')).toBeDefined()
    expect(screen.queryByTestId('mission-control-cluster-cluster-1')).toBeNull()
    expect(screen.getByTestId('mission-control-ask-ai')).toBeDisabled()

    await act(async () => {
      resolveAutoAssign?.()
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(screen.getByText('Auto-Assign')).toBeDefined()
      expect(screen.getByTestId('mission-control-cluster-cluster-1')).toBeDefined()
    })
  })
})

describe('LaunchSequence', () => {
  it('initializes progress and starts launch', async () => {
    const onUpdateProgress = vi.fn()
    const stateWithAssignments: MissionControlState = {
      ...mockState,
      assignments: [{
        clusterName: 'cluster-1',
        clusterContext: 'cluster-1',
        provider: 'kind',
        projectNames: ['falco'],
        readiness: {
          cpuHeadroomPercent: 80,
          memHeadroomPercent: 80,
          storageHeadroomPercent: 80,
          overallScore: 80,
        },
        warnings: [],
      }],
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
    vi.mocked(global.fetch).mockResolvedValue(createMockResponse({ hasToken: true }))
  })

  it('validates repo format', async () => {
    render(
      <RequestApprovalModal
        isOpen={true}
        onClose={vi.fn()}
        state={mockState}
        installedProjects={new Set()}
      />
    )

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1))

    const input = screen.getByPlaceholderText('org/repo')
    fireEvent.change(input, { target: { value: 'invalid-repo' } })
    expect(screen.getByText('Enter a valid repository in owner/repo format')).toBeDefined()
  })

  it('creates GitHub issue on submit', async () => {
    const mockFetch = vi.mocked(global.fetch)
    mockFetch
      .mockResolvedValueOnce(createMockResponse({ hasToken: true }))
      .mockResolvedValueOnce(createMockResponse({ html_url: 'https://github.com/org/repo/issues/1' }))

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

  it('prevents duplicate approval submission on rapid double click', async () => {
    let resolveIssueRequest: ((value: Response) => void) | undefined
    const issueRequest = new Promise<Response>((resolve) => {
      resolveIssueRequest = resolve
    })
    const mockFetch = vi.mocked(global.fetch)
    mockFetch
      .mockResolvedValueOnce(createMockResponse({ hasToken: true }))
      .mockImplementationOnce(() => issueRequest)

    render(
      <RequestApprovalModal
        isOpen={true}
        onClose={vi.fn()}
        state={mockState}
        installedProjects={new Set()}
      />
    )

    fireEvent.change(screen.getByPlaceholderText('org/repo'), { target: { value: 'org/repo' } })

    const submitBtn = await screen.findByText('Create Issue')
    await waitFor(() => expect(submitBtn).not.toBeDisabled())

    await act(async () => {
      fireEvent.click(submitBtn)
      fireEvent.click(submitBtn)
    })

    expect(mockFetch).toHaveBeenCalledTimes(2)
    expect(submitBtn).toBeDisabled()
    expect(screen.getByText('Creating…')).toBeDefined()

    resolveIssueRequest?.(createMockResponse({ html_url: 'https://github.com/org/repo/issues/1' }))

    await waitFor(() => {
      expect(screen.getByText('View on GitHub')).toBeDefined()
    })
  })
})
