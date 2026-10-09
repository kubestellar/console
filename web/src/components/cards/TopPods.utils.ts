export type SortByOption = 'restarts' | 'name' | 'cpu' | 'memory' | 'gpu'

export const SORT_OPTIONS = [
  { value: 'restarts' as const, label: 'Restarts' },
  { value: 'cpu' as const, label: 'CPU' },
  { value: 'memory' as const, label: 'Memory' },
  { value: 'gpu' as const, label: 'GPU' },
  { value: 'name' as const, label: 'Name' },
]

// Format CPU millicores to human readable
export const formatCpu = (millis: number | undefined): string => {
  if (!millis) return '-'
  if (millis >= 1000) {
    return `${(millis / 1000).toFixed(1)}c`
  }
  return `${millis}m`
}

// Format memory bytes to human readable
export const formatMemory = (bytes: number | undefined): string => {
  if (!bytes) return '-'
  const gb = bytes / (1024 * 1024 * 1024)
  if (gb >= 1) {
    return `${gb.toFixed(1)}Gi`
  }
  const mb = bytes / (1024 * 1024)
  if (mb >= 1) {
    return `${mb.toFixed(0)}Mi`
  }
  return `${(bytes / 1024).toFixed(0)}Ki`
}

// Get effective CPU value (prefer actual usage over request)
export const getEffectiveCpu = (pod: { cpuUsageMillis?: number; cpuRequestMillis?: number; metricsAvailable?: boolean }) => {
  return pod.metricsAvailable && pod.cpuUsageMillis ? pod.cpuUsageMillis : (pod.cpuRequestMillis || 0)
}

// Get effective memory value (prefer actual usage over request)
export const getEffectiveMemory = (pod: { memoryUsageBytes?: number; memoryRequestBytes?: number; metricsAvailable?: boolean }) => {
  return pod.metricsAvailable && pod.memoryUsageBytes ? pod.memoryUsageBytes : (pod.memoryRequestBytes || 0)
}
