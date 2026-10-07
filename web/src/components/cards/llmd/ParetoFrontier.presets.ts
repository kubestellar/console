/**
 * ParetoFrontier chart presets and shared ECharts types.
 *
 * Each preset defines the X/Y axes, chart title, and optional info pills
 * rendered above the chart.
 */
import { SECONDS_PER_HOUR } from '../../../lib/constants/time'
import { getHardwareShort, type ParetoPoint } from '../../../lib/llmd/benchmarkMockData'

// Minimal parameter type for ECharts label/tooltip formatter callbacks
export interface EChartsFormatterParam {
  data?: { point?: ParetoPoint }
}

// Minimal ECharts series config type covering both scatter/line and frontier series
export interface EChartsSeriesConfig {
  name: string
  type: string
  smooth?: boolean
  symbol?: string
  symbolSize?: number
  data: unknown[]
  lineStyle?: Record<string, unknown>
  itemStyle?: Record<string, unknown>
  label?: Record<string, unknown>
  emphasis?: Record<string, unknown>
  z?: number
  silent?: boolean
}

// ---------------------------------------------------------------------------
// Chart presets — each defines X-axis, Y-axis, title, and optional info pills
// ---------------------------------------------------------------------------

export interface ChartPreset {
  label: string
  title: string
  xAxis: { label: string; unit: string; getValue: (p: ParetoPoint) => number }
  yAxis: {
    label: string
    unit: string
    getValue: (p: ParetoPoint) => number
    formatter?: (v: number) => string
  }
  infoPills?: (points: ParetoPoint[]) => { label: string; items: { hw: string; value: string }[] } | null
}

