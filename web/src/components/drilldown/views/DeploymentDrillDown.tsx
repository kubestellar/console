import { useState, useEffect, useRef, useCallback, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useLocalAgent } from '../../../hooks/useLocalAgent'
import { useDrillDownWebSocket } from '../../../hooks/useDrillDownWebSocket'
import { useDrillDownActions, useDrillDown } from '../../../hooks/useDrillDown'
import { useCanI } from '../../../hooks/usePermissions'
import { FileText, Code, Info, Zap, Box } from 'lucide-react'
import { cn } from '../../../lib/cn'
import { moveFocusByKey } from '../../../lib/a11y/rovingFocus'
import { RETRY_DELAY_MS } from '../../../lib/constants/network'
import { getHealthColors } from '../../../lib/statusColors'
import { useTranslation } from 'react-i18next'
import { PageErrorBoundary } from '../../PageErrorBoundary'
import { MAX_SCALE_REPLICAS } from './deployment-drilldown/types'
import { classifyScaleError, buildLabelSelector } from './deployment-drilldown/helpers'
import {
  DeploymentHeader,
  DeploymentOverviewPanel,
  DeploymentPodsPanel,
  DeploymentOutputPanel,
  DeploymentTabs,
  useCopyFeedback,
  type TabType,
  type Props,
} from './deployment-drilldown'

