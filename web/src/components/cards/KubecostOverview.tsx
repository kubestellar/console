import { TrendingDown, AlertTriangle, ExternalLink, AlertCircle, PieChart, ChevronRight } from 'lucide-react'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { useReportCardDataState } from './CardDataContext'

interface KubecostOverviewProps {
  config?: {
    endpoint?: string
  }
}

// Demo data for Kubecost integration
const DEMO_COST_SUMMARY = {
  totalMonthly: 12450,
  cpuCost: 5200,
  memoryCost: 3100,
  storageCost: 1850,
  networkCost: 890,
  gpuCost: 1410,
  efficiency: 72,
  savings: 2340,
}

const DEMO_COST_TRENDS = [
  { label: 'CPU', value: DEMO_COST_SUMMARY.cpuCost, color: 'bg-blue-500', percent: 42 },
  { label: 'Memory', value: DEMO_COST_SUMMARY.memoryCost, color: 'bg-green-500', percent: 25 },
  { label: 'Storage', value: DEMO_COST_SUMMARY.storageCost, color: 'bg-purple-500', percent: 15 },
  { label: 'GPU', value: DEMO_COST_SUMMARY.gpuCost, color: 'bg-amber-500', percent: 11 },
  { label: 'Network', value: DEMO_COST_SUMMARY.networkCost, color: 'bg-cyan-500', percent: 7 },
]

const DEMO_RECOMMENDATIONS = [
  { type: 'rightsize', description: 'Rightsize 12 over-provisioned workloads', savings: 890 },
  { type: 'idle', description: 'Remove 3 idle workloads', savings: 450 },
  { type: 'spot', description: 'Use spot instances for batch jobs', savings: 1000 },
]

export function KubecostOverview({ config: _config }: KubecostOverviewProps) {
  const { drillToCost } = useDrillDownActions()
  useReportCardDataState({ hasData: true, isFailed: false, consecutiveFailures: 0 })

  return (
    <div className="h-full flex flex-col min-h-card content-loaded">
      {/* Controls */}
      <div className="flex items-center justify-end gap-1 mb-3">
        <a
          href="https://www.kubecost.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="p-1 hover:bg-secondary rounded transition-colors text-muted-foreground hover:text-purple-400"
          title="Kubecost Website"
        >
          <ExternalLink className="w-4 h-4" />
        </a>
      </div>

      {/* Integration notice */}
      <div className="flex items-start gap-2 p-2 mb-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs">
        <AlertCircle className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-emerald-400 font-medium">Kubecost Integration</p>
          <p className="text-muted-foreground">
            Install Kubecost for detailed cost allocation and optimization recommendations.{' '}
            <a href="https://docs.kubecost.com/install-and-configure/install/first-time-user-guide" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:underline">
              Install guide →
            </a>
          </p>
        </div>
      </div>

      {/* Cost overview */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="p-3 rounded-lg bg-gradient-to-r from-emerald-500/20 to-green-500/20 border border-emerald-500/30">
          <p className="text-xs text-emerald-400 mb-1">Monthly Cost</p>
          <p className="text-xl font-bold text-foreground">${DEMO_COST_SUMMARY.totalMonthly.toLocaleString()}</p>
        </div>
        <div className="p-3 rounded-lg bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-500/30">
          <div className="flex items-center gap-1 mb-1">
            <p className="text-xs text-purple-400">Efficiency</p>
            <PieChart className="w-3 h-3 text-purple-400" />
          </div>
          <p className="text-xl font-bold text-foreground">{DEMO_COST_SUMMARY.efficiency}%</p>
        </div>
      </div>

      {/* Cost breakdown */}
      <div className="mb-3">
        <p className="text-xs text-muted-foreground font-medium mb-2">Cost Breakdown</p>
        <div className="h-3 rounded-full overflow-hidden flex">
          {DEMO_COST_TRENDS.map(trend => (
            <div
              key={trend.label}
              className={`${trend.color} first:rounded-l-full last:rounded-r-full`}
              style={{ width: `${trend.percent}%` }}
              title={`${trend.label}: $${trend.value}`}
            />
          ))}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
          {DEMO_COST_TRENDS.map(trend => (
            <div key={trend.label} className="flex items-center gap-1 text-[10px]">
              <div className={`w-2 h-2 rounded-full ${trend.color}`} />
              <span className="text-muted-foreground">{trend.label}: ${trend.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Savings recommendations */}
      <div className="flex-1 overflow-y-auto">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-muted-foreground font-medium">Savings Recommendations</p>
          <span className="flex items-center gap-1 text-xs text-green-400">
            <TrendingDown className="w-3 h-3" />
            ${DEMO_COST_SUMMARY.savings}/mo potential
          </span>
        </div>
        <div className="space-y-2">
          {DEMO_RECOMMENDATIONS.map((rec, i) => (
            <div
              key={i}
              onClick={() => drillToCost('all', {
                type: rec.type,
                description: rec.description,
                potentialSavings: rec.savings,
                source: 'kubecost',
              })}
              className="p-2 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors cursor-pointer group"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-xs text-foreground group-hover:text-emerald-400">{rec.description}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-green-400 font-medium">-${rec.savings}</span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="mt-3 pt-2 border-t border-border/50 flex items-center justify-between text-xs text-muted-foreground">
        <span>Powered by Kubecost</span>
        <a
          href="https://docs.kubecost.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-purple-400 hover:text-purple-300 transition-colors"
        >
          <span>Docs</span>
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </div>
  )
}
