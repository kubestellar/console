import { useState, useEffect, useRef, useCallback } from 'react'
import { useLocalAgent } from '../../../hooks/useLocalAgent'
import { LOCAL_AGENT_WS_URL } from '../../../lib/constants'
import { appendWsAuthToken } from '../../../lib/utils/wsAuth'
import { useDrillDownActions } from '../../../hooks/useDrillDown'
import { useCanI } from '../../../hooks/usePermissions'
import { ClusterBadge } from '../../ui/ClusterBadge'
import { FileText, Code, Info, Tag, Zap, Loader2, Copy, Check, Layers, Server, Box, Minus, Plus, RefreshCw } from 'lucide-react'
import { cn } from '../../../lib/cn'
import { RETRY_DELAY_MS, UI_FEEDBACK_TIMEOUT_MS } from '../../../lib/constants/network'
import { StatusIndicator } from '../../charts/StatusIndicator'
import { Gauge } from '../../charts/Gauge'
import { useTranslation } from 'react-i18next'
import { copyToClipboard } from '../../../lib/clipboard'

/** Maximum replicas allowed via the UI scale widget. Kubernetes itself supports
 *  up to 2^31-1 but most real deployments won't exceed a few hundred. */
const MAX_SCALE_REPLICAS = 100

/** Pod status styling configuration */
const POD_STATUS_CONFIG: Record<string, { bg: string; text: string }> = {
  Running: { bg: 'bg-green-500/20', text: 'text-green-400' },
  Pending: { bg: 'bg-yellow-500/20', text: 'text-yellow-400' },
  Failed: { bg: 'bg-red-500/20', text: 'text-red-400' },
  CrashLoopBackOff: { bg: 'bg-red-500/20', text: 'text-red-400' },
  ImagePullBackOff: { bg: 'bg-red-500/20', text: 'text-red-400' },
  Unknown: { bg: 'bg-red-500/20', text: 'text-red-400' },
}

/**
 * Classify a raw kubectl scale error into a stable i18n key. The caller
 * runs `t(...)` on the result. Returning a static key literal keeps the
 * keys compatible with i18next-typescript strict typing (no runtime
 * template literals inside t()).
 *
 * Issue 9284: previously we surfaced the full kubectl stderr, which exposed
 * internal cluster details (namespaces, group-version-kind, resource versions)
 * that aren't useful to end users.
 */
type ScaleErrorKey =
  | 'drilldown.scale.failedGeneric'
  | 'drilldown.scale.failedForbidden'
  | 'drilldown.scale.failedNotFound'
  | 'drilldown.scale.failedInvalid'
  | 'drilldown.scale.failedConflict'
  | 'drilldown.scale.failedTimeout'

function classifyScaleError(raw: string): ScaleErrorKey {
  const lc = (raw || '').toLowerCase()
  if (!raw) return 'drilldown.scale.failedGeneric'
  if (lc.includes('forbidden') || lc.includes('cannot patch') || lc.includes('unauthorized')) {
    return 'drilldown.scale.failedForbidden'
  }
  if (lc.includes('not found') || lc.includes('notfound')) {
    return 'drilldown.scale.failedNotFound'
  }
  if (lc.includes('invalid') || lc.includes('must be') || lc.includes('out of range')) {
    return 'drilldown.scale.failedInvalid'
  }
  if (lc.includes('conflict') || lc.includes('modified')) {
    return 'drilldown.scale.failedConflict'
  }
  if (lc.includes('timeout') || lc.includes('timed out') || lc.includes('deadline')) {
    return 'drilldown.scale.failedTimeout'
  }
  return 'drilldown.scale.failedGeneric'
}

interface Props {
  data: Record<string, unknown>
}

type TabType = 'overview' | 'pods' | 'events' | 'describe' | 'yaml'

