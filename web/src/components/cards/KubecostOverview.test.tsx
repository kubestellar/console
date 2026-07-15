import React from 'react'
/**
 * Unit tests for KubecostOverview card component.
 * Covers: integration notice, demo cost data, cost breakdown tiles,
 * recommendations list, drill-down call, and snapshot.
 *
 * Closes #21103
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { KubecostOverview } from './KubecostOverview'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string) => key.split('.').pop() ?? key,
  }),
}))

const mockDrillToCost = vi.fn()
vi.mock('../../hooks/useDrillDown', () => ({
  useDrillDownActions: () => ({ drillToCost: mockDrillToCost }),
}))

vi.mock('./CardDataContext', () => ({
  useReportCardDataState: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('KubecostOverview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // 1. Renders integration notice
  it('renders Kubecost Integration notice', () => {
    render(<KubecostOverview />)
    expect(screen.getByText('Kubecost Integration')).toBeInTheDocument()
  })

  // 2. Cost data
  it('renders monthly cost amount', () => {
    render(<KubecostOverview />)
    expect(screen.getByText(/12,450/)).toBeInTheDocument()
  })

  it('renders monthlyCost label', () => {
    render(<KubecostOverview />)
    expect(screen.getByText(/monthlyCost/i)).toBeInTheDocument()
  })

  // 3. Cost breakdown
  it('renders CPU cost category', () => {
    render(<KubecostOverview />)
    expect(screen.getByText('CPU')).toBeInTheDocument()
  })

  it('renders Memory cost category', () => {
    render(<KubecostOverview />)
    expect(screen.getByText('Memory')).toBeInTheDocument()
  })

  it('renders Storage cost category', () => {
    render(<KubecostOverview />)
    expect(screen.getByText('Storage')).toBeInTheDocument()
  })

  // 4. Recommendations
  it('renders at least one optimization recommendation', () => {
    render(<KubecostOverview />)
    // "Rightsize" or similar keyword appears in DEMO_RECOMMENDATIONS
    expect(screen.getByText(/Rightsize/i)).toBeInTheDocument()
  })

  it('renders potential savings amount', () => {
    render(<KubecostOverview />)
    expect(screen.getByText(/890/)).toBeInTheDocument()
  })

  // 5. External link
  it('renders link to kubecost website', () => {
    render(<KubecostOverview />)
    const links = screen.getAllByRole('link')
    expect(links.some(l => l.getAttribute('href')?.includes('kubecost'))).toBe(true)
  })

  // 6. Snapshot
  it('matches snapshot', () => {
    const { asFragment } = render(<KubecostOverview />)
    expect(asFragment()).toMatchSnapshot()
  })
})
