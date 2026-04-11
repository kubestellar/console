// Types
export type {
  DynamicCardTier,
  DynamicCardColumn,
  DynamicCardStat,
  DynamicCardDefinition_T1,
  DynamicCardDefinition,
  DynamicCardProps,
  CompileResult,
  DynamicComponentResult,
} from './types'

// Registry
export {
  registerDynamicCard,
  getDynamicCard,
  getAllDynamicCards,
  unregisterDynamicCard,
  isDynamicCardRegistered,
  onRegistryChange,
  clearDynamicCards,
} from './dynamicCardRegistry'

// Store (localStorage persistence)
export {
  loadDynamicCards,
  saveDynamicCards,
  saveDynamicCard,
  deleteDynamicCard,
  exportDynamicCards,
  importDynamicCards,
} from './dynamicCardStore'
export type { ImportResult } from './dynamicCardStore'

// Schema validators
export {
  validateDynamicCardDefinition,
  validateStatsDefinition,
  MAX_CARD_SOURCE_BYTES,
  MAX_CARD_NAME_LENGTH,
  MAX_CARD_DESCRIPTION_LENGTH,
} from './validator'

// Compiler (Tier 2)
export { compileCardCode, createCardComponent } from './compiler'

// Scope (Tier 2 sandbox)
export { getDynamicScope } from './scope'

// Data fetching (Tier 2 sandbox)
export { createCardFetchScope } from './useCardFetch'
export type { CardFetchResult, CardFetchOptions } from './useCardFetch'

// Dynamic Stats Registry
export {
  registerDynamicStats,
  unregisterDynamicStats,
  getDynamicStats,
  getAllDynamicStats,
  getAllDynamicStatsTypes,
  isDynamicStats,
  onDynamicStatsChange,
} from './dynamicStatsRegistry'
export type { DynamicStatsRecord } from './dynamicStatsRegistry'

// Dynamic Stats Store (localStorage persistence)
export {
  loadDynamicStats,
  saveDynamicStats,
  saveDynamicStatsDefinition,
  deleteDynamicStatsDefinition,
  exportDynamicStats,
  importDynamicStats,
} from './dynamicStatsStore'
