import { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from 'react'
import { useMissions } from '../../../hooks/useMissions'
import { useLocalAgent } from '../../../hooks/useLocalAgent'
import { useBackendHealth } from '../../../hooks/useBackendHealth'
import { LOCAL_AGENT_WS_URL } from '../../../lib/constants'
import { appendWsAuthToken } from '../../../lib/utils/wsAuth'
import { useDrillDownActions, useDrillDown } from '../../../hooks/useDrillDown'
import { useCanI } from '../../../hooks/usePermissions'
import { ClusterBadge } from '../../ui/ClusterBadge'
import { FileText, Terminal, Zap, Code, Info, Tag, Loader2, Box, Layers, Server, AlertTriangle, RefreshCw, TerminalSquare } from 'lucide-react'
const PodExecTerminal = lazy(() => import('../../terminal/PodExecTerminal'))
import { cn } from '../../../lib/cn'
import { useTranslation } from 'react-i18next'
import { UI_FEEDBACK_TIMEOUT_MS } from '../../../lib/constants/network'
import {
  filterPodIssuesForDiagnosis,
  getIssueSeverity,
  getPodDiagnosis,
  UNHEALTHY_STATUSES, RAPID_REOPEN_THRESHOLD_MS,
  getPodCache, setPodCache, cleanupPodCache,
  PodLabelsTab,
  PodRelatedTab,
  PodOutputTab,
  PodAiAnalysis,
  PodDeleteSection
} from './pod-drilldown'
import type { TabType, RelatedResource, CachedData } from './pod-drilldown'
import { copyToClipboard } from '../../../lib/clipboard'
import { useToast } from '../../ui/Toast'
import { useApiKeyCheck, ApiKeyPromptModal } from '../../cards/console-missions/shared'

/** Keys that must never be used as object property names (prototype pollution prevention). */
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

/** Safely assign a key-value pair to a plain object, rejecting prototype-polluting keys. */
function safeSet<T>(obj: Record<string, T>, key: string, value: T): void {
  if (!UNSAFE_KEYS.has(key)) {
    obj[key] = value
  }
}

const DIAGNOSIS_SUMMARY_KEYS = {
  'crash-loop': 'drilldown.diagnosis.summaries.crashLoop',
  'oom-killed': 'drilldown.diagnosis.summaries.oomKilled',
  'image-pull': 'drilldown.diagnosis.summaries.imagePull',
  'config-error': 'drilldown.diagnosis.summaries.configError',
  'probe-failure': 'drilldown.diagnosis.summaries.probeFailure',
  'unknown': 'drilldown.diagnosis.summaries.unknown',
} as const

const DIAGNOSIS_STEP_KEYS = {
  'crash-loop': [
    'drilldown.diagnosis.steps.checkLogs',
    'drilldown.diagnosis.steps.verifyCommand',
    'drilldown.diagnosis.steps.ensureLongRunningProcess',
  ],
  'oom-killed': [
    'drilldown.diagnosis.steps.checkMemoryUsage',
    'drilldown.diagnosis.steps.raiseMemoryLimit',
    'drilldown.diagnosis.steps.inspectRecentChanges',
  ],
  'image-pull': [
    'drilldown.diagnosis.steps.verifyImageReference',
    'drilldown.diagnosis.steps.checkRegistryAccess',
    'drilldown.diagnosis.steps.confirmImageExists',
  ],
  'config-error': [
    'drilldown.diagnosis.steps.inspectPodEvents',
    'drilldown.diagnosis.steps.verifyReferencedConfig',
    'drilldown.diagnosis.steps.reviewPodSpec',
  ],
  'probe-failure': [
    'drilldown.diagnosis.steps.checkProbeConfiguration',
    'drilldown.diagnosis.steps.verifyAppStartup',
    'drilldown.diagnosis.steps.reviewRecentDeployments',
  ],
  'unknown': [
    'drilldown.diagnosis.steps.checkLogs',
    'drilldown.diagnosis.steps.inspectPodEvents',
    'drilldown.diagnosis.steps.reviewPodSpec',
  ],
} as const

export function PodDrillDown({ data }: { data: Record<string, unknown> }) {
  const { t } = useTranslation()
  const cluster = data.cluster as string
  const namespace = data.namespace as string
  const podName = data.pod as string
  const { startMission } = useMissions()
  const { isConnected: agentConnected } = useLocalAgent()
  const { isConnected: backendConnected } = useBackendHealth()
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
    openCount: (persistentCache?.openCount || 0) + 1
  })

  // Clean up old cache entries periodically
  cleanupPodCache()

  const [activeTab, setActiveTab] = useState<TabType>((data.tab as TabType) || 'overview')
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
  // #5945 — Track AI analysis errors so failures are surfaced in the UI instead of silently swallowed
  const [aiAnalysisError, setAiAnalysisError] = useState<string | null>(null)
  const { showToast } = useToast()
  const { showKeyPrompt, checkKeyAndRun, goToSettings, dismissPrompt, errorMessage } = useApiKeyCheck()
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
  const [showDeletePodConfirm, setShowDeletePodConfirm] = useState(false)
  const { checkPermission } = useCanI()
  const { close: closeDrillDown } = useDrillDown()

  // Track all active WebSocket connections so they can be cleaned up on unmount.
  // Without this, WS connections opened by async handlers leak if the component
  // unmounts before the server responds.
  const activeWsRef = useRef(new Set<WebSocket>())

  /** Create a tracked WebSocket — automatically removed from the set when closed. */
  const openTrackedWs = useCallback((): WebSocket => {
    const ws = new WebSocket(appendWsAuthToken(LOCAL_AGENT_WS_URL))
    activeWsRef.current.add(ws)
    const origClose = ws.close.bind(ws)
    ws.close = (...args: Parameters<WebSocket['close']>) => {
      activeWsRef.current.delete(ws)
      origClose(...args)
    }
    return ws
  }, [])

  // Close all tracked WebSocket connections on unmount
  useEffect(() => {
    const wsSet = activeWsRef.current
    return () => {
      for (const ws of Array.from(wsSet)) {
        try { ws.close() } catch { /* already closed */ }
      }
      wsSet.clear()
    }
  }, [])

  // Pod data from the issue
  const status = data.status as string
  const restarts = (data.restarts as number) || 0
  const reason = data.reason as string
  const passedIssues = (data.issues as string[]) || []
  const passedLabels = data.labels as Record<string, string> | undefined
  const passedAnnotations = data.annotations as Record<string, string> | undefined

  const baseIssues = useMemo(() => {
    const allIssues = [...passedIssues]

    if (status && UNHEALTHY_STATUSES.some(s => status.toLowerCase().includes(s.toLowerCase()))) {
      if (!allIssues.some(i => i.toLowerCase() === status.toLowerCase())) {
        allIssues.unshift(status)
      }
    }

    if (podStatusOutput) {
      const lines = podStatusOutput.split('\n')
      const dataLine = lines.find(line => line.includes(podName))
      if (dataLine) {
        const parts = dataLine.trim().split(/\s+/)
        if (parts.length >= 3) {
          const kubectlStatus = parts[2]
          if (kubectlStatus && UNHEALTHY_STATUSES.some(s => kubectlStatus.toLowerCase().includes(s.toLowerCase()))) {
            if (!allIssues.some(i => i.toLowerCase() === kubectlStatus.toLowerCase())) {
              allIssues.unshift(kubectlStatus)
            }
          }
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

    if (reason && !allIssues.some(i => i.toLowerCase() === reason.toLowerCase())) {
      allIssues.push(reason)
    }

    return allIssues
  }, [passedIssues, status, reason, podStatusOutput, podName])

  const podDiagnosis = useMemo(() => getPodDiagnosis({
    status,
    reason,
    issues: baseIssues,
    describeOutput,
    eventsOutput,
    logsOutput,
  }), [status, reason, baseIssues, describeOutput, eventsOutput, logsOutput])

  const issues = useMemo(() => {
    const allIssues = [...baseIssues]

    if (eventsOutput && !eventsOutput.includes('No resources found')) {
      const eventLines = eventsOutput.split('\n')
      const headerLine = eventLines[0] || ''
      const typeIdx = headerLine.indexOf('TYPE')
      const reasonIdx = headerLine.indexOf('REASON')
      const messageIdx = headerLine.indexOf('MESSAGE')

      const TYPE_COLUMN_FALLBACK_WIDTH = 10
      if (typeIdx >= 0 && messageIdx >= 0) {
        for (const line of eventLines.slice(1)) {
          if (!line.trim()) continue
          const typeEnd = reasonIdx > typeIdx ? reasonIdx : typeIdx + TYPE_COLUMN_FALLBACK_WIDTH
          const eventType = line.substring(typeIdx, typeEnd).trim()
          if (eventType.toLowerCase() === 'warning') {
            const message = messageIdx < line.length
              ? line.substring(messageIdx).trim()
              : ''
            const REASON_COLUMN_FALLBACK_WIDTH = 30
            const eventReason = reasonIdx >= 0
              ? line.substring(reasonIdx, messageIdx > reasonIdx ? messageIdx : reasonIdx + REASON_COLUMN_FALLBACK_WIDTH).trim()
              : ''
            const MAX_EVENT_MSG_LENGTH = 80
            const issueText = eventReason
              ? `Warning: ${eventReason}${message ? ' — ' + message.substring(0, MAX_EVENT_MSG_LENGTH) : ''}`
              : `Warning: ${message.substring(0, MAX_EVENT_MSG_LENGTH)}`
            if (!allIssues.some(i => i.toLowerCase() === issueText.toLowerCase())) {
              allIssues.push(issueText)
            }
          }
        }
      }
    }

    return filterPodIssuesForDiagnosis(allIssues, podDiagnosis?.kind)
  }, [baseIssues, eventsOutput, podDiagnosis?.kind])

  const diagnosisEvidence = useMemo(() => {
    if (!podDiagnosis) {
      return []
    }

    const evidenceItems: string[] = []

    if (podDiagnosis.currentStateReason) {
      evidenceItems.push(t('drilldown.diagnosis.evidence.currentStateReason', { reason: podDiagnosis.currentStateReason }))
    }
    if (podDiagnosis.lastExitReason && podDiagnosis.exitCode) {
      evidenceItems.push(t('drilldown.diagnosis.evidence.lastExitReasonWithCode', { reason: podDiagnosis.lastExitReason, code: podDiagnosis.exitCode }))
    } else if (podDiagnosis.lastExitReason) {
      evidenceItems.push(t('drilldown.diagnosis.evidence.lastExitReason', { reason: podDiagnosis.lastExitReason }))
    }
    if (podDiagnosis.lastExitMessage) {
      evidenceItems.push(t('drilldown.diagnosis.evidence.lastExitMessage', { message: podDiagnosis.lastExitMessage }))
    }
    if (podDiagnosis.warningEvent) {
      evidenceItems.push(t('drilldown.diagnosis.evidence.warningEvent', { event: podDiagnosis.warningEvent }))
    }
    if (podDiagnosis.logSnippet) {
      evidenceItems.push(t('drilldown.diagnosis.evidence.logSnippet', { snippet: podDiagnosis.logSnippet }))
    }
    if (evidenceItems.length === 0 && reason) {
      evidenceItems.push(t('drilldown.diagnosis.evidence.reportedReason', { reason }))
    }
    if (evidenceItems.length === 0 && status) {
      evidenceItems.push(t('drilldown.diagnosis.evidence.reportedStatus', { status }))
    }

    return evidenceItems
  }, [podDiagnosis, reason, status, t])

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
      const ws = openTrackedWs()
      const requestId = `describe-${Date.now()}`

      ws.onopen = () => {
        ws.send(JSON.stringify({
          id: requestId,
          type: 'kubectl',
          payload: { context: cluster, args: ['describe', 'pod', podName, '-n', namespace] }
        }))
      }

      ws.onmessage = (event: MessageEvent) => {
        try {
          const msg = JSON.parse(event.data)
          if (msg.id === requestId && msg.payload?.output) {
            setDescribeOutput(msg.payload.output)
            // Parse labels and annotations from describe output if not already set
            if (!labels || !annotations) {
              const output = msg.payload.output as string
              const labelsMatch = output.match(/Labels:\s*([\s\S]*?)(?=Annotations:|$)/i)
              const annotationsMatch = output.match(/Annotations:\s*([\s\S]*?)(?=Status:|Controlled By:|$)/i)

              if (labelsMatch && !labels) {
                const parsed: Record<string, string> = Object.create(null) as Record<string, string>
                labelsMatch[1].trim().split('\n').forEach(line => {
                  const [key, ...valueParts] = line.trim().split('=')
                  if (key && key !== '<none>') safeSet(parsed, key, valueParts.join('='))
                })
                if (Object.keys(parsed).length > 0) setLabels(parsed)
              }

              if (annotationsMatch && !annotations) {
                const parsed: Record<string, string> = Object.create(null) as Record<string, string>
                annotationsMatch[1].trim().split('\n').forEach(line => {
                  const colonIdx = line.indexOf(':')
                  if (colonIdx > 0) {
                    const key = line.substring(0, colonIdx).trim()
                    const value = line.substring(colonIdx + 1).trim()
                    if (key && key !== '<none>') safeSet(parsed, key, value)
                  }
                })
                if (Object.keys(parsed).length > 0) setAnnotations(parsed)
              }
            }
          }
        } catch {
          // Ignore malformed WebSocket messages
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
      const ws = openTrackedWs()
      const requestId = `logs-${Date.now()}`

      ws.onopen = () => {
        ws.send(JSON.stringify({
          id: requestId,
          type: 'kubectl',
          payload: { context: cluster, args: ['logs', podName, '-n', namespace, '--tail=500'] }
        }))
      }

      ws.onmessage = (event: MessageEvent) => {
        try {
          const msg = JSON.parse(event.data)
          if (msg.id === requestId && msg.payload?.output) {
            setLogsOutput(msg.payload.output)
          }
        } catch {
          // Ignore malformed WebSocket messages
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
      const ws = openTrackedWs()
      const requestId = `events-${Date.now()}`

      ws.onopen = () => {
        ws.send(JSON.stringify({
          id: requestId,
          type: 'kubectl',
          payload: { context: cluster, args: ['get', 'events', '-n', namespace, '--field-selector', `involvedObject.name=${podName}`, '-o', 'wide'] }
        }))
      }

      ws.onmessage = (event: MessageEvent) => {
        try {
          const msg = JSON.parse(event.data)
          if (msg.id === requestId && msg.payload?.output) {
            setEventsOutput(msg.payload.output)
          }
        } catch {
          // Ignore malformed WebSocket messages
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
    if (!agentConnected || !backendConnected || aiAnalysisLoading) return
    setAiAnalysisLoading(true)
    // #5945 — Clear any previous error when starting a new analysis so stale
    // failures don't linger in the UI while the new request is in flight.
    setAiAnalysisError(null)

    try {
      // Helper to run a kubectl command and get output
      const runKubectl = (args: string[]): Promise<string> => {
        return new Promise((resolve) => {
          const ws = openTrackedWs()
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
          ws.onmessage = (event: MessageEvent) => {
            try {
              const msg = JSON.parse(event.data)
              if (msg.id === requestId && msg.payload?.output) {
                output = msg.payload.output
              }
            } catch {
              // Ignore malformed WebSocket messages
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
      const ws = openTrackedWs()
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
Reported Issues: ${(issues || []).join(', ')}

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

      ws.onmessage = (event: MessageEvent) => {
        try {
          const msg = JSON.parse(event.data)
          if (msg.id === requestId) {
            if (msg.payload?.content) {
              // #5945 — Success path: clear any lingering error state
              setAiAnalysis(msg.payload.content)
              setAiAnalysisError(null)
            } else if (msg.payload?.error || msg.payload?.message) {
              // #5945 — Surface backend error via dedicated error state + toast
              // so the user sees a clear failure instead of a silent no-op.
              const errMsg = `Analysis unavailable: ${msg.payload.error || msg.payload.message}`
              setAiAnalysisError(errMsg)
              setAiAnalysis(null)
              showToast(errMsg, 'error')
            } else {
              setAiAnalysis('Analysis complete - no specific issues identified.')
              setAiAnalysisError(null)
            }
          }
        } catch {
          // #5945 — Even malformed WebSocket messages must be reported as a
          // failure so the user knows the analysis did not complete.
          const errMsg = 'AI analysis failed: received an invalid response from the agent.'
          setAiAnalysisError(errMsg)
          showToast(errMsg, 'error')
        }
        ws.close()
        setAiAnalysisLoading(false)
      }

      ws.onerror = () => {
        // #5945 — Previously this only set aiAnalysis to a plain string which
        // made the error look like a successful result. Now we route it to
        // the error state and also show a toast so the failure is visible.
        const errMsg = 'Could not connect to AI analysis service. Please check that the agent is running and try again.'
        setAiAnalysisError(errMsg)
        setAiAnalysis(null)
        showToast(errMsg, 'error')
        setAiAnalysisLoading(false)
        ws.close()
      }
    } catch (err: unknown) {
      // #5945 — Unexpected errors (kubectl failures, network issues, etc.)
      // must also be surfaced so the failure is not silent.
      const errMsg = `Failed to perform AI analysis: ${err instanceof Error ? err.message : String(err)}`
      setAiAnalysisError(errMsg)
      setAiAnalysis(null)
      showToast(errMsg, 'error')
      setAiAnalysisLoading(false)
    }
  }

  // Fetch pod status via kubectl get
  const fetchPodStatus = async (force = false) => {
    if (!agentConnected || (!force && podStatusOutput)) return
    setPodStatusLoading(true)

    try {
      const ws = openTrackedWs()
      const requestId = `status-${Date.now()}`

      ws.onopen = () => {
        ws.send(JSON.stringify({
          id: requestId,
          type: 'kubectl',
          payload: { context: cluster, args: ['get', 'pod', podName, '-n', namespace, '-o', 'wide'] }
        }))
      }

      ws.onmessage = (event: MessageEvent) => {
        try {
          const msg = JSON.parse(event.data)
          if (msg.id === requestId && msg.payload?.output) {
            setPodStatusOutput(msg.payload.output)
          }
        } catch {
          // Ignore malformed WebSocket messages
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
      const ws = openTrackedWs()
      const requestId = `yaml-${Date.now()}`

      ws.onopen = () => {
        ws.send(JSON.stringify({
          id: requestId,
          type: 'kubectl',
          payload: { context: cluster, args: ['get', 'pod', podName, '-n', namespace, '-o', 'yaml'] }
        }))
      }

      ws.onmessage = (event: MessageEvent) => {
        try {
          const msg = JSON.parse(event.data)
          if (msg.id === requestId && msg.payload?.output) {
            setYamlOutput(msg.payload.output)
          }
        } catch {
          // Ignore malformed WebSocket messages
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hasLoadedRef guards against re-execution; only agentConnected triggers the initial load
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
      fetchedAt: Date.now()
    })
  }, [cluster, namespace, podName, describeOutput, logsOutput, eventsOutput, yamlOutput, podStatusOutput, aiAnalysis, labels, annotations, configMaps, secrets, pvcs, serviceAccount, ownerChain])

  const handleRepairPod = () => {
    checkKeyAndRun(() => {
      closeDrillDown() // Close panel so mission sidebar is visible
      startMission({
        title: `Repair Pod ${podName}`,
        description: `Diagnose and fix issues with pod ${podName}`,
        type: 'repair',
        cluster,
        initialPrompt: `I need help diagnosing and repairing issues with pod "${podName}" in namespace "${namespace}" on cluster "${cluster}".

Current Status: ${status}
Restarts: ${restarts}
${reason ? `Reason: ${reason}` : ''}
${(issues || []).length > 0 ? `Issues: ${(issues || []).join(', ')}` : ''}

Please:
1. Investigate the root cause — check pod logs, events, and configuration.
2. Tell me what you found, then ask:
   - "Should I apply the fix?"
   - "Show me more details first"
3. If I say fix it, apply and verify. Then ask:
   - "Should I check for related issues?"
   - "All done"`,
        context: {
          podName,
          namespace,
          cluster,
          status,
          restarts,
          issues
        }
      })
    })
  }

  // Check if user can delete pods in this namespace
  const checkDeletePermission = useCallback(async () => {
    try {
      const result = await checkPermission({
        cluster,
        verb: 'delete',
        resource: 'pods',
        namespace
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
    if (!agentConnected || !backendConnected || !canDeletePod) return

    setDeletingPod(true)
    setDeleteError(null)

    try {
      const ws = openTrackedWs()
      const requestId = `delete-pod-${Date.now()}`

      ws.onopen = () => {
        ws.send(JSON.stringify({
          id: requestId,
          type: 'kubectl',
          payload: { context: cluster, args: ['delete', 'pod', podName, '-n', namespace] }
        }))
      }

      ws.onmessage = (event: MessageEvent) => {
        try {
          const msg = JSON.parse(event.data)
          if (msg.id === requestId) {
            if (msg.type === 'error' || msg.payload?.exitCode !== 0) {
              setDeleteError(msg.payload?.error || 'Failed to delete pod')
            } else {
              // Success - close the drill down
              closeDrillDown()
            }
          }
        } catch {
          // Ignore malformed WebSocket messages
        }
        ws.close()
        setDeletingPod(false)
      }

      ws.onerror = () => {
        setDeleteError('Connection error')
        setDeletingPod(false)
        ws.close()
      }
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : 'Unknown error')
      setDeletingPod(false)
    }
  }

  const handleCopy = (field: string, value: string) => {
    copyToClipboard(value)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), UI_FEEDBACK_TIMEOUT_MS)
  }

  // Save label changes via kubectl
  const saveLabels = async () => {
    if (!agentConnected) return
    setLabelSaving(true)
    setLabelError(null)

    try {
      const runKubectl = (args: string[]): Promise<{ success: boolean; error?: string }> => {
        return new Promise((resolve) => {
          const ws = openTrackedWs()
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
          ws.onmessage = (event: MessageEvent) => {
            try {
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
            } catch {
              clearTimeout(timeout)
              ws.close()
              resolve({ success: false, error: 'Failed to parse response' })
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
          if (UNSAFE_KEYS.has(key)) continue
          if (value === null) {
            delete updated[key]
          } else {
            updated[key] = value
          }
        }
        // Add new label
        if (newLabelKey.trim() && newLabelValue.trim() && !UNSAFE_KEYS.has(newLabelKey.trim())) {
          updated[newLabelKey.trim()] = newLabelValue.trim()
        }
        return updated
      })

      // Reset edit state
      setEditingLabels(false)
      setPendingLabelChanges({})
      setNewLabelKey('')
      setNewLabelValue('')
    } catch (err: unknown) {
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
    if (UNSAFE_KEYS.has(key)) return
    setPendingLabelChanges(prev => ({ ...prev, [key]: value }))
  }

  const handleLabelRemove = (key: string) => {
    if (UNSAFE_KEYS.has(key)) return
    setPendingLabelChanges(prev => ({ ...prev, [key]: null }))
  }

  const undoLabelChange = (key: string) => {
    if (UNSAFE_KEYS.has(key)) return
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
          const ws = openTrackedWs()
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
          ws.onmessage = (event: MessageEvent) => {
            try {
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
            } catch {
              clearTimeout(timeout)
              ws.close()
              resolve({ success: false, error: 'Failed to parse response' })
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
          if (UNSAFE_KEYS.has(key)) continue
          if (value === null) {
            delete updated[key]
          } else {
            updated[key] = value
          }
        }
        // Add new annotation
        if (newAnnotationKey.trim() && newAnnotationValue.trim() && !UNSAFE_KEYS.has(newAnnotationKey.trim())) {
          updated[newAnnotationKey.trim()] = newAnnotationValue.trim()
        }
        return updated
      })

      // Reset edit state
      setEditingAnnotations(false)
      setPendingAnnotationChanges({})
      setNewAnnotationKey('')
      setNewAnnotationValue('')
    } catch (err: unknown) {
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
    if (UNSAFE_KEYS.has(key)) return
    setPendingAnnotationChanges(prev => ({ ...prev, [key]: value }))
  }

  const handleAnnotationRemove = (key: string) => {
    if (UNSAFE_KEYS.has(key)) return
    setPendingAnnotationChanges(prev => ({ ...prev, [key]: null }))
  }

  const undoAnnotationChange = (key: string) => {
    if (UNSAFE_KEYS.has(key)) return
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
          const ws = openTrackedWs()
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
          ws.onmessage = (event: MessageEvent) => {
            try {
              const msg = JSON.parse(event.data)
              if (msg.id === requestId && msg.payload?.output) {
                output = msg.payload.output
              }
            } catch {
              // Ignore malformed WebSocket messages
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
      // Use a K8s-valid name pattern to avoid capturing quotes or YAML artifacts
      const K8S_NAME_PATTERN = '[a-z0-9][a-z0-9._-]*[a-z0-9]|[a-z0-9]'
      const pvcRefs = new Set<string>()
      const pvcMatches = podYaml.matchAll(new RegExp(`claimName:\\s*"?(${K8S_NAME_PATTERN})"?`, 'g'))
      for (const match of pvcMatches) {
        if (match[1]) pvcRefs.add(match[1])
      }
      setPvcs(Array.from(pvcRefs))

      // Build owner chain (pod -> replicaset -> deployment)
      const chain: RelatedResource[] = []
      const ownerRefMatch = podYaml.match(/ownerReferences:[\s\S]*?kind:\s*(\w+)[\s\S]*?name:\s*([\w-]+)/)
      if (ownerRefMatch) {
        const ownerKind = ownerRefMatch[1]
        const ownerName = ownerRefMatch[2]
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
    { id: 'exec', label: 'Exec', icon: TerminalSquare },
    { id: 'events', label: t('drilldown.tabs.events'), icon: Zap },
    { id: 'yaml', label: t('drilldown.tabs.yaml'), icon: Code },
  ]

  // Extract container names from YAML output for exec tab
  const containerNames = useMemo(() => {
    if (!yamlOutput) return []
    const names: string[] = []
    // In kubectl YAML, container objects live under "  containers:" or "  initContainers:"
    // and have "    name: <value>" (4-space indent, no dash prefix).
    // Env vars/volumes use "    - name:" (with dash) — we must NOT match those.
    const lines = yamlOutput.split('\n')
    let inContainerSection = false
    for (const line of lines) {
      if (/^ {2}(?:init)?containers:\s*$/.test(line)) {
        inContainerSection = true
        continue
      }
      // Exit section at next spec-level key (2-space indent, not a list item)
      if (inContainerSection && /^ {2}[a-z]/.test(line)) {
        inContainerSection = false
      }
      if (inContainerSection) {
        const match = line.match(/^ {4}name:\s+(.+)$/)
        if (match) {
          const name = match[1].trim()
          if (name && !names.includes(name)) {
            names.push(name)
          }
        }
      }
    }
    return names
  }, [yamlOutput])

  return (
    <div className="flex flex-col -m-6">
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
              <svg className="w-3 h-3 text-purple-400/70 group-hover:text-purple-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
              <svg className="w-3 h-3 text-blue-400/70 group-hover:text-blue-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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

      {/* Tab Content */}
      <div className="p-6 space-y-6">
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
                  <pre className="p-3 rounded-lg bg-muted border border-border overflow-x-auto text-xs text-foreground font-mono">
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
              ) : (podStatusLoading || describeLoading || eventsLoading) ? (
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

            {podDiagnosis && (
              <div className="rounded-xl border border-orange-500/30 bg-orange-500/5 p-4 space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-orange-300">
                      <AlertTriangle className="w-4 h-4" />
                      <span className="text-xs font-semibold tracking-wide uppercase">{t('drilldown.diagnosis.title')}</span>
                    </div>
                    <h3 className="text-sm font-semibold text-foreground">
                      {t(DIAGNOSIS_SUMMARY_KEYS[podDiagnosis.kind])}
                    </h3>
                    <p className="text-sm text-muted-foreground">{t('drilldown.diagnosis.subtitle')}</p>
                  </div>
                  {(podDiagnosis.lastExitReason || podDiagnosis.exitCode) && (
                    <div className="rounded-lg border border-orange-500/30 bg-background/60 px-3 py-2 text-right">
                      <div className="text-[11px] uppercase tracking-wide text-orange-300">{t('drilldown.diagnosis.lastExit')}</div>
                      <div className="font-mono text-sm text-foreground">
                        {podDiagnosis.lastExitReason || t('drilldown.diagnosis.unknownExit')}
                        {podDiagnosis.exitCode ? ` · ${t('drilldown.diagnosis.exitCode', { code: podDiagnosis.exitCode })}` : ''}
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <div>
                    <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {t('drilldown.diagnosis.evidenceTitle')}
                    </h4>
                    <ul className="space-y-2 text-sm text-foreground">
                      {diagnosisEvidence.map((item, index) => (
                        <li key={`${item}-${index}`} className="flex gap-2">
                          <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-orange-400" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {t('drilldown.diagnosis.nextStepsTitle')}
                    </h4>
                    <ul className="space-y-2 text-sm text-foreground">
                      {DIAGNOSIS_STEP_KEYS[podDiagnosis.kind].map(stepKey => (
                        <li key={stepKey} className="flex gap-2">
                          <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-400" />
                          <span>{t(stepKey)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setActiveTab('logs')}
                    className="rounded-lg border border-border bg-background/70 px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
                  >
                    {t('drilldown.actions.viewLogs')}
                  </button>
                  <button
                    onClick={() => setActiveTab('events')}
                    className="rounded-lg border border-border bg-background/70 px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
                  >
                    {t('drilldown.actions.viewEvents')}
                  </button>
                  <button
                    onClick={() => setActiveTab('yaml')}
                    className="rounded-lg border border-border bg-background/70 px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
                  >
                    {t('drilldown.diagnosis.reviewSpec')}
                  </button>
                  {agentConnected && canDeletePod && isManagedPod && (
                    <button
                      onClick={() => setShowDeletePodConfirm(true)}
                      className="rounded-lg border border-orange-500/40 bg-orange-500/10 px-3 py-2 text-sm font-medium text-orange-200 transition-colors hover:bg-orange-500/20"
                    >
                      {t('drilldown.actions.restartResource')}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Recent Events */}
            {eventsOutput && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <Zap className="w-4 h-4 text-yellow-400" />
                    {t('drilldown.tabs.recentEvents')}
                  </h3>
                  <button
                    onClick={() => setActiveTab('events')}
                    className="text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 font-medium"
                  >
                    View all
                  </button>
                </div>
                <pre className="p-3 rounded-lg bg-muted border border-border overflow-x-auto text-xs text-foreground font-mono max-h-32 overflow-y-auto">
                  {eventsOutput.includes('No resources found')
                    ? `No events found for pod ${podName}`
                    : eventsOutput.split('\n').slice(0, 6).join('\n')}
                </pre>
              </div>
            )}
          </div>
        )}

        {activeTab === 'labels' && (
          <PodLabelsTab
            labels={labels}
            annotations={annotations}
            describeLoading={describeLoading}
            agentConnected={agentConnected}
            copiedField={copiedField}
            showAllLabels={showAllLabels}
            setShowAllLabels={setShowAllLabels}
            editingLabels={editingLabels}
            setEditingLabels={setEditingLabels}
            pendingLabelChanges={pendingLabelChanges}
            newLabelKey={newLabelKey}
            setNewLabelKey={setNewLabelKey}
            newLabelValue={newLabelValue}
            setNewLabelValue={setNewLabelValue}
            labelSaving={labelSaving}
            labelError={labelError}
            handleLabelChange={handleLabelChange}
            handleLabelRemove={handleLabelRemove}
            undoLabelChange={undoLabelChange}
            saveLabels={saveLabels}
            cancelLabelEdit={cancelLabelEdit}
            showAllAnnotations={showAllAnnotations}
            setShowAllAnnotations={setShowAllAnnotations}
            editingAnnotations={editingAnnotations}
            setEditingAnnotations={setEditingAnnotations}
            pendingAnnotationChanges={pendingAnnotationChanges}
            newAnnotationKey={newAnnotationKey}
            setNewAnnotationKey={setNewAnnotationKey}
            newAnnotationValue={newAnnotationValue}
            setNewAnnotationValue={setNewAnnotationValue}
            annotationSaving={annotationSaving}
            annotationError={annotationError}
            handleAnnotationChange={handleAnnotationChange}
            handleAnnotationRemove={handleAnnotationRemove}
            undoAnnotationChange={undoAnnotationChange}
            saveAnnotations={saveAnnotations}
            cancelAnnotationEdit={cancelAnnotationEdit}
            handleCopy={handleCopy}
          />
        )}

        {activeTab === 'related' && (
          <PodRelatedTab
            podName={podName}
            namespace={namespace}
            cluster={cluster}
            agentConnected={agentConnected}
            relatedLoading={relatedLoading}
            ownerChain={ownerChain}
            configMaps={configMaps}
            secrets={secrets}
            pvcs={pvcs}
            serviceAccount={serviceAccount}
            fetchRelatedResources={fetchRelatedResources}
            drillToDeployment={drillToDeployment}
            drillToReplicaSet={drillToReplicaSet}
            drillToConfigMap={drillToConfigMap}
            drillToSecret={drillToSecret}
            drillToServiceAccount={drillToServiceAccount}
            drillToPVC={drillToPVC}
          />
        )}

        {activeTab === 'describe' && (
          <PodOutputTab
            output={describeOutput}
            loading={describeLoading}
            agentConnected={agentConnected}
            copyField="describe"
            copiedField={copiedField}
            kubectlComment={`# kubectl describe pod ${podName} -n ${namespace}`}
            loadingMessage={t('drilldown.status.runningDescribe')}
            notConnectedMessage={t('drilldown.empty.connectAgentDescribe')}
            emptyMessage={t('drilldown.empty.failedFetchDescribe')}
            handleCopy={handleCopy}
            onRefresh={() => fetchDescribe(true)}
          />
        )}

        {activeTab === 'logs' && (
          <PodOutputTab
            output={logsOutput}
            loading={logsLoading}
            agentConnected={agentConnected}
            copyField="logs"
            copiedField={copiedField}
            kubectlComment={`# kubectl logs ${podName} -n ${namespace} --tail=500`}
            loadingMessage={t('drilldown.status.fetchingLogs')}
            notConnectedMessage={t('drilldown.empty.connectAgentLogs')}
            emptyMessage={t('drilldown.empty.noLogsAvailable')}
            handleCopy={handleCopy}
            onRefresh={() => fetchLogs(true)}
            refreshIcon={Terminal}
            refreshLabel="Refresh"
          />
        )}

        {activeTab === 'exec' && (
          <div className="h-[500px] rounded-lg overflow-hidden border border-border">
            <Suspense fallback={<div className="flex items-center justify-center h-full text-muted-foreground"><Loader2 className="animate-spin mr-2 h-4 w-4" />Loading terminal…</div>}>
              <PodExecTerminal
                cluster={cluster}
                namespace={namespace}
                pod={podName}
                containers={containerNames}
                defaultContainer={containerNames[0]}
              />
            </Suspense>
          </div>
        )}

        {activeTab === 'events' && (
          <PodOutputTab
            output={eventsOutput}
            loading={eventsLoading}
            agentConnected={agentConnected}
            copyField="events"
            copiedField={copiedField}
            kubectlComment={`# kubectl get events -n ${namespace} --field-selector involvedObject.name=${podName}`}
            loadingMessage={t('drilldown.status.fetchingEvents')}
            notConnectedMessage={t('drilldown.empty.connectAgentEvents')}
            emptyMessage={t('drilldown.empty.noEventsFound', { resource: 'pod' })}
            handleCopy={handleCopy}
            onRefresh={() => fetchEvents(true)}
            refreshIcon={Zap}
            refreshLabel="Refresh"
          />
        )}

        {activeTab === 'yaml' && (
          <PodOutputTab
            output={yamlOutput}
            loading={yamlLoading}
            agentConnected={agentConnected}
            copyField="yaml"
            copiedField={copiedField}
            kubectlComment={`# kubectl get pod ${podName} -n ${namespace} -o yaml`}
            loadingMessage={t('drilldown.status.fetchingYaml')}
            notConnectedMessage={t('drilldown.empty.connectAgentYaml')}
            emptyMessage={t('drilldown.empty.failedFetchYaml')}
            handleCopy={handleCopy}
            onRefresh={() => fetchYaml(true)}
            refreshIcon={Code}
            refreshLabel="Refresh"
          />
        )}
      </div>

      {/* AI Actions Footer - Always visible */}
      {agentConnected && issues.length > 0 && (
        <div className="border-t border-border bg-card">
          <PodAiAnalysis
            aiAnalysis={aiAnalysis}
            aiAnalysisLoading={aiAnalysisLoading}
            aiAnalysisError={aiAnalysisError}
            backendUnavailable={!backendConnected}
            fetchAiAnalysis={fetchAiAnalysis}
            handleRepairPod={handleRepairPod}
          />
          <PodDeleteSection
            podName={podName}
            agentConnected={agentConnected}
            backendUnavailable={!backendConnected}
            canDeletePod={canDeletePod}
            deletingPod={deletingPod}
            deleteError={deleteError}
            showDeletePodConfirm={showDeletePodConfirm}
            setShowDeletePodConfirm={setShowDeletePodConfirm}
            isManagedPod={isManagedPod}
            handleDeletePod={handleDeletePod}
          />
        </div>
      )}

      <ApiKeyPromptModal
        isOpen={showKeyPrompt}
        onDismiss={dismissPrompt}
        onGoToSettings={goToSettings}
        errorMessage={errorMessage}
        fallbackContent={
          eventsOutput && !eventsOutput.includes('No resources found') ? (
            <div>
              <p className="text-xs font-medium text-foreground mb-1.5">Pod Events (non-AI troubleshooting):</p>
              <pre className="text-[10px] text-muted-foreground overflow-x-auto whitespace-pre-wrap max-h-32 overflow-y-auto">
                {eventsOutput.split('\n').slice(0, 10).join('\n')}
              </pre>
            </div>
          ) : null
        }
      />
    </div>
  )
}
