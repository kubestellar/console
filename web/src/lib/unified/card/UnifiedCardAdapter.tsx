/**
 * UnifiedCardAdapter
 *
 * A bridge component that enables gradual migration from legacy card components
 * to the UnifiedCard framework. Cards can opt-in to using UnifiedCard rendering
 * by being added to the UNIFIED_READY_CARDS set.
 *
 * Usage:
 *   <UnifiedCardAdapter cardType="pod_issues" cardId="abc" />
 *
 * Migration path:
 *   1. Add card type to UNIFIED_READY_CARDS set
 *   2. Verify rendering matches legacy component
 *   3. Eventually deprecate legacy component
 */

import { UnifiedCard } from './UnifiedCard'
import { useDataHookRegistryVersion } from './hooks/useDataSource'
import { getCardConfig } from '../../../config/cards'
import type { CardComponentProps } from '../../../components/cards/cardRegistry'
import { UNIFIED_READY_CARDS, UNIFIED_EXCLUDED_CARDS } from './adapters/cardMigrationSets'

export { UNIFIED_READY_CARDS, UNIFIED_EXCLUDED_CARDS }

interface UnifiedCardAdapterProps extends CardComponentProps {
  /** The card type to render */
  cardType: string
  /** Unique card instance ID */
  cardId: string
  /** Instance-specific config overrides */
  instanceConfig?: Record<string, unknown>
  /** Force legacy rendering even if card is unified-ready */
  forceLegacy?: boolean
  /** Callback when legacy component should be rendered */
  renderLegacy?: () => React.ReactNode
}

/**
 * Check if a card should use UnifiedCard rendering
 */
export function shouldUseUnifiedCard(cardType: string): boolean {
  // Explicitly excluded cards never use unified
  if (UNIFIED_EXCLUDED_CARDS.has(cardType)) {
    return false
  }

  // Only cards in the ready set use unified
  return UNIFIED_READY_CARDS.has(cardType)
}

/**
 * Check if a card has a valid config for UnifiedCard
 */
export function hasValidUnifiedConfig(cardType: string): boolean {
  const config = getCardConfig(cardType)
  if (!config) return false

  // Check required fields
  if (!config.type || !config.dataSource || !config.content) {
    return false
  }

  // Check data source is configured
  if (config.dataSource.type === 'hook' && !config.dataSource.hook) {
    return false
  }

  // Check content type is supported
  const supportedTypes = ['list', 'table', 'chart', 'status-grid']
  if (!supportedTypes.includes(config.content.type)) {
    return false
  }

  return true
}

/**
 * UnifiedCardAdapter - Renders cards via UnifiedCard or legacy component
 */
export function UnifiedCardAdapter({
  cardType,
  cardId: _cardId,
  instanceConfig,
  forceLegacy = false,
  renderLegacy }: UnifiedCardAdapterProps) {
  // Get config for this card type
  const config = getCardConfig(cardType)

  // Determine if we should use UnifiedCard
  const useUnified = (() => {
    if (forceLegacy) return false
    if (!shouldUseUnifiedCard(cardType)) return false
    if (!hasValidUnifiedConfig(cardType)) return false
    return true
  })()

  // Track data-hook registry version so that when hooks are registered
  // (after dynamic import in main.tsx), we remount UnifiedCard with a new
  // key. This keeps React hook counts stable within each component lifecycle
  // and prevents "Rendered more hooks than previous render" crashes.
  const registryVersion = useDataHookRegistryVersion()

  // Render via UnifiedCard
  if (useUnified && config) {
    return (
      <UnifiedCard
        key={`unified-${cardType}-rv${registryVersion}`}
        config={config}
        instanceConfig={instanceConfig}
        className="h-full"
      />
    )
  }

  // Fall back to legacy rendering
  if (renderLegacy) {
    return <>{renderLegacy()}</>
  }

  // If no legacy renderer provided, show placeholder
  return (
    <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
      Card not available
    </div>
  )
}

/**
 * Get migration status for a card type
 */
export function getCardMigrationStatus(cardType: string): {
  status: 'unified' | 'ready' | 'pending' | 'excluded'
  reason?: string
} {
  if (UNIFIED_EXCLUDED_CARDS.has(cardType)) {
    return {
      status: 'excluded',
      reason: 'Card type not suitable for unified framework' }
  }

  if (UNIFIED_READY_CARDS.has(cardType)) {
    return {
      status: 'unified',
      reason: 'Card is rendering via UnifiedCard' }
  }

  if (hasValidUnifiedConfig(cardType)) {
    return {
      status: 'ready',
      reason: 'Config complete, ready for validation' }
  }

  return {
    status: 'pending',
    reason: 'Config incomplete or missing' }
}

/**
 * Get all cards by migration status
 */
export function getCardsByMigrationStatus(): {
  unified: string[]
  ready: string[]
  pending: string[]
  excluded: string[]
} {
  const result = {
    unified: Array.from(UNIFIED_READY_CARDS),
    ready: [] as string[],
    pending: [] as string[],
    excluded: Array.from(UNIFIED_EXCLUDED_CARDS) }

  // Import all card types from config registry
  // This would need to be done dynamically in practice
  // For now, we check known card types

  return result
}

export default UnifiedCardAdapter
