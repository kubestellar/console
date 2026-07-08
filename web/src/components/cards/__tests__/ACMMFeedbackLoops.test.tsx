import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CardDataReportContext } from '../CardDataContext'
import { ACMMFeedbackLoops } from '../ACMMFeedbackLoops'
import { ALL_CRITERIA } from '../../../lib/acmm/sources'
import { buildACMMContext, buildACMMContextFromScan, buildScanResult } from './acmmTestFixtures'

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

vi.mock('../../../lib/cards/CardComponents', () => ({
  CardSkeleton: ({ type, rows }: { type?: string; rows?: number }) => (
    <div data-testid="card-skeleton" data-type={type} data-rows={rows} />
  ),
}))

describe('ACMMFeedbackLoops', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseACMM.mockReturnValue(buildACMMContext())
  })

  it('renders loading skeleton when scan is loading with no criteria detected', () => {
    mockUseACMM.mockReturnValue(
      buildACMMContext({ isLoading: true, detectedIds: [] }),
    )
    render(<ACMMFeedbackLoops />)
    expect(screen.getByTestId('card-skeleton')).toHaveAttribute('data-type', 'list')
  })

  it('renders feedback loop criterion names from the catalog', () => {
    const sample = ALL_CRITERIA.find((c) => c.source === 'acmm' && c.level === 2)
    expect(sample).toBeDefined()
    render(<ACMMFeedbackLoops />)
    expect(screen.getByText(sample!.name)).toBeInTheDocument()
  })

  it('shows load-failed empty state when scan has no detected data after load', () => {
    mockUseACMM.mockReturnValue(
      buildACMMContext({ detectedIds: [], isLoading: false }),
    )
    render(<ACMMFeedbackLoops />)
    expect(screen.getByText('Failed to load criteria')).toBeInTheDocument()
  })

  it('shows filter empty state when no criteria match the active filter', async () => {
    const user = userEvent.setup()
    render(<ACMMFeedbackLoops />)
    // Demo detected set has no claude-reflect IDs — Reflect + detected yields zero rows.
    await user.click(screen.getByRole('button', { name: 'Reflect' }))
    await user.click(screen.getByRole('button', { name: 'detected' }))
    expect(
      screen.getByText('No criteria match the current filter'),
    ).toBeInTheDocument()
  })

  it('reports isDemoData to CardDataReportContext when scan uses demo fallback', async () => {
    const report = vi.fn()
    mockUseACMM.mockReturnValue(buildACMMContext({ isDemoData: true }))
    render(
      <CardDataReportContext.Provider value={{ report }}>
        <ACMMFeedbackLoops />
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

  it('reports isDemoData false when live scan data is shown', async () => {
    const report = vi.fn()
    const scan = buildScanResult({ isDemoData: false })
    mockUseACMM.mockReturnValue(buildACMMContextFromScan(scan))
    render(
      <CardDataReportContext.Provider value={{ report }}>
        <ACMMFeedbackLoops />
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
