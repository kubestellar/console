/**
 * Shared resource-type constants for storage quota UIs.
 *
 * Split from storage.ts (Issue #23155).
 */

// Common GPU resource types for quotas
export const GPU_RESOURCE_TYPES = [
  { key: 'requests.nvidia.com/gpu', label: 'NVIDIA GPU Requests', description: 'Maximum GPUs that can be requested' },
  { key: 'limits.nvidia.com/gpu', label: 'NVIDIA GPU Limits', description: 'Maximum GPU limits allowed' },
  { key: 'requests.amd.com/gpu', label: 'AMD GPU Requests', description: 'Maximum AMD GPUs that can be requested' },
  { key: 'limits.amd.com/gpu', label: 'AMD GPU Limits', description: 'Maximum AMD GPU limits allowed' },
] as const

// Common resource types for quotas
export const COMMON_RESOURCE_TYPES = [
  { key: 'requests.cpu', label: 'CPU Requests', description: 'Total CPU requests allowed' },
  { key: 'limits.cpu', label: 'CPU Limits', description: 'Total CPU limits allowed' },
  { key: 'requests.memory', label: 'Memory Requests', description: 'Total memory requests allowed' },
  { key: 'limits.memory', label: 'Memory Limits', description: 'Total memory limits allowed' },
  { key: 'pods', label: 'Pods', description: 'Maximum number of pods' },
  { key: 'services', label: 'Services', description: 'Maximum number of services' },
  { key: 'persistentvolumeclaims', label: 'PVCs', description: 'Maximum number of PVCs' },
  { key: 'requests.storage', label: 'Storage Requests', description: 'Total storage that can be requested' },
  ...GPU_RESOURCE_TYPES,
] as const
