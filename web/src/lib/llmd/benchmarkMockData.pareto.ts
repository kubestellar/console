/**
 * LLM-d Benchmark Mock Data — Pareto & leaderboard utilities.
 *
 * Analysis functions that extract Pareto-plottable points, compute the
 * Pareto-optimal frontier, and build leaderboard rows from benchmark reports.
 * Split out from benchmarkMockData.ts to keep each file focused.
 */

import type { BenchmarkReport, LeaderboardRow, ParetoPoint } from './benchmarkMockData.types'
import { HARDWARE_SPECS } from './benchmarkMockData.generators'

/** Extract Pareto-plottable points from a set of reports. */
export function extractParetoPoints(reports: BenchmarkReport[]): ParetoPoint[] {
  return reports.map(r => {
    const engine = r.scenario.stack?.find(c => c.standardized?.kind === 'inference_engine')
    if (!engine) return null

    const agg = r.results?.request_performance?.aggregate
    if (!agg) return null

    const acc = engine.standardized.accelerator
    const gpuCount = acc?.count ?? 1
    const outputRate = agg.throughput?.output_token_rate?.mean ?? 0
    const ttft = (agg.latency?.time_to_first_token?.p50 ?? 0) * 1000
    const tpot = (agg.latency?.time_per_output_token?.p50 ?? 0) * 1000
    const p99 = (agg.latency?.request_latency?.p99 ?? 0) * 1000

    // Skip points with zero throughput (invalid data)
    if (outputRate === 0) return null

    // Classify config by stack roles, tool name, and experiment ID
    const roles = (r.scenario.stack ?? []).map(c => c.standardized?.role).filter(Boolean) as string[]
    const eid = r.run?.eid ?? ''
    const tool = engine.standardized.tool ?? ''
    const hasPrefill = roles.includes('prefill')
    const hasDecode = roles.includes('decode')
    const hasReplica = roles.includes('replica')

    let config: ParetoPoint['config'] = 'scheduling'
    if (hasReplica || eid.includes('standalone') || tool === 'vllm') {
      config = 'standalone'
    } else if ((hasPrefill && hasDecode) || eid.includes('modelservice')) {
      config = 'disaggregated'
    }

    const isl = r.scenario.load?.standardized?.input_seq_len?.value ?? 0
    const osl = r.scenario.load?.standardized?.output_seq_len?.value

    const hwSpecs = HARDWARE_SPECS[acc?.model ?? ''] ?? { powerKw: 0.5, costPerHr: 2.00 }

    return {
      uid: r.run.uid,
      model: engine.standardized.model?.name ?? 'unknown',
      hardware: acc?.model ?? 'unknown',
      hardwareMemory: acc?.memory ?? 0,
      gpuCount,
      config,
      framework: tool,
      seqLen: `${isl}/${osl ?? '?'}`,
      throughputPerGpu: outputRate / gpuCount,
      ttftP50Ms: ttft,
      tpotP50Ms: tpot,
      p99LatencyMs: p99,
      requestRate: agg.throughput?.request_rate?.mean ?? 0,
      powerPerGpuKw: hwSpecs.powerKw,
      tcoPerGpuHr: hwSpecs.costPerHr,
    }
  }).filter((p): p is ParetoPoint => p !== null)
}

/** Compute Pareto-optimal frontier from a set of points (maximizing throughput, minimizing TTFT). */
export function computeParetoFrontier(points: ParetoPoint[]): ParetoPoint[] {
  // Sort by throughput ascending
  const sorted = [...points].sort((a, b) => a.throughputPerGpu - b.throughputPerGpu)
  const frontier: ParetoPoint[] = []
  let minTtft = Infinity

  // Sweep from highest throughput to lowest, keeping points with lower TTFT
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i].ttftP50Ms < minTtft) {
      minTtft = sorted[i].ttftP50Ms
      frontier.push(sorted[i])
    }
  }
  return frontier.reverse()
}

/** Generate leaderboard rows from reports. */
export function generateLeaderboardRows(reports: BenchmarkReport[]): LeaderboardRow[] {
  const points = extractParetoPoints(reports)

  // Build uid→report lookup (extractParetoPoints filters nulls, so indices don't match)
  const reportByUid = new Map(reports.map(r => [r.run.uid, r]))

  // Compute composite score: normalize each metric to 0-100, weighted average
  const maxThroughput = Math.max(...points.map(p => p.throughputPerGpu), 1)
  const minTtft = Math.min(...points.map(p => p.ttftP50Ms), 1)
  const minP99 = Math.min(...points.map(p => p.p99LatencyMs), 1)

  const rows: LeaderboardRow[] = points.map((p) => {
    const throughputScore = (p.throughputPerGpu / maxThroughput) * 100
    const ttftScore = (minTtft / p.ttftP50Ms) * 100
    const p99Score = (minP99 / p.p99LatencyMs) * 100
    const score = throughputScore * 0.4 + ttftScore * 0.35 + p99Score * 0.25

    // Compute llm-d advantage vs standalone for same hardware + model
    let advantage: number | null = null
    if (p.config !== 'standalone') {
      const baseline = points.find(
        pp => pp.hardware === p.hardware && pp.model === p.model && pp.config === 'standalone'
      )
      if (baseline) {
        advantage = Math.round(((p.throughputPerGpu / baseline.throughputPerGpu) - 1) * 100)
      }
    }

    const hw = p.hardware.replace('NVIDIA-', '').replace('-SXM4-80GB', '').replace('-80GB-HBM3', '').replace('-141GB', '')

    return {
      rank: 0,
      hardware: hw,
      model: p.model.split('/').pop() ?? p.model,
      config: p.config,
      framework: p.framework,
      throughputPerGpu: Math.round(p.throughputPerGpu),
      ttftP50Ms: Math.round(p.ttftP50Ms * 100) / 100,
      tpotP50Ms: Math.round(p.tpotP50Ms * 100) / 100,
      p99LatencyMs: Math.round(p.p99LatencyMs),
      score: Math.round(score * 10) / 10,
      llmdAdvantage: advantage,
      report: reportByUid.get(p.uid) ?? reports[0],
    }
  })

  // Sort by score descending and assign ranks
  rows.sort((a, b) => b.score - a.score)
  rows.forEach((r, i) => { r.rank = i + 1 })

  return rows
}

/** Get hardware short name for display. */
export function getHardwareShort(model: string): string {
  return model.replace('NVIDIA-', '').replace('-SXM4-80GB', '').replace('-80GB-HBM3', '').replace('-141GB', '')
}

/** Get model short name for display. */
export function getModelShort(name: string): string {
  return name.split('/').pop() ?? name
}

/** Color palette for hardware types. */
export const HARDWARE_COLORS: Record<string, string> = {
  'H100': '#3b82f6',
  'H200': '#8b5cf6',
  'A100': '#f59e0b',
  'L40S': '#10b981',
}

/** Color palette for config types. */
export const CONFIG_COLORS: Record<string, string> = {
  'standalone': '#f59e0b',
  'scheduling': '#3b82f6',
  'disaggregated': '#10b981',
}
