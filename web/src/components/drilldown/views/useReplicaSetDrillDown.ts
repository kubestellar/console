import { useState, useEffect, useRef, useCallback } from 'react'
import { useLocalAgent } from '../../../hooks/useLocalAgent'
import { useDrillDownWebSocket } from '../../../hooks/useDrillDownWebSocket'
import { UI_FEEDBACK_TIMEOUT_MS } from '../../../lib/constants/network'
import { copyToClipboard } from '../../../lib/clipboard'

export interface PodInfo {
  name: string
  status: string
  restarts: number
}

export interface UseReplicaSetDrillDownResult {
  agentConnected: boolean
  replicas: number
  readyReplicas: number
  pods: PodInfo[]
  ownerDeployment: string | null
  labels: Record<string, string> | null
  eventsOutput: string | null
  eventsLoading: boolean
  describeOutput: string | null
  describeLoading: boolean
  yamlOutput: string | null
  yamlLoading: boolean
  copiedField: string | null
  handleCopy: (field: string, value: string) => void
}

/**
 * Owns all remote data loading for the ReplicaSet drill-down
 * so the view component stays presentational.
 */
export function useReplicaSetDrillDown(
  cluster: string,
  namespace: string,
  replicasetName: string
): UseReplicaSetDrillDownResult {
  const { isConnected: agentConnected } = useLocalAgent()
  const { runKubectl } = useDrillDownWebSocket(cluster)

  const [replicas, setReplicas] = useState<number>(0)
  const [readyReplicas, setReadyReplicas] = useState<number>(0)
  const [pods, setPods] = useState<PodInfo[]>([])
  const [ownerDeployment, setOwnerDeployment] = useState<string | null>(null)
  const [labels, setLabels] = useState<Record<string, string> | null>(null)
  const [eventsOutput, setEventsOutput] = useState<string | null>(null)
  const [eventsLoading, setEventsLoading] = useState(false)
  const [describeOutput, setDescribeOutput] = useState<string | null>(null)
  const [describeLoading, setDescribeLoading] = useState(false)
  const [yamlOutput, setYamlOutput] = useState<string | null>(null)
  const [yamlLoading, setYamlLoading] = useState(false)
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const copiedFieldTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Fetch ReplicaSet data
  const fetchData = useCallback(async () => {
    if (!agentConnected) return

    try {
      const output = await runKubectl(['get', 'replicaset', replicasetName, '-n', namespace, '-o', 'json'])
      if (output) {
        let rs
        try {
          rs = JSON.parse(output)
        } catch {
          console.warn('[ReplicaSetDrillDown] Failed to parse ReplicaSet JSON output')
          return
        }
        setReplicas(rs.spec?.replicas || 0)
        setReadyReplicas(rs.status?.readyReplicas || 0)
        setLabels(rs.metadata?.labels || {})

        // Get owner deployment
        const ownerRef = rs.metadata?.ownerReferences?.find((o: { kind: string }) => o.kind === 'Deployment')
        if (ownerRef) {
          setOwnerDeployment(ownerRef.name)
        }

        // Get pods managed by this ReplicaSet
        const selector = Object.entries(rs.spec?.selector?.matchLabels || {})
          .map(([k, v]) => `${k}=${v}`)
          .join(',')
        if (selector) {
          const podsOutput = await runKubectl(['get', 'pods', '-n', namespace, '-l', selector, '-o', 'json'])
          if (podsOutput) {
            let podList
            try {
              podList = JSON.parse(podsOutput)
            } catch {
              console.warn('[ReplicaSetDrillDown] Failed to parse Pods JSON output')
              setPods([])
              return
            }
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
      // Ignore fetch errors
    }
  }, [agentConnected, runKubectl, replicasetName, namespace])

  const fetchEvents = useCallback(async () => {
    if (!agentConnected || eventsOutput) return
    setEventsLoading(true)
    const output = await runKubectl(['get', 'events', '-n', namespace, '--field-selector', `involvedObject.name=${replicasetName}`, '-o', 'wide'])
    setEventsOutput(output)
    setEventsLoading(false)
  }, [agentConnected, eventsOutput, runKubectl, namespace, replicasetName])

  const fetchDescribe = useCallback(async () => {
    if (!agentConnected || describeOutput) return
    setDescribeLoading(true)
    const output = await runKubectl(['describe', 'replicaset', replicasetName, '-n', namespace])
    setDescribeOutput(output)
    setDescribeLoading(false)
  }, [agentConnected, describeOutput, runKubectl, replicasetName, namespace])

  const fetchYaml = useCallback(async () => {
    if (!agentConnected || yamlOutput) return
    setYamlLoading(true)
    const output = await runKubectl(['get', 'replicaset', replicasetName, '-n', namespace, '-o', 'yaml'])
    setYamlOutput(output)
    setYamlLoading(false)
  }, [agentConnected, yamlOutput, runKubectl, replicasetName, namespace])

  // Track if we've already loaded data to prevent refetching
  const hasLoadedRef = useRef(false)

  // Pre-fetch tab data when agent connects
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

  useEffect(() => {
    return () => {
      if (copiedFieldTimeoutRef.current) {
        clearTimeout(copiedFieldTimeoutRef.current)
      }
    }
  }, [])

  const handleCopy = useCallback((field: string, value: string) => {
    copyToClipboard(value)
    setCopiedField(field)
    if (copiedFieldTimeoutRef.current) {
      clearTimeout(copiedFieldTimeoutRef.current)
    }
    copiedFieldTimeoutRef.current = setTimeout(() => {
      setCopiedField(null)
      copiedFieldTimeoutRef.current = null
    }, UI_FEEDBACK_TIMEOUT_MS)
  }, [])

  return {
    agentConnected,
    replicas,
    readyReplicas,
    pods,
    ownerDeployment,
    labels,
    eventsOutput,
    eventsLoading,
    describeOutput,
    describeLoading,
    yamlOutput,
    yamlLoading,
    copiedField,
    handleCopy,
  }
}
