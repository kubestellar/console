/**
 * Unified Card Descriptor System
 *
 * Replaces the need to register a card in 6+ separate places:
 *   1. RAW_CARD_COMPONENTS in cardRegistry.ts
 *   2. CARD_CHUNK_PRELOADERS in cardRegistry.ts
 *   3. CARD_DEFAULT_WIDTHS in cardRegistry.ts
 *   4. CARD_TITLES in cardMetadata.ts
 *   5. CARD_DESCRIPTIONS in cardMetadata.ts
 *   6. CARD_CATALOG in AddCardModal.tsx
 *   7. (optionally) DEMO_DATA_CARDS, LIVE_DATA_CARDS, DEMO_EXEMPT_CARDS
 *
 * With the descriptor system, a new card only needs ONE registration call:
 *
 *   registerCard({
 *     id: 'my_card',
 *     title: 'My Card',
 *     description: 'What this card does.',
 *     category: 'Cluster Health',
 *     defaultWidth: 6,
 *     visualization: 'status',
 *     component: () => import('./MyCard').then(m => ({ default: m.MyCard })),
 *   })
 *
 * The function auto-populates all existing maps so everything stays
 * backwards-compatible.
 *
 * @see https://github.com/kubestellar/console/issues/2377
 */

import { lazy, ComponentType } from 'react'
import type { CardVisualization } from '../../lib/cards/types'
import type { CardComponentProps } from './cardRegistry'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Visualization type used in the AddCardModal catalog */
export type CatalogVisualization = CardVisualization

/** Categories matching the CARD_CATALOG keys in AddCardModal.tsx */
export type CardCatalogCategory =
  | 'Cluster Admin'
  | 'Cluster Health'
  | 'Workloads'
  | 'Compute'
  | 'Storage'
  | 'Network'
  | 'GitOps'
  | 'ArgoCD'
  | 'Operators'
  | 'Namespaces'
  | 'Crossplane'
  | 'Security & Events'
  | 'Live Trends'
  | 'AI Agents'
  | 'AI Assistant'
  | 'Alerting'
  | 'Cost Management'
  | 'Security Posture'
  | 'Data Compliance'
  | 'Workload Detection'
  | 'Arcade'
  | 'Utilities'
  | 'Misc'
  | 'Orchestration'
  | 'Streaming & Messaging'

/**
 * Single source of truth for everything needed to register a card.
 *
 * Every field that was previously spread across 6+ separate maps
 * is consolidated here.
 */
export interface CardDescriptor {
  /** Unique card type id (e.g. 'cluster_health') — used as the key everywhere */
  id: string

  /** Display title (English default — i18n key `cards.titles.<id>` takes priority if available) */
  title: string

  /** Short description shown in AddCardModal catalog and card info tooltip */
  description: string

  /** Category in AddCardModal catalog */
  category: CardCatalogCategory

  /** Default grid width in columns (out of 12) */
  defaultWidth: number

  /** Visualization type hint for the AddCardModal icon */
  visualization: CatalogVisualization

  /**
   * Dynamic import function that returns the card component module.
   * Used to create both the lazy React component and the chunk preloader.
   *
   * Example: `() => import('./MyCard').then(m => ({ default: m.MyCard }))`
   */
  component: () => Promise<{ default: ComponentType<CardComponentProps> }>

  /**
   * Chunk preloader — if the card is part of a shared barrel bundle,
   * provide the barrel import here so preloading warms the shared chunk.
   * Defaults to using `component` if not provided.
   *
   * Example: `() => import('./deploy-bundle')`
   */
  preloader?: () => Promise<unknown>

  /** Whether the card always uses demo/mock data (no live data source exists) */
  isDemoOnly?: boolean

  /** Whether the card shows a "Live" badge when rendering real data */
  isLiveData?: boolean

  /** Whether the card should never show demo indicators (badge/yellow border) — e.g., arcade games */
  isDemoExempt?: boolean
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/**
 * Central map of all card descriptors registered via `registerCard()`.
 * Keyed by card type id.
 */
export const CARD_DESCRIPTORS = new Map<string, CardDescriptor>()

/**
 * Register a card using a single unified descriptor.
 *
 * This function populates all existing legacy maps so that every part of the
 * codebase continues to work without changes:
 *   - RAW_CARD_COMPONENTS / CARD_COMPONENTS  (via cardRegistry.ts)
 *   - CARD_CHUNK_PRELOADERS                   (via cardRegistry.ts)
 *   - CARD_DEFAULT_WIDTHS                     (via cardRegistry.ts)
 *   - CARD_TITLES                             (via cardMetadata.ts)
 *   - CARD_DESCRIPTIONS                       (via cardMetadata.ts)
 *   - DEMO_DATA_CARDS                         (via cardRegistry.ts)
 *   - LIVE_DATA_CARDS                         (via cardRegistry.ts)
 *   - DEMO_EXEMPT_CARDS                       (via cardMetadata.ts)
 *
 * The CARD_CATALOG in AddCardModal can read from CARD_DESCRIPTORS directly
 * (or fall back to its existing hard-coded catalog for cards not yet migrated).
 */
export function registerCard(
  descriptor: CardDescriptor,
  targets: {
    components: Record<string, ComponentType<CardComponentProps>>
    preloaders: Record<string, () => Promise<unknown>>
    defaultWidths: Record<string, number>
    titles: Record<string, string>
    descriptions: Record<string, string>
    demoDataCards: Set<string>
    liveDataCards: Set<string>
    demoExemptCards: Set<string>
  },
): void {
  const { id } = descriptor

  // Store the full descriptor
  CARD_DESCRIPTORS.set(id, descriptor)

  // 1. Register lazy component
  const LazyComponent = lazy(descriptor.component)
  targets.components[id] = LazyComponent

  // 2. Register chunk preloader (use explicit preloader or fall back to component import)
  targets.preloaders[id] = descriptor.preloader ?? descriptor.component

  // 3. Register default width
  targets.defaultWidths[id] = descriptor.defaultWidth

  // 4. Register title
  targets.titles[id] = descriptor.title

  // 5. Register description
  targets.descriptions[id] = descriptor.description

  // 6. Register demo/live/exempt flags
  if (descriptor.isDemoOnly) {
    targets.demoDataCards.add(id)
  }
  if (descriptor.isLiveData) {
    targets.liveDataCards.add(id)
  }
  if (descriptor.isDemoExempt) {
    targets.demoExemptCards.add(id)
  }
}

/**
 * Get all registered descriptors as an array.
 * Useful for building the AddCardModal catalog dynamically.
 */
export function getAllDescriptors(): CardDescriptor[] {
  return Array.from(CARD_DESCRIPTORS.values())
}

/**
 * Get all registered descriptors grouped by category.
 * Returns a Map where keys are category names and values are descriptor arrays.
 */
export function getDescriptorsByCategory(): Map<CardCatalogCategory, CardDescriptor[]> {
  const byCategory = new Map<CardCatalogCategory, CardDescriptor[]>()
  for (const descriptor of CARD_DESCRIPTORS.values()) {
    const existing = byCategory.get(descriptor.category) || []
    existing.push(descriptor)
    byCategory.set(descriptor.category, existing)
  }
  return byCategory
}

/**
 * Get a single descriptor by card type id.
 */
export function getDescriptor(id: string): CardDescriptor | undefined {
  return CARD_DESCRIPTORS.get(id)
}
