/**
 * ResourceUtilization — GPU resource utilization during benchmark runs
 *
 * Three sub-charts (memory, compute, power) comparing standalone vs llm-d.
 * Includes efficiency metric (throughput/watt).
 */
import { useState, useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { Cpu, Zap, HardDrive } from 'lucide-react'
import { useReportCardDataState } from '../CardDataContext'
import {
  generateBenchmarkReports,
  getHardwareShort,
  getModelShort,
  CONFIG_COLORS,
  type BenchmarkReport,
} from '../../../lib/llmd/benchmarkMockData'

type ViewMode = 'overview' | 'efficiency'

interface GpuEntry {
  hardware: string
  config: string
  label: string
  gpuUtil: number
  gpuMem: number
  gpuPower: number
  throughput: number
  throughputPerWatt: number
}

function extractGpuData(report: BenchmarkReport): { util: number; mem: number; power: number } {
  const metrics = report.results.observability?.metrics ?? []
  const util = metrics.find(m => m.name.includes('gpu_util'))?.samples?.[0]?.value ?? 0
  const mem = metrics.find(m => m.name.includes('gpu_mem'))?.samples?.[0]?.value ?? 0
  const power = metrics.find(m => m.name.includes('gpu_power'))?.samples?.[0]?.value ?? 0
  return { util, mem, power }
}

function MiniBar({ label, items, dataKey, unit, icon: Icon, color }: {
  label: string
  items: GpuEntry[]
  dataKey: keyof GpuEntry
  unit: string
  icon: typeof Cpu
  color: string
}) {
  return (
    <div className="flex-1 flex flex-col">
      <div className="flex items-center gap-1.5 mb-2">
        <Icon size={12} style={{ color }} />
        <span className="text-[10px] text-slate-400 uppercase tracking-wider font-medium">{label}</span>
      </div>
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={items} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
            <XAxis dataKey="label" stroke="#71717a" fontSize={8} angle={-30} textAnchor="end" height={40} />
            <YAxis stroke="#71717a" fontSize={9} width={35} />
            <Tooltip
              contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', fontSize: '11px' }}
              formatter={(value: number | undefined) => [`${(value ?? 0).toFixed(1)} ${unit}`, label]}
              labelStyle={{ color: '#e5e5e5' }}
            />
            <Bar dataKey={dataKey as string} radius={[3, 3, 0, 0]} barSize={16}>
              {items.map((entry, i) => (
                <Cell key={i} fill={CONFIG_COLORS[entry.config] ?? '#6b7280'} fillOpacity={0.85} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

export function ResourceUtilization() {
  useReportCardDataState({ isDemoData: true, isFailed: false, consecutiveFailures: 0, hasData: true })

  const [view, setView] = useState<ViewMode>('overview')
  const entries = useMemo(() => {
    const reports = generateBenchmarkReports()

    const items: GpuEntry[] = []
    const seen = new Set<string>()

    for (const r of reports) {
      const engine = r.scenario.stack.find(c => c.standardized.kind === 'inference_engine')
      const hw = getHardwareShort(engine?.standardized.accelerator?.model ?? '')
      const model = getModelShort(engine?.standardized.model?.name ?? '')
      const config = r.scenario.stack.some(c => c.standardized.role === 'prefill')
        ? 'disaggregated'
        : engine?.standardized.tool === 'llm-d' ? 'llm-d' : 'standalone'

      const key = `${hw}-${model}-${config}`
      if (seen.has(key)) continue
      seen.add(key)

      const gpu = extractGpuData(r)
      const throughput = r.results.request_performance.aggregate.throughput.output_token_rate?.mean ?? 0

      items.push({
        hardware: hw,
        config,
        label: `${hw}\n${config}`,
        gpuUtil: gpu.util,
        gpuMem: gpu.mem,
        gpuPower: gpu.power,
        throughput,
        throughputPerWatt: gpu.power > 0 ? throughput / gpu.power : 0,
      })
    }

    return items
  }, [])

  return (
    <div className="p-4 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-white">GPU Resource Utilization</span>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 bg-slate-800/80 rounded-lg p-0.5">
            <button
              onClick={() => setView('overview')}
              className={`px-2 py-0.5 text-xs rounded font-medium transition-colors ${
                view === 'overview' ? 'bg-blue-500/20 text-blue-400' : 'text-slate-400 hover:text-white'
              }`}
            >
              Resources
            </button>
            <button
              onClick={() => setView('efficiency')}
              className={`px-2 py-0.5 text-xs rounded font-medium transition-colors ${
                view === 'efficiency' ? 'bg-blue-500/20 text-blue-400' : 'text-slate-400 hover:text-white'
              }`}
            >
              Efficiency
            </button>
          </div>
        </div>
      </div>

      {view === 'overview' ? (
        /* Three sub-charts side by side */
        <div className="flex-1 min-h-0 grid grid-cols-3 gap-4">
          <MiniBar
            label="Compute Util"
            items={entries}
            dataKey="gpuUtil"
            unit="%"
            icon={Cpu}
            color="#3b82f6"
          />
          <MiniBar
            label="Memory Util"
            items={entries}
            dataKey="gpuMem"
            unit="%"
            icon={HardDrive}
            color="#8b5cf6"
          />
          <MiniBar
            label="Power Draw"
            items={entries}
            dataKey="gpuPower"
            unit="W"
            icon={Zap}
            color="#f59e0b"
          />
        </div>
      ) : (
        /* Efficiency view: throughput/watt comparison */
        <div className="flex-1 min-h-0">
          <div className="flex items-center gap-1.5 mb-2">
            <Zap size={12} className="text-emerald-400" />
            <span className="text-[10px] text-slate-400 uppercase tracking-wider font-medium">
              Throughput per Watt (tok/s/W)
            </span>
          </div>
          <div className="flex-1 min-h-0" style={{ height: 'calc(100% - 24px)' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={entries} layout="vertical" margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                <XAxis type="number" stroke="#71717a" fontSize={10} />
                <YAxis
                  type="category"
                  dataKey="label"
                  stroke="#71717a"
                  fontSize={9}
                  width={90}
                  tick={{ fill: '#a1a1aa' }}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', fontSize: '11px' }}
                  formatter={(value: number | undefined) => [`${(value ?? 0).toFixed(2)} tok/s/W`, 'Efficiency']}
                  labelStyle={{ color: '#e5e5e5' }}
                />
                <Bar dataKey="throughputPerWatt" radius={[0, 3, 3, 0]} barSize={14}>
                  {entries.map((entry, i) => (
                    <Cell key={i} fill={CONFIG_COLORS[entry.config] ?? '#6b7280'} fillOpacity={0.85} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 mt-2 text-[10px]">
        {Object.entries(CONFIG_COLORS).map(([cfg, color]) => (
          <div key={cfg} className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded" style={{ backgroundColor: color }} />
            <span className="text-slate-400">{cfg}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default ResourceUtilization
