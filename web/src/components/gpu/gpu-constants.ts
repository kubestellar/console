import type { GPUUtilizationSnapshot } from '../../hooks/useGPUUtilizations'

// GPU utilization thresholds for visual indicators
export const UTILIZATION_HIGH_THRESHOLD = 80
export const UTILIZATION_MEDIUM_THRESHOLD = 50

// Sparkline utilization color thresholds
export const SPARKLINE_HIGH_UTIL_PCT = 70    // Green: well-utilized
export const SPARKLINE_LOW_UTIL_PCT = 30     // Red: underutilized
export const SPARKLINE_HEIGHT_PX = 28        // Height of sparkline chart

// Display settings
export const MAX_NAME_DISPLAY_LENGTH = 12 // Maximum characters to display before truncating cluster names

// GPU resource keys used to identify GPU quotas
export const GPU_KEYS = ['nvidia.com/gpu', 'amd.com/gpu', 'gpu.intel.com/i915']

/** Get sparkline color based on average utilization */
export function getUtilizationColor(avgPct: number): string {
  if (avgPct >= SPARKLINE_HIGH_UTIL_PCT) return '#22c55e' // green-500
  if (avgPct >= SPARKLINE_LOW_UTIL_PCT) return '#eab308'  // yellow-500
  return '#ef4444' // red-500
}

/** Count unique days where GPUs were actively used */
export function countActiveDays(snapshots: GPUUtilizationSnapshot[]): number {
  const activeDates = new Set<string>()
  for (const snap of snapshots) {
    if (snap.active_gpu_count > 0) {
      activeDates.add(snap.timestamp.split('T')[0])
    }
  }
  return activeDates.size
}

/** Compute average GPU utilization across all snapshots */
export function computeAvgUtilization(snapshots: GPUUtilizationSnapshot[]): number {
  if (snapshots.length === 0) return 0
  const sum = snapshots.reduce((acc, s) => acc + s.gpu_utilization_pct, 0)
  return Math.round(sum / snapshots.length)
}

// Status badge colors
export const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  active: 'bg-green-500/20 text-green-400 border-green-500/30',
  completed: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  cancelled: 'bg-red-500/20 text-red-400 border-red-500/30',
}
