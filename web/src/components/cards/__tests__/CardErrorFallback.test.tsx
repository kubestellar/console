import React from 'react'
/**
 * Unit tests for CardFailureBanner (addresses #21094) and CardErrorFallback
 * (addresses #22484).
 *
 * CardFailureBanner is the inline error surface used by every card via
 * CardWrapper when a refresh fails. CardErrorFallback is the render-time error
 * boundary wrapper that renders when a card component itself throws. Testing
 * these shared surfaces covers a large blast radius with a small amount of
 * test code.
 */
import { afterAll, beforeEach, describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  CardErrorFallback,
  CardFailureBanner,
  type CardFailureBannerProps,
} from '../CardErrorFallback'

vi.mock('../../../lib/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/analytics')>()),
  emitError: vi.fn(),
  markErrorReported: vi.fn(),
}))

vi.mock('../../../lib/chunkErrors', () => ({
  isChunkLoadError: () => false,
}))

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (opts && 'count' in opts) return `${key}:${opts.count}`
      return key
    },
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}))

function renderBanner(overrides: Partial<CardFailureBannerProps> = {}) {
  const props: CardFailureBannerProps = {
    cardType: 'cluster_health',
    isFailed: true,
    isCollapsed: false,
    consecutiveFailures: 1,
    isVisuallySpinning: false,
    ...overrides,
  }
  return render(<CardFailureBanner {...props} />)
}

describe('CardFailureBanner', () => {
  it('renders nothing when the card is not failed', () => {
    const { container } = renderBanner({ isFailed: false })
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when the card is collapsed', () => {
    const { container } = renderBanner({ isCollapsed: true })
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing for the events_timeline compact-failure card type', () => {
    const { container } = renderBanner({ cardType: 'events_timeline' })
    expect(container.firstChild).toBeNull()
  })

  it('renders the banner with a failure count when the card has failed', () => {
    renderBanner({ consecutiveFailures: 3 })
    expect(screen.getByTestId('card-failure-banner')).toBeTruthy()
    expect(screen.getByText('cardWrapper.refreshFailedCount:3')).toBeTruthy()
  })

  it('shows the error message inline when provided', () => {
    renderBanner({ errorMessage: 'boom: connection refused' })
    expect(screen.getByText(/boom: connection refused/)).toBeTruthy()
  })

  it('does not render the view-logs toggle when there is no error message', () => {
    renderBanner()
    expect(screen.queryByLabelText('cardWrapper.viewLogs')).toBeNull()
    expect(screen.queryByLabelText('cardWrapper.hideLogs')).toBeNull()
  })

  it('toggles the failure log details when view-logs is clicked', async () => {
    const user = userEvent.setup()
    renderBanner({ errorMessage: 'stack: EPIPE at socket' })
    // Logs hidden by default
    expect(screen.queryByTestId('card-failure-logs')).toBeNull()
    await user.click(screen.getByLabelText('cardWrapper.viewLogs'))
    expect(screen.getByTestId('card-failure-logs')).toBeTruthy()
    // Now the button flips to hide-logs
    await user.click(screen.getByLabelText('cardWrapper.hideLogs'))
    expect(screen.queryByTestId('card-failure-logs')).toBeNull()
  })

  it('invokes onRefresh when the retry button is clicked', async () => {
    const onRefresh = vi.fn()
    const user = userEvent.setup()
    renderBanner({ onRefresh })
    await user.click(screen.getByLabelText('cardWrapper.failureRetry'))
    expect(onRefresh).toHaveBeenCalledTimes(1)
  })

  it('does not render the retry button when no onRefresh is provided', () => {
    renderBanner()
    expect(screen.queryByLabelText('cardWrapper.failureRetry')).toBeNull()
  })

  it('hides the remove button below the failure threshold', () => {
    renderBanner({ onRemove: vi.fn(), consecutiveFailures: 2 })
    expect(screen.queryByTestId('card-remove-button')).toBeNull()
  })

  it('shows the remove button at or above the failure threshold and calls onRemove', async () => {
    const onRemove = vi.fn()
    const user = userEvent.setup()
    renderBanner({ onRemove, consecutiveFailures: 3 })
    const remove = screen.getByTestId('card-remove-button')
    await user.click(remove)
    expect(onRemove).toHaveBeenCalledTimes(1)
  })

  it('spins the retry icon when isRefreshing or isVisuallySpinning is true', () => {
    const { container, rerender } = renderBanner({
      onRefresh: vi.fn(),
      isRefreshing: true,
    })
    expect(container.querySelector('.animate-spin')).not.toBeNull()
    rerender(
      <CardFailureBanner
        cardType="cluster_health"
        isFailed
        isCollapsed={false}
        consecutiveFailures={1}
        isVisuallySpinning
        onRefresh={vi.fn()}
      />
    )
    expect(container.querySelector('.animate-spin')).not.toBeNull()
  })

  it('resets the log-visibility toggle when the card recovers from failure', async () => {
    const user = userEvent.setup()
    const { rerender } = render(
      <CardFailureBanner
        cardType="cluster_health"
        isFailed
        isCollapsed={false}
        consecutiveFailures={1}
        isVisuallySpinning={false}
        errorMessage="boom"
      />
    )
    await user.click(screen.getByLabelText('cardWrapper.viewLogs'))
    expect(screen.getByTestId('card-failure-logs')).toBeTruthy()
    rerender(
      <CardFailureBanner
        cardType="cluster_health"
        isFailed={false}
        isCollapsed={false}
        consecutiveFailures={0}
        isVisuallySpinning={false}
        errorMessage="boom"
      />
    )
    // Banner unmounts entirely when not failed, so logs must be gone.
    expect(screen.queryByTestId('card-failure-logs')).toBeNull()
  })
})

