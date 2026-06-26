import { useState, useMemo, useEffect, useRef } from 'react'
import { useOptionalStack } from '../../../../contexts/StackContext'
import { useCardDemoState, useReportCardDataState } from '../../CardDataContext'
import { usePrometheusMetrics } from '../../../../hooks/usePrometheusMetrics'
import { useCardExpanded } from '../../CardWrapper'
import { POLL_INTERVAL_FAST_MS } from '../../../../lib/constants/network'
import type { LLMdStack } from '../../../../hooks/useStackDiscovery'

const NODE_COLOR_SOURCE = '#3b82f6'
const NODE_COLOR_EPP = '#f59e0b'
const NODE_COLOR_PREFILL = '#9333ea'
const NODE_COLOR_DECODE = '#22c55e'

type NodeType = 'source' | 'router' | 'prefill' | 'decode'

export type MetricType = 'load' | 'rps'
export type ViewMode = 'default' | 'horseshoe'

export interface FlowNode {
  id: string
  label: string
  x: number
  y: number
  type: NodeType
  color: string
  load?: number
  isGhost?: boolean
}

export interface FlowLink {
  source: string
  target: string
  value: number
  percentage: number
  type: 'prefill' | 'decode' | 'kv-transfer'
}

export interface NodeMetric {
  load: number
  rps: number
}

export interface NodeMetricHistory {
  load: number[]
  rps: number[]
}

export interface RoutingSummaryMetrics {
  totalRps: number
  prefillRps: number
  decodeRps: number
  prefillPercent: number
  decodePercent: number
}

export interface EPPRoutingDataResult {
  dynamicNodes: FlowNode[]
  generatePath: (source: FlowNode, target: FlowNode) => string
  getNodeWithMetrics: (node: FlowNode) => FlowNode
  hoveredLink: string | null
  isDemoMode: boolean
  isExpanded: boolean
  links: FlowLink[]
  metrics: RoutingSummaryMetrics
  metricsHistory: Record<string, NodeMetricHistory>
  nodeMetrics: Record<string, NodeMetric>
  onHoveredLinkChange: (linkId: string | null) => void
  onSelectedNodeChange: (nodeId: string | null) => void
  selectedMetricTypes: MetricType[]
  selectedNode: string | null
  selectedStack: LLMdStack | null
  showEmptyState: boolean
  showParticles: boolean
  toggleMetric: (metric: MetricType) => void
  toggleShowParticles: () => void
  toggleViewMode: () => void
  uniqueId: string
  viewMode: ViewMode
}

const NODES: FlowNode[] = [
  { id: 'requests', label: 'Requests', x: 12, y: 50, type: 'source', color: NODE_COLOR_SOURCE, load: 0 },
  { id: 'epp', label: 'EPP', x: 38, y: 50, type: 'router', color: NODE_COLOR_EPP, load: 65 },
  { id: 'prefill-0', label: 'Prefill-0', x: 65, y: 18, type: 'prefill', color: NODE_COLOR_PREFILL, load: 72 },
  { id: 'prefill-1', label: 'Prefill-1', x: 65, y: 50, type: 'prefill', color: NODE_COLOR_PREFILL, load: 58 },
  { id: 'prefill-2', label: 'Prefill-2', x: 65, y: 82, type: 'prefill', color: NODE_COLOR_PREFILL, load: 45 },
  { id: 'decode-0', label: 'Decode-0', x: 90, y: 34, type: 'decode', color: NODE_COLOR_DECODE, load: 80 },
  { id: 'decode-1', label: 'Decode-1', x: 90, y: 66, type: 'decode', color: NODE_COLOR_DECODE, load: 67 },
]

