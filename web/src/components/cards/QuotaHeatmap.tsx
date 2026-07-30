import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useCachedPods } from '../../hooks/useCachedData'
import { useCardLoadingState } from './CardDataContext'
import { RefreshIndicator } from '../ui/RefreshIndicator'

const MAX_VISIBLE_NAMESPACES = 60

interface NamespaceUsage {
  namespace: string
  cluster: string
  podCount: number
  /** Hard pod quota from ResourceQuota (undefined = no quota configured) */
  podQuota?: number
}

export function QuotaHeatmap() {
  const { t } = useTranslation('cards')
  const { pods, isLoading, isRefreshing, isDemoFallback, isFailed, consecutiveFailures, lastRefresh: podsLastRefresh } = useCachedPods(undefined, undefined, { limit: 500 })
  const [selectedNs, setSelectedNs] = useState<string | null>(null)

  const hasData = pods.length > 0
  const { showSkeleton } = useCardLoadingState({
    isLoading: isLoading && !hasData,
    isRefreshing,
    hasAnyData: hasData,
    isDemoData: isDemoFallback,
    isFailed,
    consecutiveFailures })

  const namespaceData = useMemo(() => {
    const map = new Map<string, NamespaceUsage>()
    for (const pod of pods) {
      const key = `${pod.cluster || 'unknown'}/${pod.namespace || 'default'}`
      if (!map.has(key)) {
        map.set(key, {
          namespace: pod.namespace || 'default',
          cluster: pod.cluster || 'unknown',
          podCount: 0 })
      }
      map.get(key)!.podCount++
    }
    return Array.from(map.values()).sort((a, b) => b.podCount - a.podCount)
  }, [pods])

  const maxPods = Math.max(1, ...namespaceData.map(d => d.podCount))

  if (showSkeleton) {
    return (
      <div className="grid grid-cols-6 gap-1 p-1">
        {Array.from({ length: 24 }).map((_, i) => (
          <div key={i} className="h-8 rounded bg-muted/50 animate-pulse" />
        ))}
      </div>
    )
  }

  if (namespaceData.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm p-4">
        <div className="text-2xl mb-2">📊</div>
        <div className="font-medium">{t('quotaHeatmap.noNamespaceData')}</div>
        <div className="text-xs mt-1">{t('quotaHeatmap.namespaceUsageHint')}</div>
      </div>
    )
  }

  /** Density thresholds for heat coloring (relative to highest namespace) */
  const HIGH_DENSITY_THRESHOLD = 0.8
  const MEDIUM_DENSITY_THRESHOLD = 0.5
  const LOW_DENSITY_THRESHOLD = 0.2

  const getHeatColor = (ratio: number) => {
    if (ratio > HIGH_DENSITY_THRESHOLD) return 'bg-blue-500/60 text-blue-100'
    if (ratio > MEDIUM_DENSITY_THRESHOLD) return 'bg-blue-500/40 text-blue-200'
    if (ratio > LOW_DENSITY_THRESHOLD) return 'bg-blue-500/20 text-blue-300'
    return 'bg-blue-500/10 text-blue-300'
  }

  return (
    <div className="space-y-2 p-1">
      <div className="flex flex-wrap items-center justify-between gap-y-2 gap-2">
        <div className="text-xs text-muted-foreground">
          {t('quotaHeatmap.summary', { namespaces: namespaceData.length, clusters: new Set(namespaceData.map(d => d.cluster)).size })}
        </div>
        {/* #6217 part 2: freshness indicator. */}
        <RefreshIndicator
          isRefreshing={isRefreshing}
          lastUpdated={typeof podsLastRefresh === 'number' ? new Date(podsLastRefresh) : null}
          size="sm"
          showLabel={true}
          staleThresholdMinutes={5}
        />
      </div>
      <div className="grid grid-cols-2 @md:grid-cols-4 @lg:grid-cols-6 gap-1 max-h-[350px] overflow-y-auto">
        {namespaceData.slice(0, 60).map(ns => {
          const ratio = ns.podCount / maxPods
          const isSelected = selectedNs === `${ns.cluster}/${ns.namespace}`
          return (
            <button
              key={`${ns.cluster}/${ns.namespace}`}
              onClick={() => setSelectedNs(isSelected ? null : `${ns.cluster}/${ns.namespace}`)}
              className={`p-1.5 rounded text-xs transition-all ${getHeatColor(ratio)} ${
                isSelected ? 'ring-2 ring-primary scale-105' : 'hover:scale-105'
              }`}
              title={`${ns.namespace} (${ns.cluster}): ${ns.podCount} pods — relative density ${Math.round((ns.podCount / maxPods) * 100)}%`}
              aria-label={`${ns.namespace} on ${ns.cluster}: ${ns.podCount} pods`}
              aria-pressed={isSelected}
            >
              <div className="truncate font-medium">{ns.namespace}</div>
              <div className="text-2xs opacity-75">{t('quotaHeatmap.podsCount', { count: ns.podCount })}</div>
            </button>
          )
        })}
      </div>
      {selectedNs && (() => {
        const ns = namespaceData.find(d => `${d.cluster}/${d.namespace}` === selectedNs)
        if (!ns) return null
        return (
          <div className="mt-2 p-2 rounded-lg bg-muted/30 text-xs">
            <div className="font-medium">{ns.namespace}</div>
            <div className="text-muted-foreground">{t('quotaHeatmap.cluster')} {ns.cluster}</div>
            <div className="text-muted-foreground">{t('quotaHeatmap.pods')} {ns.podCount}</div>
          </div>
        )
      })()}
      {namespaceData.length > MAX_VISIBLE_NAMESPACES && (
        <div className="text-xs text-muted-foreground text-center">{t('quotaHeatmap.more', { count: namespaceData.length - MAX_VISIBLE_NAMESPACES })}</div>
      )}
    </div>
  )
}
