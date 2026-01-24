/**
 * Centralized Registry
 *
 * Provides unified access to all component registries for the YAML-based builders.
 * This is the single source of truth for registering and retrieving definitions.
 *
 * @example
 * ```typescript
 * import { registry } from '@/lib/registry'
 *
 * // Register a card definition
 * registry.cards.register(podIssuesCardDef)
 *
 * // Get all dashboard definitions
 * const dashboards = registry.dashboards.getAll()
 *
 * // Check if a modal exists
 * if (registry.modals.has('Pod')) {
 *   const podModal = registry.modals.get('Pod')
 * }
 * ```
 */

import {
  registerCard,
  getCardDefinition,
  getAllCardDefinitions,
  registerDataHook,
  registerDrillAction,
  registerRenderer,
} from './cards'
import type { CardDefinition } from './cards'

import {
  registerDashboard,
  getDashboardDefinition,
  getAllDashboardDefinitions,
  registerStatsValueGetter as registerDashboardStatsValueGetter,
} from './dashboards'
import type { DashboardDefinition } from './dashboards'

import {
  registerModal,
  getModalDefinition,
  getAllModalDefinitions,
  registerSectionRenderer,
} from './modals'
import type { ModalDefinition } from './modals'

import {
  registerStats,
  getStatsDefinition,
  getAllStatsDefinitions,
  registerStatValueGetter,
} from './stats'
import type { StatsDefinition } from './stats'

// ============================================================================
// Registry Interfaces
// ============================================================================

interface CardRegistry {
  register: typeof registerCard
  get: typeof getCardDefinition
  getAll: typeof getAllCardDefinitions
  has: (type: string) => boolean
  registerDataHook: typeof registerDataHook
  registerDrillAction: typeof registerDrillAction
  registerRenderer: typeof registerRenderer
}

interface DashboardRegistry {
  register: typeof registerDashboard
  get: typeof getDashboardDefinition
  getAll: typeof getAllDashboardDefinitions
  has: (id: string) => boolean
  registerStatsValueGetter: typeof registerDashboardStatsValueGetter
}

interface ModalRegistry {
  register: typeof registerModal
  get: typeof getModalDefinition
  getAll: typeof getAllModalDefinitions
  has: (kind: string) => boolean
  registerSectionRenderer: typeof registerSectionRenderer
}

interface StatsRegistry {
  register: typeof registerStats
  get: typeof getStatsDefinition
  getAll: typeof getAllStatsDefinitions
  has: (type: string) => boolean
  registerValueGetter: typeof registerStatValueGetter
}

interface CentralizedRegistry {
  cards: CardRegistry
  dashboards: DashboardRegistry
  modals: ModalRegistry
  stats: StatsRegistry
}

// ============================================================================
// Registry Implementation
// ============================================================================

export const registry: CentralizedRegistry = {
  cards: {
    register: registerCard,
    get: getCardDefinition,
    getAll: getAllCardDefinitions,
    has: (type: string) => getCardDefinition(type) !== undefined,
    registerDataHook,
    registerDrillAction,
    registerRenderer,
  },
  dashboards: {
    register: registerDashboard,
    get: getDashboardDefinition,
    getAll: getAllDashboardDefinitions,
    has: (id: string) => getDashboardDefinition(id) !== undefined,
    registerStatsValueGetter: registerDashboardStatsValueGetter,
  },
  modals: {
    register: registerModal,
    get: getModalDefinition,
    getAll: getAllModalDefinitions,
    has: (kind: string) => getModalDefinition(kind) !== undefined,
    registerSectionRenderer,
  },
  stats: {
    register: registerStats,
    get: getStatsDefinition,
    getAll: getAllStatsDefinitions,
    has: (type: string) => getStatsDefinition(type) !== undefined,
    registerValueGetter: registerStatValueGetter,
  },
}

// ============================================================================
// Batch Registration Helpers
// ============================================================================

/**
 * Register multiple card definitions at once
 */
export function registerCards(definitions: CardDefinition[]): void {
  definitions.forEach(registerCard)
}

/**
 * Register multiple dashboard definitions at once
 */
export function registerDashboards(definitions: DashboardDefinition[]): void {
  definitions.forEach(registerDashboard)
}

/**
 * Register multiple modal definitions at once
 */
export function registerModals(definitions: ModalDefinition[]): void {
  definitions.forEach(registerModal)
}

/**
 * Register multiple stats definitions at once
 */
export function registerAllStats(definitions: StatsDefinition[]): void {
  definitions.forEach(registerStats)
}

// ============================================================================
// Registry Statistics
// ============================================================================

/**
 * Get counts of all registered definitions
 */
export function getRegistryCounts(): {
  cards: number
  dashboards: number
  modals: number
  stats: number
  total: number
} {
  const cards = getAllCardDefinitions().length
  const dashboards = getAllDashboardDefinitions().length
  const modals = getAllModalDefinitions().length
  const stats = getAllStatsDefinitions().length

  return {
    cards,
    dashboards,
    modals,
    stats,
    total: cards + dashboards + modals + stats,
  }
}

/**
 * List all registered definition IDs/types
 */
export function listRegistered(): {
  cards: string[]
  dashboards: string[]
  modals: string[]
  stats: string[]
} {
  return {
    cards: getAllCardDefinitions().map((d) => d.type),
    dashboards: getAllDashboardDefinitions().map((d) => d.id),
    modals: getAllModalDefinitions().map((d) => d.kind),
    stats: getAllStatsDefinitions().map((d) => d.type),
  }
}

// ============================================================================
// Default Export
// ============================================================================

export default registry
