/**
 * badgeVisibility — unit tests for the pure predicate helpers that decide
 * whether the live badge and failure banner should render on a card.
 *
 * Run from web/:  npx vitest run src/components/cards/card-wrapper/badgeVisibility.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  shouldShowLiveBadge,
  shouldShowFailureBanner,
} from './badgeVisibility'

describe('shouldShowLiveBadge', () => {
  it('returns true when live, not demo, and not failed', () => {
    expect(
      shouldShowLiveBadge({
        isLive: true,
        showDemoIndicator: false,
        isFailed: false,
      }),
    ).toBe(true)
  })

  it('returns false when not live', () => {
    expect(
      shouldShowLiveBadge({
        isLive: false,
        showDemoIndicator: false,
        isFailed: false,
      }),
    ).toBe(false)
  })

  it('returns false when isLive is undefined', () => {
    expect(
      shouldShowLiveBadge({
        showDemoIndicator: false,
        isFailed: false,
      }),
    ).toBe(false)
  })

  it('returns false when the demo indicator is shown (demo takes precedence over live)', () => {
    expect(
      shouldShowLiveBadge({
        isLive: true,
        showDemoIndicator: true,
        isFailed: false,
      }),
    ).toBe(false)
  })

  it('returns false when the card is failed (failure takes precedence over live)', () => {
    expect(
      shouldShowLiveBadge({
        isLive: true,
        showDemoIndicator: false,
        isFailed: true,
      }),
    ).toBe(false)
  })

  it('returns false when both demo and failure states are active', () => {
    expect(
      shouldShowLiveBadge({
        isLive: true,
        showDemoIndicator: true,
        isFailed: true,
      }),
    ).toBe(false)
  })
})

describe('shouldShowFailureBanner', () => {
  it('returns true when failed, not collapsed, and cardType is not compact', () => {
    expect(
      shouldShowFailureBanner({
        cardType: 'some_generic_card',
        isFailed: true,
        isCollapsed: false,
      }),
    ).toBe(true)
  })

  it('returns false when not failed', () => {
    expect(
      shouldShowFailureBanner({
        cardType: 'some_generic_card',
        isFailed: false,
        isCollapsed: false,
      }),
    ).toBe(false)
  })

  it('returns false when the card is collapsed (banner suppressed while collapsed)', () => {
    expect(
      shouldShowFailureBanner({
        cardType: 'some_generic_card',
        isFailed: true,
        isCollapsed: true,
      }),
    ).toBe(false)
  })

  it('returns false for events_timeline even when failed (compact failure status card)', () => {
    expect(
      shouldShowFailureBanner({
        cardType: 'events_timeline',
        isFailed: true,
        isCollapsed: false,
      }),
    ).toBe(false)
  })

  it('returns false when all suppression conditions coincide', () => {
    expect(
      shouldShowFailureBanner({
        cardType: 'events_timeline',
        isFailed: true,
        isCollapsed: true,
      }),
    ).toBe(false)
  })

  it('handles unknown card types like any generic card', () => {
    expect(
      shouldShowFailureBanner({
        cardType: '',
        isFailed: true,
        isCollapsed: false,
      }),
    ).toBe(true)
  })

  it('cardType comparison is case-sensitive (EVENTS_TIMELINE is not compact)', () => {
    // The compact-failure set only lists the lowercase 'events_timeline'; any
    // case variant must fall through to the generic (banner-shown) branch so
    // that future cards are not silently suppressed by a typo.
    expect(
      shouldShowFailureBanner({
        cardType: 'EVENTS_TIMELINE',
        isFailed: true,
        isCollapsed: false,
      }),
    ).toBe(true)
  })
})
