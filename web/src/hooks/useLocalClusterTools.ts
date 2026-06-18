import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocalAgent } from './useLocalAgent'
import { useDemoMode } from './useDemoMode'
import { useClusterProgress } from './useClusterProgress'
import { useLocalToolDetection } from './localClusterTools/useLocalToolDetection'
import { useLocalClusters } from './localClusterTools/useLocalClusters'
import { useVCluster } from './localClusterTools/useVCluster'

export type {
  LocalClusterTool,
  VClusterInstance,
  VClusterClusterStatus,
  LocalCluster,
  CreateClusterResult,
  VClusterActionKind,
  VClusterActionState,
  VClusterActionFeedback,
} from './localClusterTools/types'

export function useLocalClusterTools() {
  const { isConnected } = useLocalAgent()
  const { isDemoMode } = useDemoMode()
  const [error, setError] = useState<string | null>(null)

  const {
    tools,
    installedTools,
    fetchTools,
  } = useLocalToolDetection({
    isConnected,
    isDemoMode,
    setGlobalError: setError,
  })

  const {
    clusters,
    isLoading,
    isCreating: isClusterCreating,
    isDeleting: deletingClusterName,
    createCluster,
    deleteCluster,
    clusterLifecycle,
    fetchClusters,
  } = useLocalClusters({
    isConnected,
    isDemoMode,
    setGlobalError: setError,
  })

  const {
    vclusterInstances,
    vclusterClusterStatus,
    isVClustersLoading,
    vclustersError,
    checkVClusterOnCluster,
    isConnecting,
    isDisconnecting,
    isCreating: isVClusterCreating,
    isDeleting: deletingVClusterName,
    vclusterActionFeedback,
    setVClusterActionFeedback,
    createVCluster,
    connectVCluster,
    disconnectVCluster,
    deleteVCluster,
    fetchVClusters,
    fetchVClusterClusterStatus,
  } = useVCluster({
    isConnected,
    isDemoMode,
    setGlobalError: setError,
  })

  const { progress: clusterProgress, dismiss: dismissProgress, isStale: clusterProgressIsStale } = useClusterProgress()

  const refresh = useCallback(() => {
    void fetchTools()
    void fetchClusters()
    void fetchVClusters()
    void fetchVClusterClusterStatus()
  }, [fetchClusters, fetchTools, fetchVClusterClusterStatus, fetchVClusters])

  const localClusterInitRef = useRef(false)
  useEffect(() => {
    if (isConnected || isDemoMode) {
      if (!localClusterInitRef.current) {
        localClusterInitRef.current = true
        void fetchTools()
        void fetchClusters()
        void fetchVClusters()
        void fetchVClusterClusterStatus()
      }
    } else {
      localClusterInitRef.current = false
      setError(null)
    }
  }, [isConnected, isDemoMode, fetchClusters, fetchTools, fetchVClusterClusterStatus, fetchVClusters])

  useEffect(() => {
    if (clusterProgress?.status === 'done') {
      void fetchClusters()
      void fetchVClusters()
    }
  }, [clusterProgress?.status, fetchClusters, fetchVClusters])

  return {
    tools,
    installedTools,
    clusters,
    isLoading,
    isCreating: isClusterCreating || isVClusterCreating,
    isDeleting: deletingVClusterName ?? deletingClusterName,
    error,
    isConnected,
    isDemoMode,
    clusterProgress,
    clusterProgressIsStale,
    dismissProgress,
    createCluster,
    deleteCluster,
    clusterLifecycle,
    refresh,
    vclusterInstances,
    vclusterClusterStatus,
    isVClustersLoading,
    vclustersError,
    checkVClusterOnCluster,
    isConnecting,
    isDisconnecting,
    vclusterActionFeedback,
    dismissVClusterActionFeedback: () => setVClusterActionFeedback(null),
    createVCluster,
    connectVCluster,
    disconnectVCluster,
    deleteVCluster,
    fetchVClusters,
  }
}
