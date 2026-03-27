import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PageErrorBoundary } from './PageErrorBoundary'

// Mock i18next
vi.mock('i18next', () => ({
  default: {
    t: (_key: string, fallback: string) => fallback,
  },
}))

// Mock analytics
vi.mock('../lib/analytics', () => ({
  emitError: vi.fn(),
  markErrorReported: vi.fn(),
}))

// Mock chunkErrors — non-chunk errors should be caught by PageErrorBoundary
vi.mock('../lib/chunkErrors', () => ({
  isChunkLoadError: (error: Error) =>
    error.message.includes('dynamically imported module'),
}))

describe('PageErrorBoundary', () => {
  let originalLocation: Location

  beforeEach(() => {
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
    vi.restoreAllMocks()
  })

  it('renders children when there is no error', () => {
    render(
      <PageErrorBoundary>
        <div>Hello World</div>
      </PageErrorBoundary>,
    )
    expect(screen.getByText('Hello World')).toBeTruthy()
  })

  it('shows error UI when a non-chunk render error occurs', () => {
    const ThrowError = () => {
      throw new Error('Unexpected null reference')
    }

    vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <PageErrorBoundary>
        <ThrowError />
      </PageErrorBoundary>,
    )

    expect(screen.getByText('This page encountered an error')).toBeTruthy()
    expect(screen.getByText('Unexpected null reference')).toBeTruthy()
    expect(screen.getByText('Try again')).toBeTruthy()
    expect(screen.getByText('Dashboard')).toBeTruthy()
    expect(screen.getByText('Reload')).toBeTruthy()
  })

  it('recovers when "Try again" is clicked', () => {
    let shouldThrow = true
    const MaybeThrow = () => {
      if (shouldThrow) throw new Error('Render crash')
      return <div>Recovered content</div>
    }

    vi.spyOn(console, 'error').mockImplementation(() => {})

    const { rerender } = render(
      <PageErrorBoundary>
        <MaybeThrow />
      </PageErrorBoundary>,
    )

    expect(screen.getByText('This page encountered an error')).toBeTruthy()

    // Stop throwing and click Try again
    shouldThrow = false
    fireEvent.click(screen.getByText('Try again'))

    rerender(
      <PageErrorBoundary>
        <MaybeThrow />
      </PageErrorBoundary>,
    )

    expect(screen.getByText('Recovered content')).toBeTruthy()
  })

  it('navigates home when Dashboard button is clicked', () => {
    const ThrowError = () => {
      throw new Error('crash')
    }

    vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <PageErrorBoundary>
        <ThrowError />
      </PageErrorBoundary>,
    )

    fireEvent.click(screen.getByText('Dashboard'))
    expect(window.location.href).toBe('/')
  })

  it('reloads the page when Reload button is clicked', () => {
    const ThrowError = () => {
      throw new Error('crash')
    }

    vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <PageErrorBoundary>
        <ThrowError />
      </PageErrorBoundary>,
    )

    fireEvent.click(screen.getByText('Reload'))
    expect(window.location.reload).toHaveBeenCalled()
  })

  it('lets chunk load errors propagate (not caught)', () => {
    const ThrowChunkError = () => {
      throw new Error('Failed to fetch dynamically imported module /chunk-abc.js')
    }

    vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => {
      render(
        <PageErrorBoundary>
          <ThrowChunkError />
        </PageErrorBoundary>,
      )
    }).toThrow('dynamically imported module')
  })
})
