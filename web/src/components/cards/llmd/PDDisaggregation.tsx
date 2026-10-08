/**
 * Prefill/Decode Disaggregation Visualization
 *
 * Split panel showing the disaggregated serving architecture
 * with animated token transfer between stages.
 *
 * Uses live stack data when available, demo data when in demo mode.
 *
 * Issue 9071 (dark-mode pass): inline `style={{ backgroundColor }}` uses in
 * this file are data-driven load-indicator colors (CSS variables `--color-warning`
 * when `server.load > 70`, otherwise the prefill/decode brand `color`). These are
 * accent indicators that read on both light and dark backgrounds — not
 * candidates for `dark:` variants.
 */
import { useState, useEffect, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Split, ArrowRight, Cpu, Zap, Clock, Activity, AlertCircle } from 'lucide-react'
import { StatusBadge } from '../../../components/ui/StatusBadge'
import { Acronym } from './shared/PortalTooltip'
import { useOptionalStack } from '../../../contexts/StackContext'
import { useCardDemoState, useReportCardDataState } from '../CardDataContext'
import { usePrometheusMetrics } from '../../../hooks/usePrometheusMetrics'
import { useCardExpanded } from '../CardWrapper'
import { useTranslation } from 'react-i18next'
import { POLL_INTERVAL_FAST_MS, PACKET_SPAWN_INTERVAL_MS } from '../../../lib/constants/network'
import { ServerCard } from './PDDisaggregation.ServerCard'
import {
  WAVE_PERIOD_MS,
  generateServerStats,
  type ServerStats,
  type TransferPacket,
} from './PDDisaggregation.data'

