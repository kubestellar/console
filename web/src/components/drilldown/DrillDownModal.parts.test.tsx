import '@testing-library/jest-dom/vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  DrillDownBreadcrumbs,
  DrillDownErrorBoundary,
  DrillDownFooterHints,
  DrillDownLoading,
  getPodStatusColor,
  getViewIcon,
} from './DrillDownModal.parts'
import type { DrillDownView } from '../../hooks/useDrillDown.types'

const FIRST_INDEX = 0
const SECOND_INDEX = 1

function Bomb(): never {
  throw new Error('boom')
}

describe('getPodStatusColor', () => {
  it.each([
    ['Running', 'text-green-400'],
    ['Succeeded', 'text-blue-400'],
    ['completed', 'text-blue-400'],
    ['Pending', 'text-yellow-400'],
    ['CrashLoopBackOff', 'text-red-400'],
    ['Evicted', 'text-red-400'],
    ['Unknown', 'text-orange-400'],
    ['', 'text-orange-400'],
  ])('maps %s to %s', (status, expected) => {
    expect(getPodStatusColor(status)).toContain(expected)
  })
})

describe('getViewIcon', () => {
  it('returns an icon for known types and null for unknown', () => {
    expect(getViewIcon('pod')).not.toBeNull()
    expect(getViewIcon('all-gpu')).not.toBeNull()
    expect(getViewIcon('quantum-credentials')).not.toBeNull()
    expect(getViewIcon('nope')).toBeNull()
  })
})

describe('DrillDownLoading', () => {
  it('renders a spinner', () => {
    const { container } = render(<DrillDownLoading />)
    expect(container.querySelector('.animate-spin')).toBeInTheDocument()
  })
})

describe('DrillDownErrorBoundary', () => {
  it('renders children when no error occurs', () => {
    render(<DrillDownErrorBoundary onClose={vi.fn()}><span>fine</span></DrillDownErrorBoundary>)
    expect(screen.getByText('fine')).toBeInTheDocument()
  })

  it('shows recovery UI and calls onClose', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const onClose = vi.fn()
    render(<DrillDownErrorBoundary onClose={onClose}><Bomb /></DrillDownErrorBoundary>)

    expect(screen.getByText('Failed to load view')).toBeInTheDocument()
    expect(screen.getByText('boom')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Close'))
    expect(onClose).toHaveBeenCalledTimes(1)
    errorSpy.mockRestore()
  })

  it('Retry clears the error state', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<DrillDownErrorBoundary onClose={vi.fn()}><Bomb /></DrillDownErrorBoundary>)
    fireEvent.click(screen.getByText('Retry'))
    expect(screen.getByText('Failed to load view')).toBeInTheDocument()
    errorSpy.mockRestore()
  })
})

describe('DrillDownBreadcrumbs', () => {
  const stack: DrillDownView[] = [
    { type: 'cluster', title: 'cluster-a', data: {} },
    { type: 'pod', title: 'pod-b', data: { status: 'Running' } },
  ]

  it('renders tabs with aria state and pod status badge', () => {
    render(
      <DrillDownBreadcrumbs stack={stack} goTo={vi.fn()} navigationHistoryLabel="History" navigateToLabel={(title) => `Go ${title}`} />
    )
    expect(screen.getByRole('tablist', { name: 'History' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Go pod-b' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Go cluster-a' })).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByText('Running')).toBeInTheDocument()
  })

  it('calls goTo with the clicked index', () => {
    const goTo = vi.fn()
    render(
      <DrillDownBreadcrumbs stack={stack} goTo={goTo} navigationHistoryLabel="History" navigateToLabel={(title) => `Go ${title}`} />
    )
    fireEvent.click(screen.getByRole('tab', { name: 'Go cluster-a' }))
    expect(goTo).toHaveBeenCalledWith(FIRST_INDEX)
    fireEvent.click(screen.getByRole('tab', { name: 'Go pod-b' }))
    expect(goTo).toHaveBeenCalledWith(SECOND_INDEX)
  })
})

describe('DrillDownFooterHints', () => {
  it('shows the back hint only when requested', () => {
    const { rerender } = render(<DrillDownFooterHints showBackHint={false} />)
    expect(screen.getByText('Esc')).toBeInTheDocument()
    expect(screen.queryByText('Space')).not.toBeInTheDocument()
    rerender(<DrillDownFooterHints showBackHint />)
    expect(screen.getByText('Space')).toBeInTheDocument()
  })
})
