import { describe, expect, it } from 'vitest'
import { shouldShowLiveBadge } from '../card-wrapper/badgeVisibility'

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
