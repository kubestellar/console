import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { fetchSSE } from '../../../lib/sseClient'
import { reportAgentDataSuccess, isAgentUnavailable } from '../../useLocalAgent'
import { isDemoMode } from '../../../lib/demoMode'
import { useDemoMode } from '../../useDemoMode'
import { registerRefetch } from '../../../lib/modeTransition'
import { getStoredAuthToken } from '../../../lib/authToken'
import { GPU_POLL_INTERVAL_MS, getEffectiveInterval, getLocalAgentURL, agentFetch } from '../shared'
import { subscribePolling } from '../pollingManager'
import { MCP_HOOK_TIMEOUT_MS } from '../../../lib/constants/network'
import { classifyError, type ClusterErrorType } from '../../../lib/errorClassifier'
import { isInClusterMode } from '../../useBackendHealth'
import { getClusterModeBaseUrl, isClusterModeBackend } from '../../../lib/cache/fetcherUtils'
import type { NodeInfo } from '../types'

// Duplicated from useGPU.ts to avoid cross-sibling imports
export interface NodeClusterError {
  cluster: string
  errorType: ClusterErrorType
  message: string
}

// Demo node data (duplicated from useGPU.ts to avoid cross-sibling imports)
function getDemoNodes(): NodeInfo[] {
  return [
    {
      name: 'node-1',
      cluster: 'prod-east',
      status: 'Ready',
      roles: ['control-plane', 'master'],
      internalIP: '10.0.1.10',
      kubeletVersion: 'v1.28.4',
      containerRuntime: 'containerd://1.6.24',
      os: 'Ubuntu 22.04.3 LTS',
      architecture: 'amd64',
      cpuCapacity: '8',
      memoryCapacity: '32Gi',
      storageCapacity: '200Gi',
      podCapacity: '110',
      conditions: [{ type: 'Ready', status: 'True', reason: 'KubeletReady', message: 'kubelet is posting ready status' }],
      labels: { 'node-role.kubernetes.io/control-plane': '' },
      taints: ['node-role.kubernetes.io/control-plane:NoSchedule'],
      age: '45d',
      unschedulable: false,
    },
    {
      name: 'node-2',
      cluster: 'prod-east',
      status: 'Ready',
      roles: ['worker'],
      internalIP: '10.0.1.11',
      kubeletVersion: 'v1.28.4',
      containerRuntime: 'containerd://1.6.24',
      os: 'Ubuntu 22.04.3 LTS',
      architecture: 'amd64',
      cpuCapacity: '16',
      memoryCapacity: '64Gi',
      storageCapacity: '500Gi',
      podCapacity: '110',
      conditions: [{ type: 'Ready', status: 'True', reason: 'KubeletReady', message: 'kubelet is posting ready status' }],
      labels: { 'node.kubernetes.io/instance-type': 'm5.4xlarge' },
      age: '45d',
      unschedulable: false,
    },
    {
      name: 'gpu-node-1',
      cluster: 'vllm-d',
      status: 'Ready',
      roles: ['worker'],
      internalIP: '10.0.2.20',
      kubeletVersion: 'v1.28.4',
      containerRuntime: 'containerd://1.6.24',
      os: 'Ubuntu 22.04.3 LTS',
      architecture: 'amd64',
      cpuCapacity: '32',
      memoryCapacity: '128Gi',
      storageCapacity: '1Ti',
      podCapacity: '110',
      conditions: [{ type: 'Ready', status: 'True', reason: 'KubeletReady', message: 'kubelet is posting ready status' }],
      labels: { 'nvidia.com/gpu': 'true', 'node.kubernetes.io/instance-type': 'p3.8xlarge' },
      age: '30d',
      unschedulable: false,
    },
    {
      name: 'kind-control-plane',
      cluster: 'kind-local',
      status: 'Ready',
      roles: ['control-plane'],
      internalIP: '172.18.0.2',
      kubeletVersion: 'v1.27.3',
      containerRuntime: 'containerd://1.7.1',
      os: 'Ubuntu 22.04.2 LTS',
      architecture: 'amd64',
      cpuCapacity: '4',
      memoryCapacity: '8Gi',
      storageCapacity: '50Gi',
      podCapacity: '110',
      conditions: [{ type: 'Ready', status: 'True', reason: 'KubeletReady', message: 'kubelet is posting ready status' }],
      age: '7d',
      unschedulable: false,
    },
  ]
}

