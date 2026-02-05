import { useCallback, useMemo } from 'react'
import { useClusters, useGPUNodes } from '../../hooks/useMCP'
import { useCachedLLMdModels } from '../../hooks/useCachedData'
import { useUniversalStats, createMergedStatValueGetter } from '../../hooks/useUniversalStats'
import { StatBlockValue } from '../ui/StatsOverview'
import { DashboardPage } from '../../lib/dashboards'
import { getDefaultCards } from '../../config/dashboards'
import { useLLMdClusters } from '../cards/workload-detection/shared'
import { StackProvider } from '../../contexts/StackContext'
import { StackSelector } from '../cards/llmd/StackSelector'

const AIML_CARDS_KEY = 'kubestellar-aiml-cards'

// Default cards for AI/ML dashboard
const DEFAULT_AIML_CARDS = getDefaultCards('ai-ml')

export function AIML() {
  const { clusters, isLoading, isRefreshing: dataRefreshing, lastUpdated, refetch, error } = useClusters()
  const { nodes: gpuNodes, isLoading: gpuLoading } = useGPUNodes()
  const { getStatValue: getUniversalStatValue } = useUniversalStats()

  // Get GPU cluster names for intelligent LLM-d cluster discovery
  const gpuClusterNames = useMemo(() => new Set(gpuNodes.map(n => n.cluster)), [gpuNodes])

  // Dynamically discover LLM-d clusters from available reachable clusters
  // Scans for clusters with GPU nodes or AI/ML naming patterns
  const llmdClusters = useLLMdClusters(clusters, gpuClusterNames)

  const { models: llmModels, isLoading: llmLoading } = useCachedLLMdModels(llmdClusters)

  // Filter reachable clusters
  const reachableClusters = clusters.filter(c => c.reachable !== false)

  // Calculate total GPUs
  const totalGPUs = gpuNodes.reduce((sum, n) => sum + n.gpuCount, 0)

  // Calculate ML workload count (LLM models + other ML deployments)
  const mlWorkloadCount = llmModels.length

  // Determine if we have real data (not just loading or error states)
  const hasRealData = gpuNodes.length > 0 || llmModels.length > 0
  const isDemoData = !hasRealData && !gpuLoading && !llmLoading

  // Stats value getter for the configurable StatsOverview component
  const getDashboardStatValue = useCallback((blockId: string): StatBlockValue => {
    switch (blockId) {
      case 'clusters':
        return { value: reachableClusters.length, sublabel: 'clusters', isClickable: false }
      case 'gpu_nodes':
        return {
          value: gpuNodes.length,
          sublabel: `${totalGPUs} GPUs total`,
          isClickable: false,
          isDemo: gpuNodes.length === 0 && !gpuLoading
        }
      case 'ml_workloads':
        return {
          value: mlWorkloadCount,
          sublabel: 'ML workloads',
          isClickable: false,
          isDemo: mlWorkloadCount === 0 && !llmLoading
        }
      case 'loaded_models':
        const loadedCount = llmModels.filter(m => m.status === 'loaded').length
        return {
          value: loadedCount,
          sublabel: 'models loaded',
          isClickable: false,
          isDemo: llmModels.length === 0 && !llmLoading
        }
      default:
        return { value: '-' }
    }
  }, [reachableClusters, gpuNodes, totalGPUs, mlWorkloadCount, llmModels, gpuLoading, llmLoading])

  const getStatValue = useCallback(
    (blockId: string) => createMergedStatValueGetter(getDashboardStatValue, getUniversalStatValue)(blockId),
    [getDashboardStatValue, getUniversalStatValue]
  )

  // Only pass clusters if we have some, otherwise let StackProvider use defaults
  const stackClusters = llmdClusters.length > 0 ? llmdClusters : undefined

  return (
    <StackProvider clusters={stackClusters}>
      <DashboardPage
        title="AI/ML"
        subtitle="Monitor AI and Machine Learning workloads"
        icon="Brain"
        storageKey={AIML_CARDS_KEY}
        defaultCards={DEFAULT_AIML_CARDS}
        statsType="compute"
        getStatValue={getStatValue}
        onRefresh={refetch}
        isLoading={isLoading || gpuLoading || llmLoading}
        isRefreshing={dataRefreshing}
        lastUpdated={lastUpdated}
        hasData={reachableClusters.length > 0 || hasRealData}
        isDemoData={isDemoData}
        emptyState={{
          title: 'AI/ML Dashboard',
          description: 'Add cards to monitor GPU utilization, ML workloads, and model training across your clusters.',
        }}
        headerExtra={<StackSelector />}
      >
        {error && (
          <div className="mb-4 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400">
            <div className="font-medium">Error loading cluster data</div>
            <div className="text-sm text-muted-foreground">{error}</div>
          </div>
        )}
      </DashboardPage>
    </StackProvider>
  )
}
