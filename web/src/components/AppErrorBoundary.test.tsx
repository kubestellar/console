import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AppErrorBoundary } from './AppErrorBoundary'
import { emitError, markErrorReported } from '../lib/analytics'

// Mock analytics to prevent real network calls and allow spying
vi.mock('../lib/analytics', () => ({
  emitError: vi.fn(),
  markErrorReported: vi.fn(),
}))

// Mock i18next to return translation keys directly
vi.mock('i18next', () => ({
  default: {
    t: (key: string, fallback: string) => fallback,
  },
}))

// A component that throws an error to trigger the boundary
const Bomb = ({ shouldThrow = false }: { shouldThrow?: boolean }) => {
  if (shouldThrow) {
    throw new Error('Boom! Test error.')
  }
  return <div data-testid="safe-child">Safe Content</div>
}

describe('AppErrorBoundary', () => {
  let originalLocation: Location

  beforeEach(() => {
    vi.clearAllMocks()
    // Suppress console.error so our test logs remain clean when we intentionally throw
    vi.spyOn(console, 'error').mockImplementation(() => {})

    originalLocation = window.location
    Object.defineProperty(window, 'location', {
      value: { href: '', reload: vi.fn() },
      writable: true,
    })
  })

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
    })
  })

  it('renders children normally when there is no error', () => {
    render(
      <AppErrorBoundary>
        <Bomb />
      </AppErrorBoundary>
    )
    
    expect(screen.getByTestId('safe-child')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('catches render errors, displays fallback UI, and reports to GA4', () => {
    render(
      <AppErrorBoundary>
        <Bomb shouldThrow={true} />
      </AppErrorBoundary>
    )
    
    // Fallback UI should be visible
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    expect(screen.getByText('Boom! Test error.')).toBeInTheDocument()
    
    // The error should have been intercepted and sent to analytics
    expect(markErrorReported).toHaveBeenCalledWith('Boom! Test error.')
    expect(emitError).toHaveBeenCalledWith(
      'uncaught_render',
      'Boom! Test error.',
      undefined,
      expect.objectContaining({
        error: expect.any(Error),
        componentStack: expect.any(String),
      })
    )
  })

  it('recovers from error state when "Try again" is clicked', () => {
    const { rerender } = render(
      <AppErrorBoundary>
        <Bomb shouldThrow={true} />
      </AppErrorBoundary>
    )
    
    // Currently in error state
    expect(screen.getByRole('alert')).toBeInTheDocument()
    
    // Fix the broken child component by passing safe props
    rerender(
      <AppErrorBoundary>
        <Bomb shouldThrow={false} />
      </AppErrorBoundary>
    )
    
    // Click "Try again" to trigger handleRecover
    const retryButton = screen.getByRole('button', { name: /Try again/i })
    fireEvent.click(retryButton)
    
    // The boundary should clear the error state and render the safe child
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByTestId('safe-child')).toBeInTheDocument()
  })

  it('triggers a full page reload when "Reload page" is clicked', () => {
    render(
      <AppErrorBoundary>
        <Bomb shouldThrow={true} />
      </AppErrorBoundary>
    )
    
    const reloadButton = screen.getByRole('button', { name: /Reload page/i })
    fireEvent.click(reloadButton)
    
    expect(window.location.reload).toHaveBeenCalledTimes(1)
  })
})