function buildRawNodes(selectedStack: LLMdStack | null, isDemoMode: boolean): FlowNode[] {
  if (!selectedStack && isDemoMode) {
    return NODES
  }

  if (!selectedStack) {
    return []
  }

  const nodes: FlowNode[] = [
    { id: 'requests', label: 'Requests', x: 12, y: 50, type: 'source', color: NODE_COLOR_SOURCE, load: 0 },
    { id: 'epp', label: 'EPP', x: 38, y: 50, type: 'router', color: NODE_COLOR_EPP, load: 65 },
  ]

  const prefillCount = selectedStack.components.prefill.reduce((sum, c) => sum + c.replicas, 0)
  const decodeCount = selectedStack.components.decode.reduce((sum, c) => sum + c.replicas, 0)
  const unifiedCount = selectedStack.components.both.reduce((sum, c) => sum + c.replicas, 0)
  const hasDisaggregation = prefillCount > 0 && decodeCount > 0

  if (hasDisaggregation) {
    const maxPrefill = Math.min(prefillCount, 10)
    for (let i = 0; i < maxPrefill; i++) {
      const y = maxPrefill === 1 ? 50 : 18 + (64 * i) / (maxPrefill - 1)
      nodes.push({
        id: `prefill-${i}`,
        label: `Prefill-${i}`,
        x: 65,
        y,
        type: 'prefill',
        color: NODE_COLOR_PREFILL,
        load: 50 + Math.random() * 30,
      })
    }

    const maxDecode = Math.min(decodeCount, 10)
    for (let i = 0; i < maxDecode; i++) {
      const y = maxDecode === 1 ? 50 : 5 + (90 * i) / (maxDecode - 1)
      nodes.push({
        id: `decode-${i}`,
        label: `Decode-${i}`,
        x: 90,
        y,
        type: 'decode',
        color: NODE_COLOR_DECODE,
        load: 50 + Math.random() * 35,
      })
    }
  } else if (decodeCount > 0) {
    const maxDecode = Math.min(decodeCount, 10)
    for (let i = 0; i < maxDecode; i++) {
      const y = maxDecode === 1 ? 50 : 18 + (64 * i) / (maxDecode - 1)
      nodes.push({
        id: `decode-${i}`,
        label: `Decode-${i}`,
        x: 75,
        y,
        type: 'decode',
        color: NODE_COLOR_DECODE,
        load: 50 + Math.random() * 35,
      })
    }
  } else if (prefillCount > 0) {
    const maxPrefill = Math.min(prefillCount, 10)
    for (let i = 0; i < maxPrefill; i++) {
      const y = maxPrefill === 1 ? 50 : 18 + (64 * i) / (maxPrefill - 1)
      nodes.push({
        id: `prefill-${i}`,
        label: `Prefill-${i}`,
        x: 75,
        y,
        type: 'prefill',
        color: NODE_COLOR_PREFILL,
        load: 50 + Math.random() * 30,
      })
    }
  } else if (unifiedCount > 0) {
    const maxServers = Math.min(unifiedCount, 10)
    for (let i = 0; i < maxServers; i++) {
      const y = maxServers === 1 ? 50 : 18 + (64 * i) / (maxServers - 1)
      nodes.push({
        id: `server-${i}`,
        label: `Server-${i}`,
        x: 75,
        y,
        type: 'prefill',
        color: NODE_COLOR_PREFILL,
        load: 50 + Math.random() * 30,
      })
    }
  } else if (selectedStack.autoscaler) {
    const maxReplicas = selectedStack.autoscaler.maxReplicas || 3
    const ghostCount = Math.min(maxReplicas, 3)
    for (let i = 0; i < ghostCount; i++) {
      const y = ghostCount === 1 ? 50 : 18 + (64 * i) / (ghostCount - 1)
      nodes.push({
        id: `ghost-${i}`,
        label: '(scaled to 0)',
        x: 75,
        y,
        type: 'prefill',
        color: '#475569',
        load: 0,
        isGhost: true,
      })
    }
  }

  return nodes
}

function buildNodePodMap(selectedStack: LLMdStack | null): Record<string, string[]> {
  if (!selectedStack) return {}

  const map: Record<string, string[]> = {}
  let pi = 0
  for (const comp of selectedStack.components.prefill) {
    for (let r = 0; r < comp.replicas; r++) {
      const podName = comp.podNames?.[r]
      if (podName) map[`prefill-${pi}`] = [podName]
      pi++
    }
  }

  let di = 0
  for (const comp of selectedStack.components.decode) {
    for (let r = 0; r < comp.replicas; r++) {
      const podName = comp.podNames?.[r]
      if (podName) map[`decode-${di}`] = [podName]
      di++
    }
  }

  let si = 0
  for (const comp of selectedStack.components.both) {
    for (let r = 0; r < comp.replicas; r++) {
      const podName = comp.podNames?.[r]
      if (podName) map[`server-${si}`] = [podName]
      si++
    }
  }

  return map
}

