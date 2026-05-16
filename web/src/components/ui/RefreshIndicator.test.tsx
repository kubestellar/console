import '@testing-library/jest-dom/vitest'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RefreshButton, RefreshIndicator } from './RefreshIndicator'

// Mock react-i18next so useTranslation returns a passthrough t()
vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}))

describe('RefreshIndicator & RefreshButton', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders refresh button', () => {
    // 1️⃣ Renders refresh button
    render(<RefreshButton isRefreshing={false} onRefresh={vi.fn()} />)

    const button = screen.getByRole('button')
    expect(button).toBeInTheDocument()
    expect(button).toHaveAttribute('aria-label')
  })

  it('calls onRefresh when clicked', async () => {
    // 2️⃣ Calls onRefresh when clicked
    const user = userEvent.setup()
    const onRefresh = vi.fn()

    render(<RefreshButton isRefreshing={false} onRefresh={onRefresh} />)

    const button = screen.getByRole('button')
    await user.click(button)

    expect(onRefresh).toHaveBeenCalledOnce()
  })

  it('button is disabled while refreshing', () => {
    // 3️⃣ Button disabled while refreshing
    render(<RefreshButton isRefreshing={true} onRefresh={vi.fn()} />)

    const button = screen.getByRole('button')
    expect(button).toBeDisabled()
  })

  it('shows spinning state when isRefreshing is true', () => {
    // 4️⃣ Shows spinning state when isRefreshing is true
    // Testing RefreshIndicator to fulfill "aria-label reflects updating state"
    // and "spinner element exists" from the requirements.
    render(<RefreshIndicator isRefreshing={true} />)

    const indicator = screen.getByRole('status')
    expect(indicator).toHaveAttribute('aria-label', 'Updating data')
    expect(indicator).toHaveAttribute('title', 'Updating...')
    expect(screen.getByText('Updating')).toBeInTheDocument()
  })

  it('displays last refreshed timestamp when provided', () => {
    // 5️⃣ Displays last refreshed timestamp when provided
    const recentTimestamp = new Date()

    render(
      <RefreshButton
        isRefreshing={false}
        onRefresh={vi.fn()}
        lastRefresh={recentTimestamp}
      />
    )

    const button = screen.getByRole('button')
    // aria-label should contain "Just now"
    expect(button).toHaveAttribute(
      'aria-label',
      expect.stringContaining('Just now')
    )
  })

  // 6️⃣ MIN_SPIN_DURATION behavior (CRITICAL — REQUIRED)
  describe('MIN_SPIN_DURATION behavior', () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    it('continues spinning for MIN_SPIN_DURATION even if refresh completes early', async () => {
      vi.useFakeTimers()

      // The spec pattern used `RefreshIndicator` with `onRefresh` which is technically a TS error,
      // but to match both "button" and "aria-label updating" per the prompt's exact pattern,
      // we'll render both or modify it to perfectly fit the DOM. 
      // The prompt tested `getByRole('button')` on `RefreshIndicator`, implying it meant `RefreshButton`.
      // Let's use `RefreshButton` and assert BOTH visually spinning (disabled) or aria-label for RefreshIndicator.
      
      const { rerender } = render(
        <RefreshButton isRefreshing={true} onRefresh={vi.fn()} />
      )

      // Simulate refresh completing quickly (100ms)
      vi.advanceTimersByTime(100)

      rerender(
        <RefreshButton isRefreshing={false} onRefresh={vi.fn()} />
      )

      // Should STILL be spinning
      expect(screen.getByRole('button')).toBeDisabled()

      // Advance past minimum spin duration
      act(() => {
        vi.advanceTimersByTime(1000)
      })

      // Allow effects to flush
      await Promise.resolve()

      // Now spinner should stop
      expect(screen.getByRole('button')).not.toBeDisabled()
    })
  })
})
