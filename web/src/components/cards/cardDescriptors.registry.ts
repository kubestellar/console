/**
 * Card Descriptor Registrations
 *
 * This file contains cards that have been migrated to the unified
 * CardDescriptor system. Each card is registered with a single call
 * to `registerCard()` instead of being spread across 6+ maps.
 *
 * To migrate a card:
 *   1. Add its descriptor to the DESCRIPTORS array below
 *   2. Remove its entries from:
 *      - RAW_CARD_COMPONENTS in cardRegistry.ts
 *      - CARD_CHUNK_PRELOADERS in cardRegistry.ts
 *      - CARD_DEFAULT_WIDTHS in cardRegistry.ts
 *      - CARD_TITLES in cardMetadata.ts
 *      - CARD_DESCRIPTIONS in cardMetadata.ts
 *      - DEMO_DATA_CARDS / LIVE_DATA_CARDS / DEMO_EXEMPT_CARDS as applicable
 *      - CARD_CATALOG in AddCardModal.tsx
 *   3. Remove the lazy() import at the top of cardRegistry.ts
 *   4. Run `npx tsc --noEmit` to verify no type errors
 *
 * @see https://github.com/kubestellar/console/issues/2377
 */

import type { ComponentType } from 'react'
import type { CardDescriptor } from './cardDescriptor'
import { registerCard } from './cardDescriptor'
import type { CardComponentProps } from './cardRegistry'

/**
 * All card descriptors using the unified registration system.
 *
 * Proof of concept: 3 cards migrated from the legacy multi-map system.
 */
const DESCRIPTORS: CardDescriptor[] = [
  // ── Weather card ──────────────────────────────────────────────────────
  {
    id: 'weather',
    title: 'Weather',
    description: 'Weather conditions with multi-day forecasts and animated backgrounds',
    category: 'Misc',
    defaultWidth: 6,
    visualization: 'status',
    component: () => import('./weather/Weather').then(m => ({ default: m.Weather as ComponentType<CardComponentProps> })),
  },

  // ── Stock Market Ticker card ──────────────────────────────────────────
  {
    id: 'stock_market_ticker',
    title: 'Stock Market Ticker',
    description: 'Track multiple stocks with real-time sparkline charts and iPhone-style design',
    category: 'Misc',
    defaultWidth: 6,
    visualization: 'timeseries',
    component: () => import('./StockMarketTicker').then(m => ({ default: m.StockMarketTicker as ComponentType<CardComponentProps> })),
  },

  // ── Active Alerts card ────────────────────────────────────────────────
  {
    id: 'active_alerts',
    title: 'Active Alerts',
    description: 'Currently firing alerts from Prometheus or other sources.',
    category: 'Alerting',
    defaultWidth: 4,
    visualization: 'status',
    component: () => import('./ActiveAlerts').then(m => ({ default: m.ActiveAlerts as ComponentType<CardComponentProps> })),
  },
]

/**
 * Register all descriptor-based cards into the legacy maps.
 * Called from cardRegistry.ts during module initialization.
 */
export function registerAllDescriptorCards(targets: {
  components: Record<string, ComponentType<CardComponentProps>>
  preloaders: Record<string, () => Promise<unknown>>
  defaultWidths: Record<string, number>
  titles: Record<string, string>
  descriptions: Record<string, string>
  demoDataCards: Set<string>
  liveDataCards: Set<string>
  demoExemptCards: Set<string>
}): void {
  for (const descriptor of DESCRIPTORS) {
    registerCard(descriptor, targets)
  }
}