// Hook to get detailed node information
export function useNodes(cluster?: string) {
  const [nodes, setNodes] = useState<NodeInfo[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Per-cluster errors from the SSE `cluster_error` event (Issue 9355). Lets
  // consumers (drill-downs) distinguish an RBAC denial on one or more
  // clusters from a globally-transient failure so the UI can show a
  // specific "lacks list-nodes RBAC on cluster X" message instead of a
  // generic "detailed list is empty" warning.
  const [clusterErrors, setClusterErrors] = useState<NodeClusterError[]>([])
  const { isDemoMode: demoMode } = useDemoMode()

  // Track previous cluster to detect actual changes (not just initial mount)
  const prevClusterRef = useRef<string | undefined>(cluster)
  const initialMountRef = useRef(true)

  // Reset state only when cluster actually CHANGES (not on initial mount)
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
    // If demo mode is enabled, use demo data
    if (isDemoMode()) {
      const demoNodes = getDemoNodes().filter(n => !cluster || n.cluster === cluster)
      setNodes(demoNodes)
      setIsLoading(false)
      setError(null)
      setClusterErrors([])
      return
    }
    setIsLoading(true)

    // Try local agent HTTP endpoint first (works without backend)
    const nodeAgentURL = getLocalAgentURL()
    if (cluster && nodeAgentURL && !isAgentUnavailable() && !isClusterModeBackend()) {
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), MCP_HOOK_TIMEOUT_MS)
        const response = await agentFetch(`${nodeAgentURL}/nodes?cluster=${encodeURIComponent(cluster)}`, {
          signal: controller.signal,
          headers: { 'Accept': 'application/json' },
        })
        clearTimeout(timeoutId)

        if (response.ok) {
          const data = await response.json()
          const nodeData = data.nodes || []
          if (nodeData.length > 0) {
            // Map to NodeInfo format
            const mappedNodes: NodeInfo[] = nodeData.map((n: Record<string, unknown>) => ({
              name: n.name as string,
              cluster: cluster,
              status: n.status as string || 'Unknown',
              roles: n.roles as string[] || [],
              kubeletVersion: n.kubeletVersion as string || '',
              cpuCapacity: n.cpuCapacity as string || '0',
              memoryCapacity: n.memoryCapacity as string || '0',
              podCapacity: n.podCapacity as string || '110',
              conditions: n.conditions as Array<{type: string; status: string; reason: string; message: string}> || [],
              unschedulable: n.unschedulable as boolean || false,
            }))
            setNodes(mappedNodes)
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

    // Collect per-cluster error events during this refetch. We replace the
    // previous snapshot atomically when the stream settles so a transient
    // flash of "cluster X failed" isn't left stale after a retry succeeds
    // (Issue 9355).
    const collectedErrors: NodeClusterError[] = []

    // Use SSE streaming for progressive multi-cluster data
    try {
      const sseParams: Record<string, string> = {}
      if (cluster) sseParams.cluster = cluster

      const allNodes = await fetchSSE<NodeInfo>({
        url: `${getClusterModeBaseUrl()}/nodes/stream`,
        params: sseParams,
        itemsKey: 'nodes',
        onClusterData: (_clusterName, items) => {
          setNodes(prev => [...prev, ...items])
          setIsLoading(false)
        },
        onClusterError: (clusterName, errorMessage) => {
          // Classify the raw backend error so consumers can render an
          // RBAC-specific message (auth) instead of "transient failure"
          // (timeout/network/unknown). Backend error strings already
          // contain enough context ("nodes is forbidden", "401",
          // "unauthorized", etc.) for the classifier to match.
          const classified = classifyError(errorMessage)
          collectedErrors.push({
            cluster: clusterName,
            errorType: classified.type,
            message: errorMessage,
          })
        },
      })

      setNodes(allNodes)
      setError(null)
      setClusterErrors(collectedErrors)
    } catch {
      // On error, show empty state instead of fabricating placeholder nodes
      // that would masquerade as real Ready nodes (#7351).  Even on
      // catastrophic failure, surface any per-cluster errors we collected
      // before the stream aborted so the UI can still explain the partial
      // state (Issue 9355).
      setError(null)
      setNodes([])
      setClusterErrors(collectedErrors)
    } finally {
      setIsLoading(false)
    }
  }, [cluster])

  useEffect(() => {
    refetch()

    // Register for unified mode transition refetch
    const unregisterRefetch = registerRefetch(`nodes:${cluster || 'all'}`, () => {
      refetch()
    })

    return () => {
      unregisterRefetch()
    }
  }, [refetch, cluster])

  // Re-fetch when demo mode changes (not on initial mount)
  useEffect(() => {
    if (initialMountRef.current) {
      initialMountRef.current = false
      return
    }
    refetch()
  }, [demoMode, refetch])

  // Per-cluster errors surfaced from the SSE stream (Issue 9355) so the
  // multi-cluster drill-down can explain an empty list with "lacks
  // list-nodes RBAC on cluster X" rather than a generic warning.
  return { nodes, isLoading, error, clusterErrors, refetch }
}

// Hook to get NVIDIA operator status
