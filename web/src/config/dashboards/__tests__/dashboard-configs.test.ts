/**
 * Dashboard Configuration Validation Tests
 *
 * Validates that all dashboard configs export valid structures with
 * required fields, no duplicate card IDs, and valid card positions.
 */
import { describe, it, expect } from 'vitest'
import {
  DASHBOARD_CONFIGS,
  getDashboardConfig,
  hasUnifiedDashboardConfig,
  getUnifiedDashboardIds,
  getDefaultCards,
  getDefaultCardsForDashboard,
} from '../index'
import {
  CARD_COMPONENTS,
  isCardTypeRegistered,
} from '../../../components/cards/cardRegistry'
import type { DashboardCardPlacement } from '../../../lib/unified/types'

/** Minimum number of dashboards we expect to be registered */
const MIN_DASHBOARD_COUNT = 25

describe('Dashboard Config Registry', () => {
  it('has a reasonable number of registered dashboards', () => {
    const ids = getUnifiedDashboardIds()
    expect(ids.length).toBeGreaterThanOrEqual(MIN_DASHBOARD_COUNT)
  })

  it('returns all registered dashboard IDs as strings', () => {
    const ids = getUnifiedDashboardIds()
    ids.forEach(id => {
      expect(typeof id).toBe('string')
      expect(id.length).toBeGreaterThan(0)
    })
  })

  it('getDashboardConfig returns config for known IDs', () => {
    expect(getDashboardConfig('main')).toBeDefined()
    expect(getDashboardConfig('security')).toBeDefined()
    expect(getDashboardConfig('compute')).toBeDefined()
  })

  it('getDashboardConfig returns undefined for unknown IDs', () => {
    expect(getDashboardConfig('nonexistent-dashboard')).toBeUndefined()
  })

  it('hasUnifiedDashboardConfig returns true for registered dashboards', () => {
    expect(hasUnifiedDashboardConfig('main')).toBe(true)
    expect(hasUnifiedDashboardConfig('clusters')).toBe(true)
  })

  it('hasUnifiedDashboardConfig returns false for unknown dashboards', () => {
    expect(hasUnifiedDashboardConfig('does-not-exist')).toBe(false)
  })
})

describe('Each dashboard config has valid structure', () => {
  const entries = Object.entries(DASHBOARD_CONFIGS)

  it.each(entries)('%s has required fields', (_key, config) => {
    expect(config.id).toBeTruthy()
    expect(typeof config.id).toBe('string')
    expect(config.name).toBeTruthy()
    expect(typeof config.name).toBe('string')
    expect(config.route).toBeTruthy()
    expect(config.route.startsWith('/')).toBe(true)
  })

  it.each(entries)('%s has valid cards array or tabs', (_key, config) => {
    expect(Array.isArray(config.cards)).toBe(true)
    // Some dashboards use tabs instead of direct cards (e.g., ai-agents)
    const hasTabs = !!(config as Record<string, unknown>).tabs
    if (!hasTabs) {
      expect(config.cards.length).toBeGreaterThan(0)
    }
  })

  it.each(entries)('%s cards have unique IDs', (_key, config) => {
    const ids = config.cards.map(c => c.id)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(ids.length)
  })

  it.each(entries)('%s cards have valid cardType', (_key, config) => {
    config.cards.forEach(card => {
      expect(card.cardType).toBeTruthy()
      expect(typeof card.cardType).toBe('string')
    })
  })

  it.each(entries)('%s cards have valid positions', (_key, config) => {
    config.cards.forEach(card => {
      expect(card.position).toBeDefined()
      expect(typeof card.position.w).toBe('number')
      expect(typeof card.position.h).toBe('number')
      expect(card.position.w).toBeGreaterThan(0)
      expect(card.position.h).toBeGreaterThan(0)
    })
  })

  it.each(entries)('%s has a storageKey', (_key, config) => {
    expect(config.storageKey).toBeTruthy()
    expect(typeof config.storageKey).toBe('string')
  })
})

describe('Dashboard config features', () => {
  const entries = Object.entries(DASHBOARD_CONFIGS)

  it.each(entries)('%s features object is valid when present', (_key, config) => {
    if (config.features) {
      expect(typeof config.features).toBe('object')
      if (config.features.autoRefreshInterval !== undefined) {
        expect(typeof config.features.autoRefreshInterval).toBe('number')
        expect(config.features.autoRefreshInterval).toBeGreaterThan(0)
      }
    }
  })
})

describe('getDefaultCards', () => {
  it('returns cards for known dashboard IDs', () => {
    const cards = getDefaultCards('main')
    expect(cards.length).toBeGreaterThan(0)
    cards.forEach(card => {
      expect(card.type).toBeTruthy()
      expect(card.position.w).toBeGreaterThan(0)
      expect(card.position.h).toBeGreaterThan(0)
    })
  })

  it('returns empty array for unknown dashboard IDs', () => {
    expect(getDefaultCards('nonexistent')).toEqual([])
  })
})

