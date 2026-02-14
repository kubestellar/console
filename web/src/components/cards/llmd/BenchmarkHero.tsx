/**
 * BenchmarkHero — Headline summary of latest benchmark results
 *
 * Shows model, hardware, framework, date, hero metrics (throughput, TTFT,
 * TPOT, request latency), delta indicators vs previous run, and a bottom
 * strip with total requests, failure rate, GPU util, and power draw.
 */
import { useMemo, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Zap, Clock, Activity, Cpu, TrendingUp, TrendingDown, ArrowRight, CalendarDays } from 'lucide-react'
import { useReportCardDataState } from '../CardDataContext'
import { useCachedBenchmarkReports, resetBenchmarkStream } from '../../../hooks/useBenchmarkData'
import {
  generateBenchmarkReports,
  getHardwareShort,
  getModelShort,
  CONFIG_COLORS,
} from '../../../lib/llmd/benchmarkMockData'
import { useTranslation } from 'react-i18next'

const TIME_RANGE_OPTIONS = [
  { value: '30d', label: '30 days' },
  { value: '60d', label: '60 days' },
  { value: '90d', label: '90 days' },
  { value: '120d', label: '120 days' },
  { value: '0', label: 'All time' },
]

function fmtNum(n: number, decimals = 0): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return n.toFixed(decimals)
}

