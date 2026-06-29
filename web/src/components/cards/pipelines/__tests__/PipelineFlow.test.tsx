import React from 'react'
import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PipelineFlow } from '../PipelineFlow'
import { DEMO_FLOW, type FlowPayload } from '../../../../hooks/useGitHubPipelines'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('framer-motion', () => ({
  useReducedMotion: () => true,
}))

const mockUsePipelineFlow = vi.fn()
const mockRunMutation = vi.fn()
vi.mock('../../../../hooks/useGitHubPipelines', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../hooks/useGitHubPipelines')>()
  return {
    ...actual,
    usePipelineFlow: (...args: unknown[]) => mockUsePipelineFlow(...args),
    usePipelineMutations: () => ({ run: mockRunMutation }),
    getPipelineRepos: () => ['kubestellar/console', 'kubestellar/docs'],
  }
})

const mockUseDemoMode = vi.fn(() => ({ isDemoMode: false, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() }))
vi.mock('../../../../hooks/useDemoMode', () => ({
  useDemoMode: () => mockUseDemoMode(),
}))

const mockUseCardLoadingState = vi.fn()
vi.mock('../../CardDataContext', () => ({
  useCardLoadingState: (...args: unknown[]) => mockUseCardLoadingState(...args),
}))

vi.mock('../PipelineFilterContext', () => ({
  usePipelineFilter: () => null,
}))

vi.mock('../PipelineDataContext', () => ({
  usePipelineData: () => null,
}))

vi.mock('../EmbedButton', () => ({
  EmbedButton: () => null,
}))

vi.mock('../RepoSubtitle', () => ({
  RepoSubtitle: ({ repo }: { repo: string }) => <span data-testid="repo-subtitle">{repo}</span>,
}))

vi.mock('../../../../hooks/useMissions', () => ({
  useMissions: () => ({ startMission: vi.fn() }),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFlowWithFailure(): FlowPayload {
  const base = structuredClone(DEMO_FLOW)
  base.runs.push({
    run: {
      id: 99999002,
      repo: 'kubestellar/console',
      name: 'fullstack-e2e',
      headBranch: 'main',
      status: 'completed',
      conclusion: 'failure',
      event: 'push',
      runNumber: 458,
      htmlUrl: '#',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    jobs: [
      {
        id: 2001,
        name: 'e2e',
        status: 'completed',
        conclusion: 'failure',
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        htmlUrl: '#',
        steps: [
          { name: 'Checkout', status: 'completed', conclusion: 'success', number: 1 },
          { name: 'Run Playwright', status: 'completed', conclusion: 'failure', number: 2 },
        ],
      },
    ],
  })
  return base
}

function setupFlow(data: FlowPayload | null, opts: { isLoading?: boolean; error?: string | null } = {}) {
  mockUsePipelineFlow.mockReturnValue({
    data,
    isLoading: opts.isLoading ?? false,
    isRefreshing: false,
    error: opts.error ?? null,
    refetch: vi.fn(),
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

class MockResizeObserver {
  observe = vi.fn()
  disconnect = vi.fn()
  unobserve = vi.fn()
}

const OriginalResizeObserver = globalThis.ResizeObserver

describe('PipelineFlow', () => {
  beforeAll(() => {
    globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver
  })

  afterAll(() => {
    globalThis.ResizeObserver = OriginalResizeObserver
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mockUseDemoMode.mockReturnValue({ isDemoMode: false, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })
    mockUseCardLoadingState.mockReturnValue({})
    mockRunMutation.mockResolvedValue({ ok: true })
    setupFlow(DEMO_FLOW)
  })

  describe('flow stages', () => {
    it('renders trigger, workflow, job, and step columns for in-flight runs', () => {
      render(<PipelineFlow />)
      expect(screen.getByText('pull_request')).toBeInTheDocument()
      expect(screen.getByText('Go Tests')).toBeInTheDocument()
      expect(screen.getByText('go test ./...')).toBeInTheDocument()
      expect(screen.getByText('Checkout')).toBeInTheDocument()
      expect(screen.getByText('Run full Go test suite')).toBeInTheDocument()
      expect(screen.getByText(/1 in flight/)).toBeInTheDocument()
    })
  })

  describe('failed-stage highlight', () => {
    it('shows diagnose control on jobs with failure conclusion', () => {
      setupFlow(makeFlowWithFailure())
      render(<PipelineFlow />)
      const diagnoseButtons = screen.getAllByTitle('Diagnose with AI')
      expect(diagnoseButtons.length).toBeGreaterThan(0)
      expect(screen.getByText('fullstack-e2e')).toBeInTheDocument()
      expect(screen.getByText('e2e')).toBeInTheDocument()
    })
  })

  describe('empty state', () => {
    it('shows message when no runs are in flight', () => {
      setupFlow({ runs: [] })
      render(<PipelineFlow />)
      expect(screen.getByText('No runs in flight.')).toBeInTheDocument()
    })
  })

  describe('demo data path', () => {
    it('passes isDemoData=true to useCardLoadingState in demo mode', () => {
      mockUseDemoMode.mockReturnValue({ isDemoMode: true, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })
      render(<PipelineFlow />)
      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({ isDemoData: true, hasAnyData: true }),
      )
    })
  })

  describe('error state', () => {
    it('shows load error when fetch fails with no cached data', () => {
      setupFlow(null, { error: 'HTTP 503' })
      render(<PipelineFlow />)
      expect(screen.getByText(/pipelines\.failedToLoadPipelineFlow/)).toBeInTheDocument()
      expect(screen.getByText(/HTTP 503/)).toBeInTheDocument()
    })
  })
})
