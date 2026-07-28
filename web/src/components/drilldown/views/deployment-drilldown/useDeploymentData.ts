import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { RETRY_DELAY_MS } from '../../../../lib/constants/network'
import { useCanI } from '../../../../hooks/usePermissions'
import { MAX_SCALE_REPLICAS } from './types'
import { classifyScaleError, buildLabelSelector } from './helpers'

interface UseDeploymentDataArgs {
  agentConnected: boolean
  cluster: string
  namespace: string
  deploymentName: string
  data: Record<string, unknown>
  runKubectl: (args: string[]) => Promise<string>
}

/** Encapsulates all kubectl data-fetching, scaling, and refresh logic for the
 *  Deployment drilldown view, keeping the view component focused on rendering. */
export function useDeploymentData({ agentConnected, cluster, namespace, deploymentName, data, runKubectl }: UseDeploymentDataArgs) {
  const { t } = useTranslation()
  const { checkPermission } = useCanI()

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

  const handleScaleTo = useCallback(
    async (targetReplicas: number) => {
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
    },
    [agentConnected, canScale, replicas, runKubectl, deploymentName, namespace, fetchData, t],
  )

  const handleDecrement = useCallback(() => handleScaleTo(replicas - 1), [handleScaleTo, replicas])
  const handleIncrement = useCallback(() => handleScaleTo(replicas + 1), [handleScaleTo, replicas])

  const handleRefreshAll = useCallback(async () => {
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
  }, [agentConnected, isRefreshing, fetchData, runKubectl, namespace, deploymentName])

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

  return {
    replicas,
    readyReplicas,
    pods,
    replicaSets,
    labels,
    eventsOutput,
    eventsLoading,
    describeOutput,
    describeLoading,
    yamlOutput,
    yamlLoading,
    canScale,
    isScaling,
    scaleError,
    isRefreshing,
    liveReason,
    liveMessage,
    handleDecrement,
    handleIncrement,
    handleRefreshAll,
  }
}