function Delta({ value, invert = false }: { value: number; invert?: boolean }) {
  const positive = invert ? value < 0 : value > 0
  const color = positive ? 'text-emerald-400' : 'text-red-400'
  const Icon = positive ? TrendingUp : TrendingDown
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-medium ${color}`}>
      <Icon size={11} />
      {Math.abs(value).toFixed(1)}%
    </span>
  )
}

function HeroMetric({
  label,
  value,
  unit,
  delta,
  color,
  icon: Icon,
  invertDelta = false,
  delay = 0,
}: {
  label: string
  value: string
  unit: string
  delta: number
  color: string
  icon: typeof Zap
  invertDelta?: boolean
  delay?: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}
      className="flex-1 bg-slate-800/60 border border-slate-700/50 rounded-xl p-4 relative overflow-hidden group"
    >
      <div
        className="absolute inset-0 opacity-[0.04] group-hover:opacity-[0.08] transition-opacity"
        style={{ background: `radial-gradient(ellipse at 50% 0%, ${color}, transparent 70%)` }}
      />
      <div className="relative">
        <div className="flex items-center gap-1.5 mb-2">
          <Icon size={13} style={{ color }} />
          <span className="text-[11px] text-slate-400 uppercase tracking-wider font-medium">{label}</span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-2xl font-bold text-white tracking-tight">{value}</span>
          <span className="text-xs text-slate-400">{unit}</span>
        </div>
        <div className="mt-1.5">
          <Delta value={delta} invert={invertDelta} />
        </div>
      </div>
    </motion.div>
  )
}

export function BenchmarkHero() {
  const { t: _t } = useTranslation()
  const { data: liveReports, isDemoFallback, isFailed, consecutiveFailures, isLoading, isRefreshing, currentSince } = useCachedBenchmarkReports()
  const effectiveReports = useMemo(() => isDemoFallback ? generateBenchmarkReports() : (liveReports ?? []), [isDemoFallback, liveReports])
  useReportCardDataState({ isDemoData: isDemoFallback, isFailed, consecutiveFailures, isLoading, isRefreshing, hasData: effectiveReports.length > 0 })

  const [customDays, setCustomDays] = useState('')
  const [showCustom, setShowCustom] = useState(false)

  const handleTimeRangeChange = useCallback((value: string) => {
    if (value === 'custom') {
      setShowCustom(true)
      return
    }
    setShowCustom(false)
    resetBenchmarkStream(value)
  }, [])

  const handleCustomSubmit = useCallback(() => {
    const days = parseInt(customDays, 10)
    if (days > 0) {
      setShowCustom(false)
      resetBenchmarkStream(`${days}d`)
    }
  }, [customDays])

  const { latest, prev, engine, gpuMetrics } = useMemo(() => {
    const reports = effectiveReports
    if (reports.length === 0) return { latest: null, prev: null, engine: null, gpuMetrics: [] }

    // Pick the best llm-d disaggregated result as "latest"
    const llmdReports = reports.filter(r =>
      r.scenario.stack.some(c => c.standardized.role === 'prefill')
    )
    const best = llmdReports.sort((a, b) => {
      const ta = a.results.request_performance.aggregate.throughput.output_token_rate?.mean ?? 0
      const tb = b.results.request_performance.aggregate.throughput.output_token_rate?.mean ?? 0
      return tb - ta
    })[0] ?? reports[0]

    if (!best) return { latest: null, prev: null, engine: null, gpuMetrics: [] }

    // Find a standalone baseline as "previous"
    const eng = best.scenario.stack.find(c => c.standardized.kind === 'inference_engine')
    const baseline = reports.find(r => {
      const e = r.scenario.stack.find(c => c.standardized.kind === 'inference_engine')
      return e?.standardized.model?.name === eng?.standardized.model?.name
        && e?.standardized.accelerator?.model === eng?.standardized.accelerator?.model
        && e?.standardized.tool === 'vllm'
    })

    const gpuM = best.results.observability?.metrics ?? []
    return { latest: best, prev: baseline, engine: eng, gpuMetrics: gpuM }
  }, [effectiveReports])

  if (!latest) return <div className="p-5 h-full flex items-center justify-center text-slate-400 text-sm">No benchmark data available</div>

  const agg = latest.results.request_performance.aggregate
  const prevAgg = prev?.results.request_performance.aggregate

  const throughput = agg.throughput.output_token_rate?.mean ?? 0
  const prevThroughput = prevAgg?.throughput.output_token_rate?.mean ?? 1
  const ttft = (agg.latency.time_to_first_token?.p50 ?? 0) * 1000
  const prevTtft = (prevAgg?.latency.time_to_first_token?.p50 ?? 1) * 1000
  const tpot = (agg.latency.time_per_output_token?.p50 ?? 0) * 1000
  const prevTpot = (prevAgg?.latency.time_per_output_token?.p50 ?? 1) * 1000
  const reqLat = (agg.latency.request_latency?.p50 ?? 0) * 1000
  const prevReqLat = (prevAgg?.latency.request_latency?.p50 ?? 1) * 1000

  const hw = getHardwareShort(engine?.standardized.accelerator?.model ?? '')
  const model = getModelShort(engine?.standardized.model?.name ?? '')
  const roles = latest.scenario.stack.map(c => c.standardized.role).filter(Boolean)
  const eid = latest.run.eid ?? ''
  const roleStrings = roles as string[]
  const hasPrefill = roleStrings.includes('prefill')
  const hasReplica = roleStrings.includes('replica')
  const config = hasReplica || eid.includes('standalone')
    ? 'standalone'
    : hasPrefill || eid.includes('modelservice')
      ? 'disaggregated'
      : 'scheduling'

  const gpuUtil = gpuMetrics.find(m => m.name.includes('gpu_util'))?.samples?.[0]?.value ?? 0
  const gpuPower = gpuMetrics.find(m => m.name.includes('gpu_power'))?.samples?.[0]?.value ?? 0

  return (
    <div className="p-5 h-full flex flex-col gap-4">
      {/* Top row: Run info + time range filter */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="p-2 rounded-xl"
            style={{ background: `${CONFIG_COLORS[config]}20` }}
          >
            <Zap size={20} style={{ color: CONFIG_COLORS[config] }} />
          </motion.div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-white font-semibold text-lg">{model}</span>
              <ArrowRight size={14} className="text-slate-500" />
              <span className="text-slate-300 font-medium">{hw}</span>
              <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                style={{ background: `${CONFIG_COLORS[config]}20`, color: CONFIG_COLORS[config] }}>
                {config}
              </span>
            </div>
            <div className="text-xs text-slate-400 mt-0.5">
              {engine?.standardized.tool} {engine?.standardized.tool_version?.split(':').pop()} &middot;{' '}
              {new Date(latest.run.time.start).toLocaleDateString()} &middot;{' '}
              {latest.run.time.duration.replace('PT', '').replace('S', 's')}
            </div>
          </div>
        </div>
        {/* Time range filter */}
        <div className="flex items-center gap-2">
          <CalendarDays size={13} className="text-slate-500" />
          <select
            value={TIME_RANGE_OPTIONS.some(o => o.value === currentSince) ? currentSince : 'custom'}
            onChange={e => handleTimeRangeChange(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white appearance-none cursor-pointer hover:border-slate-600 transition-colors"
          >
            {TIME_RANGE_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
            <option value="custom">Custom...</option>
          </select>
          {showCustom && (
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={1}
                max={365}
                placeholder="days"
                value={customDays}
                onChange={e => setCustomDays(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCustomSubmit()}
                className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white w-16"
                autoFocus
              />
              <button
                onClick={handleCustomSubmit}
                className="px-2 py-1 bg-blue-500/20 text-blue-400 rounded text-xs hover:bg-blue-500/30 transition-colors"
              >
                Go
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Hero metrics row */}
      <div className="grid grid-cols-4 gap-3 flex-1">
        <HeroMetric
          label="Output Throughput"
          value={fmtNum(throughput)}
          unit="tok/s"
          delta={((throughput / prevThroughput) - 1) * 100}
          color="#3b82f6"
          icon={Zap}
          delay={0.1}
        />
        <HeroMetric
          label="TTFT (p50)"
          value={fmtNum(ttft, 1)}
          unit="ms"
          delta={((ttft / prevTtft) - 1) * 100}
          color="#f59e0b"
          icon={Clock}
          invertDelta
          delay={0.2}
        />
        <HeroMetric
          label="TPOT (p50)"
          value={fmtNum(tpot, 2)}
          unit="ms/tok"
          delta={((tpot / prevTpot) - 1) * 100}
          color="#8b5cf6"
          icon={Activity}
          invertDelta
          delay={0.3}
        />
        <HeroMetric
          label="Req Latency (p50)"
          value={fmtNum(reqLat, 0)}
          unit="ms"
          delta={((reqLat / prevReqLat) - 1) * 100}
          color="#10b981"
          icon={Clock}
          invertDelta
          delay={0.4}
        />
      </div>

      {/* Bottom strip */}
      <div className="flex items-center gap-6 px-1 text-xs text-slate-400">
        <div className="flex items-center gap-1.5">
          <span className="text-slate-500">Requests:</span>
          <span className="text-white font-mono">{agg.requests.total.toLocaleString()}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-slate-500">Failures:</span>
          <span className={`font-mono ${agg.requests.failures > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
            {agg.requests.failures === 0 ? '0' : agg.requests.failures}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Cpu size={11} className="text-slate-500" />
          <span className="text-slate-500">GPU Util:</span>
          <span className="text-white font-mono">{gpuUtil.toFixed(0)}%</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Zap size={11} className="text-slate-500" />
          <span className="text-slate-500">Power:</span>
          <span className="text-white font-mono">{gpuPower.toFixed(0)}W</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-slate-500">GPUs:</span>
          <span className="text-white font-mono">{engine?.standardized.accelerator?.count ?? 1}x {hw}</span>
        </div>
      </div>
    </div>
  )
}

export default BenchmarkHero