function DeploymentDrillDownContent({ data }: Props) {
  const { t } = useTranslation()
  const cluster = (data.cluster as string) || ''
  const namespace = (data.namespace as string) || ''
  const deploymentName = (data.deployment as string) || ''
  const { isConnected: agentConnected } = useLocalAgent()
  const { drillToNamespace, drillToCluster, drillToPod, drillToReplicaSet } = useDrillDownActions()
  const { state, pop } = useDrillDown()

  const [activeTab, setActiveTab] = useState<TabType>((data.tab as TabType) || 'overview')
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
  const refetchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [canScale, setCanScale] = useState<boolean | null>(null)
  const [isScaling, setIsScaling] = useState(false)
  const [scaleError, setScaleError] = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const { checkPermission } = useCanI()
  const { runKubectl } = useDrillDownWebSocket(cluster)
  const { copiedField, handleCopy } = useCopyFeedback()

  const [liveReason, setLiveReason] = useState<string | undefined>(data.reason as string | undefined)
  const [liveMessage, setLiveMessage] = useState<string | undefined>(data.message as string | undefined)

  const fetchData = useCallback(async () => {
    if (!agentConnected) return

    try {
      const output = await runKubectl(['get', 'deployment', deploymentName, '-n', namespace, '-o', 'json'])
      if (!output) return

      let deploy
      try {
        deploy = JSON.parse(output)
      } catch {
        setPods([])
        setReplicaSets([])
        return
      }

      const liveReplicas = deploy.spec?.replicas || 0
      const liveReady = deploy.status?.readyReplicas || 0

      setReplicas(liveReplicas)
      setReadyReplicas(liveReady)
      setLabels(deploy.metadata?.labels || {})

      if (liveReady === liveReplicas && liveReplicas > 0) {
        setLiveReason(undefined)
        setLiveMessage(undefined)
      } else {
        const conditions = (deploy.status?.conditions || []) as Array<{ type: string; status: string; reason?: string; message?: string }>
        const failedCondition = conditions.find(
          (c: { type: string; status: string }) =>
            (c.type === 'Available' && c.status === 'False') ||
            (c.type === 'Progressing' && c.status === 'False') ||
            (c.type === 'ReplicaFailure' && c.status === 'True'),
        )
        if (failedCondition) {
          setLiveReason(failedCondition.reason || liveReason)
          setLiveMessage(failedCondition.message || liveMessage)
        }
      }

      const rsSelector = buildLabelSelector(
        deploy.spec?.selector?.matchLabels,
        deploy.spec?.selector?.matchExpressions,
      )
      const rsOutput = rsSelector
        ? await runKubectl(['get', 'replicasets', '-n', namespace, '-l', rsSelector, '-o', 'json'])
        : null

      if (rsOutput) {
        let rsList
        try {
          rsList = JSON.parse(rsOutput)
        } catch {
          setReplicaSets([])
          return
        }
        const rsInfo =
          rsList.items?.map((rs: { metadata: { name: string }; spec: { replicas: number }; status: { readyReplicas?: number } }) => ({
            name: rs.metadata.name,
            replicas: rs.spec?.replicas || 0,
            ready: rs.status?.readyReplicas || 0,
          })) || []
        setReplicaSets(rsInfo)
      }

      const selector = buildLabelSelector(
        deploy.spec?.selector?.matchLabels,
        deploy.spec?.selector?.matchExpressions,
      )
      if (!selector) return

      const podsOutput = await runKubectl(['get', 'pods', '-n', namespace, '-l', selector, '-o', 'json'])
      if (!podsOutput) return

      let podList
      try {
        podList = JSON.parse(podsOutput)
      } catch {
        setPods([])
        return
      }

      const podInfo =
        podList.items?.map((p: { metadata: { name: string }; status: { phase: string; containerStatuses?: Array<{ restartCount: number }> } }) => ({
          name: p.metadata.name,
          status: p.status.phase,
          restarts: p.status.containerStatuses?.reduce((sum: number, c: { restartCount: number }) => sum + c.restartCount, 0) || 0,
        })) || []
      setPods(podInfo)
    } catch {
      // Ignore parse errors
    }
  }, [agentConnected, runKubectl, deploymentName, namespace, liveReason, liveMessage])

  const fetchEvents = useCallback(async () => {
    if (!agentConnected || eventsOutput) return
    setEventsLoading(true)
    const output = await runKubectl(['get', 'events', '-n', namespace, '--field-selector', `involvedObject.name=${deploymentName}`, '-o', 'wide'])
    setEventsOutput(output)
    setEventsLoading(false)
  }, [agentConnected, eventsOutput, runKubectl, namespace, deploymentName])

  const fetchDescribe = useCallback(async () => {
    if (!agentConnected || describeOutput) return
    setDescribeLoading(true)
    const output = await runKubectl(['describe', 'deployment', deploymentName, '-n', namespace])
    setDescribeOutput(output)
    setDescribeLoading(false)
  }, [agentConnected, describeOutput, runKubectl, deploymentName, namespace])

  const fetchYaml = useCallback(async () => {
    if (!agentConnected || yamlOutput) return
    setYamlLoading(true)
    const output = await runKubectl(['get', 'deployment', deploymentName, '-n', namespace, '-o', 'yaml'])
    setYamlOutput(output)
    setYamlLoading(false)
  }, [agentConnected, yamlOutput, runKubectl, deploymentName, namespace])

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
      try {
        const result = await checkPermission({
          cluster,
          verb: 'patch',
          resource: 'deployments',
          namespace,
        })
        setCanScale(result.allowed)
      } catch {
        setCanScale(agentConnected)
      }
    }
  }, [cluster, namespace, checkPermission, agentConnected])

  useEffect(() => {
    checkScalePermission()
  }, [checkScalePermission])

  const handleScaleTo = async (targetReplicas: number) => {
    if (!agentConnected || !canScale || targetReplicas === replicas) return
    if (targetReplicas < 0) return
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
        setReplicas(targetReplicas)
        if (refetchTimeoutRef.current) {
          clearTimeout(refetchTimeoutRef.current)
        }
        refetchTimeoutRef.current = setTimeout(() => {
          refetchTimeoutRef.current = null
          void fetchData()
        }, RETRY_DELAY_MS)
      } else if (output.toLowerCase().includes('error') || output.toLowerCase().includes('forbidden')) {
        setScaleError(t(classifyScaleError(output)))
      }
    } catch (err: unknown) {
      setScaleError(t(classifyScaleError(err instanceof Error ? err.message : '')))
    } finally {
      setIsScaling(false)
    }
  }

  const handleDecrement = () => handleScaleTo(replicas - 1)
  const handleIncrement = () => handleScaleTo(replicas + 1)

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

  const hasLoadedRef = useRef(false)

  useEffect(() => {
    if (!agentConnected || hasLoadedRef.current) return
    hasLoadedRef.current = true

    const loadData = async () => {
      await Promise.all([fetchData(), fetchEvents()])
      await Promise.all([fetchDescribe(), fetchYaml()])
    }

    void loadData()
  }, [agentConnected, fetchData, fetchDescribe, fetchEvents, fetchYaml])

  useEffect(() => {
    return () => {
      if (refetchTimeoutRef.current) {
        clearTimeout(refetchTimeoutRef.current)
      }
    }
  }, [])

  const isHealthy = readyReplicas === replicas && replicas > 0
  const healthColors = getHealthColors(isHealthy)

  const TABS: { id: TabType; label: string; icon: typeof Info }[] = [
    { id: 'overview', label: t('drilldown.tabs.overview', 'Overview'), icon: Info },
    { id: 'pods', label: `${t('drilldown.tabs.pods', 'Pods')} (${pods.length})`, icon: Box },
    { id: 'events', label: t('drilldown.tabs.events', 'Events'), icon: Zap },
    { id: 'describe', label: t('drilldown.tabs.describe', 'Describe'), icon: FileText },
    { id: 'yaml', label: t('drilldown.tabs.yaml', 'YAML'), icon: Code },
  ]

  const handleTabKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const nextTab = moveFocusByKey(event, { selector: '[role="tab"]', orientation: 'horizontal' })
    const nextTabId = nextTab?.dataset.tabId as TabType | undefined
    if (nextTabId) {
      setActiveTab(nextTabId)
    }
  }

  const handleButtonLikeKeyDown = (
    event: ReactKeyboardEvent<HTMLDivElement>,
    action: () => void,
    disabled = false,
  ) => {
    if (disabled) {
      return
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      action()
    }
  }

  return (
    <div className="flex flex-col h-full -m-6">
      <DeploymentHeader
        cluster={cluster}
        namespace={namespace}
        stackDepth={state.stack.length}
        agentConnected={agentConnected}
        isRefreshing={isRefreshing}
        onBack={pop}
        onDrillToNamespace={() => drillToNamespace(cluster, namespace)}
        onDrillToCluster={() => drillToCluster(cluster)}
        onRefreshAll={() => {
          void handleRefreshAll()
        }}
        onButtonLikeKeyDown={handleButtonLikeKeyDown}
      />

      <DeploymentTabs
        tabs={TABS}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onTabKeyDown={handleTabKeyDown}
        ariaLabel={t('drilldown.deployment.tabs', 'Deployment tabs')}
      />

      <div
        id={`deployment-panel-${activeTab}`}
        role="tabpanel"
        tabIndex={0}
        aria-labelledby={`deployment-tab-${activeTab}`}
        className="flex-1 overflow-y-auto p-6 space-y-6"
      >
        {activeTab === 'overview' && (
          <DeploymentOverviewPanel
            isHealthy={isHealthy}
            healthColors={healthColors}
            liveReason={liveReason}
            liveMessage={liveMessage}
            replicas={replicas}
            readyReplicas={readyReplicas}
            canScale={canScale}
            isScaling={isScaling}
            scaleError={scaleError}
            replicaSets={replicaSets}
            labels={labels}
            onScaleDown={handleDecrement}
            onScaleUp={handleIncrement}
            onDrillToReplicaSet={(rsName) => drillToReplicaSet(cluster, namespace, rsName)}
          />
        )}

        {activeTab === 'pods' && (
          <DeploymentPodsPanel
            pods={pods}
            onDrillToPod={(pod) => drillToPod(cluster, namespace, pod.name, { status: pod.status, restarts: pod.restarts })}
          />
        )}

        {activeTab === 'events' && (
          <DeploymentOutputPanel
            loading={eventsLoading}
            output={eventsOutput}
            loadingMessage={t('drilldown.status.fetchingEvents')}
            notConnectedMessage=""
            noResourcesMessage="No events found for this Deployment"
          />
        )}

        {activeTab === 'describe' && (
          <DeploymentOutputPanel
            loading={describeLoading}
            output={describeOutput}
            loadingMessage={t('drilldown.status.runningDescribe')}
            notConnectedMessage=""
            enableCopy
            copyField="describe"
            copiedField={copiedField}
            onCopy={handleCopy}
          />
        )}

        {activeTab === 'yaml' && (
          <DeploymentOutputPanel
            loading={yamlLoading}
            output={yamlOutput}
            loadingMessage={t('drilldown.status.fetchingYaml')}
            notConnectedMessage=""
            enableCopy
            copyField="yaml"
            copiedField={copiedField}
            onCopy={handleCopy}
          />
        )}
      </div>
    </div>
  )
}

export function DeploymentDrillDown(props: Props) {
  return (
    <PageErrorBoundary>
      <DeploymentDrillDownContent {...props} />
    </PageErrorBoundary>
  )
}
