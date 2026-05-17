import { useCallback, useMemo, useRef } from 'react'
import { useAsyncData } from '../../../hooks/useAsyncData'
import { useDrillDownWebSocket } from '../../../hooks/useDrillDownWebSocket'
import { useToast } from '../../ui/Toast'
import { useTranslation } from 'react-i18next'
import { UNHEALTHY_STATUSES, getPodCache, setPodCache, cleanupPodCache, RAPID_REOPEN_THRESHOLD_MS, filterPodIssuesForDiagnosis, getPodDiagnosis } from './pod-drilldown'
import type { CachedData } from './pod-drilldown'

/** Safely assign a key-value pair to a plain object, rejecting prototype-polluting keys. */
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

export function safeSet<T>(obj: Record<string, T>, key: string, value: T): void {
  if (!UNSAFE_KEYS.has(key)) {
    obj[key] = value
  }
}

interface UsePodDataProps {
  cluster: string
  namespace: string
  podName: string
  data: Record<string, unknown>
  agentConnected: boolean
  backendActionUnavailable: boolean
  backendUnavailableMessage: string
}

export function usePodData({
  cluster,
  namespace,
  podName,
  data,
  agentConnected,
  backendActionUnavailable,
  backendUnavailableMessage,
}: UsePodDataProps) {
  const { t } = useTranslation()
  const { showToast } = useToast()
  const {
    runKubectl,
    openTrackedWs,
    parseWsMessage: parseDrillDownWsMessage,
  } = useDrillDownWebSocket(cluster)

  // Get cached data
  const persistentCache = getPodCache(cluster, namespace, podName)
  const viewCache = (data._cache as CachedData) || {}
  const cache = persistentCache || viewCache

  // Track if this is a fresh mount vs navigation back
  const hasLoadedRef = useRef(false)
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

  const getInvalidWsResponseError = useCallback((context: string) => (
    `${context} failed: received an invalid response from the agent.`
  ), [])

  const parseWsMessage = useCallback((event: MessageEvent, context: string) => {
    const message = parseDrillDownWsMessage(event)
    if (!message) {
      console.error(`[PodDrillDown] Failed to parse ${context} WebSocket message.`)
      showToast(t('drilldown.errors.invalidPodResponse', 'Failed to load pod details due to an invalid agent response.'), 'error')
      return null
    }
    return message
  }, [parseDrillDownWsMessage, showToast, t])

  // Pod data from the issue
  const status = data.status as string
  const restarts = (data.restarts as number) || 0
  const reason = data.reason as string
  const passedIssues = (data.issues as string[]) || []

  const invalidPodResponseError = t(
    'drilldown.errors.invalidPodResponse',
    'Failed to load pod details due to an invalid agent response.',
  )

  // Fetchers
  const describeFetcher = useCallback(async (): Promise<string> => {
    const output = await runKubectl(['describe', 'pod', podName, '-n', namespace])
    if (!output) {
      throw new Error(invalidPodResponseError)
    }
    return output
  }, [runKubectl, podName, namespace, invalidPodResponseError])

  const logsFetcher = useCallback(async (): Promise<string> => {
    const output = await runKubectl(['logs', podName, '-n', namespace, '--tail=500'])
    if (!output) {
      throw new Error(invalidPodResponseError)
    }
    return output
  }, [runKubectl, podName, namespace, invalidPodResponseError])

  const eventsFetcher = useCallback(async (): Promise<string> => {
    const output = await runKubectl([
      'get',
      'events',
      '-n',
      namespace,
      '--field-selector',
      `involvedObject.name=${podName}`,
      '-o',
      'wide',
    ])
    if (!output) {
      throw new Error(invalidPodResponseError)
    }
    return output
  }, [runKubectl, podName, namespace, invalidPodResponseError])

  const podStatusFetcher = useCallback(async (): Promise<string> => {
    const ws = await openTrackedWs()
    return new Promise((resolve, reject) => {
      const requestId = `status-${Date.now()}`

      ws.onopen = () => {
        ws.send(JSON.stringify({
          id: requestId,
          type: 'kubectl',
          payload: { context: cluster, args: ['get', 'pod', podName, '-n', namespace, '-o', 'wide'] },
        }))
      }

      ws.onmessage = (event: MessageEvent) => {
        const msg = parseWsMessage(event, 'pod status')
        if (!msg) {
          reject(new Error(getInvalidWsResponseError('Pod status')))
          ws.close()
          return
        }

        if (msg.id === requestId && msg.payload?.output) {
          resolve(msg.payload.output)
          ws.close()
          return
        }
        if (msg.id === requestId) {
          reject(new Error(getInvalidWsResponseError('Pod status')))
          ws.close()
          return
        }
      }

      ws.onerror = () => {
        ws.close()
        reject(new Error(getInvalidWsResponseError('Pod status')))
      }
    })
  }, [openTrackedWs, cluster, podName, namespace, parseWsMessage, getInvalidWsResponseError])

  const yamlFetcher = useCallback(async (): Promise<string> => {
    const ws = await openTrackedWs()
    return new Promise((resolve, reject) => {
      const requestId = `yaml-${Date.now()}`

      ws.onopen = () => {
        ws.send(JSON.stringify({
          id: requestId,
          type: 'kubectl',
          payload: { context: cluster, args: ['get', 'pod', podName, '-n', namespace, '-o', 'yaml'] },
        }))
      }

      ws.onmessage = (event: MessageEvent) => {
        const msg = parseWsMessage(event, 'yaml')
        if (!msg) {
          reject(new Error(getInvalidWsResponseError('YAML')))
          ws.close()
          return
        }

        if (msg.id === requestId && msg.payload?.output) {
          resolve(msg.payload.output)
          ws.close()
          return
        }
        if (msg.id === requestId) {
          reject(new Error(getInvalidWsResponseError('YAML')))
          ws.close()
          return
        }
      }

      ws.onerror = () => {
        ws.close()
        reject(new Error(getInvalidWsResponseError('YAML')))
      }
    })
  }, [openTrackedWs, cluster, podName, namespace, parseWsMessage, getInvalidWsResponseError])

  const aiAnalysisFetcher = useCallback(async (
    labels: Record<string, string> | null,
    annotations: Record<string, string> | null,
    issues: string[]
  ): Promise<string> => {
    if (backendActionUnavailable) {
      showToast(backendUnavailableMessage, 'error')
      throw new Error(backendUnavailableMessage)
    }

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

    let nodeInfo = ''
    const nodeMatch = podDescribe.match(/Node:\s*([\w.-]+)/)
    if (nodeMatch && nodeMatch[1] !== '<none>') {
      const nodeDescribe = await runKubectl(['describe', 'node', nodeMatch[1]])
      const conditionsMatch = nodeDescribe.match(/Conditions:[\s\S]*?(?=Addresses:|$)/)
      const capacityMatch = nodeDescribe.match(/Capacity:[\s\S]*?(?=Allocatable:|$)/)
      const allocatableMatch = nodeDescribe.match(/Allocatable:[\s\S]*?(?=System Info:|$)/)
      nodeInfo = `\n--- NODE INFO (${nodeMatch[1]}) ---\n`
      if (conditionsMatch) nodeInfo += `Conditions:\n${conditionsMatch[0]}\n`
      if (capacityMatch) nodeInfo += `${capacityMatch[0]}\n`
      if (allocatableMatch) nodeInfo += `${allocatableMatch[0]}\n`
    }

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

    const ws = await openTrackedWs()
    const requestId = `ai-analyze-${Date.now()}`

    return new Promise((resolve, reject) => {
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

Be specific and reference actual values from the data. Keep response to 3-4 sentences max.`,
          },
        }))
      }

      ws.onmessage = (event: MessageEvent) => {
        const msg = parseWsMessage(event, 'AI analysis')
        if (!msg) {
          reject(new Error(getInvalidWsResponseError('AI analysis')))
          ws.close()
          return
        }

        const response = msg.payload?.response
        if (msg.id === requestId && typeof response === 'string') {
          resolve(response)
          ws.close()
          return
        }
        if (msg.id === requestId) {
          reject(new Error(getInvalidWsResponseError('AI analysis')))
          ws.close()
          return
        }
      }

      ws.onerror = () => {
        ws.close()
        reject(new Error(getInvalidWsResponseError('AI analysis')))
      }
    })
  }, [openTrackedWs, runKubectl, parseWsMessage, getInvalidWsResponseError, cluster, podName, namespace, status, backendActionUnavailable, backendUnavailableMessage, showToast])

  // UseAsyncData hooks
  const {
    data: describeOutput,
    loading: describeLoading,
    error: describeError,
    refetch: refetchDescribe,
  } = useAsyncData(describeFetcher, [describeFetcher], {
    initialData: cache.describeOutput || null,
    enabled: false,
  })

  const {
    data: logsOutput,
    loading: logsLoading,
    error: logsError,
    refetch: refetchLogs,
  } = useAsyncData(logsFetcher, [logsFetcher], {
    initialData: cache.logsOutput || null,
    enabled: false,
  })

  const {
    data: eventsOutput,
    loading: eventsLoading,
    error: eventsError,
    refetch: refetchEvents,
  } = useAsyncData(eventsFetcher, [eventsFetcher], {
    initialData: cache.eventsOutput || null,
    enabled: false,
  })

  const {
    data: yamlOutput,
    loading: yamlLoading,
    error: yamlError,
    refetch: refetchYaml,
  } = useAsyncData(yamlFetcher, [yamlFetcher], {
    initialData: cache.yamlOutput || null,
    enabled: false,
  })

  const {
    data: podStatusOutput,
    loading: podStatusLoading,
    error: podStatusError,
    refetch: refetchPodStatus,
  } = useAsyncData(podStatusFetcher, [podStatusFetcher], {
    initialData: cache.podStatusOutput || null,
    enabled: false,
  })

  const fetchDescribe = async (force = false): Promise<void> => {
    if (!agentConnected || (!force && describeOutput)) return
    await refetchDescribe()
  }

  const fetchLogs = async (force = false): Promise<void> => {
    if (!agentConnected || (!force && logsOutput)) return
    await refetchLogs()
  }

  const fetchEvents = async (force = false): Promise<void> => {
    if (!agentConnected || (!force && eventsOutput)) return
    await refetchEvents()
  }

  const fetchYaml = async (force = false): Promise<void> => {
    if (!agentConnected || (!force && yamlOutput)) return
    await refetchYaml()
  }

  const fetchPodStatus = async (force = false): Promise<void> => {
    if (!agentConnected || (!force && podStatusOutput)) return
    await refetchPodStatus()
  }

  // Issues computation
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

  return {
    cache,
    hasLoadedRef,
    shouldAutoRefreshRef,
    describeOutput,
    describeLoading,
    describeError,
    logsOutput,
    logsLoading,
    logsError,
    eventsOutput,
    eventsLoading,
    eventsError,
    yamlOutput,
    yamlLoading,
    yamlError,
    podStatusOutput,
    podStatusLoading,
    podStatusError,
    fetchDescribe,
    fetchLogs,
    fetchEvents,
    fetchYaml,
    fetchPodStatus,
    issues,
    baseIssues,
    podDiagnosis,
    status,
    restarts,
    reason,
    aiAnalysisFetcher,
    runKubectl,
    openTrackedWs,
    parseWsMessage,
  }
}
