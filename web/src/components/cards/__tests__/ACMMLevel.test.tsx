import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import { CardDataReportContext } from '../CardDataContext'
import { ACMMLevel } from '../ACMMLevel'
import {
  buildACMMContext,
  buildACMMContextFromScan,
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
    mockUseACMM.mockReturnValue(buildACMMContextFromScan(scan))
    render(<ACMMLevel />)

    expect(screen.getByText(TEST_REPO)).toBeInTheDocument()
    const levelShortName = scan.level.levelName.split(' / ')[0]
    const gauge = screen.getByText(levelShortName).closest('.relative')
    expect(gauge).not.toBeNull()
    expect(within(gauge as HTMLElement).getByText(`L${scan.level.level}`)).toBeInTheDocument()
    expect(screen.getByText(scan.level.characteristic)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /source/i })).toHaveAttribute(
      'href',
      'https://arxiv.org/abs/2604.09388',
    )
  })

  it('shows foundations prerequisite counts for demo fixture data', () => {
    const level = computeLevel(new Set(DEMO_DETECTED_IDS))
    expect(level.prerequisites.total).toBeGreaterThan(0)
    const scan = buildScanResult({ isDemoData: false })
    mockUseACMM.mockReturnValue(buildACMMContextFromScan(scan))
    render(<ACMMLevel />)

    expect(
      screen.getByText(`${level.prerequisites.met}/${level.prerequisites.total}`),
    ).toBeInTheDocument()
    expect(screen.getByText('Foundations:')).toBeInTheDocument()
  })

  it('does not render foundations block when prerequisites total is zero', () => {
    const scan = buildScanResult({ detectedIds: ['acmm:claude-md'], isDemoData: false })
    const scanNoPrereq = {
      ...scan,
      level: { ...scan.level, prerequisites: { met: 0, total: 0 } },
    }
    mockUseACMM.mockReturnValue(buildACMMContextFromScan(scanNoPrereq))
    render(<ACMMLevel />)
    expect(screen.queryByText('Foundations:')).not.toBeInTheDocument()
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
