import React from 'react'
/**
 * Unit tests for CardMeta presentational badges (addresses #21094).
 *
 * CardMeta is used by every card via CardWrapper to render the demo /
 * live / failure / refresh indicators. These are pure branch checks so
 * we can mock i18n and formatters and assert directly on the DOM.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CardMeta, type CardMetaProps } from '../CardMeta'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (opts && 'count' in opts) return `${key}:${opts.count}`
      if (opts && 'time' in opts) return `${key}:${opts.time}`
      return key
    },
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}))

vi.mock('@/lib/formatters', () => ({
  formatTimeAgo: (d: Date) => `ago:${d.toISOString()}`,
}))

function renderMeta(overrides: Partial<CardMetaProps> = {}) {
  const props: CardMetaProps = {
    showDemoIndicator: false,
    isDemoData: false,
    isLive: false,
    isFailed: false,
    consecutiveFailures: 0,
    showRefreshIndicator: false,
    isLoading: false,
    isVisuallySpinning: false,
    lastUpdated: null,
    ...overrides,
  }
  return render(<CardMeta {...props} />)
}

describe('CardMeta', () => {
  it('renders nothing when all indicators are off and no lastUpdated', () => {
    const { container } = renderMeta()
    expect(container.textContent).toBe('')
  })

  it('shows the demo badge when showDemoIndicator is true', () => {
    renderMeta({ showDemoIndicator: true, isDemoData: true })
    const badge = screen.getByTestId('demo-badge')
    expect(badge).toBeTruthy()
    expect(badge.getAttribute('title')).toBe('cardWrapper.demoBadgeTitle')
  })

  it('uses demoModeTitle when demo indicator is shown but data is not demo', () => {
    renderMeta({ showDemoIndicator: true, isDemoData: false })
    const badge = screen.getByTestId('demo-badge')
    expect(badge.getAttribute('title')).toBe('cardWrapper.demoModeTitle')
  })

  it('shows the live badge only for healthy non-demo cards', () => {
    renderMeta({ isLive: true })
    expect(screen.getByTitle('cardWrapper.liveBadgeTitle')).toBeTruthy()
  })

  it('hides the live badge when the card is in demo mode', () => {
    renderMeta({ isLive: true, showDemoIndicator: true })
    expect(screen.queryByTitle('cardWrapper.liveBadgeTitle')).toBeNull()
  })

  it('hides the live badge when the card has failed', () => {
    renderMeta({ isLive: true, isFailed: true, consecutiveFailures: 2 })
    expect(screen.queryByTitle('cardWrapper.liveBadgeTitle')).toBeNull()
  })

  it('renders a failure indicator with consecutiveFailures tooltip when failed', () => {
    renderMeta({ isFailed: true, consecutiveFailures: 4 })
    const failed = screen.getByRole('alert')
    expect(failed.getAttribute('title')).toBe('cardWrapper.refreshFailedCount:4')
    expect(failed.textContent).toContain('cardWrapper.refreshFailed')
  })

  it('shows the spinning refresh icon only when not failed', () => {
    const { container } = renderMeta({ showRefreshIndicator: true })
    expect(container.querySelector('.animate-spin')).not.toBeNull()
  })

  it('does not show the spinning refresh icon when failed', () => {
    const { container } = renderMeta({
      showRefreshIndicator: true,
      isFailed: true,
      consecutiveFailures: 1,
    })
    expect(container.querySelector('.animate-spin')).toBeNull()
  })

  it('renders a lastUpdated timestamp when idle', () => {
    const when = new Date('2024-01-02T03:04:05Z')
    renderMeta({ lastUpdated: when })
    expect(screen.getByText(`ago:${when.toISOString()}`)).toBeTruthy()
  })

  it('suppresses the lastUpdated timestamp while loading', () => {
    const when = new Date('2024-01-02T03:04:05Z')
    renderMeta({ lastUpdated: when, isLoading: true })
    expect(screen.queryByText(`ago:${when.toISOString()}`)).toBeNull()
  })

  it('suppresses the lastUpdated timestamp while visually spinning', () => {
    const when = new Date('2024-01-02T03:04:05Z')
    renderMeta({ lastUpdated: when, isVisuallySpinning: true })
    expect(screen.queryByText(`ago:${when.toISOString()}`)).toBeNull()
  })

  it('uses the stale tooltip label when failed', () => {
    const when = new Date('2024-01-02T03:04:05Z')
    renderMeta({ lastUpdated: when, isFailed: true, consecutiveFailures: 1 })
    const stamp = screen.getByText(`ago:${when.toISOString()}`)
    expect(stamp.getAttribute('title')).toContain('cardWrapper.lastRefreshedStale')
  })

  it('uses the fresh tooltip label when not failed', () => {
    const when = new Date('2024-01-02T03:04:05Z')
    renderMeta({ lastUpdated: when })
    const stamp = screen.getByText(`ago:${when.toISOString()}`)
    expect(stamp.getAttribute('title')).toContain('cardWrapper.lastRefreshed')
    expect(stamp.getAttribute('title')).not.toContain('Stale')
  })
})
