/**
 * Barrel module for the storage hooks - re-exports the individually split
 * modules under `./storage/` so `hooks/mcp/storage` import paths keep
 * working.
 *
 * Split from an 811-line storage.ts (Issue #23155) into:
 * - storageDemoData.ts: demo data factories for PVCs/ResourceQuotas/LimitRanges
 * - constants.ts: shared resource-type constants
 * - usePVCs.ts: usePVCs hook + PVC cache/subscriber plumbing
 * - usePVs.ts: usePVs hook
 * - useResourceQuotas.ts: useResourceQuotas/useLimitRanges hooks + quota CRUD
 * - index.ts: barrel re-exporting everything + __storageTestables
 */
import { getDemoPVCs, getDemoResourceQuotas, getDemoLimitRanges } from './storageDemoData'
import { __pvcsTestables } from './usePVCs'

export { subscribeStorageCache, usePVCs } from './usePVCs'
export { usePVs } from './usePVs'
export {
  useResourceQuotas,
  useLimitRanges,
  createOrUpdateResourceQuota,
  deleteResourceQuota,
} from './useResourceQuotas'
export { GPU_RESOURCE_TYPES, COMMON_RESOURCE_TYPES } from './constants'

export const __storageTestables = {
  getDemoPVCs,
  getDemoResourceQuotas,
  getDemoLimitRanges,
  loadPVCsCacheFromStorage: __pvcsTestables.loadPVCsCacheFromStorage,
  savePVCsCacheToStorage: __pvcsTestables.savePVCsCacheToStorage,
  resetPVCsCache: __pvcsTestables.resetPVCsCache,
  PVCS_CACHE_KEY: __pvcsTestables.PVCS_CACHE_KEY,
}
