import { useState, useMemo } from 'react'
import { Package, ArrowUpCircle, CheckCircle, RefreshCw, ExternalLink } from 'lucide-react'
import { useClusters } from '../../hooks/useMCP'
import { Skeleton } from '../ui/Skeleton'
import { ClusterBadge } from '../ui/ClusterBadge'

interface ChartVersionsProps {
  config?: {
    cluster?: string
  }
}

interface ChartInfo {
  name: string
  installed: string
  latest: string
  hasUpgrade: boolean
  repository: string
}

export function ChartVersions({ config }: ChartVersionsProps) {
  const { clusters, isLoading, refetch } = useClusters()
  const [selectedCluster, setSelectedCluster] = useState<string>(config?.cluster || '')
  const [showUpgradesOnly, setShowUpgradesOnly] = useState(false)

  // Mock chart version data
  const allCharts: ChartInfo[] = selectedCluster ? [
    { name: 'prometheus', installed: '25.8.0', latest: '25.10.0', hasUpgrade: true, repository: 'prometheus-community' },
    { name: 'grafana', installed: '7.0.8', latest: '7.0.8', hasUpgrade: false, repository: 'grafana' },
    { name: 'ingress-nginx', installed: '4.9.0', latest: '4.9.1', hasUpgrade: true, repository: 'ingress-nginx' },
    { name: 'cert-manager', installed: '1.13.3', latest: '1.14.0', hasUpgrade: true, repository: 'jetstack' },
    { name: 'redis', installed: '18.6.1', latest: '18.6.1', hasUpgrade: false, repository: 'bitnami' },
    { name: 'postgresql', installed: '13.2.24', latest: '14.0.0', hasUpgrade: true, repository: 'bitnami' },
    { name: 'elasticsearch', installed: '8.5.1', latest: '8.5.1', hasUpgrade: false, repository: 'elastic' },
  ] : []

  const charts = useMemo(() => {
    if (!showUpgradesOnly) return allCharts
    return allCharts.filter(c => c.hasUpgrade)
  }, [allCharts, showUpgradesOnly])

  const upgradeCount = allCharts.filter(c => c.hasUpgrade).length

  if (isLoading) {
    return (
      <div className="h-full flex flex-col min-h-card">
        <div className="flex items-center justify-between mb-4">
          <Skeleton variant="text" width={130} height={20} />
          <Skeleton variant="rounded" width={120} height={32} />
        </div>
        <div className="space-y-2">
          <Skeleton variant="rounded" height={50} />
          <Skeleton variant="rounded" height={50} />
          <Skeleton variant="rounded" height={50} />
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-card content-loaded">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Package className="w-4 h-4 text-emerald-400" />
          <span className="text-sm font-medium text-muted-foreground">Chart Versions</span>
          {upgradeCount > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400">
              {upgradeCount} upgrades
            </span>
          )}
        </div>
        <button
          onClick={() => refetch()}
          className="p-1 hover:bg-secondary rounded transition-colors"
        >
          <RefreshCw className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      {/* Cluster selector */}
      <select
        value={selectedCluster}
        onChange={(e) => setSelectedCluster(e.target.value)}
        className="w-full px-3 py-1.5 rounded-lg bg-secondary border border-border text-sm text-white mb-4"
      >
        <option value="">Select cluster...</option>
        {clusters.map(c => (
          <option key={c.name} value={c.name}>{c.name}</option>
        ))}
      </select>

      {!selectedCluster ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          Select a cluster to check chart versions
        </div>
      ) : (
        <>
          {/* Scope and filter */}
          <div className="flex items-center justify-between mb-4">
            <ClusterBadge cluster={selectedCluster} />
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={showUpgradesOnly}
                onChange={(e) => setShowUpgradesOnly(e.target.checked)}
                className="rounded border-border bg-secondary"
              />
              <span>Upgrades only</span>
            </label>
          </div>

          {/* Summary */}
          <div className="flex gap-2 mb-4">
            <div className="flex-1 p-2 rounded-lg bg-emerald-500/10 text-center">
              <span className="text-lg font-bold text-emerald-400">{allCharts.length}</span>
              <p className="text-xs text-muted-foreground">Charts</p>
            </div>
            <div className="flex-1 p-2 rounded-lg bg-cyan-500/10 text-center">
              <span className="text-lg font-bold text-cyan-400">{upgradeCount}</span>
              <p className="text-xs text-muted-foreground">Upgrades</p>
            </div>
            <div className="flex-1 p-2 rounded-lg bg-green-500/10 text-center">
              <span className="text-lg font-bold text-green-400">{allCharts.length - upgradeCount}</span>
              <p className="text-xs text-muted-foreground">Up-to-date</p>
            </div>
          </div>

          {/* Charts list */}
          <div className="flex-1 space-y-2 overflow-y-auto">
            {charts.map((chart, idx) => (
              <div
                key={idx}
                className={`p-3 rounded-lg ${chart.hasUpgrade ? 'bg-cyan-500/10 border border-cyan-500/20' : 'bg-secondary/30'} hover:bg-secondary/50 transition-colors`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    {chart.hasUpgrade ? (
                      <ArrowUpCircle className="w-4 h-4 text-cyan-400" />
                    ) : (
                      <CheckCircle className="w-4 h-4 text-green-400" />
                    )}
                    <span className="text-sm text-white font-medium">{chart.name}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{chart.repository}</span>
                </div>
                <div className="flex items-center gap-2 ml-6 text-xs">
                  <span className="text-muted-foreground">v{chart.installed}</span>
                  {chart.hasUpgrade && (
                    <>
                      <span className="text-muted-foreground">→</span>
                      <span className="text-cyan-400 font-medium">v{chart.latest}</span>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="mt-4 pt-3 border-t border-border/50 flex items-center justify-between text-xs text-muted-foreground">
            <span>Checked against Artifact Hub</span>
            <a href="#" className="flex items-center gap-1 text-emerald-400 hover:underline">
              <ExternalLink className="w-3 h-3" />
              View all
            </a>
          </div>
        </>
      )}
    </div>
  )
}
