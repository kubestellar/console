/**
 * Unified Card System - Hook Registration
 *
 * This file registers data hooks with the unified card system.
 * Import this file early in the application (e.g., in main.tsx) to make
 * hooks available for unified cards.
 */

import { registerDataHook } from './card/hooks/useDataSource'
import { createUnifiedResourceHook, createUnifiedCachedHook } from './registerHooks/factories'
import { RESOURCE_HOOKS, CACHED_STATUS_HOOKS } from './registerHooks/hookTables'
import { DEMO_HOOK_TABLE } from './registerHooks/demoData'
import { useDemoDataHook } from './registerHooks/demoSupport'
import {
  useWarningEvents,
  useRecentEvents,
  useNamespaceEvents,
  useUnifiedFluxStatus,
  useUnifiedContourStatus,
  useUnifiedChaosMeshStatus,
} from './registerHooks/customHooks'

export function registerUnifiedHooks(): void {
  for (const { name, ...config } of RESOURCE_HOOKS) {
    registerDataHook(name, createUnifiedResourceHook(config))
  }

  registerDataHook('useWarningEvents', useWarningEvents)
  registerDataHook('useRecentEvents', useRecentEvents)
  registerDataHook('useNamespaceEvents', useNamespaceEvents)
  registerDataHook('useFluxStatus', useUnifiedFluxStatus)
  registerDataHook('useContourStatus', useUnifiedContourStatus)
  registerDataHook('useChaosMeshStatus', useUnifiedChaosMeshStatus)

  for (const { name, ...config } of CACHED_STATUS_HOOKS) {
    registerDataHook(name, createUnifiedCachedHook(config))
  }

  for (const { name, data } of DEMO_HOOK_TABLE) {
    registerDataHook(name, () => useDemoDataHook(data))
  }
}

registerUnifiedHooks()
