/**
 * KVCache Monitor
 *
 * High-definition visualization of KV cache levels across pods
 * with stunning glowing gauges inspired by Home Assistant.
 *
 * Uses live stack data when available, demo data when in demo mode.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useOptionalStack } from '../../../contexts/StackContext'
import { usePrometheusMetrics } from '../../../hooks/usePrometheusMetrics'
import { KV_CACHE_UPDATE_INTERVAL_MS } from '../../../lib/constants/network'
import { type KVCacheStats } from '../../../lib/llmd/mockData'
import { useCardExpanded } from '../CardWrapper'
import { useCardDemoState, useReportCardDataState } from '../CardDataContext'
import { KVCacheMonitorVisualization, SummaryStats, TrendSparkline } from './KVCacheMonitorChart'
import { KVCacheMonitorDetailPanel } from './KVCacheMonitorDetailPanel'
import { KVCacheMonitorHeader } from './KVCacheMonitorHeader'
import type { AggregationMode, CardsCommonTFunction, MetricType, PanelPosition, PodHistoryMap, ViewMode } from './KVCacheMonitor.types'
import {
  calculateAggregateMetrics,
  calculateTrend,
  generateMonitorStats,
  updatePodHistory,
} from './KVCacheMonitor.utils'

export function KVCacheMonitor() {
  const { t: tRaw } = useTranslation(['cards', 'common'])
  const t = tRaw as CardsCommonTFunction
  const stackContext = useOptionalStack()
  const { isExpanded } = useCardExpanded()

  const [stats, setStats] = useState<KVCacheStats[]>([])
  const [viewMode, setViewMode] = useState<ViewMode>('gauges')
  const [history, setHistory] = useState<number[]>([])
  const [selectedPod, setSelectedPod] = useState<string | null>(null)
  const [podHistory, setPodHistory] = useState<PodHistoryMap>({})
  const [selectedMetrics, setSelectedMetrics] = useState<MetricType[]>(['util'])
  const [aggregationMode, setAggregationMode] = useState<AggregationMode>('aggregated')
  const [panelPosition, setPanelPosition] = useState<PanelPosition | null>(null)

  const gaugeRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const generateStatsRef = useRef<() => KVCacheStats[]>(() => [])

  const selectedStack = stackContext?.selectedStack ?? null
  const { shouldUseDemoData: isDemoMode, showDemoBadge } = useCardDemoState({ requires: 'stack' })
  const { metrics: prometheusMetrics, isRefreshing: metricsRefreshing } = usePrometheusMetrics(
    selectedStack?.cluster,
    selectedStack?.namespace,
  )

  useReportCardDataState({
    consecutiveFailures: 0,
    hasData: true,
    isDemoData: showDemoBadge,
    isFailed: false,
    isRefreshing: (stackContext?.isRefreshing ?? false) || metricsRefreshing,
  })

  generateStatsRef.current = () =>
    generateMonitorStats({
      aggregationMode,
      isDemoMode,
      prometheusMetrics,
      selectedStack,
    })

  const handleGaugeClick = useCallback((podName: string, element: HTMLButtonElement | null) => {
    if (selectedPod === podName) {
      setSelectedPod(null)
      setPanelPosition(null)
      return
    }

    setSelectedPod(podName)
    if (element) {
      const rect = element.getBoundingClientRect()
      setPanelPosition({ x: rect.right + 8, y: rect.top })
    }
  }, [selectedPod])

  const handleDetailPanelClose = useCallback(() => {
    setSelectedPod(null)
    setPanelPosition(null)
  }, [])

  const toggleMetric = useCallback((metric: MetricType) => {
    setSelectedMetrics(previousMetrics => {
      if (previousMetrics.includes(metric)) {
        return previousMetrics.length === 1
          ? previousMetrics
          : previousMetrics.filter(currentMetric => currentMetric !== metric)
      }

      return [...previousMetrics, metric]
    })
  }, [])

  useEffect(() => {
    if (!selectedPod || !panelPosition) return undefined

    const handleScroll = () => {
      setSelectedPod(null)
      setPanelPosition(null)
    }

    window.addEventListener('scroll', handleScroll, { capture: true, passive: true })
    return () => window.removeEventListener('scroll', handleScroll, { capture: true })
  }, [panelPosition, selectedPod])

  useEffect(() => {
    const updateStats = () => {
      const nextStats = generateStatsRef.current()
      setStats(nextStats)

      if ((nextStats || []).length > 0) {
        const averageUtilization = nextStats.reduce((sum, stat) => sum + stat.utilizationPercent, 0) / nextStats.length
        setHistory(previousHistory => [...previousHistory.slice(-20), averageUtilization])
      }

      setPodHistory(previousHistory => updatePodHistory(previousHistory, nextStats))
    }

    updateStats()
    const intervalId = setInterval(updateStats, KV_CACHE_UPDATE_INTERVAL_MS)
    return () => clearInterval(intervalId)
  }, [])

  const aggregateMetrics = useMemo(() => calculateAggregateMetrics(stats), [stats])
  const trend = useMemo(() => calculateTrend(history), [history])
  const showEmptyState = !selectedStack && !isDemoMode

  return (
    <div className={`relative flex h-full flex-1 flex-col bg-linear-to-br from-background/50 to-secondary/30 p-4 ${isExpanded ? 'min-h-[500px]' : ''}`}>
      {showEmptyState && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center rounded-lg bg-background/60 backdrop-blur-xs">
          <div className="mb-4 h-12 w-12 animate-spin rounded-full border-2 border-border border-t-cyan-500" />
          <span className="text-sm text-muted-foreground">{t('llmd.selectStackMonitor')}</span>
          <span className="mt-1 text-xs text-muted-foreground">{t('llmd.useStackSelector')}</span>
        </div>
      )}

      <KVCacheMonitorHeader
        aggregationMode={aggregationMode}
        isDemoMode={isDemoMode}
        onAggregationModeChange={setAggregationMode}
        onViewModeToggle={setViewMode}
        selectedStack={selectedStack}
        t={t}
        viewMode={viewMode}
      />

      <SummaryStats aggregateMetrics={aggregateMetrics} podCount={stats.length} t={t} trend={trend} />

      <div className="relative flex-1 overflow-visible">
        <KVCacheMonitorDetailPanel
          onClose={handleDetailPanelClose}
          onToggleMetric={toggleMetric}
          panelPosition={panelPosition}
          podHistory={podHistory}
          selectedMetrics={selectedMetrics}
          selectedPod={selectedPod}
          stats={stats}
          t={t}
        />

        <KVCacheMonitorVisualization
          gaugeRefs={gaugeRefs}
          isExpanded={isExpanded}
          onGaugeClick={handleGaugeClick}
          selectedPod={selectedPod}
          stats={stats}
          t={t}
          viewMode={viewMode}
        />
      </div>

      <TrendSparkline history={history} />
    </div>
  )
}

export default KVCacheMonitor
