import { useState, useEffect, useCallback, useRef } from 'react'
import { fetchSSE } from '../../../lib/sseClient'
import { reportAgentDataSuccess, isAgentUnavailable } from '../../useLocalAgent'
import { isDemoMode } from '../../../lib/demoMode'
import { useDemoMode } from '../../useDemoMode'
import { registerRefetch } from '../../../lib/modeTransition'
import { getStoredAuthToken } from '../../../lib/authToken'
import { getLocalAgentURL, agentFetch } from '../shared'
import { MCP_HOOK_TIMEOUT_MS } from '../../../lib/constants/network'
import { classifyError, type ClusterErrorType } from '../../../lib/errorClassifier'
import { isInClusterMode } from '../../useBackendHealth'
import { getClusterModeBaseUrl, isClusterModeBackend } from '../../../lib/cache/fetcherUtils'
import type { NVIDIAOperatorStatus, NodeInfo } from '../types'

export interface NodeClusterError {
  cluster: string
  errorType: ClusterErrorType
  message: string
}

export function useNodes(cluster?: string) {
  const [nodes, setNodes] = useState<NodeInfo[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [clusterErrors, setClusterErrors] = useState<NodeClusterError[]>([])
  const { isDemoMode: demoMode } = useDemoMode()
  const prevClusterRef = useRef<string | undefined>(cluster)
  const initialMountRef = useRef(true)

  useEffect(() => {
    if (prevClusterRef.current !== cluster) {
      setNodes([])
      setIsLoading(true)
      setError(null)
      setClusterErrors([])
      prevClusterRef.current = cluster
    }
  }, [cluster])

  const refetch = useCallback(async () => {
    if (isDemoMode()) {
      const demoNodes = getDemoNodes().filter(node => !cluster || node.cluster === cluster)
      setNodes(demoNodes)
      setIsLoading(false)
      setError(null)
      setClusterErrors([])
      return
    }

    setIsLoading(true)
    const nodeAgentURL = getLocalAgentURL()
    if (cluster && nodeAgentURL && !isAgentUnavailable() && !isClusterModeBackend()) {
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), MCP_HOOK_TIMEOUT_MS)
        const response = await agentFetch(`${nodeAgentURL}/nodes?cluster=${encodeURIComponent(cluster)}`, {
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        })
        clearTimeout(timeoutId)
        if (response.ok) {
          const data = await response.json()
          const nodeData = data.nodes || []
          if (nodeData.length > 0) {
            setNodes(nodeData.map((node: Record<string, unknown>) => ({
              name: node.name as string,
              cluster,
              status: node.status as string || 'Unknown',
              roles: node.roles as string[] || [],
              kubeletVersion: node.kubeletVersion as string || '',
              cpuCapacity: node.cpuCapacity as string || '0',
              memoryCapacity: node.memoryCapacity as string || '0',
              podCapacity: node.podCapacity as string || '110',
              conditions: node.conditions as Array<{ type: string; status: string; reason: string; message: string }> || [],
              unschedulable: node.unschedulable as boolean || false,
            })))
            setError(null)
            setClusterErrors([])
            setIsLoading(false)
            reportAgentDataSuccess()
            return
          }
        }
      } catch (err: unknown) {
        console.error(`[useNodes] Local agent failed for ${cluster}:`, err)
      }
    }

    const collectedErrors: NodeClusterError[] = []
    try {
      const params: Record<string, string> = {}
      if (cluster) params.cluster = cluster
      const allNodes = await fetchSSE<NodeInfo>({
        url: `${getClusterModeBaseUrl()}/nodes/stream`,
        params,
        itemsKey: 'nodes',
        onClusterData: (_clusterName, items) => {
          setNodes(prev => [...prev, ...items])
          setIsLoading(false)
        },
        onClusterError: (clusterName, errorMessage) => {
          const classified = classifyError(errorMessage)
          collectedErrors.push({ cluster: clusterName, errorType: classified.type, message: errorMessage })
        },
      })

      setNodes(allNodes)
      setError(null)
      setClusterErrors(collectedErrors)
    } catch {
      setError(null)
      setNodes([])
      setClusterErrors(collectedErrors)
    } finally {
      setIsLoading(false)
    }
  }, [cluster])

  useEffect(() => {
    void refetch()
    const unregisterRefetch = registerRefetch(`nodes:${cluster || 'all'}`, () => { void refetch() })
    return () => { unregisterRefetch() }
  }, [refetch, cluster])

  useEffect(() => {
    if (initialMountRef.current) {
      initialMountRef.current = false
      return
    }
    void refetch()
  }, [demoMode, refetch])

  return { nodes, isLoading, error, clusterErrors, refetch }
}