// React's error-boundary path logs to console.error even when caught. Silence
// it so failures in these tests remain readable.
const originalConsoleError = console.error
beforeEach(() => {
  console.error = vi.fn()
})
afterAll(() => {
  console.error = originalConsoleError
})

function Crashing(): React.ReactElement {
  throw new Error('boom in card body')
}

describe('CardErrorFallback', () => {
  it('renders children when the wrapped subtree does not throw', () => {
    render(
      <CardErrorFallback cardId="healthy-card">
        <div data-testid="ok">card body</div>
      </CardErrorFallback>,
    )
    expect(screen.getByTestId('ok')).toBeTruthy()
    // No error UI leaks through on the happy path.
    expect(screen.queryByText('cardWrapper.renderErrorTitle')).toBeNull()
  })

  it('surfaces the translated error-boundary copy when a child throws', () => {
    render(
      <CardErrorFallback cardId="bad-card">
        <Crashing />
      </CardErrorFallback>,
    )
    // Both title and message come from the `cards` namespace via the fallback*
    // props CardErrorFallback wires into DynamicCardErrorBoundary.
    expect(screen.getByText('cardWrapper.renderErrorTitle')).toBeTruthy()
    expect(screen.getByText('cardWrapper.renderErrorMessage')).toBeTruthy()
  })

  it('passes retriesLeft into the retry-label factory (initial render = 3)', () => {
    render(
      <CardErrorFallback cardId="retry-card">
        <Crashing />
      </CardErrorFallback>,
    )
    // Mocked t() stringifies opts.count into the key, so the first render
    // (retriesLeft = 3) must produce this exact button label.
    expect(
      screen.getByRole('button', { name: /cardWrapper\.renderRetryLeft:3/ }),
    ).toBeTruthy()
  })

  it('shows the reload message once every retry is exhausted', async () => {
    const user = userEvent.setup()
    render(
      <CardErrorFallback cardId="exhaust-card">
        <Crashing />
      </CardErrorFallback>,
    )
    // Burn through 3 retries — each click re-renders Crashing which throws again.
    await user.click(
      screen.getByRole('button', { name: /cardWrapper\.renderRetryLeft/ }),
    )
    await user.click(
      screen.getByRole('button', { name: /cardWrapper\.renderRetryLeft/ }),
    )
    await user.click(
      screen.getByRole('button', { name: /cardWrapper\.renderRetryLeft/ }),
    )
    expect(
      screen.queryByRole('button', { name: /cardWrapper\.renderRetryLeft/ }),
    ).toBeNull()
    expect(screen.getByText('cardWrapper.renderReloadMessage')).toBeTruthy()
  })

  it('isolates a crashing card from a healthy sibling boundary', () => {
    render(
      <div>
        <CardErrorFallback cardId="ok">
          <div data-testid="sibling">ok</div>
        </CardErrorFallback>
        <CardErrorFallback cardId="bad">
          <Crashing />
        </CardErrorFallback>
      </div>,
    )
    expect(screen.getByTestId('sibling')).toBeTruthy()
    expect(screen.getByText('cardWrapper.renderErrorTitle')).toBeTruthy()
  })

  it('reports the crash through analytics with the cardId', async () => {
    const { emitError, markErrorReported } = await import('../../../lib/analytics')
    render(
      <CardErrorFallback cardId="analytics-card">
        <Crashing />
      </CardErrorFallback>,
    )
    expect(markErrorReported).toHaveBeenCalledWith('boom in card body')
    expect(emitError).toHaveBeenCalled()
    const call = (emitError as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    // Third arg is cardId — verify the fallback threads it through.
    expect(call[2]).toBe('analytics-card')
  })
})
