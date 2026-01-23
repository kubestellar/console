import { useState } from 'react'
import { DollarSign, Server, Box, HardDrive, ExternalLink, AlertCircle, ChevronRight } from 'lucide-react'
import { RefreshButton } from '../ui/RefreshIndicator'
import { useDrillDownActions } from '../../hooks/useDrillDown'

interface OpenCostOverviewProps {
  config?: {
    endpoint?: string
  }
}

// Demo data for OpenCost integration
const DEMO_NAMESPACE_COSTS = [
  { namespace: 'production', cpuCost: 2450, memCost: 890, storageCost: 340, totalCost: 3680 },
  { namespace: 'ml-training', cpuCost: 1820, memCost: 1240, storageCost: 890, totalCost: 3950 },
  { namespace: 'monitoring', cpuCost: 450, memCost: 320, storageCost: 120, totalCost: 890 },
  { namespace: 'cert-manager', cpuCost: 85, memCost: 45, storageCost: 10, totalCost: 140 },
  { namespace: 'ingress-nginx', cpuCost: 120, memCost: 80, storageCost: 5, totalCost: 205 },
]

export function OpenCostOverview({ config: _config }: OpenCostOverviewProps) {
  const [isRefreshing, setIsRefreshing] = useState(false)
  const { drillToCost } = useDrillDownActions()

  const totalCost = DEMO_NAMESPACE_COSTS.reduce((sum, ns) => sum + ns.totalCost, 0)
  const maxCost = Math.max(...DEMO_NAMESPACE_COSTS.map(ns => ns.totalCost))

  const handleRefresh = async () => {
    setIsRefreshing(true)
    await new Promise(r => setTimeout(r, 1000))
    setIsRefreshing(false)
  }

  return (
    <div className="h-full flex flex-col min-h-card content-loaded">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-blue-400" />
          <span className="text-sm font-medium text-muted-foreground">OpenCost</span>
        </div>
        <div className="flex items-center gap-1">
          <a
            href="https://www.opencost.io/"
            target="_blank"
            rel="noopener noreferrer"
            className="p-1 hover:bg-secondary rounded transition-colors text-muted-foreground hover:text-purple-400"
            title="OpenCost Documentation"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
          <RefreshButton
            isRefreshing={isRefreshing}
            onRefresh={handleRefresh}
            size="sm"
          />
        </div>
      </div>

      {/* Integration notice */}
      <div className="flex items-start gap-2 p-2 mb-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs">
        <AlertCircle className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-blue-400 font-medium">OpenCost Integration</p>
          <p className="text-muted-foreground">
            Install OpenCost in your cluster to get real cost allocation data.{' '}
            <a href="https://www.opencost.io/docs/installation/install" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:underline">
              Install guide →
            </a>
          </p>
        </div>
      </div>

      {/* Total cost */}
      <div className="p-3 rounded-lg bg-gradient-to-r from-blue-500/20 to-cyan-500/20 border border-blue-500/30 mb-3">
        <p className="text-xs text-blue-400 mb-1">Monthly Cost (Demo)</p>
        <p className="text-xl font-bold text-foreground">${totalCost.toLocaleString()}</p>
      </div>

      {/* Namespace costs */}
      <div className="flex-1 overflow-y-auto space-y-2">
        <p className="text-xs text-muted-foreground font-medium mb-2">Cost by Namespace</p>
        {DEMO_NAMESPACE_COSTS.map(ns => (
          <div
            key={ns.namespace}
            onClick={() => drillToCost('all', {
              namespace: ns.namespace,
              cpuCost: ns.cpuCost,
              memCost: ns.memCost,
              storageCost: ns.storageCost,
              totalCost: ns.totalCost,
              source: 'opencost',
            })}
            className="p-2 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors cursor-pointer group"
          >
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <Box className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground group-hover:text-blue-400">{ns.namespace}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-blue-400">${ns.totalCost.toLocaleString()}</span>
                <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </div>
            <div className="h-1 bg-secondary rounded-full overflow-hidden mb-1.5">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full"
                style={{ width: `${(ns.totalCost / maxCost) * 100}%` }}
              />
            </div>
            <div className="flex gap-3 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <Server className="w-2.5 h-2.5" />
                CPU: ${ns.cpuCost}
              </span>
              <span className="flex items-center gap-1">
                <HardDrive className="w-2.5 h-2.5" />
                Mem: ${ns.memCost}
              </span>
              <span>Storage: ${ns.storageCost}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="mt-3 pt-2 border-t border-border/50 flex items-center justify-between text-xs text-muted-foreground">
        <span>Powered by OpenCost</span>
        <a
          href="https://www.opencost.io/docs"
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
