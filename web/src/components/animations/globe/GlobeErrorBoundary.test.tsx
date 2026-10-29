/// <reference types='@testing-library/jest-dom/vitest' />
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import { render, screen } from '@testing-library/react'
import { GlobeErrorBoundary } from './GlobeErrorBoundary'

vi.mock('../../../lib/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/analytics')>()),
  emitError: vi.fn(),
  markErrorReported: vi.fn(),
}))

const originalConsoleError = console.error

beforeEach(() => {
  vi.clearAllMocks()
  console.error = vi.fn()
})

afterAll(() => {
  console.error = originalConsoleError
})

function HealthyGlobe() {
  return <div data-testid="globe">3D globe</div>
}

function CrashingGlobe(): React.ReactElement {
  throw new Error('WebGL context lost')
}

describe('GlobeErrorBoundary', () => {
  it('renders children when no error occurs', () => {
    render(
      <GlobeErrorBoundary>
        <HealthyGlobe />
      </GlobeErrorBoundary>,
    )

    expect(screen.getByTestId('globe')).toBeInTheDocument()
  })

  it('fails silently (renders nothing) instead of crashing the login page when a child throws', () => {
    const { container } = render(
      <GlobeErrorBoundary>
        <CrashingGlobe />
      </GlobeErrorBoundary>,
    )

    expect(container).toBeEmptyDOMElement()
  })

  it('reports the error to analytics when a child throws', async () => {
    const { emitError, markErrorReported } = await import('../../../lib/analytics')

    render(
      <GlobeErrorBoundary>
        <CrashingGlobe />
      </GlobeErrorBoundary>,
    )

    expect(markErrorReported).toHaveBeenCalledWith('WebGL context lost')
    expect(emitError).toHaveBeenCalledWith(
      'globe_render',
      'WebGL context lost',
      undefined,
      expect.objectContaining({
        error: expect.objectContaining({ message: 'WebGL context lost' }),
        componentStack: expect.any(String),
      }),
    )
    expect(console.error).toHaveBeenCalledWith(
      '[GlobeErrorBoundary] 3D globe rendering failed:',
      expect.objectContaining({ message: 'WebGL context lost' }),
      expect.objectContaining({ componentStack: expect.any(String) }),
    )
  })

  it('keeps sibling content mounted when the globe subtree crashes', () => {
    render(
      <div>
        <div data-testid="sibling">Login form</div>
        <GlobeErrorBoundary>
          <CrashingGlobe />
        </GlobeErrorBoundary>
      </div>,
    )

    expect(screen.getByTestId('sibling')).toBeInTheDocument()
  })
})
