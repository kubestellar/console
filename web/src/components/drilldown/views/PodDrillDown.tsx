import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useMissions } from '../../../hooks/useMissions'
import { useLocalAgent } from '../../../hooks/useLocalAgent'
import { useDrillDownActions, useDrillDown } from '../../../hooks/useDrillDown'
import { useCanI } from '../../../hooks/usePermissions'
import { ClusterBadge } from '../../ui/ClusterBadge'
import { FileText, Terminal, Zap, Code, Info, Tag, ChevronDown, ChevronUp, Loader2, Copy, Check, Box, Layers, Server, AlertTriangle, Pencil, Trash2, Plus, Save, X, RefreshCw, Stethoscope, Wrench, Sparkles } from 'lucide-react'
import { cn } from '../../../lib/cn'
import { ConsoleAIIcon } from '../../ui/ConsoleAIIcon'
import { useTranslation } from 'react-i18next'

// Helper to determine issue severity for styling
const getIssueSeverity = (issue: string): 'critical' | 'warning' | 'info' => {
  const lowerIssue = issue.toLowerCase()

  if (lowerIssue.includes('crashloopbackoff') ||
      lowerIssue.includes('oomkilled') ||
      lowerIssue.includes('oom') ||
      lowerIssue.includes('imagepullbackoff') ||
      lowerIssue.includes('errimagepull') ||
      lowerIssue.includes('failed') ||
      lowerIssue.includes('error') ||
      lowerIssue.includes('evicted')) {
    return 'critical'
  }
  if (lowerIssue.includes('pending') || lowerIssue.includes('waiting')) {
    return 'warning'
  }
  if (lowerIssue.includes('creating') || lowerIssue.includes('running')) {
    return 'info'
  }

  return 'warning'
}

interface Props {
  data: Record<string, unknown>
}

type TabType = 'overview' | 'labels' | 'related' | 'describe' | 'logs' | 'events' | 'yaml'

interface RelatedResource {
  kind: string
  name: string
  namespace?: string
}

// Cache structure stored in view data
interface CachedData {
  describeOutput?: string
  logsOutput?: string
  eventsOutput?: string
  yamlOutput?: string
  podStatusOutput?: string
  aiAnalysis?: string
  labels?: Record<string, string>
  annotations?: Record<string, string>
  configMaps?: string[]
  secrets?: string[]
  pvcs?: string[]
  serviceAccount?: string
  ownerChain?: RelatedResource[]
  fetchedAt?: number
}

// ============================================================================
// Module-level pod data cache - persists when dialog is closed/reopened
// ============================================================================
interface PodCacheEntry extends CachedData {
  lastOpened: number
  openCount: number
}

// Cache key format: cluster/namespace/podName
const podDataCache = new Map<string, PodCacheEntry>()

// Consider opening again within this window as "looking for something new" (triggers auto-refresh)
const RAPID_REOPEN_THRESHOLD_MS = 10000 // 10 seconds

function getPodCacheKey(cluster: string, namespace: string, pod: string): string {
  return `${cluster}/${namespace}/${pod}`
}

function getPodCache(cluster: string, namespace: string, pod: string): PodCacheEntry | undefined {
  return podDataCache.get(getPodCacheKey(cluster, namespace, pod))
}

function setPodCache(cluster: string, namespace: string, pod: string, data: Partial<PodCacheEntry>) {
  const key = getPodCacheKey(cluster, namespace, pod)
  const existing = podDataCache.get(key) || { lastOpened: Date.now(), openCount: 0 }
  podDataCache.set(key, { ...existing, ...data })
}

// Clean up old cache entries (older than 5 minutes)
function cleanupPodCache() {
  const maxAge = 5 * 60 * 1000 // 5 minutes
  const now = Date.now()
  for (const [key, entry] of podDataCache.entries()) {
    if (now - entry.lastOpened > maxAge) {
      podDataCache.delete(key)
    }
  }
}

