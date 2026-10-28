import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BatchSummary } from './BatchSummary'
import type { BatchProcessing } from './BatchMonitorModal.utils'

function makeBatch(overrides: Partial<BatchProcessing> = {}): BatchProcessing {
  return {
    id: 'batch-1',
    startTime: '2026-01-01T00:00:00Z',
    status: 'in_progress',
    totalEvents: 7,
    events: [],
    summary: { resolved: 0, failed: 0, skipped: 0, inProgress: 0 },
    ...overrides,
  }
}

describe('BatchSummary', () => {
  it('renders total events count', () => {
    render(<BatchSummary batch={makeBatch()} progressPercent={0} />)
    expect(screen.getByText(/^7 /)).toBeInTheDocument()
  })

  it('exposes progress percent on the progressbar', () => {
    render(<BatchSummary batch={makeBatch()} progressPercent={42} />)
    const bar = screen.getByRole('progressbar')
    expect(bar).toHaveAttribute('aria-valuenow', '42')
    expect(bar).toHaveAttribute('aria-valuemin', '0')
    expect(bar).toHaveAttribute('aria-valuemax', '100')
  })

  it('renders no breakdown items when all counts are zero', () => {
    render(<BatchSummary batch={makeBatch()} progressPercent={0} />)
    expect(screen.queryByText('✓')).not.toBeInTheDocument()
    expect(screen.queryByText('✗')).not.toBeInTheDocument()
    expect(screen.queryByText('–')).not.toBeInTheDocument()
    expect(screen.queryByText('⊙')).not.toBeInTheDocument()
  })

  it('renders only breakdown items with non-zero counts', () => {
    render(
      <BatchSummary
        batch={makeBatch({ summary: { resolved: 3, failed: 0, skipped: 2, inProgress: 0 } })}
        progressPercent={50}
      />,
    )
    expect(screen.getByText('✓')).toBeInTheDocument()
    expect(screen.getByText(/^3 /)).toBeInTheDocument()
    expect(screen.getByText('–')).toBeInTheDocument()
    expect(screen.getByText(/^2 /)).toBeInTheDocument()
    expect(screen.queryByText('✗')).not.toBeInTheDocument()
    expect(screen.queryByText('⊙')).not.toBeInTheDocument()
  })

  it('renders all four breakdown items', () => {
    render(
      <BatchSummary
        batch={makeBatch({ summary: { resolved: 1, failed: 2, skipped: 3, inProgress: 4 } })}
        progressPercent={10}
      />,
    )
    expect(screen.getByText('✓')).toBeInTheDocument()
    expect(screen.getByText('✗')).toBeInTheDocument()
    expect(screen.getByText('–')).toBeInTheDocument()
    expect(screen.getByText('⊙')).toBeInTheDocument()
  })

  it('uses success color when completed with no failures', () => {
    render(<BatchSummary batch={makeBatch({ status: 'completed' })} progressPercent={100} />)
    const fill = screen.getByRole('progressbar').firstElementChild as HTMLElement
    expect(fill.style.background).toBe('var(--s-success)')
    expect(fill.style.width).toBe('100%')
  })

  it('uses warning color when there are failures', () => {
    render(
      <BatchSummary
        batch={makeBatch({ status: 'completed', summary: { resolved: 1, failed: 1, skipped: 0, inProgress: 0 } })}
        progressPercent={100}
      />,
    )
    const fill = screen.getByRole('progressbar').firstElementChild as HTMLElement
    expect(fill.style.background).toBe('var(--s-warning)')
  })

  it('uses info color while in progress', () => {
    render(<BatchSummary batch={makeBatch()} progressPercent={30} />)
    const fill = screen.getByRole('progressbar').firstElementChild as HTMLElement
    expect(fill.style.background).toBe('var(--s-info)')
  })
})
