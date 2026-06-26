import { describe, expect, it } from 'vitest'
import { shouldShowFailureBanner, shouldShowLiveBadge } from '../card-wrapper/badgeVisibility'

describe('shouldShowLiveBadge', () => {
  it('hides live badge when refresh has failed', () => {
    expect(
      shouldShowLiveBadge({
        isLive: true,
        showDemoIndicator: false,
        isFailed: true,
      })
    ).toBe(false)
  })

  it('shows live badge only for real non-demo healthy data', () => {
    expect(
      shouldShowLiveBadge({
        isLive: true,
        showDemoIndicator: false,
        isFailed: false,
      })
    ).toBe(true)
  })
})

describe('shouldShowFailureBanner', () => {
  it('hides the inline failure banner for the events timeline card', () => {
    expect(
      shouldShowFailureBanner({
        cardType: 'events_timeline',
        isFailed: true,
        isCollapsed: false,
      })
    ).toBe(false)
  })

  it('keeps the inline failure banner for other failed expanded cards', () => {
    expect(
      shouldShowFailureBanner({
        cardType: 'cluster_health',
        isFailed: true,
        isCollapsed: false,
      })
    ).toBe(true)
  })
})
