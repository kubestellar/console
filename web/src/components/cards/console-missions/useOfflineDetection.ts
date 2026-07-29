import { useMemo } from 'react'
import type { ClusterHealthIssue, GpuIssue, UnifiedItem } from './offlineDataTransforms'
import type { PredictedRisk } from '../../../types/predictions'
import { buildAnalysisMissionConfig } from './offlineAnalysis'

interface UseOfflineDetectionArgs {
  offlineNodes: { cluster?: string }[]
  clusterHealthIssues: ClusterHealthIssue[]
  gpuIssues: GpuIssue[]
  predictedRisks: PredictedRisk[]
  unifiedItems: UnifiedItem[]
  categorizedItems: {
    offline: UnifiedItem[]
    gpu: UnifiedItem[]
    prediction: UnifiedItem[]
  }
  filteredTotalIssues: number
  filteredTotalPredicted: number
  filteredCriticalPredicted: number
  isFiltered: boolean
}

export function useOfflineDetection({
  offlineNodes,
  clusterHealthIssues,
  gpuIssues,
  predictedRisks,
  unifiedItems,
  categorizedItems,
  filteredTotalIssues,
  filteredTotalPredicted,
  filteredCriticalPredicted,
  isFiltered,
}: UseOfflineDetectionArgs) {
  const currentClusterIssueCount = offlineNodes.length + clusterHealthIssues.length
  const firstCurrentIssueCluster = offlineNodes[0]?.cluster || clusterHealthIssues[0]?.cluster || null

  const analysisMissionConfig = useMemo(() => {
    return buildAnalysisMissionConfig({
      unifiedItems,
      categorizedItems,
      gpuIssues,
      predictedRisks,
      filteredTotalIssues,
      filteredTotalPredicted,
      filteredCriticalPredicted,
      isFiltered,
    })
  }, [
    categorizedItems,
    filteredCriticalPredicted,
    filteredTotalIssues,
    filteredTotalPredicted,
    gpuIssues,
    isFiltered,
    predictedRisks,
    unifiedItems,
  ])

  return {
    currentClusterIssueCount,
    firstCurrentIssueCluster,
    analysisMissionConfig,
  }
}
