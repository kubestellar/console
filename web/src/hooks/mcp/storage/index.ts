import { __storageTestables as _pvcTestables } from './usePersistentVolumeClaims'
import { getDemoResourceQuotas, getDemoLimitRanges } from './useStorageClasses'

export * from './usePersistentVolumeClaims'
export * from './usePersistentVolumes'
export * from './useStorageClasses'

// Assemble combined testables (avoids cross-sibling imports in individual files)
export const __storageTestables = {
  ..._pvcTestables,
  getDemoResourceQuotas,
  getDemoLimitRanges,
}
