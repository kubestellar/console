/**
 * Utilities for extracting and organizing real benchmark data from Google Drive.
 *
 * The real data has 3 experiment categories:
 * - Inference Scheduling: kv-scorer, no-scorer, prefix-scorer, queue-scorer
 * - Inference Scheduling with Precise Prefix: cache_tracking, default
 * - PD Disaggregation: various prefill/decode replica ratios + standalone baselines
 *
 * Each experiment has multiple stages (increasing QPS: 2, 5, 8, 10, 12, 15, 20)
 * and multiple ISL/OSL combinations (2148/2348/3048 × 100/300/1000).
 */
import type { BenchmarkReport } from './benchmarkMockData'
import { getHardwareShort, getModelShort } from './benchmarkMockData'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExperimentMeta {
  category: string      // "Inference Scheduling", "PD Disaggregation", etc.
  variant: string       // "queue-scorer", "cache_tracking", "standalone_1_4", etc.
  shortVariant: string  // Short display name
  config: 'standalone' | 'disaggregated' | 'scheduling'
  qps: number
  isl: number
  osl: number
  model: string
  hardware: string
}

export interface ScalingPoint {
  qps: number
  throughput: number
  ttftP50Ms: number
  tpotP50Ms: number
  itlP50Ms: number
  p99LatencyMs: number
  requestLatencyMs: number
  requestRate: number
  totalRequests: number
  failures: number
}

export interface ExperimentGroup {
  category: string
  variant: string
  shortVariant: string
  config: 'standalone' | 'disaggregated' | 'scheduling'
  model: string
  hardware: string
  color: string
  points: ScalingPoint[]       // Aggregated by QPS (averaged across ISL/OSL)
  rawPoints: ScalingPointWithSeq[]  // All points with ISL/OSL detail
}

export interface ScalingPointWithSeq extends ScalingPoint {
  isl: number
  osl: number
}

// ---------------------------------------------------------------------------
// Color palettes
// ---------------------------------------------------------------------------

const CATEGORY_COLORS: Record<string, string[]> = {
  'Inference Scheduling': ['#3b82f6', '#60a5fa', '#93c5fd', '#2563eb'],
  'Inference Scheduling with Precise Prefix': ['#8b5cf6', '#a78bfa'],
  'PD Disaggregation': ['#10b981', '#34d399', '#6ee7b7', '#059669', '#047857', '#f59e0b', '#fbbf24', '#f97316', '#fb923c', '#ef4444', '#f87171', '#fca5a5'],
}

let colorIdx = 0
const variantColorMap = new Map<string, string>()

function getVariantColor(category: string, variant: string): string {
  const key = `${category}/${variant}`
  if (variantColorMap.has(key)) return variantColorMap.get(key)!
  const palette = CATEGORY_COLORS[category] ?? ['#6b7280', '#9ca3af', '#d1d5db']
  const color = palette[colorIdx % palette.length]
  colorIdx++
  variantColorMap.set(key, color)
  return color
}

// ---------------------------------------------------------------------------
// Extraction helpers
// ---------------------------------------------------------------------------

export function extractExperimentMeta(report: BenchmarkReport): ExperimentMeta {
  const eid = report.run.eid ?? ''
  const parts = eid.split('/')
  const category = parts[0] ?? 'Unknown'
  const variant = parts.slice(1).join('/') ?? 'unknown'

  // Determine config type
  const roleStrings = report.scenario.stack.map(c => c.standardized.role).filter(Boolean) as string[]
  const hasReplica = roleStrings.includes('replica')
  const hasPrefill = roleStrings.includes('prefill')

  let config: ExperimentMeta['config'] = 'scheduling'
  if (hasReplica || variant.includes('standalone')) {
    config = 'standalone'
  } else if (hasPrefill || variant.includes('modelservice')) {
    config = 'disaggregated'
  }

  // Short variant name
  let shortVariant = variant
  if (variant.includes('setup_standalone_')) {
    const nums = variant.replace('pd-disaggregation.setup_standalone_', '').replace(/_NA/g, '').replace(/_/g, '×')
    shortVariant = `Standalone ${nums}`
  } else if (variant.includes('setup_modelservice_')) {
    const nums = variant.replace('pd-disaggregation.setup_modelservice_', '').replace(/NA_NA_/g, '').replace(/_/g, '/')
    shortVariant = `PD ${nums}`
  } else if (variant.includes('precise_prefix_cache_aware.')) {
    shortVariant = variant.split('.').pop() ?? variant
  } else if (variant.startsWith('inference-scheduling-')) {
    shortVariant = variant.replace('inference-scheduling-', '')
  }

  const engine = report.scenario.stack.find(c => c.standardized.kind === 'inference_engine')
  const model = getModelShort(engine?.standardized.model?.name ?? 'unknown')
  const hardware = getHardwareShort(engine?.standardized.accelerator?.model ?? 'unknown')

  const load = report.scenario.load.standardized
  const qps = load.rate_qps ?? 0
  const isl = load.input_seq_len?.value ?? 0
  const osl = load.output_seq_len?.value ?? 0

  return { category, variant, shortVariant, config, qps, isl, osl, model, hardware }
}

function extractScalingPoint(report: BenchmarkReport, meta: ExperimentMeta): ScalingPointWithSeq {
  const agg = report.results.request_performance.aggregate
  const lat = agg.latency
  const tp = agg.throughput

  return {
    qps: meta.qps,
    isl: meta.isl,
    osl: meta.osl,
    throughput: tp.output_token_rate?.mean ?? 0,
    ttftP50Ms: (lat.time_to_first_token?.p50 ?? 0) * 1000,
    tpotP50Ms: (lat.time_per_output_token?.p50 ?? 0) * 1000,
    itlP50Ms: (lat.inter_token_latency?.p50 ?? 0) * 1000,
    p99LatencyMs: (lat.request_latency?.p99 ?? 0) * 1000,
    requestLatencyMs: (lat.request_latency?.p50 ?? 0) * 1000,
    requestRate: tp.request_rate?.mean ?? 0,
    totalRequests: agg.requests.total,
    failures: agg.requests.failures,
  }
}

