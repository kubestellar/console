import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DynamicCardErrorBoundary } from '../DynamicCardErrorBoundary'

// Suppress console.error from React error boundaries during tests
const originalConsoleError = console.error
beforeEach(() => {
  console.error = vi.fn()
})

// Restore after all tests
afterAll(() => {
  console.error = originalConsoleError
})

vi.mock('../../../lib/analytics', () => ({
  emitError: vi.fn(),
  markErrorReported: vi.fn(),
}))

vi.mock('../../../lib/chunkErrors', () => ({
  isChunkLoadError: () => false,
}))

/** Component that always throws during render */
function CrashingComponent(): JSX.Element {
  throw new Error('TSX execution crash')
}

/** Component that renders successfully */
function HealthyComponent() {
  return <div data-testid="healthy">Healthy card content</div>
}

describe('DynamicCardErrorBoundary', () => {
  it('renders children when no error occurs', () => {
    render(
      <DynamicCardErrorBoundary cardId="test-card">
        <HealthyComponent />
      </DynamicCardErrorBoundary>,
    )
    expect(screen.getByTestId('healthy')).toBeTruthy()
    expect(screen.getByText('Healthy card content')).toBeTruthy()
  })

  it('catches render errors and shows recovery UI instead of crashing', () => {
    render(
      <DynamicCardErrorBoundary cardId="bad-card">
        <CrashingComponent />
      </DynamicCardErrorBoundary>,
    )
    expect(screen.getByText('Card Render Error')).toBeTruthy()
    expect(screen.getByText('TSX execution crash')).toBeTruthy()
  })

  it('does not crash the parent when a child throws', () => {
    const { container } = render(
      <div data-testid="parent">
        <DynamicCardErrorBoundary cardId="bad-card">
          <CrashingComponent />
        </DynamicCardErrorBoundary>
      </div>,
    )
    // Parent remains intact
    expect(container.querySelector('[data-testid="parent"]')).toBeTruthy()
    // Error UI is rendered inside the boundary
    expect(screen.getByText('Card Render Error')).toBeTruthy()
  })

  it('shows retry button with attempt count', () => {
    render(
      <DynamicCardErrorBoundary cardId="retry-card">
        <CrashingComponent />
      </DynamicCardErrorBoundary>,
    )
    const retryButton = screen.getByRole('button', { name: /retry/i })
    expect(retryButton).toBeTruthy()
    expect(retryButton.textContent).toContain('3')
  })

  it('decrements retry count on each failed retry attempt', () => {
    render(
      <DynamicCardErrorBoundary cardId="retry-card">
        <CrashingComponent />
      </DynamicCardErrorBoundary>,
    )
    // First error: retryCount=0, retriesLeft=3
    expect(screen.getByText(/3 left/)).toBeTruthy()

    // Click retry — component re-renders, crashes again, retryCount becomes 1
    fireEvent.click(screen.getByRole('button', { name: /retry/i }))
    expect(screen.getByText(/2 left/)).toBeTruthy()

    // Click retry again — retryCount becomes 2
    fireEvent.click(screen.getByRole('button', { name: /retry/i }))
    expect(screen.getByText(/1 left/)).toBeTruthy()
  })

  it('shows reload message after all retries are exhausted', () => {
    render(
      <DynamicCardErrorBoundary cardId="exhaust-card">
        <CrashingComponent />
      </DynamicCardErrorBoundary>,
    )

    // Exhaust all 3 retries
    fireEvent.click(screen.getByRole('button', { name: /retry/i }))
    fireEvent.click(screen.getByRole('button', { name: /retry/i }))
    fireEvent.click(screen.getByRole('button', { name: /retry/i }))

    // Retry button should be gone, replaced by reload message
    expect(screen.queryByRole('button', { name: /retry/i })).toBeNull()
    expect(screen.getByText('Reload the page to try again.')).toBeTruthy()
  })

  it('calls onError callback when an error is caught', () => {
    const onError = vi.fn()
    render(
      <DynamicCardErrorBoundary cardId="callback-card" onError={onError}>
        <CrashingComponent />
      </DynamicCardErrorBoundary>,
    )
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'TSX execution crash' }),
      expect.objectContaining({ componentStack: expect.any(String) }),
    )
  })

  it('isolates errors between sibling boundaries', () => {
    render(
      <div>
        <DynamicCardErrorBoundary cardId="good-card">
          <HealthyComponent />
        </DynamicCardErrorBoundary>
        <DynamicCardErrorBoundary cardId="bad-card">
          <CrashingComponent />
        </DynamicCardErrorBoundary>
      </div>,
    )
    // Good card still renders
    expect(screen.getByTestId('healthy')).toBeTruthy()
    // Bad card shows error UI
    expect(screen.getByText('Card Render Error')).toBeTruthy()
  })

  it('emits analytics error when a crash occurs', async () => {
    const { emitError, markErrorReported } = await import('../../../lib/analytics')
    render(
      <DynamicCardErrorBoundary cardId="analytics-card">
        <CrashingComponent />
      </DynamicCardErrorBoundary>,
    )
    expect(markErrorReported).toHaveBeenCalledWith('TSX execution crash')
    expect(emitError).toHaveBeenCalledWith(
      'card_render',
      '[analytics-card] TSX execution crash',
      'analytics-card',
    )
  })
})