describe('getDefaultCardsForDashboard', () => {
  it('returns cards with full position data', () => {
    const cards = getDefaultCardsForDashboard('security')
    expect(cards.length).toBeGreaterThan(0)
    cards.forEach(card => {
      expect(card.id).toBeTruthy()
      expect(card.card_type).toBeTruthy()
      expect(typeof card.position.x).toBe('number')
      expect(typeof card.position.y).toBe('number')
      expect(typeof card.position.w).toBe('number')
      expect(typeof card.position.h).toBe('number')
    })
  })

  it('returns empty array for unknown dashboard IDs', () => {
    expect(getDefaultCardsForDashboard('nonexistent')).toEqual([])
  })
})

describe('No duplicate dashboard IDs across configs', () => {
  it('each config.id matches its registry key or is unique globally', () => {
    const allIds = Object.values(DASHBOARD_CONFIGS).map(c => c.id)
    const uniqueIds = new Set(allIds)
    expect(uniqueIds.size).toBe(allIds.length)
  })
})

describe('No duplicate routes across dashboards', () => {
  it('each dashboard has a unique route', () => {
    const routes = Object.values(DASHBOARD_CONFIGS).map(c => c.route)
    const uniqueRoutes = new Set(routes)
    expect(uniqueRoutes.size).toBe(routes.length)
  })
})

describe('No duplicate storageKeys across dashboards', () => {
  it('each dashboard has a unique storageKey', () => {
    const keys = Object.values(DASHBOARD_CONFIGS).map(c => c.storageKey)
    const uniqueKeys = new Set(keys)
    expect(uniqueKeys.size).toBe(keys.length)
  })
})

// ---------------------------------------------------------------------------
// cardType registry validation (issue #9837)
//
// Dashboard configs previously broke at runtime when a cardType string didn't
// match a registered component (typo, renamed card, etc.). These tests catch
// unregistered cardTypes statically so the failure surfaces in CI rather than
// as a blank card on the live dashboard. PR #9810 (threat-intel.ts) was the
// motivating regression — see Copilot ref: PR #9810 threat-intel.ts:12.
// ---------------------------------------------------------------------------

/** Collects every card placement from a config, including tab-nested cards. */
function collectAllCardPlacements(
  config: (typeof DASHBOARD_CONFIGS)[keyof typeof DASHBOARD_CONFIGS],
): DashboardCardPlacement[] {
  const direct: DashboardCardPlacement[] = Array.isArray(config.cards) ? config.cards : []
  const tabs = (config as { tabs?: Array<{ cards?: DashboardCardPlacement[] }> }).tabs
  const tabCards: DashboardCardPlacement[] = Array.isArray(tabs)
    ? tabs.flatMap(tab => (Array.isArray(tab.cards) ? tab.cards : []))
    : []
  return [...direct, ...tabCards]
}

describe('cardType registry validation', () => {
  const entries = Object.entries(DASHBOARD_CONFIGS)

  it.each(entries)(
    '%s — every cardType (including tab cards) is registered in CARD_COMPONENTS',
    (_key, config) => {
      const placements = collectAllCardPlacements(config)
      const unregistered = placements
        .map(p => p.cardType)
        .filter(cardType => !(cardType in CARD_COMPONENTS))

      // Helpful diagnostic message if this fails
      expect(
        unregistered,
        `Unregistered cardType(s) in dashboard "${config.id}": ${JSON.stringify(unregistered)}. ` +
          'Add the card to cardRegistry.ts or fix the typo in the dashboard config.',
      ).toEqual([])
    },
  )

  it.each(entries)(
    '%s — isCardTypeRegistered() returns true for every card (static or dynamic)',
    (_key, config) => {
      const placements = collectAllCardPlacements(config)
      placements.forEach(card => {
        expect(
          isCardTypeRegistered(card.cardType),
          `cardType "${card.cardType}" in dashboard "${config.id}" is not registered ` +
            '(neither as a static component nor a dynamic card).',
        ).toBe(true)
      })
    },
  )

  it('reports aggregate count of distinct cardTypes across all dashboards', () => {
    const all = Object.values(DASHBOARD_CONFIGS).flatMap(collectAllCardPlacements)
    const distinct = new Set(all.map(c => c.cardType))
    // Sanity check — at least one cardType is in use. This is not a strict
    // ratchet; it exists so someone accidentally stubbing out all cards will
    // see a failure here before the per-dashboard registry check fails.
    expect(distinct.size).toBeGreaterThan(0)
  })
})
