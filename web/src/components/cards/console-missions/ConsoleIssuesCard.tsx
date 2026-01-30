import { useMemo } from 'react'
import { Play, CheckCircle, Clock, ChevronRight } from 'lucide-react'
import { useMissions } from '../../../hooks/useMissions'
import { useCachedPodIssues, useCachedDeploymentIssues } from '../../../hooks/useCachedData'
import { useGlobalFilters } from '../../../hooks/useGlobalFilters'
import { useDrillDownActions } from '../../../hooks/useDrillDown'
import { cn } from '../../../lib/cn'
import { useApiKeyCheck, ApiKeyPromptModal } from './shared'
import type { ConsoleMissionCardProps } from './shared'

// Card 1: AI Issues Overview - Shows issues AI can help fix
export function ConsoleIssuesCard(_props: ConsoleMissionCardProps) {
  const { startMission, missions } = useMissions()
  const { issues: allPodIssues } = useCachedPodIssues()
  const { issues: allDeploymentIssues } = useCachedDeploymentIssues()
  const { selectedClusters, isAllClustersSelected, customFilter } = useGlobalFilters()
  const { showKeyPrompt, checkKeyAndRun, goToSettings, dismissPrompt } = useApiKeyCheck()

  const { drillToPod, drillToDeployment } = useDrillDownActions()

  // Filter issues by global cluster filter
  const podIssues = useMemo(() => {
    let result = allPodIssues

    // Apply global cluster filter
    if (!isAllClustersSelected) {
      result = result.filter(p => !p.cluster || selectedClusters.includes(p.cluster))
    }

    // Apply global custom text filter
    if (customFilter.trim()) {
      const query = customFilter.toLowerCase()
      result = result.filter(p =>
        p.name.toLowerCase().includes(query) ||
        p.namespace.toLowerCase().includes(query) ||
        (p.cluster?.toLowerCase() || '').includes(query)
      )
    }

    return result
  }, [allPodIssues, selectedClusters, isAllClustersSelected, customFilter])

  const deploymentIssues = useMemo(() => {
    let result = allDeploymentIssues

    // Apply global cluster filter
    if (!isAllClustersSelected) {
      result = result.filter(d => !d.cluster || selectedClusters.includes(d.cluster))
    }

    // Apply global custom text filter
    if (customFilter.trim()) {
      const query = customFilter.toLowerCase()
      result = result.filter(d =>
        d.name.toLowerCase().includes(query) ||
        d.namespace.toLowerCase().includes(query) ||
        (d.cluster?.toLowerCase() || '').includes(query)
      )
    }

    return result
  }, [allDeploymentIssues, selectedClusters, isAllClustersSelected, customFilter])

  const totalIssues = podIssues.length + deploymentIssues.length
  const clustersWithIssues = new Set([
    ...podIssues.map(p => p.cluster),
    ...deploymentIssues.map(d => d.cluster),
  ]).size

  // Check if there's already a running repair mission
  const runningRepairMission = missions.find(m => m.type === 'repair' && m.status === 'running')

  const doStartRepair = () => {
    const issuesSummary = [
      ...podIssues.slice(0, 5).map(p => `- Pod ${p.name} (${p.namespace}): ${p.status}`),
      ...deploymentIssues.slice(0, 5).map(d => `- Deployment ${d.name} (${d.namespace}): ${d.readyReplicas}/${d.replicas} ready`),
    ].join('\n')

    startMission({
      title: 'Fix Cluster Issues',
      description: `Repairing ${totalIssues} issues across ${clustersWithIssues} clusters`,
      type: 'repair',
      initialPrompt: `I need help diagnosing and fixing issues across my Kubernetes clusters.

Current issues (${totalIssues} total across ${clustersWithIssues} clusters):
${issuesSummary}
${totalIssues > 10 ? `\n...and ${totalIssues - 10} more issues` : ''}

Please:
1. Analyze these issues and identify root causes
2. Prioritize by severity
3. Provide step-by-step remediation commands
4. Explain potential side effects of each fix`,
      context: {
        podIssues: podIssues.slice(0, 20),
        deploymentIssues: deploymentIssues.slice(0, 20),
        clustersWithIssues,
      },
    })
  }

  const handleStartRepair = () => checkKeyAndRun(doStartRepair)

  return (
    <div className="h-full flex flex-col relative">
      {/* API Key Prompt Modal */}
      <ApiKeyPromptModal
        isOpen={showKeyPrompt}
        onDismiss={dismissPrompt}
        onGoToSettings={goToSettings}
      />

      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {runningRepairMission && (
            <span className="flex items-center gap-1 text-xs text-purple-400">
              <Clock className="w-3 h-3 animate-pulse" />
              Fixing...
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
        </div>
      </div>

      {/* Issue Summary */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div
          className={cn(
            "p-3 rounded-lg bg-orange-500/10 border border-orange-500/20",
            podIssues.length > 0 && "cursor-pointer hover:bg-orange-500/20 transition-colors"
          )}
          onClick={() => podIssues.length > 0 && podIssues[0] && drillToPod(podIssues[0].cluster || 'default', podIssues[0].namespace, podIssues[0].name)}
          title={podIssues.length > 0 ? `${podIssues.length} pod${podIssues.length !== 1 ? 's' : ''} with issues - Click to view first issue` : 'No pod issues'}
        >
          <div className="text-2xl font-bold text-foreground">{podIssues.length}</div>
          <div className="text-xs text-orange-400">Pod Issues</div>
        </div>
        <div
          className={cn(
            "p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20",
            deploymentIssues.length > 0 && "cursor-pointer hover:bg-yellow-500/20 transition-colors"
          )}
          onClick={() => deploymentIssues.length > 0 && deploymentIssues[0] && drillToDeployment(deploymentIssues[0].cluster || 'default', deploymentIssues[0].namespace, deploymentIssues[0].name)}
          title={deploymentIssues.length > 0 ? `${deploymentIssues.length} deployment${deploymentIssues.length !== 1 ? 's' : ''} with issues - Click to view first issue` : 'No deployment issues'}
        >
          <div className="text-2xl font-bold text-foreground">{deploymentIssues.length}</div>
          <div className="text-xs text-yellow-400">Deployment Issues</div>
        </div>
      </div>

      {/* Top Issues Preview */}
      <div className="flex-1 space-y-2 overflow-y-auto mb-4">
        {podIssues.slice(0, 3).map((issue, i) => (
          <div
            key={`pod-${i}`}
            className="p-2 rounded bg-orange-500/10 text-xs cursor-pointer hover:bg-orange-500/20 transition-colors group flex items-center justify-between"
            onClick={() => drillToPod(issue.cluster || 'default', issue.namespace, issue.name, { status: issue.status, restarts: issue.restarts, issues: issue.issues })}
            title={`Click to view details for pod ${issue.name}`}
          >
            <div className="min-w-0">
              <div className="font-medium text-foreground truncate">{issue.name}</div>
              <div className="text-orange-400">{issue.status}</div>
            </div>
            <ChevronRight className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 flex-shrink-0" />
          </div>
        ))}
        {totalIssues > 3 && (
          <div className="text-xs text-muted-foreground text-center" title={`${totalIssues - 3} additional issues`}>
            +{totalIssues - 3} more issues
          </div>
        )}
      </div>

      {/* Action Button */}
      <button
        onClick={handleStartRepair}
        disabled={totalIssues === 0 || !!runningRepairMission}
        className={cn(
          'w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-all',
          totalIssues === 0
            ? 'bg-green-500/20 text-green-400 cursor-default'
            : runningRepairMission
              ? 'bg-purple-500/20 text-purple-400 cursor-wait'
              : 'bg-purple-500/20 hover:bg-purple-500/30 text-purple-400'
        )}
      >
        {totalIssues === 0 ? (
          <>
            <CheckCircle className="w-4 h-4" />
            All Clear
          </>
        ) : runningRepairMission ? (
          <>
            <Clock className="w-4 h-4 animate-pulse" />
            Repair in Progress
          </>
        ) : (
          <>
            <Play className="w-4 h-4" />
            Ask AI to Fix
          </>
        )}
      </button>
    </div>
  )
}
