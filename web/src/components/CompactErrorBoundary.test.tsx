/// <reference types='@testing-library/jest-dom/vitest' />
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CompactErrorBoundary } from './CompactErrorBoundary'

vi.mock('../lib/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/analytics')>()),
  emitError: vi.fn(),
  markErrorReported: vi.fn(),
}
))

const originalConsoleError = console.error

beforeEach(() => {
  vi.clearAllMocks()
  console.error = vi.fn()
})

afterAll(() => {
  console.error = originalConsoleError
})

function HealthyComponent() {
  return <div data-testid="healthy">Healthy content</div>
}

function CrashingComponent(): React.ReactElement {
  throw new Error('navbar render exploded')
}

describe('CompactErrorBoundary', () => {
  it('renders children when no error occurs', () => {
    render(
      <CompactErrorBoundary context="navbar">
        <HealthyComponent />
      </CompactErrorBoundary>,
    )

    expect(screen.getByTestId('healthy')).toBeInTheDocument()
  })

  it('renders the fallback and reports analytics when a child throws', async () => {
    const { emitError, markErrorReported } = await import('../lib/analytics')

    render(
      <CompactErrorBoundary
        context="navbar"
        fallback={<div data-testid="compact-fallback">Recovered from navbar error</div>}
      >
        <CrashingComponent />
      </CompactErrorBoundary>,
    )

    expect(screen.getByTestId('compact-fallback')).toHaveTextContent('Recovered from navbar error')
    expect(markErrorReported).toHaveBeenCalledWith('navbar render exploded')
    expect(emitError).toHaveBeenCalledWith(
      'component_render',
      'navbar render exploded',
      undefined,
      expect.objectContaining({
        error: expect.objectContaining({ message: 'navbar render exploded' }),
        componentStack: expect.any(String),
      }),
    )
    expect(console.error).toHaveBeenCalledWith(
      '[CompactErrorBoundary:navbar] Render error:',
      expect.objectContaining({ message: 'navbar render exploded' }),
      expect.objectContaining({ componentStack: expect.any(String) }),
    )
  })

  it('keeps sibling content mounted when the wrapped subtree crashes', () => {
    render(
      <div>
        <div data-testid="sibling">Sidebar toggle</div>
        <CompactErrorBoundary
          context="navbar"
          fallback={<div data-testid="compact-fallback">Recovered from navbar error</div>}
        >
          <CrashingComponent />
        </CompactErrorBoundary>
      </div>,
    )

    expect(screen.getByTestId('sibling')).toBeInTheDocument()
    expect(screen.getByTestId('compact-fallback')).toBeInTheDocument()
  })
})