function buildLinks(dynamicNodes: FlowNode[]): FlowLink[] {
  const flowLinks: FlowLink[] = [
    { source: 'requests', target: 'epp', value: 450, percentage: 100, type: 'prefill' },
  ]

  const prefillNodes = dynamicNodes.filter(n => n.type === 'prefill' && n.id.startsWith('prefill-'))
  const decodeNodes = dynamicNodes.filter(n => n.type === 'decode')
  const serverNodes = dynamicNodes.filter(n => n.id.startsWith('server-'))

  if (prefillNodes.length > 0 && decodeNodes.length > 0) {
    const prefillPercent = Math.round(80 / prefillNodes.length)
    prefillNodes.forEach((node, i) => {
      flowLinks.push({
        source: 'epp',
        target: node.id,
        value: Math.round(350 / prefillNodes.length),
        percentage: prefillPercent - (i * 2),
        type: 'prefill',
      })
    })

    const decodePercent = Math.round(20 / decodeNodes.length)
    decodeNodes.forEach((node, i) => {
      flowLinks.push({
        source: 'epp',
        target: node.id,
        value: Math.round(100 / decodeNodes.length),
        percentage: decodePercent - i,
        type: 'decode',
      })
    })

    if (decodeNodes.length > 0) {
      prefillNodes.forEach(prefillNode => {
        decodeNodes.forEach(decodeNode => {
          flowLinks.push({
            source: prefillNode.id,
            target: decodeNode.id,
            value: Math.round(50 / decodeNodes.length),
            percentage: Math.round(100 / decodeNodes.length),
            type: 'decode',
          })
        })
      })
    }
  } else if (serverNodes.length > 0) {
    const percent = Math.round(100 / serverNodes.length)
    serverNodes.forEach((node, i) => {
      flowLinks.push({
        source: 'epp',
        target: node.id,
        value: Math.round(450 / serverNodes.length),
        percentage: percent - (i * 3),
        type: 'prefill',
      })
    })
  } else if (decodeNodes.length > 0) {
    const percent = Math.round(100 / decodeNodes.length)
    decodeNodes.forEach((node, i) => {
      flowLinks.push({
        source: 'epp',
        target: node.id,
        value: Math.round(450 / decodeNodes.length),
        percentage: percent - (i * 2),
        type: 'decode',
      })
    })
  } else if (prefillNodes.length > 0) {
    const percent = Math.round(100 / prefillNodes.length)
    prefillNodes.forEach((node, i) => {
      flowLinks.push({
        source: 'epp',
        target: node.id,
        value: Math.round(450 / prefillNodes.length),
        percentage: percent - (i * 2),
        type: 'prefill',
      })
    })
  } else {
    return [
      { source: 'requests', target: 'epp', value: 450, percentage: 100, type: 'prefill' },
      { source: 'epp', target: 'prefill-0', value: 120, percentage: 27, type: 'prefill' },
      { source: 'epp', target: 'prefill-1', value: 115, percentage: 26, type: 'prefill' },
      { source: 'epp', target: 'prefill-2', value: 95, percentage: 21, type: 'prefill' },
      { source: 'epp', target: 'decode-0', value: 65, percentage: 14, type: 'decode' },
      { source: 'epp', target: 'decode-1', value: 55, percentage: 12, type: 'decode' },
      { source: 'prefill-0', target: 'decode-1', value: 60, percentage: 50, type: 'decode' },
      { source: 'prefill-1', target: 'decode-1', value: 58, percentage: 50, type: 'decode' },
      { source: 'prefill-2', target: 'decode-1', value: 48, percentage: 50, type: 'decode' },
    ]
  }

  return flowLinks
}

function buildSummaryMetrics(links: FlowLink[]): RoutingSummaryMetrics {
  const prefillTotal = links
    .filter(link => link.source === 'epp' && link.target.startsWith('prefill'))
    .reduce((sum, link) => sum + link.value, 0)
  const decodeTotal = links
    .filter(link => link.source === 'epp' && link.target.startsWith('decode'))
    .reduce((sum, link) => sum + link.value, 0)

  return {
    totalRps: 450,
    prefillRps: prefillTotal,
    decodeRps: decodeTotal,
    prefillPercent: Math.round((prefillTotal / 450) * 100),
    decodePercent: Math.round((decodeTotal / 450) * 100),
  }
}

function scaleNodesForExpanded(rawNodes: FlowNode[], isExpanded: boolean): FlowNode[] {
  if (!isExpanded || rawNodes.length === 0) {
    return rawNodes
  }

  return rawNodes.map(node => ({
    ...node,
    x: 10 + (node.x - 12) * (210 / 78),
  }))
}