export function useNVIDIAOperators(cluster?: string) {
  const [operators, setOperators] = useState<NVIDIAOperatorStatus[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setIsLoading(true)
    try {
      const params: Record<string, string> = {}
      if (cluster) params.cluster = cluster
      const agentBaseUrl = getClusterModeBaseUrl()
      if (!agentBaseUrl) {
        setOperators([])
        setError(null)
        return
      }

      const token = await getStoredAuthToken()
      if ((token && token !== 'demo-token') || isInClusterMode()) {
        try {
          const accumulated: NVIDIAOperatorStatus[] = []
          const result = await fetchSSE<NVIDIAOperatorStatus>({
            url: `${agentBaseUrl}/nvidia-operators/stream`,
            params,
            itemsKey: 'operators',
            onClusterData: (_clusterName, items) => {
              accumulated.push(...items)
              setOperators([...accumulated])
              setIsLoading(false)
            },
          })
          setOperators(result)
          setError(null)
          setIsLoading(false)
          return
        } catch {
          // Fall through to REST
        }
      }

      const urlParams = new URLSearchParams()
      if (cluster) urlParams.append('cluster', cluster)
      const resp = await agentFetch(`${agentBaseUrl}/nvidia-operators?${urlParams}`)
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const data = await resp.json()
      setOperators(data.operators ? data.operators : data.operator ? [data.operator] : [])
      setError(null)
    } catch {
      setError(null)
      setOperators([])
    } finally {
      setIsLoading(false)
    }
  }, [cluster])

  useEffect(() => { void refetch() }, [refetch])
  return { operators, isLoading, error, refetch }
}

function getDemoNodes(): NodeInfo[] {
  return [
    {
      name: 'node-1', cluster: 'prod-east', status: 'Ready', roles: ['control-plane', 'master'], internalIP: '10.0.1.10',
      kubeletVersion: 'v1.28.4', containerRuntime: 'containerd://1.6.24', os: 'Ubuntu 22.04.3 LTS', architecture: 'amd64',
      cpuCapacity: '8', memoryCapacity: '32Gi', storageCapacity: '200Gi', podCapacity: '110',
      conditions: [{ type: 'Ready', status: 'True', reason: 'KubeletReady', message: 'kubelet is posting ready status' }],
      labels: { 'node-role.kubernetes.io/control-plane': '' }, taints: ['node-role.kubernetes.io/control-plane:NoSchedule'], age: '45d', unschedulable: false,
    },
    {
      name: 'node-2', cluster: 'prod-east', status: 'Ready', roles: ['worker'], internalIP: '10.0.1.11', kubeletVersion: 'v1.28.4',
      containerRuntime: 'containerd://1.6.24', os: 'Ubuntu 22.04.3 LTS', architecture: 'amd64', cpuCapacity: '16', memoryCapacity: '64Gi',
      storageCapacity: '500Gi', podCapacity: '110', conditions: [{ type: 'Ready', status: 'True', reason: 'KubeletReady', message: 'kubelet is posting ready status' }],
      labels: { 'node.kubernetes.io/instance-type': 'm5.4xlarge' }, age: '45d', unschedulable: false,
    },
    {
      name: 'gpu-node-1', cluster: 'vllm-d', status: 'Ready', roles: ['worker'], internalIP: '10.0.2.20', kubeletVersion: 'v1.28.4',
      containerRuntime: 'containerd://1.6.24', os: 'Ubuntu 22.04.3 LTS', architecture: 'amd64', cpuCapacity: '32', memoryCapacity: '128Gi',
      storageCapacity: '1Ti', podCapacity: '110', conditions: [{ type: 'Ready', status: 'True', reason: 'KubeletReady', message: 'kubelet is posting ready status' }],
      labels: { 'nvidia.com/gpu': 'true', 'node.kubernetes.io/instance-type': 'p3.8xlarge' }, age: '30d', unschedulable: false,
    },
    {
      name: 'kind-control-plane', cluster: 'kind-local', status: 'Ready', roles: ['control-plane'], internalIP: '172.18.0.2', kubeletVersion: 'v1.27.3',
      containerRuntime: 'containerd://1.7.1', os: 'Ubuntu 22.04.2 LTS', architecture: 'amd64', cpuCapacity: '4', memoryCapacity: '8Gi',
      storageCapacity: '50Gi', podCapacity: '110', conditions: [{ type: 'Ready', status: 'True', reason: 'KubeletReady', message: 'kubelet is posting ready status' }],
      age: '7d', unschedulable: false,
    },
  ]
}
