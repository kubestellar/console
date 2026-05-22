/**
 * AgenticDetectionRuns card — Vitest RTL (#15355, Part of #4189).
 *
 * Hook layer is covered by useAgenticDetectionRuns.test.ts; this file tests
 * conclusion icons, pagination, external links, empty state, and isDemoData reporting.
 *
 * Run from web/:
 *   npx vitest run src/components/cards/__tests__/AgenticDetectionRuns.test.tsx
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CardDataReportContext } from '../CardDataContext'
import type { DetectionRun, DetectionRunsData } from '../../../hooks/useAgenticDetectionRuns'
import { AgenticDetectionRuns } from '../AgenticDetectionRuns'

const ITEMS_PER_PAGE = 10
const GITHUB_ISSUE_URL = 'https://github.com/kubestellar/console/issues/13634'
const GITHUB_WORKFLOW_URL = 'https://github.com/kubestellar/console/actions/runs/12345'
const MS_PER_HOUR = 60 * 60 * 1000

const mockUseAgenticDetectionRuns = vi.fn()

vi.mock('../../../hooks/useAgenticDetectionRuns', () => ({
  useAgenticDetectionRuns: () => mockUseAgenticDetectionRuns(),
}))

function makeRun(overrides: Partial<DetectionRun> = {}): DetectionRun {
  return {
    conclusion: 'success',
    reason: 'ok',
    workflowUrl: GITHUB_WORKFLOW_URL,
    runId: 'run-1',
    commentedAt: new Date().toISOString(),
    commentUrl: 'https://github.com/kubestellar/console/issues/13634#issuecomment-1',
    ...overrides,
  }
}

function makeDetectionData(
  overrides: Partial<DetectionRunsData> = {},
): DetectionRunsData {
  return {
    runs: [],
    issueUrl: '',
    totalCount: 0,
    source: 'test',
    cachedAt: new Date().toISOString(),
    isDemoData: false,
    ...overrides,
  }
}

function setupHook(overrides: {
  data?: Partial<DetectionRunsData>
  isLoading?: boolean
  isRefreshing?: boolean
  isDemoFallback?: boolean
  isFailed?: boolean
  consecutiveFailures?: number
  lastRefresh?: number | null
} = {}) {
  const data = makeDetectionData(overrides.data)
  mockUseAgenticDetectionRuns.mockReturnValue({
    data,
    isLoading: overrides.isLoading ?? false,
    isRefreshing: overrides.isRefreshing ?? false,
    isDemoFallback: overrides.isDemoFallback ?? false,
    isFailed: overrides.isFailed ?? false,
    consecutiveFailures: overrides.consecutiveFailures ?? 0,
    lastRefresh: overrides.lastRefresh ?? null,
  })
}

function makePaginatedRuns(count: number): DetectionRun[] {
  const runs: DetectionRun[] = []
  for (let i = 0; i < count; i += 1) {
    runs.push(
      makeRun({
        runId: `run-${i}`,
        reason: `reason_page_marker_${i}`,
        commentedAt: new Date(Date.now() - i * MS_PER_HOUR).toISOString(),
        conclusion: i % 2 === 0 ? 'success' : 'failure',
      }),
    )
  }
  return runs
}

describe('AgenticDetectionRuns', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    setupHook()
  })

  describe('empty state', () => {
    it('shows no-detections message when there are no runs and not loading', () => {
      setupHook({ data: { runs: [], totalCount: 0 } })
      render(<AgenticDetectionRuns />)

      expect(
        screen.getByText('cards:agenticDetectionRuns.noDetections'),
      ).toBeInTheDocument()
      expect(
        screen.getByText('cards:agenticDetectionRuns.noDetectionsDesc'),
      ).toBeInTheDocument()
    })

    it('renders issue link in empty state when issueUrl is valid https', () => {
      setupHook({
        data: { runs: [], totalCount: 0, issueUrl: GITHUB_ISSUE_URL },
      })
      render(<AgenticDetectionRuns />)

      const link = screen.getByRole('link', {
        name: /cards:agenticDetectionRuns\.viewIssue/i,
      })
      expect(link).toHaveAttribute('href', GITHUB_ISSUE_URL)
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    })
  })

  describe('conclusion icons and labels', () => {
    it('renders success, failure, warning, and default icons for each conclusion', () => {
      setupHook({
        data: {
          runs: [
            makeRun({ conclusion: 'success', reason: 'success_run' }),
            makeRun({ conclusion: 'failure', reason: 'failure_run' }),
            makeRun({ conclusion: 'warning', reason: 'warning_run' }),
            makeRun({ conclusion: 'running', reason: 'running_run' }),
          ],
          totalCount: 4,
        },
      })
      const { container } = render(<AgenticDetectionRuns />)

      const successRow = screen.getByText('Success Run').closest('.p-3') as HTMLElement
      const failureRow = screen.getByText('Failure Run').closest('.p-3') as HTMLElement
      const warningRow = screen.getByText('Warning Run').closest('.p-3') as HTMLElement
      const runningRow = screen.getByText('Running Run').closest('.p-3') as HTMLElement

      expect(within(successRow).getByText('SUCCESS')).toHaveClass('text-green-400')
      expect(within(failureRow).getByText('FAILURE')).toHaveClass('text-red-400')
      expect(within(warningRow).getByText('WARNING')).toHaveClass('text-yellow-400')
      expect(within(runningRow).getByText('RUNNING')).toHaveClass('text-muted-foreground')

      expect(successRow.querySelector('svg.text-green-400')).toBeInTheDocument()
      expect(failureRow.querySelector('svg.text-red-400')).toBeInTheDocument()
      expect(warningRow.querySelector('svg.text-yellow-400')).toBeInTheDocument()
      expect(runningRow.querySelector('svg.text-muted-foreground')).toBeInTheDocument()
      expect(container.querySelectorAll('a[target="_blank"]').length).toBeGreaterThan(0)
    })
  })

  describe('external URL links', () => {
    it('renders workflow and issue links with validated href and target blank', () => {
      setupHook({
        data: {
          runs: [makeRun({ reason: 'linked_run', workflowUrl: GITHUB_WORKFLOW_URL })],
          issueUrl: GITHUB_ISSUE_URL,
          totalCount: 1,
        },
      })
      render(<AgenticDetectionRuns />)

      const workflowLink = screen.getByRole('link', {
        name: /cards:agenticDetectionRuns\.viewRun/i,
      })
      expect(workflowLink).toHaveAttribute('href', GITHUB_WORKFLOW_URL)
      expect(workflowLink).toHaveAttribute('target', '_blank')
      expect(workflowLink).toHaveAttribute('rel', 'noopener noreferrer')

      const issueLinks = screen.getAllByRole('link', {
        name: /cards:agenticDetectionRuns\.viewAllIssue/i,
      })
      expect(issueLinks.length).toBeGreaterThan(0)
      issueLinks.forEach((link) => {
        expect(link).toHaveAttribute('href', GITHUB_ISSUE_URL)
        expect(link).toHaveAttribute('target', '_blank')
        expect(link).toHaveAttribute('rel', 'noopener noreferrer')
      })
    })

    it('does not render workflow link for unsafe javascript URLs', () => {
      setupHook({
        data: {
          runs: [
            makeRun({
              reason: 'unsafe_run',
              workflowUrl: 'javascript:alert(1)',
            }),
          ],
          totalCount: 1,
        },
      })
      render(<AgenticDetectionRuns />)

      expect(
        screen.queryByRole('link', { name: /cards:agenticDetectionRuns\.viewRun/i }),
      ).not.toBeInTheDocument()
    })
  })

  describe('pagination', () => {
    it('navigates next and previous pages when more than one page of runs', async () => {
      const user = userEvent.setup()
      const runs = makePaginatedRuns(ITEMS_PER_PAGE + 2)
      setupHook({ data: { runs, totalCount: runs.length } })
      render(<AgenticDetectionRuns />)

      const firstPageMarker = 'Reason Page Marker 0'
      const lastPageMarker = `Reason Page Marker ${ITEMS_PER_PAGE + 1}`

      expect(screen.getByText(firstPageMarker)).toBeInTheDocument()
      expect(screen.queryByText(lastPageMarker)).not.toBeInTheDocument()

      await user.click(
        screen.getByRole('button', { name: 'pagination.nextPage' }),
      )

      expect(screen.getByText(lastPageMarker)).toBeInTheDocument()
      expect(screen.queryByText(firstPageMarker)).not.toBeInTheDocument()

      await user.click(
        screen.getByRole('button', { name: 'pagination.previousPage' }),
      )

      expect(screen.getByText(firstPageMarker)).toBeInTheDocument()
      expect(screen.queryByText(lastPageMarker)).not.toBeInTheDocument()
    })
  })

  describe('isDemoData reporting', () => {
    it('reports isDemoData true to CardDataReportContext when hook uses demo fallback', async () => {
      const report = vi.fn()
      setupHook({ isDemoFallback: true, data: { isDemoData: true, totalCount: 1, runs: [makeRun()] } })

      render(
        <CardDataReportContext.Provider value={{ report }}>
          <AgenticDetectionRuns />
        </CardDataReportContext.Provider>,
      )

      await waitFor(() => {
        const reportedDemo = report.mock.calls.some(
          (call) =>
            call[0] &&
            typeof call[0] === 'object' &&
            (call[0] as { isDemoData?: boolean }).isDemoData === true,
        )
        expect(reportedDemo).toBe(true)
      })
    })

    it('reports isDemoData false for live detection run data', async () => {
      const report = vi.fn()
      setupHook({
        isDemoFallback: false,
        data: { isDemoData: false, totalCount: 1, runs: [makeRun()] },
      })

      render(
        <CardDataReportContext.Provider value={{ report }}>
          <AgenticDetectionRuns />
        </CardDataReportContext.Provider>,
      )

      await waitFor(() => {
        const lastReport = report.mock.calls[report.mock.calls.length - 1]?.[0] as
          | { isDemoData?: boolean }
          | undefined
        expect(lastReport?.isDemoData).toBe(false)
      })
    })
  })
})
