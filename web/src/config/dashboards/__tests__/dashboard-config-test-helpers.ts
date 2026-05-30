import { describe, expect, it } from 'vitest'
import type { DashboardCardPlacement, DashboardTab, UnifiedDashboardConfig } from '../../../lib/unified/types'
import { getDashboardConfig, hasUnifiedDashboardConfig } from '../index'
import { isCardTypeRegistered } from '../../../components/cards/cardRegistry.index'

type ModuleExports = Record<string, unknown>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isDashboardConfigCandidate(value: unknown): value is UnifiedDashboardConfig {
  if (!isRecord(value)) return false
  return (
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    Array.isArray(value.cards)
  )
}

function extractDashboardConfig(moduleExports: ModuleExports): UnifiedDashboardConfig {
  const uniqueConfigs = new Set<UnifiedDashboardConfig>()

  Object.values(moduleExports).forEach(value => {
    if (isDashboardConfigCandidate(value)) {
      uniqueConfigs.add(value)
    }
  })

  const configs = [...uniqueConfigs]
  expect(configs).toHaveLength(1)
  return configs[0]
}

function collectCardPlacements(config: UnifiedDashboardConfig): DashboardCardPlacement[] {
  const directCards = Array.isArray(config.cards) ? config.cards : []
  const tabCards = Array.isArray(config.tabs)
    ? config.tabs.flatMap((tab: DashboardTab) => (Array.isArray(tab.cards) ? tab.cards : []))
    : []
  return [...directCards, ...tabCards]
}

export function registerDashboardConfigTest(fileName: string, moduleExports: ModuleExports): void {
  describe(`${fileName} dashboard config`, () => {
    it('exports a valid unified dashboard config', () => {
      const config = extractDashboardConfig(moduleExports)
      const hasTabs = Array.isArray(config.tabs) && config.tabs.length > 0

      expect(config.id).toBeTruthy()
      expect(config.name).toBeTruthy()
      expect(config.route).toBeTruthy()
      expect(config.route?.startsWith('/')).toBe(true)
      expect(Array.isArray(config.cards)).toBe(true)
      expect(config.storageKey).toBeTruthy()

      if (!hasTabs) {
        expect(config.cards.length).toBeGreaterThan(0)
      }

      if (config.tabs) {
        config.tabs.forEach(tab => {
          expect(tab.id).toBeTruthy()
          expect(tab.label).toBeTruthy()
          expect(Array.isArray(tab.cards)).toBe(true)
        })
      }

      if (config.availableCardTypes) {
        expect(Array.isArray(config.availableCardTypes)).toBe(true)
        config.availableCardTypes.forEach(cardType => expect(typeof cardType).toBe('string'))
      }
    })

    it('uses registered card types in every placement', () => {
      const config = extractDashboardConfig(moduleExports)
      const placements = collectCardPlacements(config)
      const ids = placements.map(card => card.id)

      expect(new Set(ids).size).toBe(ids.length)

      placements.forEach(card => {
        expect(card.cardType).toBeTruthy()
        expect(isCardTypeRegistered(card.cardType)).toBe(true)
        expect(card.position.w).toBeGreaterThan(0)
        expect(card.position.h).toBeGreaterThan(0)
      })
    })

    it('is registered under its dashboard id', () => {
      const config = extractDashboardConfig(moduleExports)

      expect(hasUnifiedDashboardConfig(config.id)).toBe(true)
      expect(getDashboardConfig(config.id)).toBeDefined()
    })
  })
}
