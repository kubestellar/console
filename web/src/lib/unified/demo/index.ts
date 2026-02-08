/**
 * Unified Demo System
 *
 * Centralized demo data and skeleton state management.
 *
 * Usage:
 * 1. Wrap your app with <UnifiedDemoProvider>
 * 2. Register demo data generators with registerDemoData()
 * 3. Use useUnifiedData() hook in components for automatic demo/live switching
 * 4. Use useUnifiedDemoContext() for direct access to demo state
 */

// Provider and hooks
export { UnifiedDemoProvider, useUnifiedData, useUnifiedDemoContext } from './UnifiedDemo'
export { useIsDemoMode, useIsModeSwitching } from './UnifiedDemoContext'

// Registry functions
export {
  registerDemoData,
  registerDemoDataBatch,
  unregisterDemoData,
  hasDemoData,
  getDemoDataEntry,
  getAllDemoDataEntries,
  getDemoDataByCategory,
  generateDemoData,
  generateDemoDataSync,
  clearDemoDataCache,
  subscribeToRegistry,
  getRegistryStats,
} from './demoDataRegistry'

// Types
export type {
  DemoDataGenerator,
  DemoDataGeneratorConfig,
  DemoDataEntry,
  DemoDataState,
  LiveDataState,
  DataState,
  UnifiedDemoContextValue,
  UnifiedDemoProps,
  UseUnifiedDataResult,
  SkeletonConfig,
  ModeSwitchEvent,
} from './types'

// Demo data generators
export {
  registerAllDemoGenerators,
  getDemoClusters,
  getDemoPodIssues,
  getDemoDeploymentIssues,
  getDemoEvents,
  getDemoSecurityIssues,
  getDemoGPUNodes,
  getDemoHelmReleases,
  getDemoOperators,
  getDemoServices,
} from './generators/registerDemoGenerators'
