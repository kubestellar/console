/**
 * Demo Data Registry
 *
 * Central registry for all demo data generators.
 * Components register their demo data generators here, and the
 * UnifiedDemo provider uses this registry to generate demo data.
 */

import type { DemoDataEntry, DemoDataGeneratorConfig, DemoDataState } from './types'

/**
 * Registry of all demo data generators.
 */
const registry = new Map<string, DemoDataEntry>()

/**
 * Cache of generated demo data.
 */
const dataCache = new Map<string, DemoDataState>()

/**
 * Listeners for registry changes.
 */
const listeners = new Set<() => void>()

/**
 * Register a demo data generator.
 * @param entry The demo data entry to register
 */
export function registerDemoData<T = unknown>(entry: DemoDataEntry<T>): void {
  registry.set(entry.id, entry as DemoDataEntry)
  notifyListeners()
}

/**
 * Register multiple demo data generators.
 * @param entries Array of demo data entries to register
 */
export function registerDemoDataBatch(entries: DemoDataEntry[]): void {
  for (const entry of entries) {
    registry.set(entry.id, entry)
  }
  notifyListeners()
}

/**
 * Unregister a demo data generator.
 * @param id The ID of the generator to remove
 */
export function unregisterDemoData(id: string): void {
  registry.delete(id)
  dataCache.delete(id)
  notifyListeners()
}

/**
 * Check if a demo data generator is registered.
 * @param id The ID to check
 * @returns Whether the generator is registered
 */
export function hasDemoData(id: string): boolean {
  return registry.has(id)
}

/**
 * Get a demo data generator entry.
 * @param id The ID of the generator
 * @returns The generator entry or undefined
 */
export function getDemoDataEntry(id: string): DemoDataEntry | undefined {
  return registry.get(id)
}

/**
 * Get all registered demo data entries.
 * @returns Array of all registered entries
 */
export function getAllDemoDataEntries(): DemoDataEntry[] {
  return Array.from(registry.values())
}

/**
 * Get demo data entries by category.
 * @param category The category to filter by
 * @returns Array of entries in the category
 */
export function getDemoDataByCategory(category: DemoDataEntry['category']): DemoDataEntry[] {
  return Array.from(registry.values()).filter(entry => entry.category === category)
}

/**
 * Generate demo data for a component.
 * Uses caching to avoid regenerating on every call.
 * @param id The component ID
 * @param forceRegenerate Whether to bypass cache
 * @returns Promise resolving to the demo data state
 */
export async function generateDemoData<T = unknown>(
  id: string,
  forceRegenerate = false
): Promise<DemoDataState<T>> {
  // Check cache first
  if (!forceRegenerate && dataCache.has(id)) {
    return dataCache.get(id) as DemoDataState<T>
  }

  const entry = registry.get(id)
  if (!entry) {
    const state: DemoDataState<T> = {
      data: undefined,
      isLoading: false,
      isDemoData: true,
      error: new Error(`No demo data generator registered for: ${id}`),
    }
    return state
  }

  const config = entry.config as DemoDataGeneratorConfig<T>

  // Calculate delay
  let delay = config.delay ?? 0
  if (config.randomDelay) {
    const min = config.minDelay ?? 200
    const max = config.maxDelay ?? 1500
    delay = Math.floor(Math.random() * (max - min + 1)) + min
  }

  // Apply delay if needed
  if (delay > 0) {
    await new Promise(resolve => setTimeout(resolve, delay))
  }

  try {
    const data = config.generate()
    const state: DemoDataState<T> = {
      data,
      isLoading: false,
      isDemoData: true,
      generatedAt: new Date(),
    }
    dataCache.set(id, state as DemoDataState)
    return state
  } catch (error) {
    const state: DemoDataState<T> = {
      data: undefined,
      isLoading: false,
      isDemoData: true,
      error: error instanceof Error ? error : new Error(String(error)),
    }
    return state
  }
}

/**
 * Generate demo data synchronously (no delay).
 * Used for immediate data needs.
 * @param id The component ID
 * @returns The demo data state
 */
export function generateDemoDataSync<T = unknown>(id: string): DemoDataState<T> {
  const entry = registry.get(id)
  if (!entry) {
    return {
      data: undefined,
      isLoading: false,
      isDemoData: true,
      error: new Error(`No demo data generator registered for: ${id}`),
    }
  }

  const config = entry.config as DemoDataGeneratorConfig<T>

  try {
    const data = config.generate()
    const state: DemoDataState<T> = {
      data,
      isLoading: false,
      isDemoData: true,
      generatedAt: new Date(),
    }
    dataCache.set(id, state as DemoDataState)
    return state
  } catch (error) {
    return {
      data: undefined,
      isLoading: false,
      isDemoData: true,
      error: error instanceof Error ? error : new Error(String(error)),
    }
  }
}

/**
 * Clear the demo data cache.
 * @param id Optional ID to clear specific entry, or clear all if not provided
 */
export function clearDemoDataCache(id?: string): void {
  if (id) {
    dataCache.delete(id)
  } else {
    dataCache.clear()
  }
}

/**
 * Subscribe to registry changes.
 * @param listener Callback when registry changes
 * @returns Unsubscribe function
 */
export function subscribeToRegistry(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * Notify all listeners of registry changes.
 */
function notifyListeners(): void {
  listeners.forEach(listener => listener())
}

/**
 * Get registry stats for debugging.
 */
export function getRegistryStats(): { total: number; byCategory: Record<string, number> } {
  const entries = Array.from(registry.values())
  const byCategory: Record<string, number> = {}

  for (const entry of entries) {
    const cat = entry.category ?? 'uncategorized'
    byCategory[cat] = (byCategory[cat] ?? 0) + 1
  }

  return {
    total: entries.length,
    byCategory,
  }
}