/** Kubernetes set-based label selector expression */
interface LabelSelectorRequirement {
  key: string
  operator: 'In' | 'NotIn' | 'Exists' | 'DoesNotExist'
  values?: string[]
}

/**
 * Build a kubectl-compatible label selector string from matchLabels and matchExpressions.
 * Supports both equality-based (matchLabels) and set-based (matchExpressions) selectors.
 *
 * kubectl -l format:
 *   matchLabels:      "key=value"
 *   In:               "key in (val1,val2)"
 *   NotIn:            "key notin (val1,val2)"
 *   Exists:           "key"
 *   DoesNotExist:     "!key"
 */
function buildLabelSelector(
  matchLabels?: Record<string, unknown>,
  matchExpressions?: LabelSelectorRequirement[],
): string {
  const parts: string[] = []

  // Equality-based selectors from matchLabels
  if (matchLabels) {
    for (const [k, v] of Object.entries(matchLabels)) {
      parts.push(`${k}=${v}`)
    }
  }

  // Set-based selectors from matchExpressions
  if (matchExpressions) {
    for (const expr of matchExpressions) {
      const values = (expr.values || []).join(',')
      switch (expr.operator) {
        case 'In':
          parts.push(`${expr.key} in (${values})`)
          break
        case 'NotIn':
          parts.push(`${expr.key} notin (${values})`)
          break
        case 'Exists':
          parts.push(expr.key)
          break
        case 'DoesNotExist':
          parts.push(`!${expr.key}`)
          break
      }
    }
  }

  return parts.join(',')
}

