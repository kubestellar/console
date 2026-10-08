import { MS_PER_MINUTE, MS_PER_HOUR } from '../../lib/constants/time'

/**
 * Maximum age of a metrics-history snapshot we're willing to use as a
 * fallback when the live GPU-nodes fetch returns empty. Snapshots older than
 * this are treated as stale and skipped (the card will render its empty
 * state instead of showing days-old inventory). 30 minutes matches the
 * `MAX_AGE_MS` used by this card's own on-screen chart history so the two
 * windows stay consistent.
 */
export const GPU_SNAPSHOT_STALENESS_MS = 30 * MS_PER_MINUTE // 30 min

/**
 * Bucket size for the staleness-tick that forces the fallback memo to
 * re-evaluate as time passes. Without this, a snapshot accepted as fresh
 * can remain displayed indefinitely because the memo's deps never change.
 * Rounding `Date.now()` to this bucket means the memo only recomputes when
 * the bucket boundary crosses — roughly once per minute — which is plenty
 * of precision for a 30-minute staleness window.
 */
export const STALENESS_TICK_MS = 60_000

export interface GPUDataPoint {
  time: string
  available: number
  allocated: number
  free: number
}

// Shape we pass through the card's filter/aggregation pipeline. This matches
// the live GPUNode shape for the fields we actually use (cluster, gpuType,
// gpuCount, gpuAllocated). We normalize here so we can transparently fall
// back to a recent metrics-history snapshot whose field name is `gpuTotal`
// instead of `gpuCount` — see snapshot fallback in useEffectiveGPUNodes.
export interface EffectiveGPUNode {
  name: string
  cluster: string
  gpuType?: string
  gpuCount: number
  gpuAllocated: number
}

export type TimeRange = '15m' | '1h' | '6h' | '24h'

export const TIME_RANGE_OPTIONS: { value: TimeRange; label: string; points: number; intervalMs: number }[] = [
  { value: '15m', label: '15 min', points: 15, intervalMs: MS_PER_MINUTE },
  { value: '1h', label: '1 hour', points: 20, intervalMs: 3 * MS_PER_MINUTE },
  { value: '6h', label: '6 hours', points: 24, intervalMs: 15 * MS_PER_MINUTE },
  { value: '24h', label: '24 hours', points: 24, intervalMs: MS_PER_HOUR },
]
