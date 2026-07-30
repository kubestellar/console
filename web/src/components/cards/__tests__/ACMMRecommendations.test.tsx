import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CardDataReportContext } from '../CardDataContext'
import { ACMMRecommendations } from '../ACMMRecommendations'
import {
  buildACMMContext,
  buildACMMContextFromScan,
  buildScanResult,
  TEST_REPO,
} from './acmmTestFixtures'
import { SOURCES_BY_ID } from '../../../lib/acmm/sources'

const mockUseACMM = vi.fn()
const mockStartMission = vi.fn()

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
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

/** Walk up from criterion heading to the card root that contains its CTA button. */
function recommendationCardRoot(criterionName: string): HTMLElement {
  const heading = screen.getByText(criterionName)
  let el: HTMLElement | null = heading.parentElement
  while (el && !el.querySelector(`button[title*="Ask the selected agent"]`)) {
    el = el.parentElement
  }
  if (!el) {
    throw new Error(`Recommendation card not found for: ${criterionName}`)
  }
  return el
}

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
    mockUseACMM.mockReturnValue(buildACMMContextFromScan(scan))
    render(<ACMMRecommendations />)

    expect(scan.recommendations.length).toBeGreaterThan(0)
    const first = scan.recommendations[0]
    expect(screen.getByText(first.criterion.name)).toBeInTheDocument()
    expect(
      within(recommendationCardRoot(first.criterion.name)).getByRole('button', {
        name: /ask agent for help/i,
      }),
    ).toBeInTheDocument()
  })

  it('renders source citation links when recommendation sources have URLs', () => {
    const scan = buildScanResult({ isDemoData: false })
    mockUseACMM.mockReturnValue(buildACMMContextFromScan(scan))
    render(<ACMMRecommendations />)

    const withUrl = scan.recommendations.find((r) =>
      r.sources.some((s) => Boolean(SOURCES_BY_ID[s]?.url)),
    )
    expect(withUrl).toBeDefined()
    const card = recommendationCardRoot(withUrl!.criterion.name)
    const links = within(card).getAllByRole('link')
    expect(links.length).toBeGreaterThan(0)
    const sourceId = withUrl!.sources.find((s) => SOURCES_BY_ID[s]?.url)
    expect(sourceId).toBeDefined()
    expect(
      links.some((a) =>
        (a as HTMLAnchorElement).href.includes(
          new URL(SOURCES_BY_ID[sourceId!].url!).hostname,
        ),
      ),
    ).toBe(true)
  })

  it('launches a mission when Ask agent for help is clicked on a recommendation', async () => {
    const user = userEvent.setup()
    const scan = buildScanResult({ isDemoData: false })
    mockUseACMM.mockReturnValue(buildACMMContextFromScan(scan))
    render(<ACMMRecommendations />)

    const first = scan.recommendations[0]
    await user.click(
      screen.getByTitle(
        `Ask the selected agent to add the "${first.criterion.name}" criterion to ${TEST_REPO}`,
      ),
    )
    expect(mockStartMission).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringContaining(first.criterion.name),
      }),
    )
  })

  it('shows empty recommendations copy when recommendations list is empty', () => {
    const scan = buildScanResult({ recommendations: [], isDemoData: false })
    mockUseACMM.mockReturnValue(
      buildACMMContextFromScan(scan, scan.level.level),
    )
    render(<ACMMRecommendations />)

    expect(
      screen.getByText('Nothing to recommend — this repo covers all registered criteria.'),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /ask agent for help with all/i }),
    ).not.toBeInTheDocument()
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
    const scan = buildScanResult({ isDemoData: false })
    mockUseACMM.mockReturnValue(buildACMMContextFromScan(scan))
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