export function DeploymentDrillDown({ data }: Props) {
  const { t } = useTranslation()
  const cluster = (data.cluster as string) || ''
  const namespace = (data.namespace as string) || ''
  const deploymentName = (data.deployment as string) || ''
  const { isConnected: agentConnected } = useLocalAgent()
  const { drillToNamespace, drillToCluster, drillToPod, drillToReplicaSet } = useDrillDownActions()

  const [activeTab, setActiveTab] = useState<TabType>((data.tab as TabType) || 'overview')
  // data.replicas can be a number OR an object {ready, desired} from DeploymentProgress drill-down.
  // Extract the numeric value safely to avoid rendering an object as a React child (error #300).
  const [replicas, setReplicas] = useState<number>(() => {
    const r = data.replicas
    if (typeof r === 'number') return r
    if (r && typeof r === 'object' && 'desired' in r) return Number((r as { desired: number }).desired) || 0
    return Number(r) || 0
  })
  const [readyReplicas, setReadyReplicas] = useState<number>(() => {
    const r = data.readyReplicas ?? (data.replicas && typeof data.replicas === 'object' && 'ready' in data.replicas ? (data.replicas as { ready: number }).ready : undefined)
    return Number(r) || 0
  })
  const [pods, setPods] = useState<Array<{ name: string; status: string; restarts: number }>>([])
  const [replicaSets, setReplicaSets] = useState<Array<{ name: string; replicas: number; ready: number }>>([])
  const [labels, setLabels] = useState<Record<string, string> | null>(null)
  const [eventsOutput, setEventsOutput] = useState<string | null>(null)
  const [eventsLoading, setEventsLoading] = useState(false)
  const [describeOutput, setDescribeOutput] = useState<string | null>(null)
  const [describeLoading, setDescribeLoading] = useState(false)
  const [yamlOutput, setYamlOutput] = useState<string | null>(null)
  const [yamlLoading, setYamlLoading] = useState(false)
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [canScale, setCanScale] = useState<boolean | null>(null)
  const [isScaling, setIsScaling] = useState(false)
  const [scaleError, setScaleError] = useState<string | null>(null)
  // Issue 9283: add a Refresh control that clears cached tab outputs and
  // refetches fresh data from the cluster.
  const [isRefreshing, setIsRefreshing] = useState(false)
  const { checkPermission } = useCanI()

  // Track reason/message from the initial click payload but reconcile with
  // live data: if the live fetch shows the deployment is now healthy
  // (readyReplicas === replicas), clear stale failure reason/message to
  // prevent the contradictory "Healthy + DeploymentFailed" display (#4200).
  const [liveReason, setLiveReason] = useState<string | undefined>(data.reason as string | undefined)
  const [liveMessage, setLiveMessage] = useState<string | undefined>(data.message as string | undefined)

  // Helper to run kubectl commands
  const runKubectl = async (args: string[]): Promise<string> => {
    let wsUrl: string
    try {
      wsUrl = await appendWsAuthToken(LOCAL_AGENT_WS_URL)
    } catch {
      return ''
    }
    return new Promise((resolve) => {
      const ws = new WebSocket(wsUrl)
      const requestId = `kubectl-${Date.now()}-${Math.random().toString(36).slice(2)}`
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
        try {
          const msg = JSON.parse(event.data)
          if (msg.id === requestId && msg.payload?.output) {
            output = msg.payload.output
          }
        } catch (err) {
          console.error('[DeploymentDrillDown] Non-JSON WebSocket message:', event.data)
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

  // Fetch Deployment data
  const fetchData = async () => {
    if (!agentConnected) return

    try {
      const output = await runKubectl(['get', 'deployment', deploymentName, '-n', namespace, '-o', 'json'])
      if (output) {
        const deploy = JSON.parse(output)
        const liveReplicas = deploy.spec?.replicas || 0
        const liveReady = deploy.status?.readyReplicas || 0
        setReplicas(liveReplicas)
        setReadyReplicas(liveReady)
        setLabels(deploy.metadata?.labels || {})

        // Reconcile reason/message with live state (#4200):
        // If live data shows healthy, clear the stale failure reason/message.
        // If still unhealthy, derive reason from deployment conditions.
        if (liveReady === liveReplicas && liveReplicas > 0) {
          setLiveReason(undefined)
          setLiveMessage(undefined)
        } else {
          // Extract current condition from the deployment status
          const conditions = (deploy.status?.conditions || []) as Array<{ type: string; status: string; reason?: string; message?: string }>
          const failedCondition = conditions.find(
            (c: { type: string; status: string }) =>
              (c.type === 'Available' && c.status === 'False') ||
              (c.type === 'Progressing' && c.status === 'False') ||
              (c.type === 'ReplicaFailure' && c.status === 'True')
          )
          if (failedCondition) {
            setLiveReason(failedCondition.reason || liveReason)
            setLiveMessage(failedCondition.message || liveMessage)
          }
        }

        // Get ReplicaSets using the deployment's actual selector (matchLabels + matchExpressions)
        const rsSelector = buildLabelSelector(
          deploy.spec?.selector?.matchLabels,
          deploy.spec?.selector?.matchExpressions,
        )
        const rsOutput = rsSelector
          ? await runKubectl(['get', 'replicasets', '-n', namespace, '-l', rsSelector, '-o', 'json'])
          : null
        if (rsOutput) {
          const rsList = JSON.parse(rsOutput)
          const rsInfo = rsList.items?.map((rs: { metadata: { name: string }; spec: { replicas: number }; status: { readyReplicas?: number } }) => ({
            name: rs.metadata.name,
            replicas: rs.spec?.replicas || 0,
            ready: rs.status?.readyReplicas || 0
          })) || []
          setReplicaSets(rsInfo)
        }

        // Get Pods with this deployment's selector (matchLabels + matchExpressions)
        const selector = buildLabelSelector(
          deploy.spec?.selector?.matchLabels,
          deploy.spec?.selector?.matchExpressions,
        )
        if (selector) {
          const podsOutput = await runKubectl(['get', 'pods', '-n', namespace, '-l', selector, '-o', 'json'])
          if (podsOutput) {
            const podList = JSON.parse(podsOutput)
            const podInfo = podList.items?.map((p: { metadata: { name: string }; status: { phase: string; containerStatuses?: Array<{ restartCount: number }> } }) => ({
              name: p.metadata.name,
              status: p.status.phase,
              restarts: p.status.containerStatuses?.reduce((sum: number, c: { restartCount: number }) => sum + c.restartCount, 0) || 0
            })) || []
            setPods(podInfo)
          }
        }
      }
    } catch {
      // Ignore parse errors
    }
  }

  const fetchEvents = async () => {
    if (!agentConnected || eventsOutput) return
    setEventsLoading(true)
    const output = await runKubectl(['get', 'events', '-n', namespace, '--field-selector', `involvedObject.name=${deploymentName}`, '-o', 'wide'])
    setEventsOutput(output)
    setEventsLoading(false)
  }

  const fetchDescribe = async () => {
    if (!agentConnected || describeOutput) return
    setDescribeLoading(true)
    const output = await runKubectl(['describe', 'deployment', deploymentName, '-n', namespace])
    setDescribeOutput(output)
    setDescribeLoading(false)
  }

  const fetchYaml = async () => {
    if (!agentConnected || yamlOutput) return
    setYamlLoading(true)
    const output = await runKubectl(['get', 'deployment', deploymentName, '-n', namespace, '-o', 'yaml'])
    setYamlOutput(output)
    setYamlLoading(false)
  }

  // Check if user can scale deployments in this namespace
  const checkScalePermission = useCallback(async () => {
    try {
      const result = await checkPermission({
        cluster,
        verb: 'patch',
        resource: 'deployments',
        namespace,
        subresource: 'scale',
      })
      setCanScale(result.allowed)
    } catch {
      // If scale subresource check fails, try checking patch on deployments
      try {
        const result = await checkPermission({
          cluster,
          verb: 'patch',
          resource: 'deployments',
          namespace,
        })
        setCanScale(result.allowed)
      } catch {
        // When kc-agent is connected, default to allowed when permission check
        // fails. The agent uses the user's own kubeconfig, so if kubectl scale
        // works, the check failure is likely a transient API error, not a real
        // permission denial. Fixes #12417.
        setCanScale(agentConnected)
      }
    }
  }, [cluster, namespace, checkPermission, agentConnected])

  // Check scale permission on mount
  useEffect(() => {
    checkScalePermission()
  }, [checkScalePermission])

  // Handle scale deployment - directly scales to the specified count
  const handleScaleTo = async (targetReplicas: number) => {
    if (!agentConnected || !canScale || targetReplicas === replicas) return
    if (targetReplicas < 0) return
    // Allow scaling down even when current replicas exceed the UI limit
    if (targetReplicas > MAX_SCALE_REPLICAS && targetReplicas > replicas) return

    setIsScaling(true)
    setScaleError(null)

    try {
      const output = await runKubectl([
        'scale',
        'deployment',
        deploymentName,
        '-n',
        namespace,
        `--replicas=${targetReplicas}`,
      ])

      if (output.toLowerCase().includes('scaled') || output.toLowerCase().includes('deployment')) {
        // Success - update local state immediately
        setReplicas(targetReplicas)
        // Refetch data to get updated status
        setTimeout(fetchData, RETRY_DELAY_MS)
      } else if (output.toLowerCase().includes('error') || output.toLowerCase().includes('forbidden')) {
        // Issue 9284: don't leak raw kubectl stderr — map to a friendly message.
        setScaleError(t(classifyScaleError(output)))
      }
    } catch (err: unknown) {
      // Issue 9284: don't leak raw stack traces; map through the same helper.
      setScaleError(t(classifyScaleError(err instanceof Error ? err.message : '')))
    } finally {
      setIsScaling(false)
    }
  }

  // Increment/decrement handlers that directly trigger scaling
  const handleDecrement = () => handleScaleTo(replicas - 1)
  const handleIncrement = () => handleScaleTo(replicas + 1)

  // Issue 9283: Refresh all tab data. The per-tab fetchX helpers
  // (fetchEvents/fetchDescribe/fetchYaml) short-circuit when their cached
  // output is already set, so bypass them and re-run the kubectl calls
  // directly, overwriting the cached state at the end.
  const handleRefreshAll = async () => {
    if (!agentConnected || isRefreshing) return
    setIsRefreshing(true)
    setEventsLoading(true)
    setDescribeLoading(true)
    setYamlLoading(true)
    try {
      const [, events, describe, yaml] = await Promise.all([
        fetchData(),
        runKubectl(['get', 'events', '-n', namespace, '--field-selector', `involvedObject.name=${deploymentName}`, '-o', 'wide']),
        runKubectl(['describe', 'deployment', deploymentName, '-n', namespace]),
        runKubectl(['get', 'deployment', deploymentName, '-n', namespace, '-o', 'yaml']),
      ])
      setEventsOutput(events)
      setDescribeOutput(describe)
      setYamlOutput(yaml)
    } finally {
      setEventsLoading(false)
      setDescribeLoading(false)
      setYamlLoading(false)
      setIsRefreshing(false)
    }
  }

  // Track if we've already loaded data to prevent refetching
  const hasLoadedRef = useRef(false)

  // Pre-fetch tab data when agent connects
  // Batched to limit concurrent WebSocket connections (max 2 at a time)
  useEffect(() => {
    if (!agentConnected || hasLoadedRef.current) return
    hasLoadedRef.current = true

    const loadData = async () => {
      // Batch 1: Overview data (2 concurrent)
      await Promise.all([
        fetchData(),
        fetchEvents(),
      ])

      // Batch 2: Describe + YAML (2 concurrent, lower priority)
      await Promise.all([
        fetchDescribe(),
        fetchYaml(),
      ])
    }

    loadData()
  }, [agentConnected, fetchData, fetchDescribe, fetchEvents, fetchYaml])

  const handleCopy = (field: string, value: string) => {
    copyToClipboard(value)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), UI_FEEDBACK_TIMEOUT_MS)
  }

  const isHealthy = readyReplicas === replicas && replicas > 0

  const TABS: { id: TabType; label: string; icon: typeof Info }[] = [
    { id: 'overview', label: t('drilldown.tabs.overview', 'Overview'), icon: Info },
    { id: 'pods', label: `${t('drilldown.tabs.pods', 'Pods')} (${pods.length})`, icon: Box },
    { id: 'events', label: t('drilldown.tabs.events', 'Events'), icon: Zap },
    { id: 'describe', label: t('drilldown.tabs.describe', 'Describe'), icon: FileText },
    { id: 'yaml', label: t('drilldown.tabs.yaml', 'YAML'), icon: Code },
  ]

  return (
    <div className="flex flex-col h-full -m-6">
      {/* Header */}
      <div className="px-6 pt-6 pb-4 flex items-center justify-between gap-4">
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
        </div>
        {/* Issue 9283: Refresh all tabs — Events/Describe/YAML used to cache
            forever with no way to refetch. */}
        <button
          type="button"
          onClick={handleRefreshAll}
          disabled={!agentConnected || isRefreshing}
          title={t('drilldown.deployment.refreshAll')}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-card/50 border border-border text-sm text-foreground hover:bg-card disabled:opacity-50"
        >
          <RefreshCw className={cn('w-4 h-4', isRefreshing && 'animate-spin')} />
          <span>{t('drilldown.deployment.refresh')}</span>
        </button>
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
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Status */}
            <div className={`p-4 rounded-lg border ${isHealthy ? 'bg-green-500/10 border-green-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <StatusIndicator status={isHealthy ? 'healthy' : 'warning'} size="lg" />
                  <div>
                    <div className="text-lg font-semibold text-foreground">
                      {isHealthy ? 'Healthy' : 'Degraded'}
                    </div>
                    {liveReason && <div className="text-sm text-muted-foreground">{liveReason}</div>}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <Gauge
                    value={replicas > 0 ? Math.round((readyReplicas / replicas) * 100) : 0}
                    max={100}
                    size="sm"
                    invertColors
                  />
                  <div className="text-right">
                    <div className="text-2xl font-bold text-foreground">{readyReplicas}/{replicas}</div>
                    <div className="text-xs text-muted-foreground">{t('drilldown.fields.replicasReady')}</div>
                  </div>
                </div>
              </div>
              {liveMessage && (
                <div className="mt-3 p-2 rounded bg-card/50 text-sm text-muted-foreground">{liveMessage}</div>
              )}
            </div>

            {/* Scale Control */}
            <div className="p-4 rounded-lg bg-card/50 border border-border">
              <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <Layers className="w-4 h-4 text-purple-400" />
                Scale Deployment
              </h3>
              {scaleError && (
                <div className="mb-3 p-2 rounded bg-red-500/20 border border-red-500/30 text-red-300 text-sm">
                  {scaleError}
                </div>
              )}
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleDecrement}
                    disabled={!canScale || replicas <= 0 || isScaling}
                    className={cn(
                      'p-2 rounded-lg transition-colors',
                      canScale && replicas > 0 && !isScaling
                        ? 'bg-secondary hover:bg-secondary/80 text-foreground'
                        : 'bg-secondary/30 text-muted-foreground cursor-not-allowed'
                    )}
                    title={
                      canScale === false ? 'No permission to scale deployments in this namespace' :
                        replicas <= 0 ? 'Already at minimum (0 replicas)' :
                          isScaling ? 'Scaling in progress...' :
                            `Scale down to ${replicas - 1} replica${replicas - 1 !== 1 ? 's' : ''}`
                    }
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <div
                    className={cn(
                      'w-16 text-center py-2 rounded-lg bg-secondary border border-border text-foreground font-mono text-lg flex items-center justify-center',
                      isScaling && 'opacity-70'
                    )}
                    title={`Current: ${replicas} replica${replicas !== 1 ? 's' : ''}`}
                  >
                    {isScaling ? (
                      <Loader2 className="w-5 h-5 animate-spin text-purple-400" />
                    ) : (
                      replicas
                    )}
                  </div>
                  <button
                    onClick={handleIncrement}
                    disabled={!canScale || replicas >= MAX_SCALE_REPLICAS || isScaling}
                    className={cn(
                      'p-2 rounded-lg transition-colors',
                      canScale && replicas < MAX_SCALE_REPLICAS && !isScaling
                        ? 'bg-secondary hover:bg-secondary/80 text-foreground'
                        : 'bg-secondary/30 text-muted-foreground cursor-not-allowed'
                    )}
                    title={
                      canScale === false ? 'No permission to scale deployments in this namespace' :
                        replicas >= MAX_SCALE_REPLICAS ? `Maximum is ${MAX_SCALE_REPLICAS} replicas` :
                          isScaling ? 'Scaling in progress...' :
                            `Scale up to ${replicas + 1} replica${replicas + 1 !== 1 ? 's' : ''}`
                    }
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex-1 text-sm text-muted-foreground">
                  {canScale === null ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Checking permissions...
                    </span>
                  ) : canScale === false ? (
                    <span className="text-yellow-400">No permission to scale deployments in this namespace</span>
                  ) : isScaling ? (
                    <span className="text-purple-400 flex items-center gap-2">
                      Scaling deployment...
                    </span>
                  ) : (
                    <span>Click +/- to scale (0-{MAX_SCALE_REPLICAS} replicas)</span>
                  )}
                </div>
              </div>
            </div>

            {/* ReplicaSets */}
            {replicaSets.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-3">{t('drilldown.fields.replicaSets')}</h3>
                <div className="space-y-2">
                  {replicaSets.map((rs) => (
                    <button
                      key={rs.name}
                      onClick={() => drillToReplicaSet(cluster, namespace, rs.name)}
                      className="w-full p-3 rounded-lg bg-blue-500/10 border border-blue-500/30 hover:bg-blue-500/20 flex items-center justify-between group transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
                        </svg>
                        <span className="font-mono text-blue-400">{rs.name}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground">{rs.ready}/{rs.replicas} ready</span>
                        <svg className="w-4 h-4 text-blue-400/70 group-hover:text-blue-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Labels */}
            {labels && Object.keys(labels).length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                  <Tag className="w-4 h-4 text-blue-400" />
                  Labels
                </h3>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(labels).slice(0, 8).map(([key, value]) => (
                    <span key={key} className="text-xs px-2 py-1 rounded bg-blue-500/10 text-blue-400 font-mono">
                      {key}={value}
                    </span>
                  ))}
                  {Object.keys(labels).length > 8 && (
                    <span className="text-xs text-muted-foreground">+{Object.keys(labels).length - 8} more</span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'pods' && (
          <div className="space-y-3">
            {pods.length > 0 ? (
              pods.map((pod) => (
                <button
                  key={pod.name}
                  onClick={() => drillToPod(cluster, namespace, pod.name, { status: pod.status, restarts: pod.restarts })}
                  className="w-full p-3 rounded-lg bg-card/50 border border-border hover:bg-card/80 flex items-center justify-between group transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Box className="w-5 h-5 text-cyan-400" />
                    <span className="font-mono text-foreground">{pod.name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                     <span className={cn(
                       'text-xs px-2 py-1 rounded',
                       (() => {
                         const config = POD_STATUS_CONFIG[pod.status] || POD_STATUS_CONFIG.Unknown
                         return `${config.bg} ${config.text}`
                       })()
                     )}>
                       {pod.status}
                     </span>
                    {pod.restarts > 0 && (
                      <span className="text-xs text-yellow-400">{pod.restarts} restarts</span>
                    )}
                    <svg className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </button>
              ))
            ) : (
              <div className="p-4 rounded-lg bg-card/50 border border-border text-center text-muted-foreground">
                No pods found for this Deployment
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
              <pre className="p-4 rounded-lg bg-black/50 border border-border overflow-auto max-h-[60vh] text-xs text-foreground font-mono whitespace-pre-wrap">
                {eventsOutput.includes('No resources found') ? 'No events found for this Deployment' : eventsOutput}
              </pre>
            ) : (
              <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-center">
                <p className="text-yellow-400">{t('drilldown.empty.localAgentNotConnected')}</p>
              </div>
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
                <button
                  onClick={() => handleCopy('describe', describeOutput)}
                  className="absolute top-2 right-2 px-2 py-1 rounded bg-secondary/50 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                >
                  {copiedField === 'describe' ? <><Check className="w-3 h-3 text-green-400" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}
                </button>
                <pre className="p-4 rounded-lg bg-black/50 border border-border overflow-auto max-h-[60vh] text-xs text-foreground font-mono whitespace-pre-wrap">
                  {describeOutput}
                </pre>
              </div>
            ) : (
              <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-center">
                <p className="text-yellow-400">{t('drilldown.empty.localAgentNotConnected')}</p>
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
                <button
                  onClick={() => handleCopy('yaml', yamlOutput)}
                  className="absolute top-2 right-2 px-2 py-1 rounded bg-secondary/50 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                >
                  {copiedField === 'yaml' ? <><Check className="w-3 h-3 text-green-400" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}
                </button>
                <pre className="p-4 rounded-lg bg-black/50 border border-border overflow-auto max-h-[60vh] text-xs text-foreground font-mono whitespace-pre-wrap">
                  {yamlOutput}
                </pre>
              </div>
            ) : (
              <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-center">
                <p className="text-yellow-400">{t('drilldown.empty.localAgentNotConnected')}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