export function PodDrillDown({ data }: Props) {
  const { t } = useTranslation()
  const cluster = data.cluster as string
  const namespace = data.namespace as string
  const podName = data.pod as string
  const { startMission } = useMissions()
  const { isConnected: agentConnected } = useLocalAgent()
  const { drillToNamespace, drillToCluster, drillToDeployment, drillToReplicaSet, drillToConfigMap, drillToSecret, drillToServiceAccount, drillToPVC } = useDrillDownActions()

  // Get cached data - first check module-level cache, then fall back to view cache
  const persistentCache = getPodCache(cluster, namespace, podName)
  const viewCache = (data._cache as CachedData) || {}
  const cache = persistentCache || viewCache

  // Track if this is a fresh mount vs navigation back
  const hasLoadedRef = useRef(false)
  // Track if we should auto-refresh due to rapid reopen
  const shouldAutoRefreshRef = useRef(false)

  // Check if this is a rapid reopen (user looking for updated data)
  const now = Date.now()
  if (persistentCache && now - persistentCache.lastOpened < RAPID_REOPEN_THRESHOLD_MS) {
    shouldAutoRefreshRef.current = true
  }

  // Update cache metadata
  setPodCache(cluster, namespace, podName, {
    lastOpened: now,
    openCount: (persistentCache?.openCount || 0) + 1,
  })

  // Clean up old cache entries periodically
  cleanupPodCache()

  const [activeTab, setActiveTab] = useState<TabType>('overview')
  const [describeOutput, setDescribeOutput] = useState<string | null>(cache.describeOutput || null)
  const [describeLoading, setDescribeLoading] = useState(false)
  const [logsOutput, setLogsOutput] = useState<string | null>(cache.logsOutput || null)
  const [logsLoading, setLogsLoading] = useState(false)
  const [eventsOutput, setEventsOutput] = useState<string | null>(cache.eventsOutput || null)
  const [eventsLoading, setEventsLoading] = useState(false)
  const [yamlOutput, setYamlOutput] = useState<string | null>(cache.yamlOutput || null)
  const [yamlLoading, setYamlLoading] = useState(false)
  const [podStatusOutput, setPodStatusOutput] = useState<string | null>(cache.podStatusOutput || null)
  const [podStatusLoading, setPodStatusLoading] = useState(false)
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(cache.aiAnalysis || null)
  const [aiAnalysisLoading, setAiAnalysisLoading] = useState(false)
  const [labels, setLabels] = useState<Record<string, string> | null>(cache.labels || null)
  const [annotations, setAnnotations] = useState<Record<string, string> | null>(cache.annotations || null)
  const [showAllLabels, setShowAllLabels] = useState(false)
  const [showAllAnnotations, setShowAllAnnotations] = useState(false)
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [editingLabels, setEditingLabels] = useState(false)
  const [pendingLabelChanges, setPendingLabelChanges] = useState<Record<string, string | null>>({})
  const [newLabelKey, setNewLabelKey] = useState('')
  const [newLabelValue, setNewLabelValue] = useState('')
  const [labelSaving, setLabelSaving] = useState(false)
  const [labelError, setLabelError] = useState<string | null>(null)
  const [editingAnnotations, setEditingAnnotations] = useState(false)
  const [pendingAnnotationChanges, setPendingAnnotationChanges] = useState<Record<string, string | null>>({})
  const [newAnnotationKey, setNewAnnotationKey] = useState('')
  const [newAnnotationValue, setNewAnnotationValue] = useState('')
  const [annotationSaving, setAnnotationSaving] = useState(false)
  const [annotationError, setAnnotationError] = useState<string | null>(null)
  const [relatedResources, setRelatedResources] = useState<RelatedResource[]>(cache.ownerChain || [])
  const [relatedLoading, setRelatedLoading] = useState(false)
  const [configMaps, setConfigMaps] = useState<string[]>(cache.configMaps || [])
  const [secrets, setSecrets] = useState<string[]>(cache.secrets || [])
  const [pvcs, setPvcs] = useState<string[]>(cache.pvcs || [])
  const [serviceAccount, setServiceAccount] = useState<string | null>(cache.serviceAccount || null)
  const [ownerChain, setOwnerChain] = useState<RelatedResource[]>(cache.ownerChain || [])
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [canDeletePod, setCanDeletePod] = useState<boolean | null>(null)
  const [deletingPod, setDeletingPod] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const { checkPermission } = useCanI()
  const { close: closeDrillDown } = useDrillDown()

  // Pod data from the issue
  const status = data.status as string
  const restarts = (data.restarts as number) || 0
  const reason = data.reason as string
  const passedIssues = (data.issues as string[]) || []
  const passedLabels = data.labels as Record<string, string> | undefined
  const passedAnnotations = data.annotations as Record<string, string> | undefined

  // Unhealthy statuses that should be flagged as issues
  const UNHEALTHY_STATUSES = [
    'Evicted', 'Failed', 'Error', 'CrashLoopBackOff', 'ImagePullBackOff',
    'ErrImagePull', 'CreateContainerConfigError', 'InvalidImageName',
    'OOMKilled', 'Terminating', 'Unknown', 'ContainerStatusUnknown',
    'Pending', 'Init:Error', 'Init:CrashLoopBackOff', 'PodInitializing'
  ]

  // Compute all issues including status-based ones
  const issues = useMemo(() => {
    const allIssues = [...passedIssues]

    // Check status from data prop
    if (status && UNHEALTHY_STATUSES.some(s => status.toLowerCase().includes(s.toLowerCase()))) {
      if (!allIssues.some(i => i.toLowerCase() === status.toLowerCase())) {
        allIssues.unshift(status)
      }
    }

    // Parse kubectl output for status - handles cases where data.status is stale
    if (podStatusOutput) {
      // Parse the STATUS column from kubectl get pod output
      const lines = podStatusOutput.split('\n')
      const dataLine = lines.find(line => line.includes(podName))
      if (dataLine) {
        const parts = dataLine.trim().split(/\s+/)
        // Format: NAME READY STATUS RESTARTS AGE ...
        if (parts.length >= 3) {
          const kubectlStatus = parts[2]
          // Check if kubectl status is unhealthy
          if (kubectlStatus && UNHEALTHY_STATUSES.some(s => kubectlStatus.toLowerCase().includes(s.toLowerCase()))) {
            if (!allIssues.some(i => i.toLowerCase() === kubectlStatus.toLowerCase())) {
              allIssues.unshift(kubectlStatus)
            }
          }
          // Check READY column (e.g., 0/1)
          const ready = parts[1]
          if (ready && ready.includes('/')) {
            const [current, total] = ready.split('/')
            if (current !== total && total !== '0') {
              const notReadyMsg = `${current}/${total} containers ready`
              if (!allIssues.some(i => i.includes('containers ready'))) {
                allIssues.push(notReadyMsg)
              }
            }
          }
        }
      }
    }

    // Add reason as an issue if it exists and indicates a problem
    if (reason && !allIssues.some(i => i.toLowerCase() === reason.toLowerCase())) {
      allIssues.push(reason)
    }

    return allIssues
  }, [passedIssues, status, reason, podStatusOutput, podName])

  // Use passed labels/annotations if available
  useEffect(() => {
    if (passedLabels) setLabels(passedLabels)
    if (passedAnnotations) setAnnotations(passedAnnotations)
  }, [passedLabels, passedAnnotations])

  // Fetch pod describe output via local agent
  const fetchDescribe = async (force = false) => {
    if (!agentConnected || (!force && describeOutput)) return
    setDescribeLoading(true)

    try {
      const ws = new WebSocket('ws://127.0.0.1:8585/ws')
      const requestId = `describe-${Date.now()}`

      ws.onopen = () => {
        ws.send(JSON.stringify({
          id: requestId,
          type: 'kubectl',
          payload: { context: cluster, args: ['describe', 'pod', podName, '-n', namespace] }
        }))
      }

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data)
        if (msg.id === requestId && msg.payload?.output) {
          setDescribeOutput(msg.payload.output)
          // Parse labels and annotations from describe output if not already set
          if (!labels || !annotations) {
            const output = msg.payload.output as string
            const labelsMatch = output.match(/Labels:\s*([\s\S]*?)(?=Annotations:|$)/i)
            const annotationsMatch = output.match(/Annotations:\s*([\s\S]*?)(?=Status:|Controlled By:|$)/i)

            if (labelsMatch && !labels) {
              const parsed: Record<string, string> = {}
              labelsMatch[1].trim().split('\n').forEach(line => {
                const [key, ...valueParts] = line.trim().split('=')
                if (key && key !== '<none>') parsed[key] = valueParts.join('=')
              })
              if (Object.keys(parsed).length > 0) setLabels(parsed)
            }

            if (annotationsMatch && !annotations) {
              const parsed: Record<string, string> = {}
              annotationsMatch[1].trim().split('\n').forEach(line => {
                const colonIdx = line.indexOf(':')
                if (colonIdx > 0) {
                  const key = line.substring(0, colonIdx).trim()
                  const value = line.substring(colonIdx + 1).trim()
                  if (key && key !== '<none>') parsed[key] = value
                }
              })
              if (Object.keys(parsed).length > 0) setAnnotations(parsed)
            }
          }
        }
        ws.close()
        setDescribeLoading(false)
      }

      ws.onerror = () => {
        setDescribeLoading(false)
        ws.close()
      }
    } catch {
      setDescribeLoading(false)
    }
  }

  // Fetch pod logs via local agent
  const fetchLogs = async (force = false) => {
    if (!agentConnected || (!force && logsOutput)) return
    setLogsLoading(true)

    try {
      const ws = new WebSocket('ws://127.0.0.1:8585/ws')
      const requestId = `logs-${Date.now()}`

      ws.onopen = () => {
        ws.send(JSON.stringify({
          id: requestId,
          type: 'kubectl',
          payload: { context: cluster, args: ['logs', podName, '-n', namespace, '--tail=500'] }
        }))
      }

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data)
        if (msg.id === requestId && msg.payload?.output) {
          setLogsOutput(msg.payload.output)
        }
        ws.close()
        setLogsLoading(false)
      }

      ws.onerror = () => {
        setLogsLoading(false)
        ws.close()
      }
    } catch {
      setLogsLoading(false)
    }
  }

  // Fetch pod events via local agent
  const fetchEvents = async (force = false) => {
    if (!agentConnected || (!force && eventsOutput)) return
    setEventsLoading(true)

    try {
      const ws = new WebSocket('ws://127.0.0.1:8585/ws')
      const requestId = `events-${Date.now()}`

      ws.onopen = () => {
        ws.send(JSON.stringify({
          id: requestId,
          type: 'kubectl',
          payload: { context: cluster, args: ['get', 'events', '-n', namespace, '--field-selector', `involvedObject.name=${podName}`, '-o', 'wide'] }
        }))
      }

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data)
        if (msg.id === requestId && msg.payload?.output) {
          setEventsOutput(msg.payload.output)
        }
        ws.close()
        setEventsLoading(false)
      }

      ws.onerror = () => {
        setEventsLoading(false)
        ws.close()
      }
    } catch {
      setEventsLoading(false)
    }
  }

  // Fetch AI analysis for pod issues - gathers comprehensive context
  const fetchAiAnalysis = async () => {
    if (!agentConnected || aiAnalysisLoading) return
    setAiAnalysisLoading(true)

    try {
      // Helper to run a kubectl command and get output
      const runKubectl = (args: string[]): Promise<string> => {
        return new Promise((resolve) => {
          const ws = new WebSocket('ws://127.0.0.1:8585/ws')
          const requestId = `kubectl-${Date.now()}-${Math.random().toString(36).slice(2)}`
          let output = ''

          const timeout = setTimeout(() => {
            ws.close()
            resolve(output || 'Command timed out')
          }, 10000)

          ws.onopen = () => {
            ws.send(JSON.stringify({
              id: requestId,
              type: 'kubectl',
              payload: { context: cluster, args }
            }))
          }
          ws.onmessage = (event) => {
            const msg = JSON.parse(event.data)
            if (msg.id === requestId && msg.payload?.output) {
              output = msg.payload.output
            }
            clearTimeout(timeout)
            ws.close()
            resolve(output)
          }
          ws.onerror = () => {
            clearTimeout(timeout)
            ws.close()
            resolve(output || 'Command failed')
          }
        })
      }

      // Gather all context in parallel
      const [
        podGet,
        podDescribe,
        podYaml,
        podLogs,
        podEvents,
        namespaceEvents,
      ] = await Promise.all([
        runKubectl(['get', 'pod', podName, '-n', namespace, '-o', 'wide']),
        runKubectl(['describe', 'pod', podName, '-n', namespace]),
        runKubectl(['get', 'pod', podName, '-n', namespace, '-o', 'yaml']),
        runKubectl(['logs', podName, '-n', namespace, '--tail=200']),
        runKubectl(['get', 'events', '-n', namespace, '--field-selector', `involvedObject.name=${podName}`]),
        runKubectl(['get', 'events', '-n', namespace, '--sort-by=.lastTimestamp']),
      ])

      // Extract owner references from YAML to get deployment/replicaset info
      let ownerInfo = ''
      const ownerMatch = podYaml.match(/ownerReferences:[\s\S]*?(?=\nspec:|$)/)
      if (ownerMatch) {
        const kindMatch = ownerMatch[0].match(/kind:\s*(\w+)/)
        const nameMatch = ownerMatch[0].match(/name:\s*([\w-]+)/)
        if (kindMatch && nameMatch) {
          const ownerKind = kindMatch[1].toLowerCase()
          const ownerName = nameMatch[1]
          if (ownerKind === 'replicaset') {
            const [rsDescribe, rsYaml] = await Promise.all([
              runKubectl(['describe', 'replicaset', ownerName, '-n', namespace]),
              runKubectl(['get', 'replicaset', ownerName, '-n', namespace, '-o', 'yaml']),
            ])
            ownerInfo = `\n--- REPLICASET INFO ---\n${rsDescribe}\n`

            // Try to get deployment from RS
            const deployMatch = rsYaml.match(/ownerReferences:[\s\S]*?name:\s*([\w-]+)/)
            if (deployMatch) {
              const deployDescribe = await runKubectl(['describe', 'deployment', deployMatch[1], '-n', namespace])
              ownerInfo += `\n--- DEPLOYMENT INFO ---\n${deployDescribe}\n`
            }
          } else if (ownerKind === 'deployment') {
            const deployDescribe = await runKubectl(['describe', 'deployment', ownerName, '-n', namespace])
            ownerInfo += `\n--- DEPLOYMENT INFO ---\n${deployDescribe}\n`
          } else if (ownerKind === 'job') {
            const jobDescribe = await runKubectl(['describe', 'job', ownerName, '-n', namespace])
            ownerInfo += `\n--- JOB INFO ---\n${jobDescribe}\n`
          }
        }
      }

      // Extract node name and get node info if pod was scheduled
      let nodeInfo = ''
      const nodeMatch = podDescribe.match(/Node:\s*([\w.-]+)/)
      if (nodeMatch && nodeMatch[1] !== '<none>') {
        const nodeDescribe = await runKubectl(['describe', 'node', nodeMatch[1]])
        // Just get conditions and capacity, not full describe
        const conditionsMatch = nodeDescribe.match(/Conditions:[\s\S]*?(?=Addresses:|$)/)
        const capacityMatch = nodeDescribe.match(/Capacity:[\s\S]*?(?=Allocatable:|$)/)
        const allocatableMatch = nodeDescribe.match(/Allocatable:[\s\S]*?(?=System Info:|$)/)
        nodeInfo = `\n--- NODE INFO (${nodeMatch[1]}) ---\n`
        if (conditionsMatch) nodeInfo += `Conditions:\n${conditionsMatch[0]}\n`
        if (capacityMatch) nodeInfo += `${capacityMatch[0]}\n`
        if (allocatableMatch) nodeInfo += `${allocatableMatch[0]}\n`
      }

      // Build comprehensive context for AI
      const analysisContext = `
=== POD STATUS (kubectl get pod -o wide) ===
${podGet}

=== POD DESCRIBE ===
${podDescribe}

=== POD EVENTS ===
${podEvents || 'No pod-specific events'}

=== NAMESPACE RECENT EVENTS ===
${namespaceEvents || 'No namespace events'}

=== POD LOGS (last 200 lines) ===
${podLogs || 'No logs available (pod may not have started)'}
${ownerInfo}
${nodeInfo}
=== LABELS ===
${labels ? Object.entries(labels).map(([k, v]) => `${k}=${v}`).join('\n') : 'No labels available'}

=== ANNOTATIONS ===
${annotations ? Object.entries(annotations).map(([k, v]) => `${k}=${v}`).join('\n') : 'No annotations available'}
`.trim()

      // Now request AI analysis via Claude
      const ws = new WebSocket('ws://127.0.0.1:8585/ws')
      const requestId = `ai-analyze-${Date.now()}`

      ws.onopen = () => {
        ws.send(JSON.stringify({
          id: requestId,
          type: 'claude',
          payload: {
            prompt: `You are a Kubernetes expert. Analyze this pod issue and provide a concise diagnosis.

Pod: ${podName}
Namespace: ${namespace}
Reported Status: ${status}
Reported Issues: ${issues.join(', ')}

COMPREHENSIVE POD CONTEXT:
${analysisContext}

Based on ALL the information above (status, events, logs, owner resources, node state), provide:
1. ROOT CAUSE: What exactly happened? (Look for Evicted, OOMKilled, ImagePullBackOff, scheduling failures, resource limits, node issues, etc.)
2. EVIDENCE: What specific data points confirm this?
3. FIX: What's the recommended action?

Be specific and reference actual values from the data. Keep response to 3-4 sentences max.`
          }
        }))
      }

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data)
        if (msg.id === requestId) {
          if (msg.payload?.content) {
            setAiAnalysis(msg.payload.content)
          } else if (msg.payload?.error || msg.payload?.message) {
            setAiAnalysis(`Analysis unavailable: ${msg.payload.error || msg.payload.message}`)
          } else {
            setAiAnalysis('Analysis complete - no specific issues identified.')
          }
        }
        ws.close()
        setAiAnalysisLoading(false)
      }

      ws.onerror = () => {
        setAiAnalysis('Could not connect to AI analysis service.')
        setAiAnalysisLoading(false)
        ws.close()
      }
    } catch (err) {
      setAiAnalysis(`Failed to perform AI analysis: ${err}`)
      setAiAnalysisLoading(false)
    }
  }

  // Fetch pod status via kubectl get
  const fetchPodStatus = async (force = false) => {
    if (!agentConnected || (!force && podStatusOutput)) return
    setPodStatusLoading(true)

    try {
      const ws = new WebSocket('ws://127.0.0.1:8585/ws')
      const requestId = `status-${Date.now()}`

      ws.onopen = () => {
        ws.send(JSON.stringify({
          id: requestId,
          type: 'kubectl',
          payload: { context: cluster, args: ['get', 'pod', podName, '-n', namespace, '-o', 'wide'] }
        }))
      }

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data)
        if (msg.id === requestId && msg.payload?.output) {
          setPodStatusOutput(msg.payload.output)
        }
        ws.close()
        setPodStatusLoading(false)
      }

      ws.onerror = () => {
        setPodStatusLoading(false)
        ws.close()
      }
    } catch {
      setPodStatusLoading(false)
    }
  }

  // Fetch pod YAML via local agent
  const fetchYaml = async (force = false) => {
    if (!agentConnected || (!force && yamlOutput)) return
    setYamlLoading(true)

    try {
      const ws = new WebSocket('ws://127.0.0.1:8585/ws')
      const requestId = `yaml-${Date.now()}`

      ws.onopen = () => {
        ws.send(JSON.stringify({
          id: requestId,
          type: 'kubectl',
          payload: { context: cluster, args: ['get', 'pod', podName, '-n', namespace, '-o', 'yaml'] }
        }))
      }

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data)
        if (msg.id === requestId && msg.payload?.output) {
          setYamlOutput(msg.payload.output)
        }
        ws.close()
        setYamlLoading(false)
      }

      ws.onerror = () => {
        setYamlLoading(false)
        ws.close()
      }
    } catch {
      setYamlLoading(false)
    }
  }

  // Pre-fetch tab data when agent connects
  // Batched to limit concurrent WebSocket connections (max 2-3 at a time)
  // Auto-refresh if the same pod is opened rapidly (user looking for changes)
  useEffect(() => {
    if (!agentConnected || hasLoadedRef.current) return
    hasLoadedRef.current = true

    // Determine if we should force refresh (rapid reopen or no cached data)
    const forceRefresh = shouldAutoRefreshRef.current

    const loadData = async () => {
      // Batch 1: Overview data (2 concurrent)
      await Promise.all([
        (forceRefresh || !podStatusOutput) && fetchPodStatus(forceRefresh),
        (forceRefresh || !eventsOutput) && fetchEvents(forceRefresh),
      ].filter(Boolean))

      // Batch 2: Related resources + describe (2 concurrent)
      await Promise.all([
        (forceRefresh || relatedResources.length === 0) && fetchRelatedResources(forceRefresh),
        (forceRefresh || !describeOutput) && fetchDescribe(forceRefresh),
      ].filter(Boolean))

      // Batch 3: Logs + YAML (2 concurrent, lower priority)
      await Promise.all([
        (forceRefresh || !logsOutput) && fetchLogs(forceRefresh),
        (forceRefresh || !yamlOutput) && fetchYaml(forceRefresh),
      ].filter(Boolean))
    }

    loadData()
  }, [agentConnected])

  // Save data to persistent cache whenever it changes
  useEffect(() => {
    setPodCache(cluster, namespace, podName, {
      describeOutput: describeOutput || undefined,
      logsOutput: logsOutput || undefined,
      eventsOutput: eventsOutput || undefined,
      yamlOutput: yamlOutput || undefined,
      podStatusOutput: podStatusOutput || undefined,
      aiAnalysis: aiAnalysis || undefined,
      labels: labels || undefined,
      annotations: annotations || undefined,
      configMaps: configMaps.length > 0 ? configMaps : undefined,
      secrets: secrets.length > 0 ? secrets : undefined,
      pvcs: pvcs.length > 0 ? pvcs : undefined,
      serviceAccount: serviceAccount || undefined,
      ownerChain: ownerChain.length > 0 ? ownerChain : undefined,
      fetchedAt: Date.now(),
    })
  }, [cluster, namespace, podName, describeOutput, logsOutput, eventsOutput, yamlOutput, podStatusOutput, aiAnalysis, labels, annotations, configMaps, secrets, pvcs, serviceAccount, ownerChain])

  const handleRepairPod = () => {
    startMission({
      title: `Repair Pod ${podName}`,
      description: `Diagnose and fix issues with pod ${podName}`,
      type: 'repair',
      cluster,
      initialPrompt: `I need help diagnosing and repairing issues with pod "${podName}" in namespace "${namespace}" on cluster "${cluster}".

Current Status: ${status}
Restarts: ${restarts}
${reason ? `Reason: ${reason}` : ''}
${issues.length > 0 ? `Issues: ${issues.join(', ')}` : ''}

Please help me:
1. Investigate the root cause of the issues
2. Check the pod logs and events
3. Analyze the pod configuration
4. Suggest remediation steps
5. Apply fixes if appropriate (with my confirmation)

Please proceed step by step and ask for confirmation before making any changes.`,
      context: {
        podName,
        namespace,
        cluster,
        status,
        restarts,
        issues,
      },
    })
  }

  // Check if user can delete pods in this namespace
  const checkDeletePermission = useCallback(async () => {
    try {
      const result = await checkPermission({
        cluster,
        verb: 'delete',
        resource: 'pods',
        namespace,
      })
      setCanDeletePod(result.allowed)
    } catch {
      setCanDeletePod(false)
    }
  }, [cluster, namespace, checkPermission])

  // Check delete permission on mount
  useEffect(() => {
    checkDeletePermission()
  }, [checkDeletePermission])

  // Check if pod is managed by a controller (can be safely deleted and will be recreated)
  const isManagedPod = ownerChain.some(owner =>
    ['ReplicaSet', 'Deployment', 'StatefulSet', 'DaemonSet', 'Job'].includes(owner.kind)
  )

  // Delete pod handler
  const handleDeletePod = async () => {
    if (!agentConnected || !canDeletePod) return

    // Confirm deletion
    const confirmMessage = isManagedPod
      ? `Delete pod "${podName}"? It will be recreated by its controller.`
      : `Delete pod "${podName}"? This pod is not managed by a controller and will NOT be recreated.`

    if (!window.confirm(confirmMessage)) return

    setDeletingPod(true)
    setDeleteError(null)

    try {
      const ws = new WebSocket('ws://127.0.0.1:8585/ws')
      const requestId = `delete-pod-${Date.now()}`

      ws.onopen = () => {
        ws.send(JSON.stringify({
          id: requestId,
          type: 'kubectl',
          payload: { context: cluster, args: ['delete', 'pod', podName, '-n', namespace] }
        }))
      }

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data)
        if (msg.id === requestId) {
          if (msg.type === 'error' || msg.payload?.exitCode !== 0) {
            setDeleteError(msg.payload?.error || 'Failed to delete pod')
          } else {
            // Success - close the drill down
            closeDrillDown()
          }
        }
        ws.close()
        setDeletingPod(false)
      }

      ws.onerror = () => {
        setDeleteError('Connection error')
        setDeletingPod(false)
        ws.close()
      }
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Unknown error')
      setDeletingPod(false)
    }
  }

  const handleCopy = (field: string, value: string) => {
    navigator.clipboard.writeText(value)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 2000)
  }

  // Save label changes via kubectl
  const saveLabels = async () => {
    if (!agentConnected) return
    setLabelSaving(true)
    setLabelError(null)

    try {
      const runKubectl = (args: string[]): Promise<{ success: boolean; error?: string }> => {
        return new Promise((resolve) => {
          const ws = new WebSocket('ws://127.0.0.1:8585/ws')
          const requestId = `label-${Date.now()}-${Math.random().toString(36).slice(2)}`

          const timeout = setTimeout(() => {
            ws.close()
            resolve({ success: false, error: 'Command timed out' })
          }, 10000)

          ws.onopen = () => {
            ws.send(JSON.stringify({
              id: requestId,
              type: 'kubectl',
              payload: { context: cluster, args }
            }))
          }
          ws.onmessage = (event) => {
            const msg = JSON.parse(event.data)
            if (msg.id === requestId) {
              clearTimeout(timeout)
              ws.close()
              if (msg.payload?.exitCode === 0 || msg.payload?.output) {
                resolve({ success: true })
              } else {
                resolve({ success: false, error: msg.payload?.error || 'Unknown error' })
              }
            }
          }
          ws.onerror = () => {
            clearTimeout(timeout)
            ws.close()
            resolve({ success: false, error: 'Connection failed' })
          }
        })
      }

      // Build label arguments for kubectl
      const labelArgs: string[] = ['label', 'pod', podName, '-n', namespace, '--overwrite']

      // Add new label if specified
      if (newLabelKey.trim() && newLabelValue.trim()) {
        labelArgs.push(`${newLabelKey.trim()}=${newLabelValue.trim()}`)
      }

      // Add pending changes (edits and removals)
      for (const [key, value] of Object.entries(pendingLabelChanges)) {
        if (value === null) {
          // Remove label
          labelArgs.push(`${key}-`)
        } else if (value !== labels?.[key]) {
          // Update label
          labelArgs.push(`${key}=${value}`)
        }
      }

      // Only run if there are actual changes
      if (labelArgs.length > 5) {
        const result = await runKubectl(labelArgs)
        if (!result.success) {
          setLabelError(result.error || 'Failed to save labels')
          setLabelSaving(false)
          return
        }
      }

      // Refresh labels by re-fetching describe
      setLabels(prev => {
        const updated = { ...prev }
        // Apply pending changes
        for (const [key, value] of Object.entries(pendingLabelChanges)) {
          if (value === null) {
            delete updated[key]
          } else {
            updated[key] = value
          }
        }
        // Add new label
        if (newLabelKey.trim() && newLabelValue.trim()) {
          updated[newLabelKey.trim()] = newLabelValue.trim()
        }
        return updated
      })

      // Reset edit state
      setEditingLabels(false)
      setPendingLabelChanges({})
      setNewLabelKey('')
      setNewLabelValue('')
    } catch (err) {
      setLabelError(`Failed to save: ${err}`)
    } finally {
      setLabelSaving(false)
    }
  }

  const cancelLabelEdit = () => {
    setEditingLabels(false)
    setPendingLabelChanges({})
    setNewLabelKey('')
    setNewLabelValue('')
    setLabelError(null)
  }

  const handleLabelChange = (key: string, value: string) => {
    setPendingLabelChanges(prev => ({ ...prev, [key]: value }))
  }

  const handleLabelRemove = (key: string) => {
    setPendingLabelChanges(prev => ({ ...prev, [key]: null }))
  }

  const undoLabelChange = (key: string) => {
    setPendingLabelChanges(prev => {
      const updated = { ...prev }
      delete updated[key]
      return updated
    })
  }

  // Save annotation changes via kubectl
  const saveAnnotations = async () => {
    if (!agentConnected) return
    setAnnotationSaving(true)
    setAnnotationError(null)

    try {
      const runKubectl = (args: string[]): Promise<{ success: boolean; error?: string }> => {
        return new Promise((resolve) => {
          const ws = new WebSocket('ws://127.0.0.1:8585/ws')
          const requestId = `annotate-${Date.now()}-${Math.random().toString(36).slice(2)}`

          const timeout = setTimeout(() => {
            ws.close()
            resolve({ success: false, error: 'Command timed out' })
          }, 10000)

          ws.onopen = () => {
            ws.send(JSON.stringify({
              id: requestId,
              type: 'kubectl',
              payload: { context: cluster, args }
            }))
          }
          ws.onmessage = (event) => {
            const msg = JSON.parse(event.data)
            if (msg.id === requestId) {
              clearTimeout(timeout)
              ws.close()
              if (msg.payload?.exitCode === 0 || msg.payload?.output) {
                resolve({ success: true })
              } else {
                resolve({ success: false, error: msg.payload?.error || 'Unknown error' })
              }
            }
          }
          ws.onerror = () => {
            clearTimeout(timeout)
            ws.close()
            resolve({ success: false, error: 'Connection failed' })
          }
        })
      }

      // Build annotation arguments for kubectl
      const annotateArgs: string[] = ['annotate', 'pod', podName, '-n', namespace, '--overwrite']

      // Add new annotation if specified
      if (newAnnotationKey.trim() && newAnnotationValue.trim()) {
        annotateArgs.push(`${newAnnotationKey.trim()}=${newAnnotationValue.trim()}`)
      }

      // Add pending changes (edits and removals)
      for (const [key, value] of Object.entries(pendingAnnotationChanges)) {
        if (value === null) {
          // Remove annotation
          annotateArgs.push(`${key}-`)
        } else if (value !== annotations?.[key]) {
          // Update annotation
          annotateArgs.push(`${key}=${value}`)
        }
      }

      // Only run if there are actual changes
      if (annotateArgs.length > 5) {
        const result = await runKubectl(annotateArgs)
        if (!result.success) {
          setAnnotationError(result.error || 'Failed to save annotations')
          setAnnotationSaving(false)
          return
        }
      }

      // Update local state
      setAnnotations(prev => {
        const updated = { ...prev }
        // Apply pending changes
        for (const [key, value] of Object.entries(pendingAnnotationChanges)) {
          if (value === null) {
            delete updated[key]
          } else {
            updated[key] = value
          }
        }
        // Add new annotation
        if (newAnnotationKey.trim() && newAnnotationValue.trim()) {
          updated[newAnnotationKey.trim()] = newAnnotationValue.trim()
        }
        return updated
      })

      // Reset edit state
      setEditingAnnotations(false)
      setPendingAnnotationChanges({})
      setNewAnnotationKey('')
      setNewAnnotationValue('')
    } catch (err) {
      setAnnotationError(`Failed to save: ${err}`)
    } finally {
      setAnnotationSaving(false)
    }
  }

  const cancelAnnotationEdit = () => {
    setEditingAnnotations(false)
    setPendingAnnotationChanges({})
    setNewAnnotationKey('')
    setNewAnnotationValue('')
    setAnnotationError(null)
  }

  const handleAnnotationChange = (key: string, value: string) => {
    setPendingAnnotationChanges(prev => ({ ...prev, [key]: value }))
  }

  const handleAnnotationRemove = (key: string) => {
    setPendingAnnotationChanges(prev => ({ ...prev, [key]: null }))
  }

  const undoAnnotationChange = (key: string) => {
    setPendingAnnotationChanges(prev => {
      const updated = { ...prev }
      delete updated[key]
      return updated
    })
  }

  // Fetch related resources (owner chain, configmaps, secrets, service account)
  const fetchRelatedResources = async (force = false) => {
    if (!agentConnected || (!force && relatedResources.length > 0)) return
    setRelatedLoading(true)

    try {
      const runKubectl = (args: string[]): Promise<string> => {
        return new Promise((resolve) => {
          const ws = new WebSocket('ws://127.0.0.1:8585/ws')
          const requestId = `related-${Date.now()}-${Math.random().toString(36).slice(2)}`
          let output = ''

          const timeout = setTimeout(() => {
            ws.close()
            resolve(output || '')
          }, 10000)

          ws.onopen = () => {
            ws.send(JSON.stringify({
              id: requestId,
              type: 'kubectl',
              payload: { context: cluster, args }
            }))
          }
          ws.onmessage = (event) => {
            const msg = JSON.parse(event.data)
            if (msg.id === requestId && msg.payload?.output) {
              output = msg.payload.output
            }
            clearTimeout(timeout)
            ws.close()
            resolve(output)
          }
          ws.onerror = () => {
            clearTimeout(timeout)
            ws.close()
            resolve(output || '')
          }
        })
      }

      // Get pod YAML to extract references
      const podYaml = await runKubectl(['get', 'pod', podName, '-n', namespace, '-o', 'yaml'])

      // Extract service account
      const saMatch = podYaml.match(/serviceAccountName:\s*(\S+)/)
      if (saMatch) {
        setServiceAccount(saMatch[1])
      }

      // Extract configmap references from volumes and envFrom
      const configMapRefs = new Set<string>()
      const configMapMatches = podYaml.matchAll(/configMapName:\s*(\S+)|name:\s*(\S+)\s*\n\s*configMap:/g)
      for (const match of configMapMatches) {
        const name = match[1] || match[2]
        if (name) configMapRefs.add(name)
      }
      // Also check envFrom configMapRef
      const envFromConfigMaps = podYaml.matchAll(/configMapRef:\s*\n\s*name:\s*(\S+)/g)
      for (const match of envFromConfigMaps) {
        if (match[1]) configMapRefs.add(match[1])
      }
      setConfigMaps(Array.from(configMapRefs))

      // Extract secret references from volumes and envFrom
      const secretRefs = new Set<string>()
      const secretMatches = podYaml.matchAll(/secretName:\s*(\S+)/g)
      for (const match of secretMatches) {
        if (match[1]) secretRefs.add(match[1])
      }
      // Also check envFrom secretRef
      const envFromSecrets = podYaml.matchAll(/secretRef:\s*\n\s*name:\s*(\S+)/g)
      for (const match of envFromSecrets) {
        if (match[1]) secretRefs.add(match[1])
      }
      setSecrets(Array.from(secretRefs))

      // Extract PVC references from volumes
      const pvcRefs = new Set<string>()
      const pvcMatches = podYaml.matchAll(/persistentVolumeClaim:\s*\n\s*claimName:\s*(\S+)/g)
      for (const match of pvcMatches) {
        if (match[1]) pvcRefs.add(match[1])
      }
      // Also check direct claimName pattern
      const claimNameMatches = podYaml.matchAll(/claimName:\s*(\S+)/g)
      for (const match of claimNameMatches) {
        if (match[1]) pvcRefs.add(match[1])
      }
      setPvcs(Array.from(pvcRefs))

      // Build owner chain (pod -> replicaset -> deployment)
      const chain: RelatedResource[] = []
      const ownerMatch = podYaml.match(/ownerReferences:[\s\S]*?kind:\s*(\w+)[\s\S]*?name:\s*([\w-]+)/)
      if (ownerMatch) {
        const ownerKind = ownerMatch[1]
        const ownerName = ownerMatch[2]
        chain.push({ kind: ownerKind, name: ownerName, namespace })

        // If ReplicaSet, get its owner (Deployment)
        if (ownerKind === 'ReplicaSet') {
          const rsYaml = await runKubectl(['get', 'replicaset', ownerName, '-n', namespace, '-o', 'yaml'])
          const rsOwnerMatch = rsYaml.match(/ownerReferences:[\s\S]*?kind:\s*(\w+)[\s\S]*?name:\s*([\w-]+)/)
          if (rsOwnerMatch) {
            chain.push({ kind: rsOwnerMatch[1], name: rsOwnerMatch[2], namespace })
          }
        }
      }
      setOwnerChain(chain)
      setRelatedResources([...chain])
    } catch {
      // Ignore errors
    } finally {
      setRelatedLoading(false)
    }
  }

  // Global refresh - refreshes all data for all tabs
  const refreshAll = async () => {
    if (!agentConnected) return
    setIsRefreshing(true)
    try {
      // Fetch all data in parallel
      await Promise.all([
        fetchDescribe(true),
        fetchLogs(true),
        fetchEvents(true),
        fetchYaml(true),
        fetchRelatedResources(true),
      ])
    } finally {
      setIsRefreshing(false)
    }
  }

  const TABS: { id: TabType; label: string; icon: typeof Info }[] = [
    { id: 'overview', label: t('drilldown.tabs.overview'), icon: Info },
    { id: 'labels', label: t('drilldown.tabs.labels'), icon: Tag },
    { id: 'related', label: t('drilldown.tabs.related'), icon: Layers },
    { id: 'describe', label: t('drilldown.tabs.describe'), icon: FileText },
    { id: 'logs', label: t('drilldown.tabs.logs'), icon: Terminal },
    { id: 'events', label: t('drilldown.tabs.events'), icon: Zap },
    { id: 'yaml', label: t('drilldown.tabs.yaml'), icon: Code },
  ]

  const labelEntries = Object.entries(labels || {})
  const annotationEntries = Object.entries(annotations || {})
  const displayedLabels = showAllLabels ? labelEntries : labelEntries.slice(0, 10)
  const displayedAnnotations = showAllAnnotations ? annotationEntries : annotationEntries.slice(0, 5)

  return (
    <div className="flex flex-col h-full -m-6">
      {/* Pod Info Header */}
      <div className="px-6 pt-6 pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6 text-sm">
            <button
              onClick={() => drillToNamespace(cluster, namespace)}
              className="flex items-center gap-2 hover:bg-purple-500/10 border border-transparent hover:border-purple-500/30 px-3 py-1.5 rounded-lg transition-all group cursor-pointer"
            >
              <Layers className="w-4 h-4 text-purple-400" />
              <span className="text-muted-foreground">{t('drilldown.fields.namespace')}</span>
              <span className="font-mono text-purple-400 group-hover:text-purple-300 transition-colors">{namespace}</span>
              <svg className="w-3 h-3 text-purple-400/50 group-hover:text-purple-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
            <button
              onClick={() => drillToCluster(cluster)}
              className="flex items-center gap-2 hover:bg-blue-500/10 border border-transparent hover:border-blue-500/30 px-3 py-1.5 rounded-lg transition-all group cursor-pointer"
            >
              <Server className="w-4 h-4 text-blue-400" />
              <span className="text-muted-foreground">{t('drilldown.fields.cluster')}</span>
              <ClusterBadge cluster={cluster.split('/').pop() || cluster} size="sm" />
              <svg className="w-3 h-3 text-blue-400/50 group-hover:text-blue-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
            {restarts > 0 && (
              <div className="flex items-center gap-2">
                <Box className="w-4 h-4 text-yellow-400" />
                <span className="text-muted-foreground">{t('drilldown.fields.restarts')}</span>
                <span className="font-mono text-yellow-400">{restarts}</span>
              </div>
            )}
          </div>
          {/* Refresh All Button */}
          {agentConnected && (
            <button
              onClick={refreshAll}
              disabled={isRefreshing}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary/50 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
              title={t('drilldown.actions.refreshAllPodData')}
            >
              <RefreshCw className={cn("w-4 h-4", isRefreshing && "animate-spin")} />
              <span className="text-sm">{isRefreshing ? t('common.refreshing') : t('common.refresh')}</span>
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border px-6">
        <div className="flex gap-1">
          {TABS.map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'px-4 py-2 text-sm font-medium flex items-center gap-2 border-b-2 transition-colors',
                  activeTab === tab.id
                    ? 'text-primary border-primary'
                    : 'text-muted-foreground border-transparent hover:text-foreground hover:border-border'
                )}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Scrollable Tab Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Pod Status from kubectl */}
          {agentConnected && (
            <div>
              {podStatusLoading ? (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-card/50 border border-border">
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  <span className="text-sm text-muted-foreground">{t('drilldown.status.fetchingPodStatus')}</span>
                </div>
              ) : podStatusOutput ? (
                <pre className="p-3 rounded-lg bg-black/50 border border-border overflow-x-auto text-xs text-foreground font-mono">
                  <code className="text-muted-foreground"># kubectl get pod {podName} -n {namespace} -o wide</code>
                  {'\n'}
                  {podStatusOutput}
                </pre>
              ) : null}
            </div>
          )}

          {/* Issues Section */}
          <div>
            {issues.length > 0 ? (
              <div className="space-y-3">
                {/* Issue list - filter out status since it's shown in breadcrumb */}
                {issues.filter(issue => issue.toLowerCase() !== status?.toLowerCase()).length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {issues
                      .filter(issue => issue.toLowerCase() !== status?.toLowerCase())
                      .map((issue, i) => {
                        const severity = getIssueSeverity(issue)
                        const bgColor = severity === 'critical' ? 'bg-red-500/20 text-red-400' :
                          severity === 'warning' ? 'bg-yellow-500/20 text-yellow-400' :
                          'bg-blue-500/20 text-blue-400'

                        return (
                          <span key={i} className={cn('px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1.5', bgColor)}>
                            <AlertTriangle className="w-3.5 h-3.5" />
                            {issue}
                          </span>
                        )
                      })}
                  </div>
                )}

              </div>
            ) : (podStatusLoading || describeLoading) ? (
              <div className="p-4 rounded-lg bg-secondary/30 border border-border text-center">
                <div className="flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  <p className="text-muted-foreground">{t('drilldown.status.analyzingPodHealth')}</p>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20 text-center">
                <p className="text-green-400 font-medium">{t('drilldown.status.podHealthy')}</p>
                <p className="text-xs text-muted-foreground mt-1">{t('drilldown.empty.noIssuesDetected')}</p>
              </div>
            )}

          </div>

          {/* Recent Events */}
          {eventsOutput && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-400" />
                  {t('drilldown.tabs.recentEvents')}
                </h3>
                <button
                  onClick={() => setActiveTab('events')}
                  className="text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 font-medium"
                >
                  View all
                </button>
              </div>
              <pre className="p-3 rounded-lg bg-black/50 border border-border overflow-x-auto text-xs text-foreground font-mono max-h-32 overflow-y-auto">
                {eventsOutput.includes('No resources found')
                  ? `No events found for pod ${podName}`
                  : eventsOutput.split('\n').slice(0, 6).join('\n')}
              </pre>
            </div>
          )}
        </div>
      )}

      {activeTab === 'labels' && (
        <div className="space-y-6">
          {describeLoading && !labels && !annotations ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
              <span className="ml-2 text-muted-foreground">{t('drilldown.status.loadingLabels')}</span>
            </div>
          ) : (
            <>
              {/* Labels */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-semibold text-foreground">
                    Labels ({labelEntries.length})
                  </h3>
                  <div className="flex items-center gap-2">
                    {labelEntries.length > 10 && !editingLabels && (
                      <button
                        onClick={() => setShowAllLabels(!showAllLabels)}
                        className="text-xs text-primary hover:text-primary/80 flex items-center gap-1"
                      >
                        {showAllLabels ? (
                          <>{t('drilldown.actions.showLess')} <ChevronUp className="w-3 h-3" /></>
                        ) : (
                          <>{t('drilldown.actions.showAll')} <ChevronDown className="w-3 h-3" /></>
                        )}
                      </button>
                    )}
                    {agentConnected && !editingLabels && (
                      <button
                        onClick={() => { setEditingLabels(true); setShowAllLabels(true) }}
                        className="text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1.5 font-medium"
                      >
                        <Pencil className="w-3 h-3" />
                        {t('drilldown.actions.editLabels')}
                      </button>
                    )}
                  </div>
                </div>

                {/* Error message */}
                {labelError && (
                  <div className="mb-3 p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
                    {labelError}
                  </div>
                )}

                {editingLabels ? (
                  <div className="space-y-3">
                    {/* Existing labels - editable */}
                    <div className="space-y-2">
                      {labelEntries.map(([key, value]) => {
                        const isRemoved = pendingLabelChanges[key] === null
                        const currentValue = pendingLabelChanges[key] !== undefined && pendingLabelChanges[key] !== null
                          ? pendingLabelChanges[key]
                          : value
                        const isModified = pendingLabelChanges[key] !== undefined

                        return (
                          <div
                            key={key}
                            className={cn(
                              'flex items-center gap-2 p-2 rounded-lg border',
                              isRemoved ? 'bg-red-500/10 border-red-500/20 opacity-50' : 'bg-card/50 border-border'
                            )}
                          >
                            <span className="text-xs text-primary font-mono flex-shrink-0">{key}</span>
                            <span className="text-muted-foreground">=</span>
                            {isRemoved ? (
                              <span className="text-xs text-red-400 line-through flex-1">{value}</span>
                            ) : (
                              <input
                                type="text"
                                value={currentValue || ''}
                                onChange={(e) => handleLabelChange(key, e.target.value)}
                                className="flex-1 text-xs font-mono bg-secondary/50 border border-border rounded px-2 py-1 text-foreground min-w-0"
                              />
                            )}
                            <div className="flex items-center gap-1 flex-shrink-0">
                              {isModified && (
                                <button
                                  onClick={() => undoLabelChange(key)}
                                  className="p-1 rounded hover:bg-secondary/50 text-yellow-400"
                                  title={t('drilldown.tooltips.undoChange')}
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              )}
                              {!isRemoved && (
                                <button
                                  onClick={() => handleLabelRemove(key)}
                                  className="p-1 rounded hover:bg-red-500/20 text-red-400"
                                  title={t('drilldown.tooltips.removeLabel')}
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {/* Add new label */}
                    <div className="flex items-center gap-2 p-2 rounded-lg bg-green-500/10 border border-green-500/20">
                      <Plus className="w-4 h-4 text-green-400 flex-shrink-0" />
                      <input
                        type="text"
                        placeholder={t('common.key')}
                        value={newLabelKey}
                        onChange={(e) => setNewLabelKey(e.target.value)}
                        className="w-32 text-xs font-mono bg-secondary/50 border border-border rounded px-2 py-1 text-foreground"
                      />
                      <span className="text-muted-foreground">=</span>
                      <input
                        type="text"
                        placeholder={t('common.value')}
                        value={newLabelValue}
                        onChange={(e) => setNewLabelValue(e.target.value)}
                        className="flex-1 text-xs font-mono bg-secondary/50 border border-border rounded px-2 py-1 text-foreground min-w-0"
                      />
                    </div>

                    {/* Save/Cancel buttons */}
                    <div className="flex items-center gap-2 pt-2">
                      <button
                        onClick={saveLabels}
                        disabled={labelSaving}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
                      >
                        {labelSaving ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Save className="w-4 h-4" />
                        )}
                        {t('drilldown.actions.saveChanges')}
                      </button>
                      <button
                        onClick={cancelLabelEdit}
                        disabled={labelSaving}
                        className="px-3 py-1.5 rounded-lg bg-secondary text-foreground text-sm hover:bg-secondary/80 disabled:opacity-50"
                      >
                        {t('common.cancel')}
                      </button>
                    </div>
                  </div>
                ) : labelEntries.length > 0 ? (
                  <div className="space-y-2">
                    {displayedLabels.map(([key, value]) => (
                      <div key={key} className="flex items-center justify-between p-2 rounded-lg bg-card/50 border border-border">
                        <div className="flex-1 min-w-0">
                          <span className="text-xs text-primary font-mono">{key}</span>
                          <span className="text-muted-foreground mx-1">=</span>
                          <span className="text-xs text-foreground font-mono break-all">{value}</span>
                        </div>
                        <button
                          onClick={() => handleCopy(`label-${key}`, `${key}=${value}`)}
                          className="p-1 rounded hover:bg-secondary/50 text-muted-foreground hover:text-foreground flex-shrink-0 ml-2"
                        >
                          {copiedField === `label-${key}` ? (
                            <Check className="w-3 h-3 text-green-400" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 rounded-lg bg-card/50 border border-border text-muted-foreground text-center">
                    {t('drilldown.empty.noLabels')}
                    {agentConnected && (
                      <button
                        onClick={() => setEditingLabels(true)}
                        className="block mx-auto mt-2 text-xs text-primary hover:text-primary/80"
                      >
                        {t('drilldown.actions.addLabels')}
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Annotations */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-semibold text-foreground">
                    Annotations ({annotationEntries.length})
                  </h3>
                  <div className="flex items-center gap-2">
                    {annotationEntries.length > 5 && !editingAnnotations && (
                      <button
                        onClick={() => setShowAllAnnotations(!showAllAnnotations)}
                        className="text-xs text-primary hover:text-primary/80 flex items-center gap-1"
                      >
                        {showAllAnnotations ? (
                          <>{t('drilldown.actions.showLess')} <ChevronUp className="w-3 h-3" /></>
                        ) : (
                          <>{t('drilldown.actions.showAll')} <ChevronDown className="w-3 h-3" /></>
                        )}
                      </button>
                    )}
                    {agentConnected && !editingAnnotations && (
                      <button
                        onClick={() => { setEditingAnnotations(true); setShowAllAnnotations(true) }}
                        className="text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1.5 font-medium"
                      >
                        <Pencil className="w-3 h-3" />
                        {t('drilldown.actions.editAnnotations')}
                      </button>
                    )}
                  </div>
                </div>

                {/* Error message */}
                {annotationError && (
                  <div className="mb-3 p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
                    {annotationError}
                  </div>
                )}

                {editingAnnotations ? (
                  <div className="space-y-3">
                    {/* Existing annotations - editable */}
                    <div className="space-y-2">
                      {annotationEntries.map(([key, value]) => {
                        const isRemoved = pendingAnnotationChanges[key] === null
                        const currentValue = pendingAnnotationChanges[key] !== undefined && pendingAnnotationChanges[key] !== null
                          ? pendingAnnotationChanges[key]
                          : value
                        const isModified = pendingAnnotationChanges[key] !== undefined

                        return (
                          <div
                            key={key}
                            className={cn(
                              'p-2 rounded-lg border',
                              isRemoved ? 'bg-red-500/10 border-red-500/20 opacity-50' : 'bg-card/50 border-border'
                            )}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs text-primary font-mono truncate">{key}</span>
                              <div className="flex items-center gap-1 flex-shrink-0">
                                {isModified && (
                                  <button
                                    onClick={() => undoAnnotationChange(key)}
                                    className="p-1 rounded hover:bg-secondary/50 text-yellow-400"
                                    title={t('drilldown.tooltips.undoChange')}
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                )}
                                {!isRemoved && (
                                  <button
                                    onClick={() => handleAnnotationRemove(key)}
                                    className="p-1 rounded hover:bg-red-500/20 text-red-400"
                                    title={t('drilldown.tooltips.removeAnnotation')}
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            </div>
                            {isRemoved ? (
                              <span className="text-xs text-red-400 line-through font-mono break-all">{value}</span>
                            ) : (
                              <textarea
                                value={currentValue || ''}
                                onChange={(e) => handleAnnotationChange(key, e.target.value)}
                                rows={2}
                                className="w-full text-xs font-mono bg-secondary/50 border border-border rounded px-2 py-1 text-foreground resize-y"
                              />
                            )}
                          </div>
                        )
                      })}
                    </div>

                    {/* Add new annotation */}
                    <div className="p-2 rounded-lg bg-green-500/10 border border-green-500/20">
                      <div className="flex items-center gap-2 mb-2">
                        <Plus className="w-4 h-4 text-green-400 flex-shrink-0" />
                        <input
                          type="text"
                          placeholder="annotation-key"
                          value={newAnnotationKey}
                          onChange={(e) => setNewAnnotationKey(e.target.value)}
                          className="flex-1 text-xs font-mono bg-secondary/50 border border-border rounded px-2 py-1 text-foreground"
                        />
                      </div>
                      <textarea
                        placeholder="annotation value"
                        value={newAnnotationValue}
                        onChange={(e) => setNewAnnotationValue(e.target.value)}
                        rows={2}
                        className="w-full text-xs font-mono bg-secondary/50 border border-border rounded px-2 py-1 text-foreground resize-y"
                      />
                    </div>

                    {/* Save/Cancel buttons */}
                    <div className="flex items-center gap-2 pt-2">
                      <button
                        onClick={saveAnnotations}
                        disabled={annotationSaving}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
                      >
                        {annotationSaving ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Save className="w-4 h-4" />
                        )}
                        {t('drilldown.actions.saveChanges')}
                      </button>
                      <button
                        onClick={cancelAnnotationEdit}
                        disabled={annotationSaving}
                        className="px-3 py-1.5 rounded-lg bg-secondary text-foreground text-sm hover:bg-secondary/80 disabled:opacity-50"
                      >
                        {t('common.cancel')}
                      </button>
                    </div>
                  </div>
                ) : annotationEntries.length > 0 ? (
                  <div className="space-y-2">
                    {displayedAnnotations.map(([key, value]) => (
                      <div key={key} className="p-2 rounded-lg bg-card/50 border border-border">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-primary font-mono truncate">{key}</span>
                          <button
                            onClick={() => handleCopy(`annot-${key}`, value)}
                            className="p-1 rounded hover:bg-secondary/50 text-muted-foreground hover:text-foreground flex-shrink-0"
                          >
                            {copiedField === `annot-${key}` ? (
                              <Check className="w-3 h-3 text-green-400" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                        <div className="text-xs text-foreground font-mono break-all">{value}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 rounded-lg bg-card/50 border border-border text-muted-foreground text-center">
                    {t('drilldown.empty.noAnnotations')}
                    {agentConnected && (
                      <button
                        onClick={() => setEditingAnnotations(true)}
                        className="block mx-auto mt-2 text-xs text-primary hover:text-primary/80"
                      >
                        {t('drilldown.actions.addAnnotations')}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {activeTab === 'related' && (
        <div className="space-y-4">
          {relatedLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
              <span className="ml-2 text-muted-foreground">{t('drilldown.status.discoveringRelated')}</span>
            </div>
          ) : (
            <>
              {/* Tree View of Resource Relationships */}
              <div className="font-mono text-sm">
                {/* Owner Chain - show from top (Deployment) down */}
                {[...ownerChain].reverse().map((resource, index) => {
                  const isDeployment = resource.kind === 'Deployment'
                  const isReplicaSet = resource.kind === 'ReplicaSet'
                  const indent = index * 24
                  const isLast = index === ownerChain.length - 1

                  return (
                    <div key={`${resource.kind}-${resource.name}`} className="relative">
                      {/* Vertical line from parent */}
                      {index > 0 && (
                        <div
                          className="absolute border-l-2 border-muted-foreground/30"
                          style={{ left: indent - 12, top: -8, height: 20 }}
                        />
                      )}
                      {/* Horizontal connector */}
                      {index > 0 && (
                        <div
                          className="absolute border-t-2 border-muted-foreground/30"
                          style={{ left: indent - 12, top: 12, width: 12 }}
                        />
                      )}
                      {/* Vertical line to children */}
                      {!isLast && (
                        <div
                          className="absolute border-l-2 border-muted-foreground/30"
                          style={{ left: indent + 12, top: 24, height: 'calc(100% - 12px)' }}
                        />
                      )}
                      <div style={{ paddingLeft: indent }} className="py-1">
                        <button
                          onClick={() => {
                            if (isDeployment) drillToDeployment(cluster, namespace, resource.name)
                            else if (isReplicaSet) drillToReplicaSet(cluster, namespace, resource.name)
                          }}
                          className={cn(
                            'px-3 py-2 rounded-lg border inline-flex items-center gap-2 group cursor-pointer transition-all hover:scale-[1.02]',
                            isDeployment && 'bg-green-500/10 border-green-500/30 text-green-400 hover:bg-green-500/20 hover:border-green-500/50',
                            isReplicaSet && 'bg-blue-500/10 border-blue-500/30 text-blue-400 hover:bg-blue-500/20 hover:border-blue-500/50'
                          )}
                        >
                          {isDeployment && (
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                            </svg>
                          )}
                          {isReplicaSet && <Layers className="w-4 h-4" />}
                          <span className="text-xs text-muted-foreground">{resource.kind}</span>
                          <span>{resource.name}</span>
                          <svg className="w-3 h-3 opacity-50 group-hover:opacity-100" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  )
                })}

                {/* Current Pod - the focal point */}
                <div className="relative">
                  {ownerChain.length > 0 && (
                    <>
                      <div
                        className="absolute border-l-2 border-muted-foreground/30"
                        style={{ left: ownerChain.length * 24 - 12, top: -8, height: 20 }}
                      />
                      <div
                        className="absolute border-t-2 border-muted-foreground/30"
                        style={{ left: ownerChain.length * 24 - 12, top: 12, width: 12 }}
                      />
                    </>
                  )}
                  {/* Vertical line to children if any */}
                  {(serviceAccount || configMaps.length > 0 || secrets.length > 0 || pvcs.length > 0) && (
                    <div
                      className="absolute border-l-2 border-cyan-500/30"
                      style={{ left: ownerChain.length * 24 + 12, top: 36, height: 'calc(100% - 24px)' }}
                    />
                  )}
                  <div style={{ paddingLeft: ownerChain.length * 24 }} className="py-1">
                    <div className="px-3 py-2 rounded-lg bg-cyan-500/20 border-2 border-cyan-500/50 text-cyan-400 inline-flex items-center gap-2 shadow-lg shadow-cyan-500/10">
                      <Box className="w-4 h-4" />
                      <span className="text-xs text-cyan-300">{t('common.pod')}</span>
                      <span className="font-semibold">{podName}</span>
                      <span className="text-xs px-1.5 py-0.5 rounded bg-cyan-500/30 text-cyan-300">current</span>
                    </div>
                  </div>
                </div>

                {/* Pod's referenced resources as children */}
                {(() => {
                  const podIndent = (ownerChain.length + 1) * 24
                  const children: { type: string; items: string[]; color: string; icon: React.ReactNode; onClick: (name: string) => void }[] = []

                  if (serviceAccount) {
                    children.push({
                      type: 'ServiceAccount',
                      items: [serviceAccount],
                      color: 'purple',
                      icon: <Server className="w-4 h-4" />,
                      onClick: (name) => drillToServiceAccount(cluster, namespace, name)
                    })
                  }
                  if (configMaps.length > 0) {
                    children.push({
                      type: 'ConfigMaps',
                      items: configMaps,
                      color: 'yellow',
                      icon: <FileText className="w-4 h-4" />,
                      onClick: (name) => drillToConfigMap(cluster, namespace, name)
                    })
                  }
                  if (secrets.length > 0) {
                    children.push({
                      type: 'Secrets',
                      items: secrets,
                      color: 'red',
                      icon: (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                      ),
                      onClick: (name) => drillToSecret(cluster, namespace, name)
                    })
                  }
                  if (pvcs.length > 0) {
                    children.push({
                      type: 'PVCs',
                      items: pvcs,
                      color: 'emerald',
                      icon: (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                        </svg>
                      ),
                      onClick: (name) => drillToPVC(cluster, namespace, name)
                    })
                  }

                  return children.map((child, childIndex) => {
                    const isLastChild = childIndex === children.length - 1

                    return (
                      <div key={child.type} className="relative">
                        {/* Vertical line continuation */}
                        {!isLastChild && (
                          <div
                            className="absolute border-l-2 border-cyan-500/30"
                            style={{ left: podIndent - 12, top: 0, height: '100%' }}
                          />
                        )}
                        {/* Connector to this child */}
                        <div
                          className="absolute border-l-2 border-cyan-500/30"
                          style={{ left: podIndent - 12, top: 0, height: child.items.length > 1 ? 20 : 16 }}
                        />
                        <div
                          className="absolute border-t-2 border-cyan-500/30"
                          style={{ left: podIndent - 12, top: child.items.length > 1 ? 20 : 16, width: 12 }}
                        />

                        <div style={{ paddingLeft: podIndent }} className="py-1">
                          {child.items.length === 1 ? (
                            // Single item - show inline
                            <button
                              onClick={() => child.onClick(child.items[0])}
                              className={cn(
                                'px-3 py-2 rounded-lg border inline-flex items-center gap-2 group cursor-pointer transition-all hover:scale-[1.02]',
                                child.color === 'purple' && 'bg-purple-500/10 border-purple-500/30 text-purple-400 hover:bg-purple-500/20 hover:border-purple-500/50',
                                child.color === 'yellow' && 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/20 hover:border-yellow-500/50',
                                child.color === 'red' && 'bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20 hover:border-red-500/50'
                              )}
                            >
                              {child.icon}
                              <span className="text-xs text-muted-foreground">{child.type.replace(/s$/, '')}</span>
                              <span>{child.items[0]}</span>
                              <svg className="w-3 h-3 opacity-50 group-hover:opacity-100" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                            </button>
                          ) : (
                            // Multiple items - show as expandable group
                            <div className="space-y-1">
                              <div className={cn(
                                'px-3 py-1.5 rounded-lg border inline-flex items-center gap-2 text-xs',
                                child.color === 'yellow' && 'bg-yellow-500/5 border-yellow-500/20 text-yellow-400',
                                child.color === 'red' && 'bg-red-500/5 border-red-500/20 text-red-400'
                              )}>
                                {child.icon}
                                <span>{child.type}</span>
                                <span className="px-1.5 py-0.5 rounded bg-current/20">{child.items.length}</span>
                              </div>
                              <div className="relative ml-6 space-y-1">
                                {/* Vertical line for sub-items */}
                                <div
                                  className={cn(
                                    'absolute border-l-2',
                                    child.color === 'yellow' && 'border-yellow-500/30',
                                    child.color === 'red' && 'border-red-500/30'
                                  )}
                                  style={{ left: -12, top: 0, height: `calc(100% - 16px)` }}
                                />
                                {child.items.map((item, itemIndex) => {
                                  const isLastItem = itemIndex === child.items.length - 1
                                  return (
                                    <div key={item} className="relative">
                                      {/* Connector */}
                                      <div
                                        className={cn(
                                          'absolute border-l-2',
                                          child.color === 'yellow' && 'border-yellow-500/30',
                                          child.color === 'red' && 'border-red-500/30'
                                        )}
                                        style={{ left: -12, top: 0, height: isLastItem ? 12 : 24 }}
                                      />
                                      <div
                                        className={cn(
                                          'absolute border-t-2',
                                          child.color === 'yellow' && 'border-yellow-500/30',
                                          child.color === 'red' && 'border-red-500/30'
                                        )}
                                        style={{ left: -12, top: 12, width: 12 }}
                                      />
                                      <button
                                        onClick={() => child.onClick(item)}
                                        className={cn(
                                          'px-2 py-1 rounded border inline-flex items-center gap-2 group cursor-pointer transition-all hover:scale-[1.02]',
                                          child.color === 'yellow' && 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/20 hover:border-yellow-500/50',
                                          child.color === 'red' && 'bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20 hover:border-red-500/50'
                                        )}
                                      >
                                        <span className="text-xs">{item}</span>
                                        <svg className="w-3 h-3 opacity-50 group-hover:opacity-100" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                        </svg>
                                      </button>
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })
                })()}

                {/* No owner chain - show pod as root */}
                {ownerChain.length === 0 && !serviceAccount && configMaps.length === 0 && secrets.length === 0 && (
                  <div className="py-1">
                    <div className="px-3 py-2 rounded-lg bg-cyan-500/20 border-2 border-cyan-500/50 text-cyan-400 inline-flex items-center gap-2 shadow-lg shadow-cyan-500/10">
                      <Box className="w-4 h-4" />
                      <span className="text-xs text-cyan-300">{t('common.pod')}</span>
                      <span className="font-semibold">{podName}</span>
                      <span className="text-xs px-1.5 py-0.5 rounded bg-cyan-500/30 text-cyan-300">current</span>
                    </div>
                    <p className="text-muted-foreground text-sm mt-3">{t('drilldown.empty.noRelatedResourcesDiscovered')}</p>
                  </div>
                )}
              </div>

              {/* Refresh button */}
              {agentConnected && (
                <div className="pt-4 border-t border-border mt-4">
                  <button
                    onClick={() => fetchRelatedResources(true)}
                    className="px-3 py-1.5 rounded-lg bg-secondary text-foreground text-sm hover:bg-secondary/80 flex items-center gap-2"
                  >
                    <Loader2 className={cn('w-4 h-4', relatedLoading && 'animate-spin')} />
                    Refresh
                  </button>
                </div>
              )}

              {/* Agent not connected warning */}
              {!agentConnected && ownerChain.length === 0 && configMaps.length === 0 && secrets.length === 0 && !serviceAccount && (
                <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-center">
                  <p className="text-yellow-400">{t('drilldown.empty.localAgentNotConnected')}</p>
                  <p className="text-sm text-muted-foreground mt-1">{t('drilldown.empty.connectAgentRelated')}</p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {activeTab === 'describe' && (
        <div>
          {describeLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
              <span className="ml-2 text-muted-foreground">{t('drilldown.status.runningDescribe')}</span>
            </div>
          ) : describeOutput ? (
            <div className="relative">
              <div className="absolute top-2 right-2 flex items-center gap-2">
                <button
                  onClick={() => handleCopy('describe', describeOutput)}
                  className="px-2 py-1 rounded bg-secondary/50 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                >
                  {copiedField === 'describe' ? (
                    <><Check className="w-3 h-3 text-green-400" /> {t('common.copied')}</>
                  ) : (
                    <><Copy className="w-3 h-3" /> {t('common.copy')}</>
                  )}
                </button>
              </div>
              <pre className="p-4 rounded-lg bg-black/50 border border-border overflow-auto max-h-[60vh] text-xs text-foreground font-mono whitespace-pre-wrap">
                <code># kubectl describe pod {podName} -n {namespace}</code>
                {'\n\n'}
                {describeOutput}
              </pre>
            </div>
          ) : !agentConnected ? (
            <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-center">
              <p className="text-yellow-400">{t('drilldown.empty.localAgentNotConnected')}</p>
              <p className="text-sm text-muted-foreground mt-1">{t('drilldown.empty.connectAgentDescribe')}</p>
            </div>
          ) : (
            <div className="p-4 rounded-lg bg-card/50 border border-border text-center">
              <p className="text-muted-foreground">{t('drilldown.empty.failedFetchDescribe')}</p>
              <button
                onClick={() => fetchDescribe(true)}
                className="mt-2 px-3 py-1 rounded bg-primary/20 text-primary text-sm"
              >
                {t('common.retry')}
              </button>
            </div>
          )}
        </div>
      )}

      {activeTab === 'logs' && (
        <div>
          {logsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
              <span className="ml-2 text-muted-foreground">{t('drilldown.status.fetchingLogs')}</span>
            </div>
          ) : logsOutput ? (
            <div className="relative">
              <div className="absolute top-2 right-2 flex items-center gap-2">
                <button
                  onClick={() => fetchLogs(true)}
                  className="px-2 py-1 rounded bg-secondary/50 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                  title="Refresh logs"
                >
                  <Terminal className="w-3 h-3" /> Refresh
                </button>
                <button
                  onClick={() => handleCopy('logs', logsOutput)}
                  className="px-2 py-1 rounded bg-secondary/50 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                >
                  {copiedField === 'logs' ? (
                    <><Check className="w-3 h-3 text-green-400" /> {t('common.copied')}</>
                  ) : (
                    <><Copy className="w-3 h-3" /> {t('common.copy')}</>
                  )}
                </button>
              </div>
              <pre className="p-4 rounded-lg bg-black/50 border border-border overflow-auto max-h-[60vh] text-xs text-foreground font-mono whitespace-pre-wrap">
                <code className="text-muted-foreground"># kubectl logs {podName} -n {namespace} --tail=500</code>
                {'\n\n'}
                {logsOutput}
              </pre>
            </div>
          ) : !agentConnected ? (
            <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-center">
              <p className="text-yellow-400">{t('drilldown.empty.localAgentNotConnected')}</p>
              <p className="text-sm text-muted-foreground mt-1">{t('drilldown.empty.connectAgentLogs')}</p>
            </div>
          ) : (
            <div className="p-4 rounded-lg bg-card/50 border border-border text-center">
              <p className="text-muted-foreground">{t('drilldown.empty.noLogsAvailable')}</p>
              <button
                onClick={() => { fetchLogs(true) }}
                className="mt-2 px-3 py-1 rounded bg-primary/20 text-primary text-sm"
              >
                {t('common.retry')}
              </button>
            </div>
          )}
        </div>
      )}

      {activeTab === 'events' && (
        <div>
          {eventsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
              <span className="ml-2 text-muted-foreground">{t('drilldown.status.fetchingEvents')}</span>
            </div>
          ) : eventsOutput ? (
            <div className="relative">
              <div className="absolute top-2 right-2 flex items-center gap-2">
                <button
                  onClick={() => fetchEvents(true)}
                  className="px-2 py-1 rounded bg-secondary/50 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                  title="Refresh events"
                >
                  <Zap className="w-3 h-3" /> Refresh
                </button>
                <button
                  onClick={() => handleCopy('events', eventsOutput)}
                  className="px-2 py-1 rounded bg-secondary/50 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                >
                  {copiedField === 'events' ? (
                    <><Check className="w-3 h-3 text-green-400" /> {t('common.copied')}</>
                  ) : (
                    <><Copy className="w-3 h-3" /> {t('common.copy')}</>
                  )}
                </button>
              </div>
              <pre className="p-4 rounded-lg bg-black/50 border border-border overflow-auto max-h-[60vh] text-xs text-foreground font-mono whitespace-pre-wrap">
                <code className="text-muted-foreground"># kubectl get events -n {namespace} --field-selector involvedObject.name={podName}</code>
                {'\n\n'}
                {eventsOutput}
              </pre>
            </div>
          ) : !agentConnected ? (
            <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-center">
              <p className="text-yellow-400">{t('drilldown.empty.localAgentNotConnected')}</p>
              <p className="text-sm text-muted-foreground mt-1">{t('drilldown.empty.connectAgentEvents')}</p>
            </div>
          ) : (
            <div className="p-4 rounded-lg bg-card/50 border border-border text-center">
              <p className="text-muted-foreground">{t('drilldown.empty.noEventsFound', { resource: 'pod' })}</p>
              <button
                onClick={() => fetchEvents(true)}
                className="mt-2 px-3 py-1 rounded bg-primary/20 text-primary text-sm"
              >
                {t('common.retry')}
              </button>
            </div>
          )}
        </div>
      )}

      {activeTab === 'yaml' && (
        <div>
          {yamlLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
              <span className="ml-2 text-muted-foreground">{t('drilldown.status.fetchingYaml')}</span>
            </div>
          ) : yamlOutput ? (
            <div className="relative">
              <div className="absolute top-2 right-2 flex items-center gap-2">
                <button
                  onClick={() => fetchYaml(true)}
                  className="px-2 py-1 rounded bg-secondary/50 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                  title="Refresh YAML"
                >
                  <Code className="w-3 h-3" /> Refresh
                </button>
                <button
                  onClick={() => handleCopy('yaml', yamlOutput)}
                  className="px-2 py-1 rounded bg-secondary/50 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                >
                  {copiedField === 'yaml' ? (
                    <><Check className="w-3 h-3 text-green-400" /> {t('common.copied')}</>
                  ) : (
                    <><Copy className="w-3 h-3" /> {t('common.copy')}</>
                  )}
                </button>
              </div>
              <pre className="p-4 rounded-lg bg-black/50 border border-border overflow-auto max-h-[60vh] text-xs text-foreground font-mono whitespace-pre-wrap">
                <code className="text-muted-foreground"># kubectl get pod {podName} -n {namespace} -o yaml</code>
                {'\n\n'}
                {yamlOutput}
              </pre>
            </div>
          ) : !agentConnected ? (
            <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-center">
              <p className="text-yellow-400">{t('drilldown.empty.localAgentNotConnected')}</p>
              <p className="text-sm text-muted-foreground mt-1">{t('drilldown.empty.connectAgentYaml')}</p>
            </div>
          ) : (
            <div className="p-4 rounded-lg bg-card/50 border border-border text-center">
              <p className="text-muted-foreground">{t('drilldown.empty.failedFetchYaml')}</p>
              <button
                onClick={() => fetchYaml(true)}
                className="mt-2 px-3 py-1 rounded bg-primary/20 text-primary text-sm"
              >
                {t('common.retry')}
              </button>
            </div>
          )}
        </div>
      )}
      </div>

      {/* AI Actions Footer - Always visible */}
      {agentConnected && issues.length > 0 && (
        <div className="border-t border-border bg-card/30">
          {/* AI Analysis Results - visible on all tabs */}
          {(aiAnalysis || aiAnalysisLoading) && (
            <div className="p-4 pb-0">
              <div className="rounded-lg bg-gradient-to-br from-purple-500/10 via-indigo-500/10 to-cyan-500/10 border border-purple-500/30 overflow-hidden">
                {aiAnalysisLoading ? (
                  <div className="p-4">
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                      <div className="flex gap-1">
                        <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                      <span className="font-mono text-xs">Analyzing pod status, events, logs, owner resources...</span>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 max-h-48 overflow-y-auto">
                    <div className="flex items-center gap-2 text-xs text-purple-400 mb-2">
                      <ConsoleAIIcon size="sm" />
                      <span className="font-semibold tracking-wide">{t('drilldown.ai.aiDiagnosis')}</span>
                      <span className="text-purple-400/50 font-mono">// powered by KubeStellar</span>
                    </div>
                    <div className="font-mono text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                      <span className="text-purple-400">{'>'}</span> {aiAnalysis}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          <div className="flex items-center gap-2 p-4">
            <button
              onClick={fetchAiAnalysis}
              disabled={aiAnalysisLoading}
              className={cn(
                'flex-1 py-2 px-3 rounded-lg transition-all flex items-center justify-center gap-2 text-sm font-medium',
                'bg-purple-600/20 text-purple-200 hover:bg-purple-500/30 border border-purple-500/50',
                'shadow-[0_0_15px_rgba(147,51,234,0.2)] hover:shadow-[0_0_20px_rgba(147,51,234,0.3)]',
                aiAnalysisLoading && 'opacity-70 cursor-wait'
              )}
            >
              {aiAnalysisLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{t('common.analyzing')}</span>
                </>
              ) : (
                <>
                  <div className="relative">
                    <Stethoscope className="w-4 h-4" />
                    <Sparkles className="absolute -top-0.5 -right-0.5 w-2 h-2 text-purple-400 animate-pulse" />
                  </div>
                  <span>{aiAnalysis ? t('drilldown.actions.reAnalyze') : t('drilldown.actions.diagnose')}</span>
                </>
              )}
            </button>
            <button
              onClick={handleRepairPod}
              className={cn(
                'flex-1 py-2 px-3 rounded-lg transition-all flex items-center justify-center gap-2 text-sm font-medium',
                'bg-orange-600/20 text-orange-200 hover:bg-orange-500/30 border border-orange-500/50',
                'shadow-[0_0_15px_rgba(234,88,12,0.2)] hover:shadow-[0_0_20px_rgba(234,88,12,0.3)]'
              )}
            >
              <div className="relative">
                <Wrench className="w-4 h-4" />
                <Sparkles className="absolute -top-0.5 -right-0.5 w-2 h-2 text-purple-400 animate-pulse" />
              </div>
              <span>{t('drilldown.actions.repair')}</span>
            </button>
          </div>
          {/* Delete Pod button */}
          <div className="px-4 pb-4">
            {deleteError && (
              <div className="mb-2 p-2 rounded bg-red-500/20 border border-red-500/30 text-red-300 text-sm">
                {deleteError}
              </div>
            )}
            <button
              onClick={handleDeletePod}
              disabled={!agentConnected || canDeletePod === false || deletingPod}
              title={
                !agentConnected
                  ? 'Agent not connected'
                  : canDeletePod === false
                  ? 'No permission to delete pods in this namespace'
                  : canDeletePod === null
                  ? 'Checking permissions...'
                  : isManagedPod
                  ? 'Delete pod (will be recreated by controller)'
                  : 'Delete pod (will NOT be recreated)'
              }
              className={cn(
                'w-full py-2.5 px-4 rounded-lg transition-all flex items-center justify-center gap-2 text-sm font-medium',
                canDeletePod === false || !agentConnected
                  ? 'bg-secondary/30 text-muted-foreground cursor-not-allowed opacity-50'
                  : 'bg-red-600/20 text-red-300 hover:bg-red-500/30 border border-red-500/40 hover:border-red-500/60'
              )}
            >
              {deletingPod ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{t('common.deleting')}</span>
                </>
              ) : canDeletePod === null ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{t('drilldown.status.checkingPermissions')}</span>
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4" />
                  <span>{t('drilldown.actions.deletePod')}</span>
                  {isManagedPod && (
                    <span className="text-xs text-red-400/60">{t('drilldown.status.willBeRecreated')}</span>
                  )}
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
