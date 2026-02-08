/**
 * Unified Demo System Types
 *
 * Provides type definitions for the centralized demo data system.
 * All cards, stats, modals, and dashboards use this system for consistent
 * demo data handling and skeleton states.
 */

/**
 * Demo data generator function type.
 * Generators create demo data for specific components.
 */
export type DemoDataGenerator<T = unknown> = () => T

/**
 * Demo data generator with delay simulation.
 * Allows testing skeleton states with configurable delays.
 */
export interface DemoDataGeneratorConfig<T = unknown> {
  /** Generator function that returns demo data */
  generate: DemoDataGenerator<T>
  /** Simulated delay in ms before data "loads" (default: 0) */
  delay?: number
  /** Whether to add random variation to delay (default: false) */
  randomDelay?: boolean
  /** Minimum delay when randomDelay is true (default: 200) */
  minDelay?: number
  /** Maximum delay when randomDelay is true (default: 1500) */
  maxDelay?: number
}

/**
 * Registry entry for demo data.
 */
export interface DemoDataEntry<T = unknown> {
  /** Unique identifier matching card/stat/modal type */
  id: string
  /** Generator configuration */
  config: DemoDataGeneratorConfig<T>
  /** Category for organization */
  category?: 'card' | 'stat' | 'modal' | 'dashboard' | 'drilldown'
  /** Description of what this demo data represents */
  description?: string
}

/**
 * Demo data state for a single component.
 */
export interface DemoDataState<T = unknown> {
  /** The demo data (undefined while loading) */
  data: T | undefined
  /** Whether data is currently loading */
  isLoading: boolean
  /** Whether this is demo data (always true for demo state) */
  isDemoData: true
  /** Error if generation failed */
  error?: Error
  /** Timestamp when data was generated */
  generatedAt?: Date
}

/**
 * Live data state for a single component.
 */
export interface LiveDataState<T = unknown> {
  /** The live data (undefined while loading) */
  data: T | undefined
  /** Whether data is currently loading/refreshing */
  isLoading: boolean
  /** Whether this is demo data (always false for live state) */
  isDemoData: false
  /** Error if fetch failed */
  error?: Error
  /** Timestamp when data was last fetched */
  fetchedAt?: Date
  /** Whether using cached data while refreshing */
  isUsingCache?: boolean
}

/**
 * Combined data state that can be either demo or live.
 */
export type DataState<T = unknown> = DemoDataState<T> | LiveDataState<T>

/**
 * Context value provided by UnifiedDemoProvider.
 */
export interface UnifiedDemoContextValue {
  /** Whether demo mode is currently active */
  isDemoMode: boolean
  /** Whether demo mode is forced (cannot be toggled off) */
  isForced: boolean
  /** Toggle demo mode on/off */
  toggleDemoMode: () => void
  /** Set demo mode explicitly */
  setDemoMode: (value: boolean) => void
  /** Whether mode is currently switching (triggers skeleton) */
  isModeSwitching: boolean
  /** Get demo data for a component by ID */
  getDemoData: <T = unknown>(id: string) => DemoDataState<T>
  /** Register a demo data generator */
  registerGenerator: <T = unknown>(entry: DemoDataEntry<T>) => void
  /** Trigger data regeneration for a component */
  regenerate: (id: string) => void
  /** Trigger data regeneration for all components */
  regenerateAll: () => void
}

/**
 * Props for components that support unified demo/skeleton states.
 */
export interface UnifiedDemoProps {
  /** Force skeleton display regardless of data state */
  forceSkeleton?: boolean
  /** Skip demo data even in demo mode (use for live-only components) */
  skipDemo?: boolean
  /** Custom loading delay for testing */
  loadingDelay?: number
}

/**
 * Hook return type for useUnifiedData.
 */
export interface UseUnifiedDataResult<T = unknown> {
  /** The data (demo or live) */
  data: T | undefined
  /** Whether data is loading */
  isLoading: boolean
  /** Whether showing skeleton (loading or mode switching) */
  showSkeleton: boolean
  /** Whether this is demo data */
  isDemoData: boolean
  /** Error if any */
  error?: Error
  /** Refetch/regenerate data */
  refetch: () => void
}

/**
 * Skeleton configuration for consistent skeleton rendering.
 */
export interface SkeletonConfig {
  /** Type of skeleton to render */
  type: 'card' | 'stat' | 'list' | 'table' | 'chart' | 'text' | 'custom'
  /** Number of rows/items for list/table types */
  rows?: number
  /** Whether to show refresh animation */
  showRefresh?: boolean
  /** Custom height */
  height?: number | string
  /** Custom width */
  width?: number | string
}

/**
 * Mode switch event for cross-component coordination.
 */
export interface ModeSwitchEvent {
  /** Previous mode */
  from: 'demo' | 'live'
  /** New mode */
  to: 'demo' | 'live'
  /** Timestamp of switch */
  timestamp: number
}
