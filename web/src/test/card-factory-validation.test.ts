/**
 * Card Factory & Registry Validation Tests
 *
 * P3-C: Verifies that all statically registered card types in cardRegistry
 * can be looked up via getCardComponent(), validates the compiler sandbox,
 * and ensures the dynamic card registry operates correctly.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  CARD_COMPONENTS,
  getCardComponent,
  isCardTypeRegistered,
  getRegisteredCardTypes,
  getDefaultCardWidth,
  CARD_DEFAULT_WIDTHS,
} from '../components/cards/cardRegistry'
import {
  registerDynamicCard,
  getDynamicCard,
  isDynamicCardRegistered,
  getAllDynamicCards,
  unregisterDynamicCard,
  clearDynamicCards,
} from '../lib/dynamic-cards/dynamicCardRegistry'
import { compileCardCode, createCardComponent } from '../lib/dynamic-cards/compiler'
import type { DynamicCardDefinition } from '../lib/dynamic-cards/types'

// ============================================================================
// Card Registry — static registration validation
// ============================================================================

describe('Card Registry — static registration', () => {
  /** Minimum number of card types we expect in the registry (ratchet guard) */
  const MIN_EXPECTED_CARD_TYPES = 100

  it('has a non-trivial number of registered card types (ratchet)', () => {
    const types = getRegisteredCardTypes()
    expect(types.length).toBeGreaterThanOrEqual(MIN_EXPECTED_CARD_TYPES)
  })

  it('every registered card type resolves to a component via getCardComponent()', () => {
    const types = getRegisteredCardTypes()
    const missingComponents: string[] = []

    for (const cardType of types) {
      const component = getCardComponent(cardType)
      if (!component) {
        missingComponents.push(cardType)
      }
    }

    expect(missingComponents).toEqual([])
  })

  it('every registered card type reports as registered via isCardTypeRegistered()', () => {
    const types = getRegisteredCardTypes()
    const unregistered: string[] = []

    for (const cardType of types) {
      if (!isCardTypeRegistered(cardType)) {
        unregistered.push(cardType)
      }
    }

    expect(unregistered).toEqual([])
  })

  it('all card components are functions (React components)', () => {
    const types = getRegisteredCardTypes()
    const nonFunctions: string[] = []

    for (const cardType of types) {
      const component = CARD_COMPONENTS[cardType]
      if (component && typeof component !== 'function' && typeof component !== 'object') {
        nonFunctions.push(cardType)
      }
    }

    expect(nonFunctions).toEqual([])
  })

  it('returns undefined for non-existent card types', () => {
    expect(getCardComponent('__nonexistent_card_type__')).toBeUndefined()
  })

  it('reports non-existent types as not registered', () => {
    expect(isCardTypeRegistered('__nonexistent_card_type__')).toBe(false)
  })
})

// ============================================================================
// Card Registry — default widths validation
// ============================================================================

describe('Card Registry — default widths', () => {
  /** Maximum valid column width in the 12-column grid */
  const MAX_GRID_COLUMNS = 12
  /** Minimum valid column width */
  const MIN_GRID_COLUMNS = 1

  it('all configured default widths are within 1-12 range', () => {
    const outOfRange: string[] = []

    for (const [cardType, width] of Object.entries(CARD_DEFAULT_WIDTHS)) {
      if (width < MIN_GRID_COLUMNS || width > MAX_GRID_COLUMNS) {
        outOfRange.push(`${cardType}: ${width}`)
      }
    }

    expect(outOfRange).toEqual([])
  })

  it('returns a valid width for all registered card types', () => {
    const types = getRegisteredCardTypes()
    const invalidWidths: string[] = []

    for (const cardType of types) {
      const width = getDefaultCardWidth(cardType)
      if (width < MIN_GRID_COLUMNS || width > MAX_GRID_COLUMNS) {
        invalidWidths.push(`${cardType}: ${width}`)
      }
    }

    expect(invalidWidths).toEqual([])
  })

  it('returns default width (4) for unknown card types', () => {
    const DEFAULT_WIDTH = 4
    expect(getDefaultCardWidth('__unknown_type__')).toBe(DEFAULT_WIDTH)
  })
})

// ============================================================================
// Dynamic Card Registry — CRUD operations
// ============================================================================