// ---------------------------------------------------------------------------
// Group and aggregate
// ---------------------------------------------------------------------------

export function groupByExperiment(
  reports: BenchmarkReport[],
  filters?: { category?: string; model?: string; isl?: number; osl?: number }
): ExperimentGroup[] {
  // Reset color assignments for consistent coloring
  colorIdx = 0
  variantColorMap.clear()

  const groupMap = new Map<string, {
    meta: ExperimentMeta
    rawPoints: ScalingPointWithSeq[]
  }>()

  for (const r of reports) {
    const meta = extractExperimentMeta(r)

    // Apply filters
    if (filters?.category && meta.category !== filters.category) continue
    if (filters?.model && meta.model !== filters.model) continue
    if (filters?.isl && meta.isl !== filters.isl) continue
    if (filters?.osl && meta.osl !== filters.osl) continue
    if (meta.qps === 0 || meta.isl === 0 || meta.osl === 0) continue

    const key = `${meta.category}/${meta.variant}`
    if (!groupMap.has(key)) {
      groupMap.set(key, { meta, rawPoints: [] })
    }
    groupMap.get(key)!.rawPoints.push(extractScalingPoint(r, meta))
  }

  return Array.from(groupMap.values()).map(({ meta, rawPoints }) => {
    // Aggregate by QPS: average across ISL/OSL combos
    const qpsMap = new Map<number, ScalingPointWithSeq[]>()
    for (const p of rawPoints) {
      if (!qpsMap.has(p.qps)) qpsMap.set(p.qps, [])
      qpsMap.get(p.qps)!.push(p)
    }

    const points: ScalingPoint[] = Array.from(qpsMap.entries())
      .map(([qps, pts]) => ({
        qps,
        throughput: avg(pts.map(p => p.throughput)),
        ttftP50Ms: avg(pts.map(p => p.ttftP50Ms)),
        tpotP50Ms: avg(pts.map(p => p.tpotP50Ms)),
        itlP50Ms: avg(pts.map(p => p.itlP50Ms)),
        p99LatencyMs: avg(pts.map(p => p.p99LatencyMs)),
        requestLatencyMs: avg(pts.map(p => p.requestLatencyMs)),
        requestRate: avg(pts.map(p => p.requestRate)),
        totalRequests: Math.round(avg(pts.map(p => p.totalRequests))),
        failures: Math.round(avg(pts.map(p => p.failures))),
      }))
      .sort((a, b) => a.qps - b.qps)

    return {
      category: meta.category,
      variant: meta.variant,
      shortVariant: meta.shortVariant,
      config: meta.config,
      model: meta.model,
      hardware: meta.hardware,
      color: getVariantColor(meta.category, meta.variant),
      points,
      rawPoints: rawPoints.sort((a, b) => a.qps - b.qps),
    }
  }).sort((a, b) => a.shortVariant.localeCompare(b.shortVariant))
}

// ---------------------------------------------------------------------------
// Unique filter options
// ---------------------------------------------------------------------------

export function getFilterOptions(reports: BenchmarkReport[]) {
  const categories = new Set<string>()
  const models = new Set<string>()
  const islValues = new Set<number>()
  const oslValues = new Set<number>()

  for (const r of reports) {
    const meta = extractExperimentMeta(r)
    if (meta.category) categories.add(meta.category)
    if (meta.model) models.add(meta.model)
    if (meta.isl > 0) islValues.add(meta.isl)
    if (meta.osl > 0) oslValues.add(meta.osl)
  }

  return {
    categories: [...categories].sort(),
    models: [...models].sort(),
    islValues: [...islValues].sort((a, b) => a - b),
    oslValues: [...oslValues].sort((a, b) => a - b),
  }
}

// ---------------------------------------------------------------------------
// Heatmap data
// ---------------------------------------------------------------------------

export interface HeatmapCell {
  isl: number
  osl: number
  value: number
  variant: string
}

export function buildHeatmapData(
  reports: BenchmarkReport[],
  metric: 'throughput' | 'ttftP50Ms' | 'p99LatencyMs',
  filters?: { category?: string; variant?: string; qps?: number }
): HeatmapCell[] {
  const cells: HeatmapCell[] = []
  const seen = new Map<string, { total: number; count: number; variant: string }>()

  for (const r of reports) {
    const meta = extractExperimentMeta(r)
    if (meta.isl === 0 || meta.osl === 0) continue
    if (filters?.category && meta.category !== filters.category) continue
    if (filters?.variant && meta.variant !== filters.variant) continue
    if (filters?.qps && meta.qps !== filters.qps) continue

    const pt = extractScalingPoint(r, meta)
    const key = `${meta.isl}-${meta.osl}`
    const val = pt[metric]

    if (!seen.has(key)) seen.set(key, { total: 0, count: 0, variant: meta.shortVariant })
    const entry = seen.get(key)!
    entry.total += val
    entry.count++
  }

  for (const [key, { total, count, variant }] of seen) {
    const [isl, osl] = key.split('-').map(Number)
    cells.push({ isl, osl, value: total / count, variant })
  }

  return cells
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function avg(nums: number[]): number {
  if (nums.length === 0) return 0
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

/** Variant display colors for config types */
export const CONFIG_TYPE_COLORS = {
  standalone: '#f59e0b',
  disaggregated: '#10b981',
  scheduling: '#3b82f6',
} as const
