/**
 * Storage hooks module - backward-compatible barrel re-exporting the split
 * modules under `./storage/`.
 *
 * This module was split (Issue #23155) from an 811-line file into:
 * - storage/storageDemoData.ts: demo data factories
 * - storage/constants.ts: shared resource-type constants
 * - storage/usePVCs.ts: usePVCs hook + PVC cache/subscriber plumbing
 * - storage/usePVs.ts: usePVs hook
 * - storage/useResourceQuotas.ts: useResourceQuotas/useLimitRanges + quota CRUD
 * - storage/index.ts: barrel re-exporting everything + __storageTestables
 *
 * No behavior change - all existing `hooks/mcp/storage` import paths keep
 * working via this re-export.
 */
export {
  subscribeStorageCache,
  usePVCs,
  usePVs,
  useResourceQuotas,
  useLimitRanges,
  createOrUpdateResourceQuota,
  deleteResourceQuota,
  GPU_RESOURCE_TYPES,
  COMMON_RESOURCE_TYPES,
  __storageTestables,
} from './storage'
