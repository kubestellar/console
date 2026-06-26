import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

// LazyEChart is an echarts wrapper — mock it to avoid canvas setup in jsdom
vi.mock('../../charts/LazyEChart', () => ({
  LazyEChart: ({ option }: { option: { title?: { text?: string } } }) => (
    <div data-testid="echart" data-title={option?.title?.text ?? ''} />
  ),
}))

import { TargetBalanceCharts } from '../TargetBalanceCharts'

describe('TargetBalanceCharts', () => {
  it('renders two charts', () => {
    render(<TargetBalanceCharts level={1} />)
    expect(screen.getAllByTestId('echart')).toHaveLength(2)
  })

  it('renders a PRs chart title', () => {
    render(<TargetBalanceCharts level={1} />)
    const charts = screen.getAllByTestId('echart')
    const titles = charts.map((c) => c.getAttribute('data-title'))
    expect(titles.some((t) => t?.toLowerCase().includes('pr'))).toBe(true)
  })

  it('renders an Issues chart title', () => {
    render(<TargetBalanceCharts level={1} />)
    const charts = screen.getAllByTestId('echart')
    const titles = charts.map((c) => c.getAttribute('data-title'))
    expect(titles.some((t) => t?.toLowerCase().includes('issue'))).toBe(true)
  })

  it('shows correct AI% for PRs at L1 (10%)', () => {
    render(<TargetBalanceCharts level={1} />)
    expect(screen.getByText(/AI 10%/)).toBeInTheDocument()
  })

  it('shows correct Human% for PRs at L1 (90%)', () => {
    render(<TargetBalanceCharts level={1} />)
    expect(screen.getByText(/Human 90%/)).toBeInTheDocument()
  })

  it('shows correct AI% for Issues at L1 (70%)', () => {
    render(<TargetBalanceCharts level={1} />)
    expect(screen.getByText(/AI 70%/)).toBeInTheDocument()
  })

  it('shows correct Human% for Issues at L1 (30%)', () => {
    render(<TargetBalanceCharts level={1} />)
    expect(screen.getByText(/Human 30%/)).toBeInTheDocument()
  })

  it('shows correct AI% for PRs at L5 (90%)', () => {
    render(<TargetBalanceCharts level={5} />)
    // At L5: PRs AI=90%, Issues AI=10%
    const matches = screen.getAllByText(/AI 90%/)
    expect(matches.length).toBeGreaterThan(0)
  })

  it('shows correct AI% for Issues at L5 (10%)', () => {
    render(<TargetBalanceCharts level={5} />)
    const matches = screen.getAllByText(/AI 10%/)
    expect(matches.length).toBeGreaterThan(0)
  })

  it('renders correctly at L3 (mid-range)', () => {
    render(<TargetBalanceCharts level={3} />)
    // PRs AI=55% Human=45%, Issues AI=40% Human=60%
    expect(screen.getByText(/AI 55%/)).toBeInTheDocument()
    expect(screen.getByText(/Human 45%/)).toBeInTheDocument()
    expect(screen.getByText(/AI 40%/)).toBeInTheDocument()
    expect(screen.getByText(/Human 60%/)).toBeInTheDocument()
  })

  it('falls back to L1 values for unknown level', () => {
    render(<TargetBalanceCharts level={99} />)
    // fallback: PR AI=10%, Issues AI=70%
    expect(screen.getByText(/AI 10%/)).toBeInTheDocument()
    expect(screen.getByText(/AI 70%/)).toBeInTheDocument()
  })
})
