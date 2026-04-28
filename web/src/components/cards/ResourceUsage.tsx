import { useMemo, memo } from 'react'
import { Gauge } from '../charts'
import { Cpu, MemoryStick, Server } from 'lucide-react'
import { useClusters } from '../../hooks/useMCP'
import { useCachedGPUNodes } from '../../hooks/useCachedData'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { CardClusterFilter } from '../../lib/cards/CardComponents'
import { useChartFilters } from '../../lib/cards/cardHooks'
import { RefreshIndicator } from '../ui/RefreshIndicator'
import { useCardLoadingState } from './CardDataContext'
import { DynamicCardErrorBoundary } from './DynamicCardErrorBoundary'
import { Skeleton } from '../ui/Skeleton'
import { useTranslation } from 'react-i18next'
import { useDemoMode } from '../../hooks/useDemoMode'

// #6216: wrapped at the bottom of the file in DynamicCardErrorBoundary so
// a runtime error in the 252-line component doesn't crash the dashboard.
function ResourceUsageInternal() {
  const { t } = useTranslation(['cards', 'common'])
  // #6217: destructure lastRefresh so the card can render a freshness
  // indicator instead of leaving users guessing how stale the data is.
  // #6271: useClusters returns Date|null; normalize to numeric epoch.
  const { isLoading: clustersLoading, isRefreshing: clustersRefreshing, lastRefresh: clustersLastRefreshDate, isFailed, consecutiveFailures } = useClusters()
  const clustersLastRefresh: number | null = clustersLastRefreshDate instanceof Date
    ? clustersLastRefreshDate.getTime()
    : (typeof clustersLastRefreshDate === 'number' ? clustersLastRefreshDate : null)
  const { nodes: allGPUNodes, isDemoFallback, isRefreshing: gpuRefreshing, lastRefresh: gpuLastRefresh } = useCachedGPUNodes()
  const { drillToResources } = useDrillDownActions()
  const { isDemoMode } = useDemoMode()

  // Use chart filters hook for cluster filtering
  const {
    localClusterFilter,
    toggleClusterFilter,
    clearClusterFilter,
    availableClusters,
    filteredClusters: clusters,
    showClusterFilter,
    setShowClusterFilter,
    clusterFilterRef } = useChartFilters({ storageKey: 'resource-usage' })

  // Filter GPU nodes to match the currently displayed clusters
  const gpuNodes = (() => {
    const clusterNames = new Set(clusters.map(c => c.name))
    return allGPUNodes.filter(n => clusterNames.has((n.cluster ?? '').split('/')[0]))
  })()

  // Calculate totals from real cluster data.
  // For the "used" numerator we prefer metrics-server actual usage (cpuUsageCores /
  // memoryUsageGB) when it's available for the cluster, and only fall back to
  // requests (cpuRequestsCores / memoryRequestsGB) when the metrics API hasn't
  // reported yet. Previously this card was labeled "Resource Usage" but summed
  // request values — which represents allocation, not usage (issue #6105).
  const totals = useMemo(() => {
    // Sum capacity from all clusters
    const totalCPUs = clusters.reduce((sum, c) => sum + (c.cpuCores || 0), 0)
    const totalMemoryGB = clusters.reduce((sum, c) => sum + (c.memoryGB || 0), 0)

    // Prefer actual usage from metrics-server; fall back to requests per-cluster.
    const usedCPUs = clusters.reduce((sum, c) => {
      const actual = c.cpuUsageCores
      if (typeof actual === 'number' && c.metricsAvailable) return sum + actual
      return sum + (c.cpuRequestsCores || 0)
    }, 0)
    const usedMemoryGB = clusters.reduce((sum, c) => {
      const actual = c.memoryUsageGB
      if (typeof actual === 'number' && c.metricsAvailable) return sum + actual
      return sum + (c.memoryRequestsGB || 0)
    }, 0)

    // Accelerator data by type
    const gpuOnly = gpuNodes.filter(n => !n.acceleratorType || n.acceleratorType === 'GPU')
    const tpuOnly = gpuNodes.filter(n => n.acceleratorType === 'TPU')
    const aiuOnly = gpuNodes.filter(n => n.acceleratorType === 'AIU')
    const xpuOnly = gpuNodes.filter(n => n.acceleratorType === 'XPU')

    const sumAccel = (nodes: typeof gpuNodes) => ({
      total: nodes.reduce((s, n) => s + (n.gpuCount || 0), 0),
      used: nodes.reduce((s, n) => s + (n.gpuAllocated || 0), 0) })

    return {
      cpu: { total: totalCPUs, used: Math.round(usedCPUs) },
      memory: { total: Math.round(totalMemoryGB), used: Math.round(usedMemoryGB) },
      gpu: sumAccel(gpuOnly),
      tpu: sumAccel(tpuOnly),
      aiu: sumAccel(aiuOnly),
      xpu: sumAccel(xpuOnly) }
  }, [clusters, gpuNodes])

  // Open resources drill down showing all clusters
  const handleDrillDown = () => {
    drillToResources()
  }

  // Report state to CardWrapper for refresh animation
  const hasData = clusters.length > 0
  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: clustersLoading && !hasData,
    isRefreshing: clustersRefreshing || gpuRefreshing,
    hasAnyData: hasData,
    isDemoData: isDemoMode || isDemoFallback,
    isFailed,
    consecutiveFailures })

  if (showSkeleton) {
    return (
      <div className="h-full flex flex-col min-h-[200px]">
        <div className="flex flex-wrap items-center justify-between gap-y-2 mb-4">
          <Skeleton variant="text" width={80} height={16} />
          <Skeleton variant="rounded" width={60} height={24} />
        </div>
        <div className="flex-1 flex items-center justify-around">
          <div className="flex flex-col items-center">
            <Skeleton variant="circular" width={80} height={80} />
            <Skeleton variant="text" width={40} height={16} className="mt-2" />
          </div>
          <div className="flex flex-col items-center">
            <Skeleton variant="circular" width={80} height={80} />
            <Skeleton variant="text" width={50} height={16} className="mt-2" />
          </div>
        </div>
        <div className="mt-4 pt-3 border-t border-border/50 grid grid-cols-2 gap-2">
          <Skeleton variant="rounded" height={40} />
          <Skeleton variant="rounded" height={40} />
        </div>
      </div>
    )
  }

  if (showEmptyState) {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground">
        <p className="text-sm">{t('resourceUsage.noClusters')}</p>
        <p className="text-xs mt-1">{t('resourceUsage.noClustersHint')}</p>
      </div>
    )
  }

  const cpuPercent = totals.cpu.total > 0 ? Math.round((totals.cpu.used / totals.cpu.total) * 100) : 0
  const memoryPercent = totals.memory.total > 0 ? Math.round((totals.memory.used / totals.memory.total) * 100) : 0
  const gpuPercent = totals.gpu.total > 0 ? Math.round((totals.gpu.used / totals.gpu.total) * 100) : 0
  const tpuPercent = totals.tpu.total > 0 ? Math.round((totals.tpu.used / totals.tpu.total) * 100) : 0
  const aiuPercent = totals.aiu.total > 0 ? Math.round((totals.aiu.used / totals.aiu.total) * 100) : 0
  const xpuPercent = totals.xpu.total > 0 ? Math.round((totals.xpu.used / totals.xpu.total) * 100) : 0

  // Collect active accelerator types for dynamic layout
  const accelerators = [
    totals.gpu.total > 0 ? { key: 'gpu', label: 'GPU', percent: gpuPercent, color: 'text-purple-400', data: totals.gpu } : null,
    totals.tpu.total > 0 ? { key: 'tpu', label: 'TPU', percent: tpuPercent, color: 'text-green-400', data: totals.tpu } : null,
    totals.aiu.total > 0 ? { key: 'aiu', label: 'AIU', percent: aiuPercent, color: 'text-cyan-400', data: totals.aiu } : null,
    totals.xpu.total > 0 ? { key: 'xpu', label: 'XPU', percent: xpuPercent, color: 'text-orange-400', data: totals.xpu } : null,
  ].filter(Boolean) as { key: string; label: string; percent: number; color: string; data: { total: number; used: number } }[]

  // Grid columns for footer: CPU + Memory + each accelerator
  const footerCols = 2 + accelerators.length

  return (
    <div className="h-full flex flex-col">
      {/* Controls - single row: Cluster count → Cluster Filter → Refresh */}
      <div className="flex flex-wrap items-center justify-between gap-y-2 mb-4">
        <div className="flex items-center gap-2">
          {localClusterFilter.length > 0 && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground bg-secondary/50 px-1.5 py-0.5 rounded">
              <Server className="w-3 h-3" />
              {clusters.length}/{availableClusters.length}
            </span>
          )}
          {localClusterFilter.length === 0 && (
            <span className="text-xs text-muted-foreground">
              {t('common:common.nClusters', { count: clusters.length })}
            </span>
          )}
          {/* #6217: freshness indicator. #6244: use the OLDER of cluster
              and GPU timestamps so the indicator reflects the staler source.
              #6273: hide the timestamp in demo mode — useCache preserves
              lastRefresh from prior live sessions, which would show
              "Updated X ago" against demo data. */}
          <RefreshIndicator
            isRefreshing={clustersRefreshing || gpuRefreshing}
            lastUpdated={(() => {
              if (isDemoMode || isDemoFallback) return null
              const cl = typeof clustersLastRefresh === 'number' ? clustersLastRefresh : null
              const gp = typeof gpuLastRefresh === 'number' ? gpuLastRefresh : null
              if (cl !== null && gp !== null) return new Date(Math.min(cl, gp))
              if (cl !== null) return new Date(cl)
              if (gp !== null) return new Date(gp)
              return null
            })()}
            size="sm"
            showLabel={true}
            staleThresholdMinutes={5}
          />
        </div>

        <div className="flex items-center gap-2">
          {/* Cluster Filter */}
          <CardClusterFilter
            availableClusters={availableClusters}
            selectedClusters={localClusterFilter}
            onToggle={toggleClusterFilter}
            onClear={clearClusterFilter}
            isOpen={showClusterFilter}
            setIsOpen={setShowClusterFilter}
            containerRef={clusterFilterRef}
            minClusters={1}
          />

        </div>
      </div>

      <div
        role="button"
        tabIndex={0}
        className="flex-1 flex items-center justify-around cursor-pointer hover:opacity-80 transition-opacity flex-wrap gap-2 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-400"
        aria-label={t('cards:resourceUsage.viewDetailsAria')}
        onClick={handleDrillDown}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            handleDrillDown()
          }
        }}
      >
        <div className="flex flex-col items-center">
          <Gauge
            value={cpuPercent}
            max={100}
            size="md"
            thresholds={{ warning: 70, critical: 90 }}
          />
          <div className="flex items-center gap-1.5 mt-2">
            <Cpu className="w-4 h-4 text-blue-400" />
            <span className="text-sm text-muted-foreground">{t('common:common.cpu')}</span>
          </div>
        </div>

        <div className="flex flex-col items-center">
          <Gauge
            value={memoryPercent}
            max={100}
            size="md"
            thresholds={{ warning: 75, critical: 90 }}
          />
          <div className="flex items-center gap-1.5 mt-2">
            <MemoryStick className="w-4 h-4 text-yellow-400" />
            <span className="text-sm text-muted-foreground">{t('common:common.memory')}</span>
          </div>
        </div>

        {accelerators.map(accel => (
          <div key={accel.key} className="flex flex-col items-center">
            <Gauge
              value={accel.percent}
              max={100}
              size="md"
              thresholds={{ warning: 80, critical: 95 }}
            />
            <div className="flex items-center gap-1.5 mt-2">
              <Cpu className={`w-4 h-4 ${accel.color}`} />
              <span className="text-sm text-muted-foreground">{accel.label}</span>
            </div>
            {accel.percent > 100 && (
              <span className="text-2xs text-red-400 mt-0.5">
                {t('resourceUsage.overcommitted', {
                  used: accel.data.used,
                  total: accel.data.total })}
              </span>
            )}
          </div>
        ))}
      </div>

      <div className={`mt-4 pt-3 border-t border-border/50 grid gap-2 text-center`} style={{ gridTemplateColumns: `repeat(${footerCols}, minmax(0, 1fr))` }}>
        <div>
          <p className="text-xs text-muted-foreground">{t('resourceUsage.totalCPU')}</p>
          <p className="text-sm font-medium text-foreground">{totals.cpu.total} {t('resourceUsage.cores')}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{t('resourceUsage.totalRAM')}</p>
          <p className="text-sm font-medium text-foreground">{totals.memory.total} GB</p>
        </div>
        {accelerators.map(accel => (
          <div key={accel.key}>
            <p className="text-xs text-muted-foreground">{t('resourceUsage.totalLabel', { label: accel.label })}</p>
            <p className="text-sm font-medium text-foreground">
              <span className={accel.color}>{accel.data.used}</span>/{accel.data.total}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

export const ResourceUsage = memo(function ResourceUsage() {
  return (
    <DynamicCardErrorBoundary cardId="ResourceUsage">
      <ResourceUsageInternal />
    </DynamicCardErrorBoundary>
  )
})
