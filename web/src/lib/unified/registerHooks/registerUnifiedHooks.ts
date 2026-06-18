/**
 * Registers all unified data hooks.
 */

import { registerDataHook } from '../card/hooks/useDataSource'
import { createUnifiedCachedHook, createUnifiedResourceHook } from './factory'
import { RESOURCE_HOOKS } from './resourceHooks'
import { CACHED_STATUS_HOOKS } from './statusHooks'
import { DEMO_HOOK_TABLE, useDemoDataHook } from './demoHooks'
import { MANUAL_HOOKS } from './manualHooks'

export function registerUnifiedHooks(): void {
  for (const { name, ...config } of RESOURCE_HOOKS) {
    registerDataHook(name, createUnifiedResourceHook(config))
  }

  for (const { name, hook } of MANUAL_HOOKS) {
    registerDataHook(name, hook)
  }

  for (const { name, ...config } of CACHED_STATUS_HOOKS) {
    registerDataHook(name, createUnifiedCachedHook(config))
  }

  for (const { name, data } of DEMO_HOOK_TABLE) {
    registerDataHook(name, () => useDemoDataHook(data))
  }
}
