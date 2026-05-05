/**
 * Card Component Registry — maps card types to lazy-loaded React components.
 *
 * Also add new cards to the browse catalog in:
 *   src/components/dashboard/AddCardModal.tsx → CARD_CATALOG
 * See src/config/cards/index.ts for the full registration checklist.
 */
import { createElement } from 'react'
import { safeLazy } from '../../lib/safeLazy'
import { isDynamicCardRegistered } from '../../lib/dynamic-cards/dynamicCardRegistry'
import { getCardConfig } from '../../config/cards'
import { registerAllDescriptorCards } from './cardDescriptors.registry'
import { CARD_TITLES, CARD_DESCRIPTIONS, DEMO_EXEMPT_CARDS } from './cardMetadata'
import { aiCardRegistry } from './cardRegistry.ai'
import { clusterCardRegistry } from './cardRegistry.cluster'
import { miscCardRegistry } from './cardRegistry.misc'
import { observabilityCardRegistry } from './cardRegistry.observability'
import { operationsCardRegistry } from './cardRegistry.operations'
import { platformCardRegistry } from './cardRegistry.platform'
import { securityCardRegistry } from './cardRegistry.security'
import type { CardComponent, CardRegistryCategory } from './cardRegistry.types'
export type { CardComponentProps, CardComponent } from './cardRegistry.types'

const REGISTRY_CATEGORIES: CardRegistryCategory[] = [clusterCardRegistry, observabilityCardRegistry, securityCardRegistry, aiCardRegistry, platformCardRegistry, operationsCardRegistry, miscCardRegistry]
const DynamicCard = safeLazy(() => import('./DynamicCard'), 'DynamicCard')
const LazyUnifiedCard = safeLazy(() => import('../../lib/unified/card/UnifiedCard'), 'UnifiedCard')

const RAW_CARD_COMPONENTS: Record<string, CardComponent> = Object.assign({ dynamic_card: DynamicCard }, ...REGISTRY_CATEGORIES.map(({ components }) => components))
const CARD_CHUNK_PRELOADERS: Record<string, () => Promise<unknown>> = Object.assign({ dynamic_card: () => import('./DynamicCard') }, ...REGISTRY_CATEGORIES.map(({ preloaders }) => preloaders))
export const DEMO_DATA_CARDS = new Set(REGISTRY_CATEGORIES.flatMap(({ demoDataCards = [] }) => [...demoDataCards]))
export const LIVE_DATA_CARDS = new Set(REGISTRY_CATEGORIES.flatMap(({ liveDataCards = [] }) => [...liveDataCards]))
LIVE_DATA_CARDS.add('node_status')
export const CARD_DEFAULT_WIDTHS: Record<string, number> = Object.assign({}, ...REGISTRY_CATEGORIES.map(({ defaultWidths }) => defaultWidths))
CARD_DEFAULT_WIDTHS.node_status = 6
const CARD_DEMO_STARTUP_PRELOADERS = REGISTRY_CATEGORIES.flatMap(({ demoStartupPreloaders = [] }) => [...demoStartupPreloaders])

const _UNIFIED_CONTENT_TYPES = ['list', 'table', 'chart', 'status-grid']
function _makeUnifiedEntry(cardType: string): CardComponent | undefined {
  const config = getCardConfig(cardType)
  if (!config?.dataSource || !config?.content) return undefined
  if (!_UNIFIED_CONTENT_TYPES.includes(config.content.type)) return undefined
  const Adapter: CardComponent = () => createElement(LazyUnifiedCard, { config, className: 'h-full' })
  Adapter.displayName = `Unified(${cardType})`
  return Adapter
}

const _UNIFIED_ONLY_TYPES = [
  'node_status', 'statefulset_status', 'daemonset_status', 'job_status', 'cronjob_status', 'replicaset_status', 'hpa_status',
  'configmap_status', 'secret_status', 'pv_status', 'ingress_status', 'network_policy_status', 'namespace_status',
  'resource_quota_status', 'limit_range_status', 'service_account_status', 'role_status', 'role_binding_status', 'operator_subscription_status',
] as const
for (const cardType of _UNIFIED_ONLY_TYPES) {
  const adapter = _makeUnifiedEntry(cardType)
  if (adapter) RAW_CARD_COMPONENTS[cardType] = adapter
}

export const CARD_COMPONENTS = RAW_CARD_COMPONENTS
export { DEMO_EXEMPT_CARDS }

export function prefetchCardChunks(cardTypes: string[]): void {
  for (const type of cardTypes) CARD_CHUNK_PRELOADERS[type]?.()?.catch(() => {})
}

export function prefetchDemoCardChunks(): void {
  CARD_DEMO_STARTUP_PRELOADERS.forEach(load => load().catch(() => {}))
}

registerAllDescriptorCards({
  components: RAW_CARD_COMPONENTS,
  preloaders: CARD_CHUNK_PRELOADERS,
  defaultWidths: CARD_DEFAULT_WIDTHS,
  titles: CARD_TITLES,
  descriptions: CARD_DESCRIPTIONS,
  demoDataCards: DEMO_DATA_CARDS,
  liveDataCards: LIVE_DATA_CARDS,
  demoExemptCards: DEMO_EXEMPT_CARDS,
})

const DEFAULT_CARD_WIDTH = 4
export function getDefaultCardWidth(cardType: string): number {
  return CARD_DEFAULT_WIDTHS[cardType] ?? DEFAULT_CARD_WIDTH
}

export function getCardComponent(cardType: string): CardComponent | undefined {
  const staticComponent = CARD_COMPONENTS[cardType]
  if (staticComponent) return staticComponent
  if (isDynamicCardRegistered(cardType)) return CARD_COMPONENTS.dynamic_card
  console.warn(
    `[cardRegistry] Unknown card type "${cardType}" — no component registered. ` +
    'Check for typos in the dashboard config or register the card in cardRegistry.ts.',
  )
  return undefined
}

export function isCardTypeRegistered(cardType: string): boolean {
  return cardType in CARD_COMPONENTS || isDynamicCardRegistered(cardType)
}

export function registerDynamicCardType(cardType: string, width = 6): void {
  CARD_DEFAULT_WIDTHS[cardType] = width
}

export function getRegisteredCardTypes(): string[] {
  return Object.keys(CARD_COMPONENTS)
}
