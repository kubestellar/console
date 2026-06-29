import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WorkflowMatrix } from '../WorkflowMatrix'
import { DEMO_MATRIX, type MatrixPayload } from '../../../../hooks/useGitHubPipelines'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

const mockUsePipelineMatrix = vi.fn()
vi.mock('../../../../hooks/useGitHubPipelines', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../hooks/useGitHubPipelines')>()
  return {
    ...actual,
    usePipelineMatrix: (...args: unknown[]) => mockUsePipelineMatrix(...args),
    getPipelineRepos: () => ['kubestellar/console'],
  }
})

const mockUseDemoMode = vi.fn(() => ({ isDemoMode: false, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() }))
vi.mock('../../../../hooks/useDemoMode', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../hooks/useDemoMode')>()),
  useDemoMode: () => mockUseDemoMode(),
}
))

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMatrixWithKnownCells(): MatrixPayload {
  return {
    days: 2,
    range: ['2026-05-21', '2026-05-22'],
    workflows: [
      {
        repo: 'kubestellar/console',
        name: 'Go Tests',
        cells: [
          { date: '2026-05-21', conclusion: 'success', htmlUrl: 'https://example.com/1' },
          { date: '2026-05-22', conclusion: 'failure', htmlUrl: 'https://example.com/2' },
        ],
      },
      {
        repo: 'kubestellar/console',
        name: 'Release',
        cells: [
          { date: '2026-05-21', conclusion: 'timed_out', htmlUrl: '#' },
          { date: '2026-05-22', conclusion: null, htmlUrl: '#' },
        ],
      },
    ],
  }
}

function setupMatrix(data: MatrixPayload | null, opts: { isLoading?: boolean; error?: string | null } = {}) {
  mockUsePipelineMatrix.mockReturnValue({
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

describe('WorkflowMatrix', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseDemoMode.mockReturnValue({ isDemoMode: false, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })
    mockUseCardLoadingState.mockReturnValue({})
    setupMatrix(DEMO_MATRIX)
  })

  describe('matrix grid', () => {
    it('renders workflow rows from matrix data', () => {
      setupMatrix(makeMatrixWithKnownCells())
      render(<WorkflowMatrix />)
      expect(screen.getByText('Go Tests')).toBeInTheDocument()
      expect(screen.getByText('Release')).toBeInTheDocument()
      expect(screen.getByText(/2 workflows/)).toBeInTheDocument()
    })

    it('renders one heatmap cell per day with status-specific colors', () => {
      setupMatrix(makeMatrixWithKnownCells())
      render(<WorkflowMatrix />)

      const goTestsRow = screen.getByText('Go Tests').closest('.flex.items-center.gap-2')
      expect(goTestsRow).not.toBeNull()
      const goTestsScope = within(goTestsRow as HTMLElement)
      // Cells render newest-first (server order reversed for display)
      expect(goTestsScope.getAllByRole('link')).toHaveLength(2)
      expect(goTestsScope.getByRole('link', { name: '2026-05-22: failure' }).className).toMatch(
        /bg-red-500/,
      )
      expect(goTestsScope.getByRole('link', { name: '2026-05-21: success' }).className).toMatch(
        /bg-green-500/,
      )

      const releaseRow = screen.getByText('Release').closest('.flex.items-center.gap-2')
      expect(releaseRow).not.toBeNull()
      const releaseScope = within(releaseRow as HTMLElement)
      expect(releaseScope.getByLabelText('2026-05-21: timed_out').className).toMatch(/bg-orange-500/)
      expect(releaseScope.getByLabelText('2026-05-22: no run').className).toMatch(/bg-muted/)
    })

    it('links cells with htmlUrl to GitHub', () => {
      setupMatrix(makeMatrixWithKnownCells())
      render(<WorkflowMatrix />)
      const link = screen.getByRole('link', { name: /2026-05-21: success/ })
      expect(link).toHaveAttribute('href', 'https://example.com/1')
    })
  })

  describe('range controls', () => {
    it('switches day range when user clicks 30d', async () => {
      const user = userEvent.setup()
      render(<WorkflowMatrix />)
      await user.click(screen.getByRole('button', { name: '30d' }))
      expect(mockUsePipelineMatrix).toHaveBeenLastCalledWith(null, 30, true)
    })
  })

  describe('empty state', () => {
    it('shows message when no workflow activity in range', () => {
      setupMatrix({ days: 14, range: [], workflows: [] })
      render(<WorkflowMatrix />)
      expect(screen.getByText('No workflow activity in this range.')).toBeInTheDocument()
    })
  })

  describe('demo data path', () => {
    it('passes isDemoData=true to useCardLoadingState in demo mode', () => {
      mockUseDemoMode.mockReturnValue({ isDemoMode: true, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })
      render(<WorkflowMatrix />)
      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({ isDemoData: true, hasAnyData: true }),
      )
    })
  })

  describe('error state', () => {
    it('shows load error when fetch fails with no cached data', () => {
      setupMatrix(null, { error: 'HTTP 500' })
      render(<WorkflowMatrix />)
      expect(screen.getByText(/pipelines\.failedToLoadMatrix/)).toBeInTheDocument()
      expect(screen.getByText(/HTTP 500/)).toBeInTheDocument()
    })
  })
})
