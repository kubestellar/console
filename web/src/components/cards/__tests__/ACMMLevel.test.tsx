import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { CardDataReportContext } from '../CardDataContext'
import { ACMMLevel } from '../ACMMLevel'
import {
  buildACMMContext,
  buildScanResult,
  DEMO_DETECTED_IDS,
  TEST_REPO,
} from './acmmTestFixtures'
import { computeLevel } from '../../../lib/acmm/computeLevel'

const mockUseACMM = vi.fn()

vi.mock('../../acmm/ACMMProvider', () => ({
  useACMM: () => mockUseACMM(),
}))

vi.mock('../../../lib/cards/CardComponents', () => ({
  CardSkeleton: ({ type }: { type?: string }) => (
    <div data-testid="card-skeleton" data-type={type} />
  ),
}))

describe('ACMMLevel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseACMM.mockReturnValue(buildACMMContext())
  })

  it('renders loading skeleton when scan is loading with no detected data', () => {
    mockUseACMM.mockReturnValue(
      buildACMMContext({ isLoading: true, detectedIds: [] }),
    )
    render(<ACMMLevel />)
    expect(screen.getByTestId('card-skeleton')).toHaveAttribute('data-type', 'metric')
  })

  it('renders level badge and numeric role for live scan data', () => {
    const scan = buildScanResult({ isDemoData: false })
    mockUseACMM.mockReturnValue(buildACMMContext({ isDemoData: false }))
    const { container } = render(<ACMMLevel />)

    expect(screen.getByText(TEST_REPO)).toBeInTheDocument()
    const levelBadge = container.querySelector('.text-2xl.font-bold')
    expect(levelBadge).toHaveTextContent(`L${scan.level.level}`)
    expect(screen.getByText(scan.level.characteristic)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /source/i })).toHaveAttribute(
      'href',
      'https://arxiv.org/abs/2604.09388',
    )
  })

  it('shows foundations prerequisite counts when prerequisites exist', () => {
    const detectedIds = new Set(DEMO_DETECTED_IDS)
    const level = computeLevel(detectedIds)
    mockUseACMM.mockReturnValue(buildACMMContext({ isDemoData: false }))
    render(<ACMMLevel />)

    if (level.prerequisites.total > 0) {
      expect(
        screen.getByText(`${level.prerequisites.met}/${level.prerequisites.total}`),
      ).toBeInTheDocument()
    }
  })

  it('reports isDemoData to CardDataReportContext when scan uses demo fallback', async () => {
    const report = vi.fn()
    mockUseACMM.mockReturnValue(buildACMMContext({ isDemoData: true }))
    render(
      <CardDataReportContext.Provider value={{ report }}>
        <ACMMLevel />
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

  it('reports isDemoData false for live scan data', async () => {
    const report = vi.fn()
    mockUseACMM.mockReturnValue(buildACMMContext({ isDemoData: false }))
    render(
      <CardDataReportContext.Provider value={{ report }}>
        <ACMMLevel />
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
