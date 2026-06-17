/**
 * Unified Card System - Hook Registration
 */

import { registerDataHook } from './card/hooks/useDataSource'
import { createUnifiedResourceHook, createUnifiedCachedHook } from './registerHooks.shared'
import { RESOURCE_HOOKS } from './registerHooks.data'
import { CACHED_STATUS_HOOKS } from './registerHooks.agent'
import { DEMO_HOOK_TABLE, useDemoDataHook } from './registerHooks.cluster'
import {
  useWarningEvents,
  useRecentEvents,
  useNamespaceEvents,
  useUnifiedFluxStatus,
  useUnifiedContourStatus,
  useUnifiedChaosMeshStatus,
} from './registerHooks.ui'

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
