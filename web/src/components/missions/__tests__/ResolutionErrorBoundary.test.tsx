import React from 'react'
/**
 * ResolutionErrorBoundary unit tests
 *
 * Covers: error catching, fallback UI, and recovery behavior.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ResolutionErrorBoundary } from '../ResolutionErrorBoundary'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: '/', search: '' }),
}))

vi.mock('../../../lib/api', () => ({
  api: { post: vi.fn(), get: vi.fn() },
}))

vi.mock('../../ui/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}))

const ThrowError = ({ shouldThrow }: { shouldThrow: boolean }) => {
  if (shouldThrow) {
    throw new Error('Test error')
  }
  return <div>No error</div>
}

describe('ResolutionErrorBoundary', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders children when there is no error', () => {
    render(
      <ResolutionErrorBoundary>
        <div data-testid="child">Child content</div>
      </ResolutionErrorBoundary>
    )

    expect(screen.getByTestId('child')).toBeInTheDocument()
    expect(screen.getByTestId('child')).toHaveTextContent('Child content')
  })

  it('catches errors and displays fallback UI', () => {
    // Suppress console.error for this test
    const consoleError = console.error
    console.error = vi.fn()

    render(
      <ResolutionErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ResolutionErrorBoundary>
    )

    expect(screen.getByText('Failed to apply resolution')).toBeInTheDocument()
    expect(screen.getByText('Test error')).toBeInTheDocument()

    console.error = consoleError
  })

  it('displays error message when error is caught', () => {
    const consoleError = console.error
    console.error = vi.fn()

    render(
      <ResolutionErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ResolutionErrorBoundary>
    )

    expect(screen.getByText(/An error occurred while processing the resolution/)).toBeInTheDocument()

    console.error = consoleError
  })

  it('recovers when "Try again" button is clicked', async () => {
    const user = userEvent.setup()
    const consoleError = console.error
    console.error = vi.fn()

    const { rerender } = render(
      <ResolutionErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ResolutionErrorBoundary>
    )

    expect(screen.getByText('Failed to apply resolution')).toBeInTheDocument()

    // Update props so children won't throw once the boundary recovers
    rerender(
      <ResolutionErrorBoundary>
        <ThrowError shouldThrow={false} />
      </ResolutionErrorBoundary>
    )

    // Click Try again — hasError becomes false; children now render without throwing
    const tryAgainButton = screen.getByRole('button', { name: /try again/i })
    await user.click(tryAgainButton)

    expect(screen.getByText('No error')).toBeInTheDocument()
    expect(screen.queryByText('Failed to apply resolution')).not.toBeInTheDocument()

    console.error = consoleError
  })
})
