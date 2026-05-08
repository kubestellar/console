import { useClusters, useGPUNodes } from '../../hooks/useMCP'
import { useCachedLLMdModels } from '../../hooks/useCachedData'
import { StatBlockValue } from '../ui/StatsOverview'
import { DashboardPage } from '../../lib/dashboards/DashboardPage'
import { getDefaultCards } from '../../config/dashboards'
import { RotatingTip } from '../ui/RotatingTip'
import { useLLMdClusters } from '../cards/workload-detection/shared'
import { StackProvider } from '../../contexts/StackContext'
import { StackSelector } from '../cards/llmd/StackSelector'
import { useTranslation } from 'react-i18next'
import { formatPercent } from '../../lib/formatters'

const AIML_CARDS_KEY = 'kubestellar-aiml-cards'
const PERCENT_MULTIPLIER = 100
const DEMO_CPU_UTIL_PERCENT = 42
const DEMO_MEMORY_UTIL_PERCENT = 61

// Default cards for AI/ML dashboard
const DEFAULT_AIML_CARDS = getDefaultCards('ai-ml')

type AIMLClusterMetrics = {
  cpuCores?: number
  cpuUsageCores?: number
  cpuRequestsCores?: number
  memoryGB?: number
  memoryUsageGB?: number
  memoryRequestsGB?: number
}

type UtilizationMetric = 'cpu' | 'memory'

function calculateUtilization(
  clusters: AIMLClusterMetrics[],
  metric: UtilizationMetric,
): number | null {
  const totals = clusters.reduce((accumulator, cluster) => {
    const capacity = metric === 'cpu' ? (cluster.cpuCores ?? 0) : (cluster.memoryGB ?? 0)
    const usedValue = metric === 'cpu'
      ? (cluster.cpuUsageCores ?? cluster.cpuRequestsCores)
      : (cluster.memoryUsageGB ?? cluster.memoryRequestsGB)

    return {
      capacity: accumulator.capacity + capacity,
      usage: accumulator.usage + (usedValue ?? 0),
      hasUsageData: accumulator.hasUsageData || usedValue !== undefined,
    }
  }, {
    capacity: 0,
    usage: 0,
    hasUsageData: false,
  })

  if (!totals.hasUsageData || totals.capacity <= 0) {
    return null
  }

  return (totals.usage / totals.capacity) * PERCENT_MULTIPLIER
}

export function AIML() {
  const { t } = useTranslation('common')
  const { deduplicatedClusters: clusters, isLoading, isRefreshing: dataRefreshing, lastUpdated, refetch, error } = useClusters()
  const { nodes: gpuNodes, isLoading: gpuLoading } = useGPUNodes()

  // Get GPU cluster names for intelligent LLM-d cluster discovery
  const gpuClusterNames = new Set(gpuNodes.map(n => n.cluster))

  // Dynamically discover LLM-d clusters from available reachable clusters
  // Scans for clusters with GPU nodes or AI/ML naming patterns
  const llmdClusters = useLLMdClusters(clusters, gpuClusterNames)

  const { models: llmModels, isLoading: llmLoading, isDemoFallback: isLLMModelsDemo } = useCachedLLMdModels(llmdClusters)

  // Filter reachable clusters
  const reachableClusters = clusters.filter(c => c.reachable !== false)
  const hasDemoClusters = reachableClusters.some(cluster => cluster.isDemo)

  // Calculate total GPUs
  const totalGPUs = gpuNodes.reduce((sum, n) => sum + n.gpuCount, 0)
  const totalMemoryGB = reachableClusters.reduce((sum, cluster) => sum + (cluster.memoryGB || 0), 0)

  // Calculate ML workload count (LLM models + other ML deployments)
  const mlWorkloadCount = llmModels.length

  // Determine if we have demo data active for the AI/ML overview
  const hasAIMLData = gpuNodes.length > 0 || llmModels.length > 0
  const isDemoData = hasDemoClusters || isLLMModelsDemo || (!hasAIMLData && !gpuLoading && !llmLoading)
  const cpuUtilization = isDemoData
    ? DEMO_CPU_UTIL_PERCENT
    : calculateUtilization(reachableClusters, 'cpu')
  const memoryUtilization = isDemoData
    ? DEMO_MEMORY_UTIL_PERCENT
    : calculateUtilization(reachableClusters, 'memory')

  // Stats value getter for the configurable StatsOverview component
  const getDashboardStatValue = (blockId: string): StatBlockValue => {
    switch (blockId) {
      case 'clusters':
        return { value: reachableClusters.length, sublabel: t('common.clusters'), isClickable: false, isDemo: isDemoData }
      case 'gpu_nodes':
        return {
          value: gpuNodes.length,
          sublabel: t('aiml.gpuTotal', { count: totalGPUs }),
          isClickable: false,
          isDemo: isDemoData,
        }
      case 'memory':
        return {
          value: Math.round(totalMemoryGB),
          sublabel: t('aiml.totalMemory'),
          isClickable: false,
          isDemo: isDemoData,
        }
      case 'memory':
        return {
          value: Math.round(totalMemoryGB),
          sublabel: t('aiml.totalMemory'),
          isClickable: false,
          isDemo: isDemoData,
        }
      case 'ml_workloads':
        return {
          value: mlWorkloadCount,
          sublabel: t('aiml.mlWorkloads'),
          isClickable: false,
          isDemo: isDemoData,
        }
      case 'loaded_models': {
        const loadedCount = llmModels.filter(m => m.status === 'loaded').length
        return {
          value: loadedCount,
          sublabel: t('aiml.modelsLoaded'),
          isClickable: false,
          isDemo: isDemoData,
        }
      }
      case 'cpu_util':
        return {
          value: cpuUtilization !== null ? formatPercent(cpuUtilization) : '-',
          sublabel: t('common.utilization'),
          isClickable: false,
          isDemo: isDemoData,
        }
      case 'memory_util':
        return {
          value: memoryUtilization !== null ? formatPercent(memoryUtilization) : '-',
          sublabel: t('common.utilization'),
          isClickable: false,
          isDemo: isDemoData,
        }
      default:
        return { value: '-' }
    }
  }

  const getStatValue = getDashboardStatValue

  return (
    <StackProvider>
      <DashboardPage
        title={t('aiml.title')}
        subtitle={t('aiml.subtitle')}
        icon="Sparkles"
        rightExtra={<RotatingTip page="ai-ml" />}
        storageKey={AIML_CARDS_KEY}
        defaultCards={DEFAULT_AIML_CARDS}
        statsType="compute"
        getStatValue={getStatValue}
        onRefresh={refetch}
        isLoading={isLoading || gpuLoading || llmLoading}
        isRefreshing={dataRefreshing}
        lastUpdated={lastUpdated}
        hasData={reachableClusters.length > 0 || hasAIMLData}
        isDemoData={isDemoData}
        emptyState={{
          title: t('aiml.emptyStateTitle'),
          description: t('aiml.emptyStateDescription') }}
        headerExtra={<StackSelector />}
      >
        {error && (
          <div className="mb-4 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400">
            <div className="font-medium">{t('aiml.errorLoading')}</div>
            <div className="text-sm text-muted-foreground">{error}</div>
          </div>
        )}
      </DashboardPage>
    </StackProvider>
  )
}