export function useEPPRoutingData(): EPPRoutingDataResult {
  const stackContext = useOptionalStack()
  const [hoveredLink, setHoveredLink] = useState<string | null>(null)
  const [showParticles, setShowParticles] = useState(true)
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const [nodeMetrics, setNodeMetrics] = useState<Record<string, NodeMetric>>({})
  const [metricsHistory, setMetricsHistory] = useState<Record<string, NodeMetricHistory>>({})
  const [selectedMetricTypes, setSelectedMetricTypes] = useState<MetricType[]>(['load'])
  const [viewMode, setViewMode] = useState<ViewMode>('default')
  const uniqueId = `epp-${Math.random().toString(36).substr(2, 9)}`
  const { isExpanded } = useCardExpanded()
  const selectedStack = stackContext?.selectedStack ?? null
  const { shouldUseDemoData: isDemoMode, showDemoBadge } = useCardDemoState({ requires: 'stack' })
  const { metrics: prometheusMetrics, isRefreshing: metricsRefreshing } = usePrometheusMetrics(
    selectedStack?.cluster,
    selectedStack?.namespace,
  )

  useReportCardDataState({
    isDemoData: showDemoBadge,
    isRefreshing: (stackContext?.isRefreshing ?? false) || metricsRefreshing,
    isFailed: false,
    consecutiveFailures: 0,
    hasData: true,
  })

  const rawNodes = useMemo(() => buildRawNodes(selectedStack, Boolean(isDemoMode)), [selectedStack, isDemoMode])
  const dynamicNodes = scaleNodesForExpanded(rawNodes, isExpanded)

  const toggleMetric = (metric: MetricType) => {
    setSelectedMetricTypes(prev => {
      if (prev.includes(metric)) {
        if (prev.length === 1) return prev
        return prev.filter(selectedMetric => selectedMetric !== metric)
      }
      return [...prev, metric]
    })
  }

  const nodePodMap = useMemo(() => buildNodePodMap(selectedStack), [selectedStack])
  const dynamicNodesRef = useRef(dynamicNodes)
  const nodePodMapRef = useRef(nodePodMap)
  const prometheusMetricsRef = useRef(prometheusMetrics)

  useEffect(() => {
    dynamicNodesRef.current = dynamicNodes
  }, [dynamicNodes])

  useEffect(() => {
    nodePodMapRef.current = nodePodMap
  }, [nodePodMap])

  useEffect(() => {
    prometheusMetricsRef.current = prometheusMetrics
  }, [prometheusMetrics])

  useEffect(() => {
    const updateMetrics = () => {
      const newMetrics: Record<string, NodeMetric> = {}
      dynamicNodesRef.current.forEach(node => {
        if (node.type !== 'source') {
          const pods = nodePodMapRef.current[node.id]
          const pod = pods?.[0]
          const prom = pod && prometheusMetricsRef.current?.[pod]
          if (prom) {
            newMetrics[node.id] = {
              load: Math.round(prom.kvCacheUsage * 100),
              rps: Math.round(prom.throughputTps),
            }
          } else {
            newMetrics[node.id] = {
              load: Math.floor(40 + Math.random() * 50),
              rps: Math.floor(80 + Math.random() * 150),
            }
          }
        }
      })
      setNodeMetrics(newMetrics)

      setMetricsHistory(prev => {
        const updated = { ...prev }
        Object.entries(newMetrics).forEach(([id, metric]) => {
          if (!updated[id]) {
            updated[id] = { load: [], rps: [] }
          }
          updated[id] = {
            load: [...updated[id].load.slice(-19), metric.load],
            rps: [...updated[id].rps.slice(-19), metric.rps],
          }
        })
        return updated
      })
    }

    updateMetrics()
    const interval = setInterval(updateMetrics, POLL_INTERVAL_FAST_MS)
    return () => clearInterval(interval)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const getNodeWithMetrics = (node: FlowNode): FlowNode => {
    if (node.isGhost) return node
    const metric = nodeMetrics[node.id]
    if (!metric) return node
    return { ...node, load: metric.load }
  }

  const links = useMemo(() => buildLinks(dynamicNodes), [dynamicNodes])
  const metrics = useMemo(() => buildSummaryMetrics(links), [links])

  const generatePath = (source: FlowNode, target: FlowNode): string => {
    const midX = (source.x + target.x) / 2
    const midY = (source.y + target.y) / 2
    const curve = Math.abs(source.y - target.y) > 20 ? 8 : 3
    const controlY = midY - curve
    return `M ${source.x} ${source.y} Q ${midX} ${controlY} ${target.x} ${target.y}`
  }

  const showEmptyState = !selectedStack && !isDemoMode

  return {
    dynamicNodes,
    generatePath,
    getNodeWithMetrics,
    hoveredLink,
    isDemoMode: Boolean(isDemoMode),
    isExpanded,
    links,
    metrics,
    metricsHistory,
    nodeMetrics,
    onHoveredLinkChange: setHoveredLink,
    onSelectedNodeChange: setSelectedNode,
    selectedMetricTypes,
    selectedNode,
    selectedStack,
    showEmptyState,
    showParticles,
    toggleMetric,
    toggleShowParticles: () => setShowParticles(prev => !prev),
    toggleViewMode: () => setViewMode(prev => (prev === 'default' ? 'horseshoe' : 'default')),
    uniqueId,
    viewMode,
  }
}
