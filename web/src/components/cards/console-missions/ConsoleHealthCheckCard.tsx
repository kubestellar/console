import { useMemo } from 'react'
import { AlertCircle, Play, Clock } from 'lucide-react'
import { useMissions } from '../../../hooks/useMissions'
import { useClusters } from '../../../hooks/useMCP'
import { useCachedPodIssues, useCachedDeploymentIssues } from '../../../hooks/useCachedData'
import { useGlobalFilters } from '../../../hooks/useGlobalFilters'
import { useDrillDownActions } from '../../../hooks/useDrillDown'
import { cn } from '../../../lib/cn'
import { useApiKeyCheck, ApiKeyPromptModal } from './shared'
import type { ConsoleMissionCardProps } from './shared'
import { useCardLoadingState } from '../CardDataContext'
import { useTranslation } from 'react-i18next'

// Card 3: Cluster Health Check - Overall health assessment
export function ConsoleHealthCheckCard(_props: ConsoleMissionCardProps) {
  const { t } = useTranslation()
  const { startMission, missions } = useMissions()
  const { deduplicatedClusters: allClusters, isLoading } = useClusters()
  const { issues: allPodIssues } = useCachedPodIssues()
  const { issues: allDeploymentIssues } = useCachedDeploymentIssues()
  const { selectedClusters, isAllClustersSelected, customFilter } = useGlobalFilters()
  const { drillToCluster, drillToPod } = useDrillDownActions()
  const { showKeyPrompt, checkKeyAndRun, goToSettings, dismissPrompt } = useApiKeyCheck()

  // Report loading state to CardWrapper for skeleton/refresh behavior
  useCardLoadingState({
    isLoading,
    hasAnyData: allClusters.length > 0,
  })

  // Filter clusters by global filter
  const clusters = useMemo(() => {
    let result = allClusters

    // Apply global cluster filter
    if (!isAllClustersSelected) {
      result = result.filter(c => selectedClusters.includes(c.name))
    }

    // Apply global custom text filter
    if (customFilter.trim()) {
      const query = customFilter.toLowerCase()
      result = result.filter(c => c.name.toLowerCase().includes(query))
    }

    return result
  }, [allClusters, selectedClusters, isAllClustersSelected, customFilter])

  // Filter issues by global filter
  const podIssues = useMemo(() => {
    let result = allPodIssues

    if (!isAllClustersSelected) {
      result = result.filter(p => !p.cluster || selectedClusters.includes(p.cluster))
    }

    return result
  }, [allPodIssues, selectedClusters, isAllClustersSelected])

  const deploymentIssues = useMemo(() => {
    let result = allDeploymentIssues

    if (!isAllClustersSelected) {
      result = result.filter(d => !d.cluster || selectedClusters.includes(d.cluster))
    }

    return result
  }, [allDeploymentIssues, selectedClusters, isAllClustersSelected])

  const healthyClusters = clusters.filter(c => c.healthy && c.reachable !== false).length
  const unhealthyClusters = clusters.filter(c => !c.healthy && c.reachable !== false).length
  const unreachableClusters = clusters.filter(c => c.reachable === false).length

  const totalNodes = clusters.reduce((sum, c) => sum + (c.nodeCount || 0), 0)
  const totalPods = clusters.reduce((sum, c) => sum + (c.podCount || 0), 0)
  const totalIssues = podIssues.length + deploymentIssues.length

  const runningHealthMission = missions.find(m => m.type === 'troubleshoot' && m.status === 'running')

  const doStartHealthCheck = () => {
    startMission({
      title: 'Cluster Health Check',
      description: 'Comprehensive health analysis across all clusters',
      type: 'troubleshoot',
      initialPrompt: `Please perform a comprehensive health check of my Kubernetes infrastructure.

Cluster Overview:
- Total clusters: ${clusters.length}
- Healthy: ${healthyClusters}
- Unhealthy: ${unhealthyClusters}
- Offline: ${unreachableClusters}

Resource Summary:
- Total nodes: ${totalNodes}
- Total pods: ${totalPods}
- Known issues: ${totalIssues}

Clusters by status:
${clusters.map(c => `- ${c.name}: ${c.healthy ? '\u2713 healthy' : c.reachable === false ? '\u2717 offline' : '\u26A0 unhealthy'} (${c.nodeCount || 0} nodes, ${c.podCount || 0} pods)`).join('\n')}

Please provide:
1. Overall infrastructure health score (1-10)
2. Critical issues requiring immediate attention
3. Resource utilization analysis
4. Recommendations for improving reliability
5. Cost optimization opportunities
6. Security posture assessment`,
      context: {
        clusters: clusters.map(c => ({
          name: c.name,
          healthy: c.healthy,
          reachable: c.reachable,
          nodeCount: c.nodeCount,
          podCount: c.podCount,
          cpuCores: c.cpuCores,
          memoryGB: c.memoryGB,
        })),
        totalIssues,
      },
    })
  }

  const handleStartHealthCheck = () => checkKeyAndRun(doStartHealthCheck)

  // Calculate health score (0-100)
  const healthScore = clusters.length > 0
    ? Math.round((healthyClusters / clusters.length) * 100)
    : 0

  return (
    <div className="h-full flex flex-col relative">
      {/* API Key Prompt Modal */}
      <ApiKeyPromptModal
        isOpen={showKeyPrompt}
        onDismiss={dismissPrompt}
        onGoToSettings={goToSettings}
      />

      <div className="flex items-center justify-end mb-4">
      </div>

      {/* Health Score */}
      <div className="flex items-center justify-center mb-4">
        <div className={cn(
          'w-20 h-20 rounded-full border-4 flex items-center justify-center',
          healthScore >= 80 ? 'border-green-500 bg-green-500/10' :
          healthScore >= 60 ? 'border-yellow-500 bg-yellow-500/10' :
          'border-red-500 bg-red-500/10'
        )}>
          <div className="text-center">
            <div className={cn(
              'text-2xl font-bold',
              healthScore >= 80 ? 'text-green-400' :
              healthScore >= 60 ? 'text-yellow-400' :
              'text-red-400'
            )}>{healthScore}%</div>
            <div className="text-[10px] text-muted-foreground">Health</div>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-3 gap-2 mb-4 text-center">
        <div
          className={cn(
            "p-2 rounded bg-green-500/10",
            healthyClusters > 0 && "cursor-pointer hover:bg-green-500/20 transition-colors"
          )}
          onClick={() => {
            const healthyCluster = clusters.find(c => c.healthy && c.reachable !== false)
            if (healthyCluster) drillToCluster(healthyCluster.name)
          }}
          title={`${healthyClusters} healthy cluster${healthyClusters !== 1 ? 's' : ''} - Click to view`}
        >
          <div className="text-lg font-bold text-green-400">{healthyClusters}</div>
          <div className="text-[10px] text-muted-foreground">{t('common.healthy')}</div>
        </div>
        <div
          className={cn(
            "p-2 rounded bg-orange-500/10",
            unhealthyClusters > 0 && "cursor-pointer hover:bg-orange-500/20 transition-colors"
          )}
          onClick={() => {
            const unhealthyCluster = clusters.find(c => !c.healthy && c.reachable !== false)
            if (unhealthyCluster) drillToCluster(unhealthyCluster.name)
          }}
          title={`${unhealthyClusters} unhealthy cluster${unhealthyClusters !== 1 ? 's' : ''} - Click to view`}
        >
          <div className="text-lg font-bold text-orange-400">{unhealthyClusters}</div>
          <div className="text-[10px] text-muted-foreground">{t('common.unhealthy')}</div>
        </div>
        <div
          className={cn(
            "p-2 rounded bg-yellow-500/10",
            unreachableClusters > 0 && "cursor-pointer hover:bg-yellow-500/20 transition-colors"
          )}
          onClick={() => {
            const unreachableCluster = clusters.find(c => c.reachable === false)
            if (unreachableCluster) drillToCluster(unreachableCluster.name)
          }}
          title={`${unreachableClusters} offline cluster${unreachableClusters !== 1 ? 's' : ''} - Click to view`}
        >
          <div className="text-lg font-bold text-yellow-400">{unreachableClusters}</div>
          <div className="text-[10px] text-muted-foreground">{t('common.offline')}</div>
        </div>
      </div>

      {/* Issues Summary */}
      {totalIssues > 0 && (
        <div
          className="mb-4 p-2 rounded bg-orange-500/10 border border-orange-500/20 cursor-pointer hover:bg-orange-500/20 transition-colors"
          onClick={() => {
            if (podIssues.length > 0 && podIssues[0]?.cluster) {
              drillToPod(podIssues[0].cluster, podIssues[0].namespace, podIssues[0].name)
            }
          }}
          title={`${totalIssues} issue${totalIssues !== 1 ? 's' : ''} detected - Click to view first issue`}
        >
          <div className="flex items-center gap-2 text-xs text-orange-400">
            <AlertCircle className="w-3 h-3" />
            {totalIssues} issues detected
          </div>
        </div>
      )}

      {/* Action Button */}
      <button
        onClick={handleStartHealthCheck}
        disabled={!!runningHealthMission}
        className={cn(
          'w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-all mt-auto',
          runningHealthMission
            ? 'bg-green-500/20 text-green-400 cursor-wait'
            : 'bg-green-500/20 hover:bg-green-500/30 text-green-400'
        )}
      >
        {runningHealthMission ? (
          <>
            <Clock className="w-4 h-4 animate-pulse" />
            Analyzing...
          </>
        ) : (
          <>
            <Play className="w-4 h-4" />
            Full Health Check
          </>
        )}
      </button>
    </div>
  )
}
