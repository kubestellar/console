/**
 * LLM-d Flow Visualization
 *
 * Premium animated request flow diagram with Home Assistant-style
 * glowing gauges, time-series sparklines, and interactive elements.
 *
 * Now supports live data from selected llm-d stack via StackContext.
 *
 * Issue 9071 (dark-mode pass): inline `style={{ backgroundColor|color|textShadow }}`
 * uses in this file are intentionally data-driven — colors come from
 * `loadColors.glow`, `COLORS.{prefill|decode|kv-transfer}`, and
 * `metricConfig[metric].color` (per-metric brand color). These are accent
 * colors, not surface chrome, and are designed to read on both light and
 * dark backgrounds. They are not candidates for `dark:` variants.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CircleDot } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useOptionalStack } from '../../../contexts/StackContext'
import { usePrometheusMetrics } from '../../../hooks/usePrometheusMetrics'
import { POLL_INTERVAL_FAST_MS } from '../../../lib/constants/network'
import { generateServerMetrics, type ServerMetrics } from '../../../lib/llmd/mockData'
import { useCardExpanded } from '../CardWrapper'
import { useCardDemoState, useReportCardDataState } from '../CardDataContext'
import { StatusBadge } from '../../ui/StatusBadge'
import { Acronym } from './shared/PortalTooltip'
import {
  COLORS,
  CONNECTIONS,
  FlowConnection,
  HorseshoeFlowNode,
  METRIC_LOAD_COLOR,
  METRIC_QUEUE_COLOR,
  NODE_POSITIONS,
  PremiumNode,
  Sparkline,
  type Connection,
} from './LLMdFlowNodes'
type ViewMode = 'default' | 'horseshoe'
type MetricType = 'load' | 'queue' | 'rps'
interface MetricsHistoryData {
  rps: number[]
  load: number[]
  queue: number[]
}
export function LLMdFlow() {
  const { t } = useTranslation(['cards', 'common'])
  const stackContext = useOptionalStack()
  const [serverMetrics, setServerMetrics] = useState<ServerMetrics[]>([])
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const [isAnimating, setIsAnimating] = useState(true)
  const [metricsHistory, setMetricsHistory] = useState<Record<string, MetricsHistoryData>>({})
  const [selectedMetricTypes, setSelectedMetricTypes] = useState<MetricType[]>(['rps'])
  const [viewMode, setViewMode] = useState<ViewMode>('default')
  const uniqueId = `flow-${Math.random().toString(36).substr(2, 9)}`
  const { isExpanded } = useCardExpanded()
  const selectedStack = stackContext?.selectedStack
  const { shouldUseDemoData: isDemoMode, showDemoBadge } = useCardDemoState({ requires: 'stack' })
  const { metrics: prometheusMetrics, isRefreshing: metricsRefreshing, lastRefresh: metricsLastRefresh } = usePrometheusMetrics(
    selectedStack?.cluster,
    selectedStack?.namespace,
  )
  const lastUpdated = useMemo(() => {
    const stackLastRefresh = stackContext?.lastRefresh ?? null
    if (stackLastRefresh && metricsLastRefresh) {
      return stackLastRefresh > metricsLastRefresh ? stackLastRefresh : metricsLastRefresh
    }
    return stackLastRefresh ?? metricsLastRefresh ?? null
  }, [metricsLastRefresh, stackContext?.lastRefresh])

  useReportCardDataState({
    isDemoData: showDemoBadge,
    isRefreshing: (stackContext?.isRefreshing ?? false) || metricsRefreshing,
    isFailed: false,
    consecutiveFailures: 0,
    hasData: true,
    lastUpdated,
  })
  const { nodePositions: rawPositions, connections, nodeLabels } = useMemo(() => {
    if (!selectedStack && isDemoMode) {
      return {
        nodePositions: NODE_POSITIONS,
        connections: CONNECTIONS,
        nodeLabels: {
          client: 'Clients',
          gateway: 'Gateway',
          epp: 'EPP',
          prefill0: 'Prefill-0',
          prefill1: 'Prefill-1',
          prefill2: 'Prefill-2',
          decode0: 'Decode-0',
          decode1: 'Decode-1' } as Record<string, string> }
    }
    if (!selectedStack) {
      return {
        nodePositions: {} as Record<string, { x: number; y: number }>,
        connections: [] as Connection[],
        nodeLabels: {} as Record<string, string> }
    }
    const prefillCount = selectedStack.components.prefill.reduce((sum, c) => sum + c.replicas, 0)
    const decodeCount = selectedStack.components.decode.reduce((sum, c) => sum + c.replicas, 0)
    const unifiedCount = selectedStack.components.both.reduce((sum, c) => sum + c.replicas, 0)
    const hasDisaggregation = prefillCount > 0 && decodeCount > 0
    const positions: Record<string, { x: number; y: number }> = {
      client: { x: 10, y: 50 },
      gateway: { x: 28, y: 50 },
      epp: { x: 48, y: 50 } }
    const labels: Record<string, string> = {
      client: 'Clients',
      gateway: 'Gateway',
      epp: 'EPP' }
    const conns: Connection[] = [
      { from: 'client', to: 'gateway', type: 'prefill', trafficPercent: 100 },
      { from: 'gateway', to: 'epp', type: 'prefill', trafficPercent: 100 },
    ]
    if (hasDisaggregation) {
      const maxPrefill = Math.min(prefillCount, 10) // Show up to 3 prefill
      const maxDecode = Math.min(decodeCount, 10)   // Show up to 2 decode
      for (let i = 0; i < maxPrefill; i++) {
        const key = `prefill${i}`
        const y = maxPrefill === 1 ? 50 : 5 + (90 * i) / (maxPrefill - 1)
        positions[key] = { x: 70, y }
        labels[key] = `Prefill-${i}`
        conns.push({
          from: 'epp',
          to: key as keyof typeof NODE_POSITIONS,
          type: 'prefill',
          trafficPercent: Math.round(100 / maxPrefill) })
      }
      for (let i = 0; i < maxDecode; i++) {
        const key = `decode${i}`
        const y = maxDecode === 1 ? 50 : 5 + (90 * i) / (maxDecode - 1)
        positions[key] = { x: 92, y }
        labels[key] = `Decode-${i}`
        conns.push({
          from: 'epp',
          to: key as keyof typeof NODE_POSITIONS,
          type: 'decode',
          trafficPercent: Math.round(20 / maxDecode) })
        for (let j = 0; j < maxPrefill; j++) {
          conns.push({
            from: `prefill${j}` as keyof typeof NODE_POSITIONS,
            to: key as keyof typeof NODE_POSITIONS,
            type: 'decode',
            trafficPercent: Math.round(100 / maxDecode) })
        }
      }
    } else if (decodeCount > 0) {
      const maxDecode = Math.min(decodeCount, 10)
      for (let i = 0; i < maxDecode; i++) {
        const key = `decode${i}`
        const y = maxDecode === 1 ? 50 : 5 + (90 * i) / (maxDecode - 1)
        positions[key] = { x: 78, y }
        labels[key] = `Decode-${i}`
        conns.push({
          from: 'epp',
          to: key as keyof typeof NODE_POSITIONS,
          type: 'decode',
          trafficPercent: Math.round(100 / maxDecode) })
      }
    } else if (prefillCount > 0) {
      const maxPrefill = Math.min(prefillCount, 10)
      for (let i = 0; i < maxPrefill; i++) {
        const key = `prefill${i}`
        const y = maxPrefill === 1 ? 50 : 5 + (90 * i) / (maxPrefill - 1)
        positions[key] = { x: 78, y }
        labels[key] = `Prefill-${i}`
        conns.push({
          from: 'epp',
          to: key as keyof typeof NODE_POSITIONS,
          type: 'prefill',
          trafficPercent: Math.round(100 / maxPrefill) })
      }
    } else if (unifiedCount > 0) {
      const maxServers = Math.min(unifiedCount, 10)
      for (let i = 0; i < maxServers; i++) {
        const key = `server${i}`
        const y = maxServers === 1 ? 50 : 5 + (90 * i) / (maxServers - 1)
        positions[key] = { x: 78, y }
        labels[key] = `Server-${i}`
        conns.push({
          from: 'epp',
          to: key as keyof typeof NODE_POSITIONS,
          type: 'prefill',
          trafficPercent: Math.round(100 / maxServers) })
      }
    } else if (selectedStack.autoscaler) {
      const maxReplicas = selectedStack.autoscaler.maxReplicas || 3
      const ghostCount = Math.min(maxReplicas, 3) // Show up to 3 ghost nodes
      for (let i = 0; i < ghostCount; i++) {
        const key = `ghost${i}`
        const y = ghostCount === 1 ? 50 : 18 + (64 * i) / (ghostCount - 1)
        positions[key] = { x: 78, y }
        labels[key] = `(scaled to 0)`
        conns.push({
          from: 'epp',
          to: key as keyof typeof NODE_POSITIONS,
          type: 'prefill',
          trafficPercent: 0, // No traffic when scaled to 0
        })
      }
    }
    return { nodePositions: positions, connections: conns, nodeLabels: labels }
  }, [selectedStack, isDemoMode])
  const nodePositions = (() => {
    if (!isExpanded || Object.keys(rawPositions).length === 0) return rawPositions
    const scaled: Record<string, { x: number; y: number }> = {}
    for (const [key, pos] of Object.entries(rawPositions)) {
      scaled[key] = { x: 10 + (pos.x - 10) * (200 / 82), y: pos.y }
    }
    return scaled
  })()
  const toggleMetric = (metric: MetricType) => {
    setSelectedMetricTypes(prev => {
      if (prev.includes(metric)) {
        if (prev.length === 1) return prev
        return prev.filter(m => m !== metric)
      }
      return [...prev, metric]
    })
  }
  const getPromMetrics = (podNames?: string[]) => {
    if (!prometheusMetrics || !podNames?.length) return null
    const matched = podNames.filter(p => prometheusMetrics[p])
    if (matched.length === 0) return null
    const avg = (fn: (p: string) => number) =>
      matched.reduce((sum, p) => sum + fn(p), 0) / matched.length
    return {
      load: Math.round(avg(p => prometheusMetrics[p].kvCacheUsage * 100)),
      queueDepth: Math.round(avg(p => prometheusMetrics[p].requestsWaiting)),
      activeConnections: Math.round(avg(p => prometheusMetrics[p].requestsRunning)),
      throughputTps: Math.round(avg(p => prometheusMetrics[p].throughputTps)) }
  }
  const generateLiveMetrics = (): ServerMetrics[] => {
    if (!selectedStack && isDemoMode) {
      return generateServerMetrics()
    }
    if (!selectedStack) {
      return []
    }
    const now = Date.now()
    const wave = Math.sin(now / 5000)
    const metrics: ServerMetrics[] = []
    if (selectedStack.components.gateway) {
      metrics.push({
        name: 'Istio Gateway',
        type: 'gateway',
        status: selectedStack.components.gateway.status === 'running' ? 'healthy' : 'unhealthy',
        load: Math.round(35 + wave * 10),
        queueDepth: Math.round(5 + Math.random() * 10),
        activeConnections: Math.round(120 + Math.random() * 30),
        throughputRps: Math.round(450 + wave * 50) })
    }
    if (selectedStack.components.epp) {
      metrics.push({
        name: 'EPP Scheduler',
        type: 'epp',
        status: selectedStack.components.epp.status === 'running' ? 'healthy' : 'unhealthy',
        load: Math.round(45 + wave * 15),
        queueDepth: Math.round(8 + Math.random() * 12),
        activeConnections: Math.round(450 + Math.random() * 50),
        throughputRps: Math.round(448 + wave * 48) })
    }
    selectedStack.components.prefill.forEach((comp, i) => {
      const isHealthy = comp.readyReplicas > 0
      const prom = getPromMetrics(comp.podNames)
      metrics.push({
        name: `Prefill-${i}`,
        type: 'prefill',
        status: isHealthy ? (prom ? 'healthy' : (wave > 0.3 ? 'healthy' : 'degraded')) : 'unhealthy',
        load: prom?.load ?? Math.round((isHealthy ? 60 : 10) + wave * 20 + Math.random() * 10),
        queueDepth: prom?.queueDepth ?? Math.round(2 + Math.random() * 6),
        activeConnections: prom?.activeConnections ?? Math.round(100 + Math.random() * 20),
        throughputRps: prom?.throughputTps ?? Math.round((isHealthy ? 100 : 10) + wave * 15) })
    })
    selectedStack.components.decode.forEach((comp, i) => {
      const isHealthy = comp.readyReplicas > 0
      const prom = getPromMetrics(comp.podNames)
      metrics.push({
        name: `Decode-${i}`,
        type: 'decode',
        status: isHealthy ? 'healthy' : 'unhealthy',
        load: prom?.load ?? Math.round((isHealthy ? 50 : 5) + wave * 15),
        queueDepth: prom?.queueDepth ?? Math.round(1 + Math.random() * 3),
        activeConnections: prom?.activeConnections ?? Math.round(180 + Math.random() * 30),
        throughputRps: prom?.throughputTps ?? Math.round((isHealthy ? 180 : 10) + wave * 20) })
    })
    selectedStack.components.both.forEach((comp, i) => {
      const isHealthy = comp.readyReplicas > 0
      const prom = getPromMetrics(comp.podNames)
      metrics.push({
        name: `Server-${i}`,
        type: 'prefill', // Unified servers do both
        status: isHealthy ? 'healthy' : 'unhealthy',
        load: prom?.load ?? Math.round((isHealthy ? 55 : 5) + wave * 18),
        queueDepth: prom?.queueDepth ?? Math.round(2 + Math.random() * 5),
        activeConnections: prom?.activeConnections ?? Math.round(150 + Math.random() * 25),
        throughputRps: prom?.throughputTps ?? Math.round((isHealthy ? 150 : 10) + wave * 18) })
    })
    return metrics
  }
  const flowMetricsInitRef = useRef(false)
  useEffect(() => {
    if (flowMetricsInitRef.current) return
    flowMetricsInitRef.current = true
    const updateMetrics = () => {
      const newMetrics = generateLiveMetrics()
      setServerMetrics(newMetrics)
      setMetricsHistory(prev => {
        const updated = { ...prev }
        newMetrics.forEach(m => {
          const key = m.name
          if (!updated[key]) {
            updated[key] = { rps: [], load: [], queue: [] }
          }
          updated[key] = {
            rps: [...updated[key].rps.slice(-19), m.throughputRps],
            load: [...updated[key].load.slice(-19), m.load],
            queue: [...updated[key].queue.slice(-19), m.queueDepth] }
        })
        return updated
      })
    }
    updateMetrics()
    const interval = setInterval(updateMetrics, POLL_INTERVAL_FAST_MS)
    return () => clearInterval(interval)
  }, [generateLiveMetrics])
  const getMetricsForNode = (nodeId: string): ServerMetrics | undefined => {
    const name = nodeLabels[nodeId]
    if (!name) return undefined
    if (name === 'Gateway') return serverMetrics.find(m => m.name === 'Istio Gateway')
    if (name === 'EPP') return serverMetrics.find(m => m.name === 'EPP Scheduler')
    return serverMetrics.find(m => m.name === name)
  }
  const getHistoryForNode = (nodeId: string, metricType: MetricType): number[] => {
    const name = nodeLabels[nodeId]
    if (!name) return []
    let historyKey = name
    if (name === 'Gateway') historyKey = 'Istio Gateway'
    if (name === 'EPP') historyKey = 'EPP Scheduler'
    const history = metricsHistory[historyKey]
    if (!history) return []
    return history[metricType] || []
  }
  const totalThroughput = serverMetrics
      .filter(m => m.type === 'prefill' || m.type === 'decode')
      .reduce((sum, m) => sum + m.throughputRps, 0)
  const avgLoad = (() => {
    const relevant = serverMetrics.filter(m => m.type === 'prefill' || m.type === 'decode')
    return relevant.length > 0
      ? Math.round(relevant.reduce((sum, m) => sum + m.load, 0) / relevant.length)
      : 0
  })()
  const selectedMetrics = selectedNode ? getMetricsForNode(selectedNode) : undefined
  const getNodeColor = (nodeId: string | null) => {
    if (!nodeId) return COLORS.gateway
    if (nodeId.startsWith('prefill')) return COLORS.prefill
    if (nodeId.startsWith('decode')) return COLORS.decode
    if (nodeId.startsWith('server')) return COLORS.prefill  // Unified servers use prefill color
    if (nodeId === 'epp') return COLORS.epp
    if (nodeId === 'client' || nodeId === 'gateway') return COLORS.gateway
    return COLORS.gateway
  }
  const metricConfig: Record<MetricType, { label: string; color: string; unit: string }> = {
    load: { label: 'Load', color: METRIC_LOAD_COLOR, unit: '%' },
    queue: { label: 'Queue', color: METRIC_QUEUE_COLOR, unit: '' },
    rps: { label: 'RPS', color: getNodeColor(selectedNode), unit: '' } }
  const showEmptyState = !selectedStack && !isDemoMode
  return (
    <div className={`relative w-full h-full flex-1 flex flex-col bg-linear-to-br from-background/50 to-secondary/30 rounded-lg ${isExpanded ? 'min-h-0' : 'min-h-[300px]'}`}>
      {showEmptyState && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-20 bg-background/60 backdrop-blur-xs">
          <div className="w-12 h-12 rounded-full border-2 border-border border-t-purple-500 animate-spin mb-4" />
          <span className="text-muted-foreground text-sm">{t('llmd.selectStackVisualize')}</span>
          <span className="text-muted-foreground text-xs mt-1">{t('llmd.useStackSelector')}</span>
        </div>
      )}
      <div className="absolute top-3 left-3 right-3 flex flex-wrap items-center justify-between gap-y-2 z-10">
        <div className="flex items-center gap-4">
          {selectedStack && (
            <div className="flex items-center gap-1.5 text-xs">
              <span className={`px-1.5 py-0.5 rounded font-medium truncate max-w-[180px] ${
                isDemoMode ? 'bg-yellow-500/20 text-yellow-400' : 'bg-green-500/20 text-green-400'
              }`} title={selectedStack.name}>
                {selectedStack.name}
              </span>
              <span className="text-muted-foreground">{selectedStack.cluster}</span>
              {selectedStack.autoscaler && (
                <span className={`px-1.5 py-0.5 rounded text-2xs font-medium ${
                  selectedStack.autoscaler.type === 'WVA' ? 'bg-purple-500/20 text-purple-400' :
                  selectedStack.autoscaler.type === 'HPA' ? 'bg-blue-500/20 text-blue-400' :
                  'bg-green-500/20 text-green-400'
                }`}>
                  {selectedStack.autoscaler.type}: {selectedStack.autoscaler.currentReplicas ?? 0}→{selectedStack.autoscaler.desiredReplicas ?? '?'}
                </span>
              )}
              {selectedStack.autoscaler && selectedStack.totalReplicas === 0 && (
                <span className="px-1.5 py-0.5 rounded bg-secondary/50 text-muted-foreground text-2xs italic">
                  ⏸ Scaled to 0
                </span>
              )}
              {isDemoMode && (
                <StatusBadge color="yellow" size="xs">{t('common:common.demo')}</StatusBadge>
              )}
            </div>
          )}
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-muted-foreground">{t('llmd.throughput')}:</span>
            <span className="text-white font-mono font-medium">{totalThroughput} <Acronym term="RPS" /></span>
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-muted-foreground">{t('llmd.avgLoad')}:</span>
            <span className={`font-mono font-medium ${avgLoad > 70 ? 'text-yellow-400' : 'text-green-400'}`}>
              {avgLoad}%
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode(viewMode === 'default' ? 'horseshoe' : 'default')}
            className={`px-2 py-1 rounded text-xs font-medium transition-all flex items-center gap-1 ${
              viewMode === 'horseshoe'
                ? 'bg-cyan-500/20 text-cyan-400 shadow-lg shadow-cyan-500/20'
                : 'bg-secondary/50 text-muted-foreground'
            }`}
            title={t('llmd.toggleHorseshoe')}
          >
            <CircleDot size={12} />
          </button>
          <button
            onClick={() => setIsAnimating(!isAnimating)}
            className={`px-3 py-1 rounded text-xs font-medium transition-all ${
              isAnimating
                ? 'bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 shadow-lg shadow-purple-500/20'
                : 'bg-secondary/50 text-muted-foreground hover:bg-secondary'
            }`}
          >
            {isAnimating ? t('common:common.pause') : t('common:common.play')}
          </button>
        </div>
      </div>
      <div className="absolute bottom-2 left-3 flex items-center gap-4 text-xs z-10">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS.prefill, boxShadow: `0 0 6px ${COLORS.prefill}` }} />
          <span className="text-muted-foreground">{t('llmd.prefill')}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS.decode, boxShadow: `0 0 6px ${COLORS.decode}` }} />
          <span className="text-muted-foreground">{t('llmd.decode')}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS['kv-transfer'], boxShadow: `0 0 6px ${COLORS['kv-transfer']}` }} />
          <span className="text-muted-foreground"><Acronym term="KV" /> Transfer</span>
        </div>
      </div>
      <svg
        viewBox={isExpanded ? '-10 -10 240 120' : '-5 -10 120 140'}
        className={`w-full overflow-visible ${isExpanded ? 'flex-1 min-h-0 mt-2' : 'h-[calc(100%-2rem)] mt-8'}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ overflow: 'visible' }}
      >
        {connections.map((conn, i) => (
          <FlowConnection
            key={`${conn.from}-${conn.to}-${i}`}
            connection={conn}
            isAnimating={isAnimating}
            nodePositions={nodePositions}
          />
        ))}
        {viewMode === 'horseshoe' ? (
          <>
            {Object.keys(nodePositions).map(nodeId => (
              <HorseshoeFlowNode
                key={nodeId}
                id={nodeId}
                label={nodeLabels[nodeId] || nodeId}
                metrics={nodeId !== 'client' ? getMetricsForNode(nodeId) : undefined}
                isSelected={selectedNode === nodeId}
                onClick={() => setSelectedNode(selectedNode === nodeId ? null : nodeId)}
                uniqueId={uniqueId}
                nodePositions={nodePositions}
                isGhost={nodeId.startsWith('ghost')}
              />
            ))}
          </>
        ) : (
          <>
            {Object.keys(nodePositions).map(nodeId => (
              <PremiumNode
                key={nodeId}
                id={nodeId}
                label={nodeLabels[nodeId] || nodeId}
                metrics={nodeId !== 'client' ? getMetricsForNode(nodeId) : undefined}
                nodeColor={getNodeColor(nodeId)}
                isSelected={selectedNode === nodeId}
                onClick={() => setSelectedNode(selectedNode === nodeId ? null : nodeId)}
                uniqueId={uniqueId}
                nodePositions={nodePositions}
                isGhost={nodeId.startsWith('ghost')}
              />
            ))}
          </>
        )}
      </svg>
      <AnimatePresence>
        {selectedNode && selectedMetrics && (
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="absolute top-10 left-3 w-56 bg-background/95 backdrop-blur-xs rounded-xl p-4 border border-border shadow-xl"
          >
            <div className="flex flex-wrap items-center justify-between gap-y-2 mb-3">
              <h3 className="text-white font-semibold text-sm">
                {selectedMetrics.name}
              </h3>
              <span className={`px-2 py-0.5 rounded-full text-2xs font-medium ${
                selectedMetrics.status === 'healthy' ? 'bg-green-500/20 text-green-400' :
                selectedMetrics.status === 'degraded' ? 'bg-yellow-500/20 text-yellow-400' :
                'bg-red-500/20 text-red-400'
              }`}>
                {selectedMetrics.status.charAt(0).toUpperCase() + selectedMetrics.status.slice(1)}
              </span>
            </div>
            <div className="flex gap-1 mb-3">
              {(['load', 'queue', 'rps'] as MetricType[]).map(metric => (
                <button
                  key={metric}
                  onClick={() => toggleMetric(metric)}
                  className={`flex-1 px-2 py-1.5 rounded text-2xs font-medium transition-all ${
                    selectedMetricTypes.includes(metric)
                      ? 'bg-secondary text-white ring-1 ring-border'
                      : 'bg-secondary/50 text-muted-foreground hover:bg-secondary'
                  }`}
                >
                  <div className="text-center">
                    <div className="text-[9px] text-muted-foreground uppercase">{t(`llmd.${metric}`)}</div>
                    <div className="font-mono" style={{ color: selectedMetricTypes.includes(metric) ? metricConfig[metric].color : undefined }}>
                      {metric === 'load' ? `${selectedMetrics.load}%` :
                       metric === 'queue' ? selectedMetrics.queueDepth :
                       selectedMetrics.throughputRps}
                    </div>
                  </div>
                </button>
              ))}
            </div>
            <div className={`grid gap-2 ${
              selectedMetricTypes.length === 1 ? 'grid-cols-1' :
              selectedMetricTypes.length === 2 ? 'grid-cols-2' :
              'grid-cols-2 @sm:grid-cols-3'
            }`}>
              {selectedMetricTypes.map(metric => (
                <div key={metric} className="bg-secondary/50 rounded-lg p-2">
                  <div className="text-[9px] text-muted-foreground mb-1 flex items-center gap-1">
                    <div
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: metricConfig[metric].color }}
                    />
                    {t(`llmd.${metric}`)}
                  </div>
                  <Sparkline
                    data={getHistoryForNode(selectedNode, metric)}
                    color={metricConfig[metric].color}
                    width={selectedMetricTypes.length === 1 ? 180 : selectedMetricTypes.length === 2 ? 85 : 55}
                    height={35}
                  />
                </div>
              ))}
            </div>
            <div className="text-[9px] text-muted-foreground mt-2 text-center">
              Click metrics above to compare
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
export default LLMdFlow
