import type { LLMdStack } from '../../../hooks/useStackDiscovery'
import type { PodMetrics } from '../../../hooks/usePrometheusMetrics'
import { generateServerMetrics, type ServerMetrics } from '../../../lib/llmd/mockData'
import { CONNECTIONS, NODE_POSITIONS, type Connection } from './LLMdFlowNodes'

const WAVE_PERIOD_MS = 5_000
export type ViewMode = 'default' | 'horseshoe'
export type MetricType = 'load' | 'queue' | 'rps'
export interface MetricsHistoryData {
  rps: number[]
  load: number[]
  queue: number[]
}

export interface FlowTopology {
  nodePositions: Record<string, { x: number; y: number }>
  connections: Connection[]
  nodeLabels: Record<string, string>
}

/** Builds node positions, connections and labels for the flow diagram from the selected stack. */
export function buildFlowTopology(selectedStack: LLMdStack | null | undefined, isDemoMode: boolean): FlowTopology {
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
}

function getPromMetrics(prometheusMetrics: Record<string, PodMetrics> | null, podNames?: string[]) {
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

/** Generates per-server metrics for the selected stack, preferring live Prometheus values when available. */
export function buildLiveServerMetrics(
  selectedStack: LLMdStack | null | undefined,
  isDemoMode: boolean,
  prometheusMetrics: Record<string, PodMetrics> | null,
): ServerMetrics[] {
  if (!selectedStack && isDemoMode) {
    return generateServerMetrics()
  }
  if (!selectedStack) {
    return []
  }
  const now = Date.now()
  const wave = Math.sin(now / WAVE_PERIOD_MS)
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
    const prom = getPromMetrics(prometheusMetrics, comp.podNames)
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
    const prom = getPromMetrics(prometheusMetrics, comp.podNames)
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
    const prom = getPromMetrics(prometheusMetrics, comp.podNames)
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