export const CHART_PRESETS: Record<string, ChartPreset> = {
  throughputVsLatency: {
    label: 'Throughput vs E2E Latency',
    title: 'Token Throughput per GPU vs. End-to-end Latency',
    xAxis: { label: 'End-to-end Latency', unit: 'ms', getValue: (p) => p.ttftP50Ms },
    yAxis: {
      label: 'Token Throughput per GPU',
      unit: 'tok/s/gpu',
      getValue: (p) => p.throughputPerGpu,
      formatter: (v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(Math.round(v)) } },
  throughputVsInteractivity: {
    label: 'Throughput vs Interactivity',
    title: 'Token Throughput per GPU vs. Interactivity',
    xAxis: { label: 'Interactivity', unit: 'tok/s/user', getValue: (p) => p.tpotP50Ms > 0 ? 1000 / p.tpotP50Ms : 0 },
    yAxis: {
      label: 'Token Throughput per GPU',
      unit: 'tok/s/gpu',
      getValue: (p) => p.throughputPerGpu,
      formatter: (v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(Math.round(v)) } },
  throughputPerMw: {
    label: 'Throughput/MW vs Interactivity',
    title: 'Token Throughput per All in Utility MW vs. Interactivity',
    xAxis: { label: 'Interactivity', unit: 'tok/s/user', getValue: (p) => p.tpotP50Ms > 0 ? 1000 / p.tpotP50Ms : 0 },
    yAxis: {
      label: 'Token Throughput per All in Utility MW',
      unit: 'tok/s/MW',
      getValue: (p) => p.powerPerGpuKw > 0 ? p.throughputPerGpu / (p.powerPerGpuKw * 0.001) : 0,
      formatter: (v) => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(Math.round(v)) },
    infoPills: (points) => {
      const hwPower = new Map<string, number>()
      for (const p of points) {
        const hw = getHardwareShort(p.hardware)
        if (!hwPower.has(hw)) hwPower.set(hw, p.powerPerGpuKw)
      }
      return {
        label: 'All in Power/GPU:',
        items: [...hwPower.entries()].map(([hw, kw]) => ({ hw, value: `${kw.toFixed(2)}kW` })) }
    } },
  costPerMTok: {
    label: 'Cost/MTok vs Interactivity',
    title: 'Cost per Million Tokens (Owning) vs. Interactivity',
    xAxis: { label: 'Interactivity', unit: 'tok/s/user', getValue: (p) => p.tpotP50Ms > 0 ? 1000 / p.tpotP50Ms : 0 },
    yAxis: {
      label: 'Cost per Million Tokens',
      unit: '$',
      getValue: (p) => p.throughputPerGpu > 0 ? (p.tcoPerGpuHr / (p.throughputPerGpu * SECONDS_PER_HOUR)) * 1_000_000 : 0,
      formatter: (v) => `$${v.toFixed(2)}` },
    infoPills: (points) => {
      const hwCost = new Map<string, number>()
      for (const p of points) {
        const hw = getHardwareShort(p.hardware)
        if (!hwCost.has(hw)) hwCost.set(hw, p.tcoPerGpuHr)
      }
      return {
        label: 'TCO $/GPU/hr:',
        items: [...hwCost.entries()].map(([hw, cost]) => ({ hw, value: cost.toFixed(2) })) }
    } },
  costVsLatency: {
    label: 'Cost/MTok vs E2E Latency',
    title: 'Cost per Million Tokens vs. End-to-end Latency',
    xAxis: { label: 'End-to-end Latency', unit: 'ms', getValue: (p) => p.ttftP50Ms },
    yAxis: {
      label: 'Cost per Million Tokens',
      unit: '$',
      getValue: (p) => p.throughputPerGpu > 0 ? (p.tcoPerGpuHr / (p.throughputPerGpu * SECONDS_PER_HOUR)) * 1_000_000 : 0,
      formatter: (v) => `$${v.toFixed(2)}` },
    infoPills: (points) => {
      const hwCost = new Map<string, number>()
      for (const p of points) {
        const hw = getHardwareShort(p.hardware)
        if (!hwCost.has(hw)) hwCost.set(hw, p.tcoPerGpuHr)
      }
      return {
        label: 'TCO $/GPU/hr:',
        items: [...hwCost.entries()].map(([hw, cost]) => ({ hw, value: cost.toFixed(2) })) }
    } },
  throughputPerDollar: {
    label: 'Throughput/$ vs Interactivity',
    title: 'Throughput per Dollar vs. Interactivity',
    xAxis: { label: 'Interactivity', unit: 'tok/s/user', getValue: (p) => p.tpotP50Ms > 0 ? 1000 / p.tpotP50Ms : 0 },
    yAxis: {
      label: 'Throughput per Dollar',
      unit: 'tok/s/$',
      getValue: (p) => p.tcoPerGpuHr > 0 ? p.throughputPerGpu / p.tcoPerGpuHr : 0,
      formatter: (v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v)) },
    infoPills: (points) => {
      const hwCost = new Map<string, number>()
      for (const p of points) {
        const hw = getHardwareShort(p.hardware)
        if (!hwCost.has(hw)) hwCost.set(hw, p.tcoPerGpuHr)
      }
      return {
        label: 'TCO $/GPU/hr:',
        items: [...hwCost.entries()].map(([hw, cost]) => ({ hw, value: cost.toFixed(2) })) }
    } },
  p99VsThroughput: {
    label: 'p99 Latency vs Throughput',
    title: 'p99 Latency vs. Token Throughput per GPU',
    xAxis: {
      label: 'Token Throughput per GPU',
      unit: 'tok/s/gpu',
      getValue: (p) => p.throughputPerGpu },
    yAxis: {
      label: 'p99 Latency',
      unit: 'ms',
      getValue: (p) => p.p99LatencyMs,
      formatter: (v) => v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${Math.round(v)}` } },
  tpotVsThroughput: {
    label: 'TPOT vs Throughput',
    title: 'Time per Output Token vs. Token Throughput per GPU',
    xAxis: {
      label: 'Token Throughput per GPU',
      unit: 'tok/s/gpu',
      getValue: (p) => p.throughputPerGpu },
    yAxis: {
      label: 'Time per Output Token (p50)',
      unit: 'ms/tok',
      getValue: (p) => p.tpotP50Ms,
      formatter: (v) => v.toFixed(1) } },
  gpuScaling: {
    label: 'GPU Scaling Efficiency',
    title: 'GPU Scaling: Throughput per GPU vs. GPU Count',
    xAxis: {
      label: 'GPU Count',
      unit: 'GPUs',
      getValue: (p) => p.gpuCount },
    yAxis: {
      label: 'Token Throughput per GPU',
      unit: 'tok/s/gpu',
      getValue: (p) => p.throughputPerGpu,
      formatter: (v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(Math.round(v)) } },
  throughputPerMwVsLatency: {
    label: 'Throughput/MW vs E2E Latency',
    title: 'Token Throughput per MW vs. End-to-end Latency',
    xAxis: { label: 'End-to-end Latency', unit: 'ms', getValue: (p) => p.ttftP50Ms },
    yAxis: {
      label: 'Token Throughput per All in Utility MW',
      unit: 'tok/s/MW',
      getValue: (p) => p.powerPerGpuKw > 0 ? p.throughputPerGpu / (p.powerPerGpuKw * 0.001) : 0,
      formatter: (v) => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(Math.round(v)) },
    infoPills: (points) => {
      const hwPower = new Map<string, number>()
      for (const p of points) {
        const hw = getHardwareShort(p.hardware)
        if (!hwPower.has(hw)) hwPower.set(hw, p.powerPerGpuKw)
      }
      return {
        label: 'All in Power/GPU:',
        items: [...hwPower.entries()].map(([hw, kw]) => ({ hw, value: `${kw.toFixed(2)}kW` })) }
    } } }

export const DEFAULT_CHART_KEY = 'throughputVsLatency'

/** Resolve the initial preset key from a card config chartType (substring match). */
export function resolveInitialChartKey(chartType?: string): string {
  if (!chartType) return DEFAULT_CHART_KEY
  const found = Object.keys(CHART_PRESETS).find(k => chartType.includes(k))
  return found ?? DEFAULT_CHART_KEY
}