export function PDDisaggregation() {
  const { t } = useTranslation(['cards', 'common'])
  const stackContext = useOptionalStack()
  const selectedStack = stackContext?.selectedStack
  const { shouldUseDemoData: isDemoMode, showDemoBadge } = useCardDemoState({ requires: 'stack' })

  // Prometheus metrics for the selected stack (null when unavailable or no stack)
  const { metrics: prometheusMetrics, isRefreshing: metricsRefreshing } = usePrometheusMetrics(
    selectedStack?.cluster,
    selectedStack?.namespace,
  )

  // Detect if card is in expanded/fullscreen mode
  const { isExpanded } = useCardExpanded()

  // Report demo state to CardWrapper so it can show demo badge and yellow outline
  // Use showDemoBadge (true when global demo mode) rather than isDemoMode (false when stack selected)
  useReportCardDataState({
    isDemoData: showDemoBadge,
    isRefreshing: (stackContext?.isRefreshing ?? false) || metricsRefreshing,
    isFailed: false,
    consecutiveFailures: 0,
    hasData: true,
  })

  const [servers, setServers] = useState<ServerStats[]>([])
  const [packets, setPackets] = useState<TransferPacket[]>([])

  // Build server stats from stack or use demo data, using Prometheus when available
  const stackServers = useMemo((): ServerStats[] => {
    // Only show demo servers if demo mode is ON
    if (!selectedStack && isDemoMode) {
      return generateServerStats()
    }
    // In live mode with no stack, return empty
    if (!selectedStack) {
      return []
    }

    const stats: ServerStats[] = []
    const wave = Math.sin(Date.now() / WAVE_PERIOD_MS)

    // Build prefill server stats from stack components
    let prefillIndex = 0
    for (const comp of selectedStack.components.prefill) {
      for (let i = 0; i < comp.replicas; i++) {
        const podName = comp.podNames?.[i]
        const prom = podName && prometheusMetrics?.[podName]
        stats.push({
          id: `prefill-${prefillIndex}`,
          name: `Prefill-${prefillIndex}`,
          type: 'prefill',
          load: prom ? Math.round(prom.kvCacheUsage * 100) : Math.round(60 + wave * 15 + Math.random() * 10),
          queueDepth: prom ? Math.round(prom.requestsWaiting) : Math.round(2 + Math.random() * 4),
          throughput: prom ? Math.round(prom.throughputTps) : Math.round(100 + wave * 20 + Math.random() * 30),
          latencyMs: prom ? Math.round(prom.ttftP50 * 1000) : Math.round(40 + wave * 10 + Math.random() * 10),
          gpuMemory: prom ? Math.round(prom.kvCacheUsage * 100) : Math.round(70 + wave * 10 + Math.random() * 10) })
        prefillIndex++
      }
    }

    // Build decode server stats from stack components
    let decodeIndex = 0
    for (const comp of selectedStack.components.decode) {
      for (let i = 0; i < comp.replicas; i++) {
        const podName = comp.podNames?.[i]
        const prom = podName && prometheusMetrics?.[podName]
        stats.push({
          id: `decode-${decodeIndex}`,
          name: `Decode-${decodeIndex}`,
          type: 'decode',
          load: prom ? Math.round(prom.kvCacheUsage * 100) : Math.round(45 + wave * 10 + Math.random() * 10),
          queueDepth: prom ? Math.round(prom.requestsWaiting) : Math.round(1 + Math.random() * 2),
          throughput: prom ? Math.round(prom.throughputTps) : Math.round(160 + wave * 25 + Math.random() * 30),
          latencyMs: prom ? Math.round(prom.tpotP50 * 1000) : Math.round(6 + wave * 2 + Math.random() * 3),
          gpuMemory: prom ? Math.round(prom.kvCacheUsage * 100) : Math.round(80 + wave * 8 + Math.random() * 10) })
        decodeIndex++
      }
    }

    return stats
  }, [selectedStack, isDemoMode, prometheusMetrics])

  // Check if stack has disaggregation
  const hasDisaggregation = selectedStack?.hasDisaggregation ??
    (stackServers.some(s => s.type === 'prefill') && stackServers.some(s => s.type === 'decode'))

  // Store latest value in ref to avoid stale closure in interval
  const stackServersRef = useRef(stackServers)
  useEffect(() => {
    stackServersRef.current = stackServers
  }, [stackServers])

  // Update stats periodically
  useEffect(() => {
    const update = () => setServers(stackServersRef.current.length > 0 ? stackServersRef.current : generateServerStats())
    update()
    const interval = setInterval(update, POLL_INTERVAL_FAST_MS)
    return () => clearInterval(interval)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Get server IDs for packet generation — stabilize with useMemo to avoid loop
  const prefillIds = useMemo(() => servers.filter(s => s.type === 'prefill').map(s => s.id), [servers])
  const decodeIds = useMemo(() => servers.filter(s => s.type === 'decode').map(s => s.id), [servers])
  // Stable key for deps — only re-run effect when the actual IDs change
  const prefillKey = (prefillIds || []).join(',')
  const decodeKey = (decodeIds || []).join(',')

  // Generate transfer packets (only when disaggregated)
  useEffect(() => {
    if (prefillIds.length === 0 || decodeIds.length === 0) {
      setPackets([])
      return
    }

    const spawnPacket = () => {
      const from = prefillIds[Math.floor(Math.random() * prefillIds.length)]
      const to = decodeIds[Math.floor(Math.random() * decodeIds.length)]

      const newPacket: TransferPacket = {
        id: `packet-${Date.now()}`,
        fromServer: from,
        toServer: to,
        progress: 0,
        size: Math.round(50 + Math.random() * 200) }

      setPackets(prev => [...prev.slice(-10), newPacket])
    }

    const interval = setInterval(spawnPacket, PACKET_SPAWN_INTERVAL_MS)
    return () => clearInterval(interval)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillKey, decodeKey])

  // Animate packets
  useEffect(() => {
    const animate = setInterval(() => {
      setPackets(prev =>
        prev
          .map(p => ({ ...p, progress: p.progress + 0.05 }))
          .filter(p => p.progress < 1)
      )
    }, 50)
    return () => clearInterval(animate)
  }, [])

  const prefillServers = servers.filter(s => s.type === 'prefill')
  const decodeServers = servers.filter(s => s.type === 'decode')

  // Aggregate metrics
  const metrics = useMemo(() => {
    const prefill = prefillServers.reduce((acc, s) => ({
      throughput: acc.throughput + s.throughput,
      avgLatency: acc.avgLatency + s.latencyMs }), { throughput: 0, avgLatency: 0 })

    const decode = decodeServers.reduce((acc, s) => ({
      throughput: acc.throughput + s.throughput,
      avgLatency: acc.avgLatency + s.latencyMs }), { throughput: 0, avgLatency: 0 })

    return {
      prefillThroughput: prefill.throughput,
      prefillAvgTTFT: prefillServers.length ? Math.round(prefill.avgLatency / prefillServers.length) : 0,
      decodeThroughput: decode.throughput,
      decodeAvgTPOT: decodeServers.length ? Math.round(decode.avgLatency / decodeServers.length) : 0,
      kvTransferRate: Math.round(packets.length * 150), // Simulated KB/s
    }
  }, [prefillServers, decodeServers, packets])

  return (
    <div className={`p-4 h-full flex-1 flex flex-col ${isExpanded ? 'min-h-[500px]' : ''}`}>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-y-2 mb-4">
        <div className="flex items-center gap-2">
          <Split size={18} className="text-cyan-400" />
          <span className="font-medium text-foreground">{t('llmd.pdDisaggregation')}</span>
        </div>
        <div className="flex items-center gap-2">
          {selectedStack && (
            <span className={`px-1.5 py-0.5 rounded text-xs font-medium truncate max-w-[180px] ${
              isDemoMode ? 'bg-yellow-500/20 text-yellow-400' : 'bg-green-500/20 text-green-400'
            }`} title={selectedStack.name}>
              {selectedStack.name}
            </span>
          )}
          {isDemoMode && (
            <StatusBadge color="yellow">
              {t('common:common.demo')}
            </StatusBadge>
          )}
        </div>
      </div>

      {/* Empty state for non-disaggregated stacks */}
      {selectedStack && !hasDisaggregation && !isDemoMode && (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
          <AlertCircle size={32} className="text-muted-foreground mb-3" />
          <span className="text-muted-foreground text-sm font-medium">{t('llmd.unifiedServingMode')}</span>
          <span className="text-muted-foreground text-xs mt-1">
            {t('llmd.stackUsesUnified')}
          </span>
          <span className="text-muted-foreground text-xs">
            {t('llmd.disaggregationAvailable')}
          </span>
        </div>
      )}

      {/* Empty state when no stack selected in live mode */}
      {!selectedStack && !isDemoMode && (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
          <div className="w-12 h-12 rounded-full border-2 border-border border-t-cyan-500 animate-spin mb-4" />
          <span className="text-muted-foreground text-sm">{t('llmd.selectStackDisaggregation')}</span>
          <span className="text-muted-foreground text-xs mt-1">{t('llmd.useStackSelector')}</span>
        </div>
      )}

      {/* Main content - only show when disaggregation is available */}
      {(isDemoMode || (selectedStack && hasDisaggregation)) && (
        <>
          {/* Metrics summary */}
          <div className={`grid grid-cols-5 mb-4 ${isExpanded ? 'gap-4' : 'gap-2'}`}>
            <div className="bg-purple-500/10 rounded-lg p-2 text-center">
              <div className="flex items-center justify-center gap-1 text-purple-400 mb-1">
                <Cpu size={12} />
                <span className="text-xs">{t('llmd.prefill')}</span>
              </div>
              <div className="text-foreground font-mono text-sm">{metrics.prefillThroughput}</div>
              <div className="text-xs text-muted-foreground">{t('llmd.rps').toLowerCase()}</div>
            </div>

            <div className="bg-purple-500/10 rounded-lg p-2 text-center">
              <div className="flex items-center justify-center gap-1 text-purple-400 mb-1">
                <Clock size={12} />
                <span className="text-xs"><Acronym term="TTFT" /></span>
              </div>
              <div className="text-foreground font-mono text-sm">{metrics.prefillAvgTTFT}</div>
              <div className="text-xs text-muted-foreground">{t('llmd.ms')}</div>
            </div>

            <div className="bg-cyan-500/10 rounded-lg p-2 text-center">
              <div className="flex items-center justify-center gap-1 text-cyan-400 mb-1">
                <Zap size={12} />
                <span className="text-xs">{t('llmd.transfer')}</span>
              </div>
              <div className="text-foreground font-mono text-sm">{metrics.kvTransferRate}</div>
              <div className="text-xs text-muted-foreground">{t('llmd.kbps')}</div>
            </div>

        <div className="bg-green-500/10 rounded-lg p-2 text-center">
          <div className="flex items-center justify-center gap-1 text-green-400 mb-1">
            <Activity size={12} />
            <span className="text-xs">{t('llmd.decode')}</span>
          </div>
          <div className="text-foreground font-mono text-sm">{metrics.decodeThroughput}</div>
          <div className="text-xs text-muted-foreground">rps</div>
        </div>

        <div className="bg-green-500/10 rounded-lg p-2 text-center">
          <div className="flex items-center justify-center gap-1 text-green-400 mb-1">
            <Clock size={12} />
            <span className="text-xs"><Acronym term="TPOT" /></span>
          </div>
          <div className="text-foreground font-mono text-sm">{metrics.decodeAvgTPOT}</div>
          <div className="text-xs text-muted-foreground">ms</div>
        </div>
          </div>

          {/* Split view */}
          <div className="flex-1 flex gap-4 relative">
            {/* Prefill panel */}
            <div className="flex-1 flex flex-col">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-3 h-3 rounded-full bg-purple-500" />
                <span className="text-sm font-medium text-purple-400">{t('llmd.prefillServers')}</span>
              </div>
              <div className={`flex-1 overflow-auto ${isExpanded ? 'grid grid-cols-2 gap-3 auto-rows-min' : 'space-y-2'}`}>
                {prefillServers.map(server => (
                  <ServerCard key={server.id} server={server} />
                ))}
              </div>
            </div>

            {/* Transfer zone */}
            <div className="w-20 flex flex-col items-center justify-center relative">
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-px h-full bg-linear-to-b from-purple-500/20 via-cyan-500/40 to-green-500/20" />
              </div>

              {/* Animated packets */}
              <AnimatePresence>
                {packets.map(packet => (
                  <motion.div
                    key={packet.id}
                    className="absolute w-4 h-4 rounded bg-cyan-500 flex items-center justify-center"
                    style={{
                      top: `${20 + packet.progress * 60}%`,
                      filter: 'drop-shadow(0 0 6px #06b6d4)' }}
                    initial={{ opacity: 0, scale: 0 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0 }}
                  >
                    <ArrowRight size={10} className="text-white" />
                  </motion.div>
                ))}
              </AnimatePresence>

              <div className="z-10 bg-background px-2 py-1 rounded text-xs text-cyan-400">
                <Acronym term="KV" /> Cache
              </div>
            </div>

            {/* Decode panel */}
            <div className="flex-1 flex flex-col">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-3 h-3 rounded-full bg-green-500" />
                <span className="text-sm font-medium text-green-400">{t('llmd.decodeServers')}</span>
              </div>
              <div className={`flex-1 overflow-auto ${isExpanded ? 'grid grid-cols-2 gap-3 auto-rows-min' : 'space-y-2'}`}>
                {decodeServers.map(server => (
                  <ServerCard key={server.id} server={server} />
                ))}
              </div>
            </div>
          </div>

          {/* Architecture explanation */}
          <div className="mt-4 text-xs text-muted-foreground text-center">
            {t('llmd.pdArchExplanation')}
          </div>
        </>
      )}
    </div>
  )
}

export default PDDisaggregation
