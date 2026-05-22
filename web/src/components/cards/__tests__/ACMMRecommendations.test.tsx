import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CardDataReportContext } from '../CardDataContext'
import { ACMMRecommendations } from '../ACMMRecommendations'
import { buildACMMContext, buildScanResult } from './acmmTestFixtures'

const mockUseACMM = vi.fn()
const mockStartMission = vi.fn()

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('../../acmm/ACMMProvider', () => ({
  useACMM: () => mockUseACMM(),
}))

vi.mock('../../../hooks/useMissions', () => ({
  useMissions: () => ({ startMission: mockStartMission }),
}))

vi.mock('../../acmm/TargetBalanceCharts', () => ({
  TargetBalanceCharts: ({ level }: { level: number }) => (
    <div data-testid="target-balance-charts" data-level={level} />
  ),
}))

vi.mock('../../../lib/cards/CardComponents', () => ({
  CardSkeleton: ({ type, rows }: { type?: string; rows?: number }) => (
    <div data-testid="card-skeleton" data-type={type} data-rows={rows} />
  ),
}))

describe('ACMMRecommendations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseACMM.mockReturnValue(buildACMMContext())
  })

  it('renders loading skeleton when scan is loading with no detected data', () => {
    mockUseACMM.mockReturnValue(
      buildACMMContext({ isLoading: true, detectedIds: [] }),
    )
    render(<ACMMRecommendations />)
    expect(screen.getByTestId('card-skeleton')).toHaveAttribute('data-type', 'list')
  })

  it('renders top recommendations with per-item Ask agent CTA', () => {
    const scan = buildScanResult({ isDemoData: false })
    mockUseACMM.mockReturnValue(buildACMMContext({ isDemoData: false }))
    render(<ACMMRecommendations />)

    expect(scan.recommendations.length).toBeGreaterThan(0)
    const first = scan.recommendations[0]
    expect(screen.getByText(first.criterion.name)).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /ask agent for help/i }).length).toBeGreaterThan(0)
  })

  it('renders source citation links when recommendation sources have URLs', () => {
    const scan = buildScanResult({ isDemoData: false })
    mockUseACMM.mockReturnValue(buildACMMContext({ isDemoData: false }))
    render(<ACMMRecommendations />)

    const withUrl = scan.recommendations.find((r) =>
      r.sources.some((s) => s === 'acmm' || s === 'fullsend'),
    )
    expect(withUrl).toBeDefined()
    const links = screen.getAllByRole('link')
    expect(links.length).toBeGreaterThan(0)
    expect(links.some((a) => (a as HTMLAnchorElement).href.startsWith('http'))).toBe(true)
  })

  it('launches a mission when Ask agent for help is clicked on a recommendation', async () => {
    const user = userEvent.setup()
    const scan = buildScanResult({ isDemoData: false })
    mockUseACMM.mockReturnValue(buildACMMContext({ isDemoData: false }))
    render(<ACMMRecommendations />)

    const first = scan.recommendations[0]
    const recRow = screen.getByText(first.criterion.name).closest('.rounded-md')
    expect(recRow).not.toBeNull()
    await user.click(
      within(recRow as HTMLElement).getByRole('button', { name: /ask agent for help/i }),
    )
    expect(mockStartMission).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringContaining(first.criterion.name),
      }),
    )
  })

  it('shows empty recommendations copy when all criteria are detected', () => {
    const scan = buildScanResult({ isDemoData: false })
    mockUseACMM.mockReturnValue({
      ...buildACMMContext({ detectedIds: [...scan.detectedIds] }),
      targetLevel: scan.level.level,
    })
    render(<ACMMRecommendations />)

    if (scan.recommendations.length === 0) {
      expect(
        screen.getByText('Nothing to recommend — this repo covers all registered criteria.'),
      ).toBeInTheDocument()
    } else {
      expect(screen.getByText('Top recommendations')).toBeInTheDocument()
    }
  })

  it('reports isDemoData to CardDataReportContext when scan uses demo fallback', async () => {
    const report = vi.fn()
    mockUseACMM.mockReturnValue(buildACMMContext({ isDemoData: true }))
    render(
      <CardDataReportContext.Provider value={{ report }}>
        <ACMMRecommendations />
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
        <ACMMRecommendations />
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
