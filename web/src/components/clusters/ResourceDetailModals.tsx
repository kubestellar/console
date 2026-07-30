/**
 * Barrel re-export for cluster resource detail modals.
 * Each modal now lives in its own file under `resource-modals/` so import
 * sites (ClusterDetailModal.tsx, tests) keep working unchanged.
 */
export { CPUDetailModal } from './resource-modals/CPUDetailModal'
export { MemoryDetailModal } from './resource-modals/MemoryDetailModal'
export { StorageDetailModal } from './resource-modals/StorageDetailModal'
export { GPUDetailModal } from './resource-modals/GPUDetailModal'
