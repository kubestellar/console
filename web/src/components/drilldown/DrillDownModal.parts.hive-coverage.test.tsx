import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DrillDownBreadcrumbs, DrillDownErrorBoundary } from './DrillDownModal.parts'
import type { DrillDownView } from '../../hooks/useDrillDown.types'

afterEach(() => vi.restoreAllMocks())

describe('DrillDownErrorBoundary', () => {
  it('allows retry after a view fails and closes when requested', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    let broken = true
    function View() {
      if (broken) throw new Error('view unavailable')
      return <div>Recovered view</div>
    }
    const onClose = vi.fn()
    render(<DrillDownErrorBoundary onClose={onClose}><View /></DrillDownErrorBoundary>)
    expect(screen.getByText('view unavailable')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledOnce()
    broken = false
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(screen.getByText('Recovered view')).toBeInTheDocument()
    expect(screen.queryByText('Failed to load view')).not.toBeInTheDocument()
  })
})

describe('DrillDownBreadcrumbs', () => {
  it('navigates earlier views and exposes the current pod status', () => {
    const goTo = vi.fn()
    const stack = [
      { type: 'cluster', title: 'Cluster', data: {} },
      { type: 'pod', title: 'Pod', data: { status: 'Running' } },
    ] as DrillDownView[]
    render(<DrillDownBreadcrumbs stack={stack} goTo={goTo} navigationHistoryLabel="History" navigateToLabel={title => `Go to ${title}`} />)
    expect(screen.getByRole('tab', { name: 'Go to Pod' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Running')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: 'Go to Cluster' }))
    expect(goTo).toHaveBeenCalledWith(0)
  })
})
