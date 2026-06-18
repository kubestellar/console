export * from './usePersistentVolumeClaims'
export * from './usePersistentVolumes'
export * from './useStorageClasses'

import { getDemoLimitRanges, getDemoResourceQuotas } from '../compute/useResourceQuotas'
import { getDemoPVCs } from './usePersistentVolumeClaims'
import { loadPVCsCacheFromStorage, PVCS_CACHE_KEY, savePVCsCacheToStorage, subscribeStorageCache } from './shared'

export { subscribeStorageCache }

export const __storageTestables = {
  getDemoPVCs,
  getDemoResourceQuotas,
  getDemoLimitRanges,
  loadPVCsCacheFromStorage,
  savePVCsCacheToStorage,
  PVCS_CACHE_KEY,
}