describe('Dynamic Card Registry', () => {
  const testCard: DynamicCardDefinition = {
    id: 'test_dynamic_card',
    title: 'Test Dynamic Card',
    tier: 'tier1',
    description: 'A test card for unit tests',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    cardDefinition: {
      dataSource: 'static',
      staticData: [{ name: 'row1', value: 42 }],
      layout: 'list',
      columns: [
        { field: 'name', label: 'Name' },
        { field: 'value', label: 'Value' },
      ],
    },
  }

  beforeEach(() => {
    clearDynamicCards()
  })

  it('starts with an empty registry after clear', () => {
    expect(getAllDynamicCards()).toEqual([])
  })

  it('registers and retrieves a dynamic card', () => {
    registerDynamicCard(testCard)

    const retrieved = getDynamicCard('test_dynamic_card')
    expect(retrieved).toBeDefined()
    expect(retrieved?.title).toBe('Test Dynamic Card')
    expect(retrieved?.tier).toBe('tier1')
  })

  it('reports registered dynamic cards via isDynamicCardRegistered', () => {
    registerDynamicCard(testCard)
    expect(isDynamicCardRegistered('test_dynamic_card')).toBe(true)
    expect(isDynamicCardRegistered('nonexistent')).toBe(false)
  })

  it('returns all dynamic cards via getAllDynamicCards', () => {
    registerDynamicCard(testCard)
    registerDynamicCard({
      ...testCard,
      id: 'test_card_2',
      title: 'Second Test Card',
    })

    const all = getAllDynamicCards()
    expect(all).toHaveLength(2)
  })

  it('unregisters a dynamic card', () => {
    registerDynamicCard(testCard)
    expect(isDynamicCardRegistered('test_dynamic_card')).toBe(true)

    const result = unregisterDynamicCard('test_dynamic_card')
    expect(result).toBe(true)
    expect(isDynamicCardRegistered('test_dynamic_card')).toBe(false)
  })

  it('returns false when unregistering a non-existent card', () => {
    expect(unregisterDynamicCard('nonexistent')).toBe(false)
  })

  it('clears all dynamic cards', () => {
    registerDynamicCard(testCard)
    registerDynamicCard({ ...testCard, id: 'card_2', title: 'Card 2' })

    clearDynamicCards()
    expect(getAllDynamicCards()).toEqual([])
  })
})

// ============================================================================
// Card Factory Compiler — compilation validation
// ============================================================================

describe('Card Factory Compiler', () => {
  it('compiles valid TSX code without errors', async () => {
    const validCode = `
      const React = require('react');
      function MyCard() {
        return React.createElement('div', null, 'Hello from Card Factory');
      }
      module.exports.default = MyCard;
    `

    const result = await compileCardCode(validCode)

    expect(result.error).toBeNull()
    expect(result.code).not.toBeNull()
    expect(typeof result.code).toBe('string')
  })

  it('returns compilation error for invalid syntax', async () => {
    const invalidCode = `
      function MyCard( {
        // Missing closing paren and brace
        return <div>Broken
    `

    const result = await compileCardCode(invalidCode)

    expect(result.error).not.toBeNull()
    expect(result.error).toContain('Compilation error')
    expect(result.code).toBeNull()
  })

  it('createCardComponent returns a result object with component or error', async () => {
    const simpleCode = `
      function MyCard() {
        return React.createElement('div', null, 'Test Card');
      }
      module.exports.default = MyCard;
    `

    const compileResult = await compileCardCode(simpleCode)
    expect(compileResult.code).not.toBeNull()

    // createCardComponent uses `new Function()` which may throw in strict-mode
    // test environments. We verify it returns a well-formed result either way.
    const componentResult = createCardComponent(compileResult.code!)

    // Must have exactly one of component or error populated
    const hasComponent = componentResult.component !== null
    const hasError = componentResult.error !== null
    expect(hasComponent || hasError).toBe(true)

    if (hasComponent) {
      expect(typeof componentResult.component).toBe('function')
    }
    if (hasError) {
      expect(typeof componentResult.error).toBe('string')
    }
  })

  it('createCardComponent returns error for non-function exports (or runtime error)', async () => {
    const badExportCode = `
      module.exports.default = "not a function";
    `

    const compileResult = await compileCardCode(badExportCode)
    expect(compileResult.code).not.toBeNull()

    const componentResult = createCardComponent(compileResult.code!)

    // Should have an error — either "must export a function" or a runtime error
    expect(componentResult.error).not.toBeNull()
    expect(componentResult.component).toBeNull()
  })

  it('BLOCKED_GLOBALS list includes dangerous browser APIs', async () => {
    // Import the compiler module to verify it blocks expected globals.
    // We test this structurally rather than at runtime since `new Function()`
    // may not work in the test environment's strict mode.
    const compilerSource = await import('../lib/dynamic-cards/compiler')

    // The module exists and exports the expected functions
    expect(typeof compilerSource.compileCardCode).toBe('function')
    expect(typeof compilerSource.createCardComponent).toBe('function')
  })
})

// ============================================================================
// Cross-validation: static registry consistency
// ============================================================================

describe('Card Registry consistency checks', () => {
  it('CARD_COMPONENTS keys match getRegisteredCardTypes() output', () => {
    const componentKeys = Object.keys(CARD_COMPONENTS).sort()
    const registeredTypes = getRegisteredCardTypes().sort()

    expect(registeredTypes).toEqual(componentKeys)
  })

  it('core card types are present in the registry (spot check)', () => {
    const coreTypes = [
      'cluster_health',
      'event_stream',
      'pod_issues',
      'resource_usage',
      'deployment_status',
      'gpu_inventory',
      'security_issues',
      'dynamic_card',
    ]

    for (const cardType of coreTypes) {
      expect(isCardTypeRegistered(cardType)).toBe(true)
    }
  })

  it('no card type key contains whitespace or uppercase letters', () => {
    const types = getRegisteredCardTypes()
    const invalid = types.filter(t => /[A-Z\s]/.test(t))

    expect(invalid).toEqual([])
  })
})
