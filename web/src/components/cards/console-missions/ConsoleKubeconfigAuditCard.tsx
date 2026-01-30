import { useMemo } from 'react'
import { Stethoscope, CheckCircle, Clock, ChevronRight } from 'lucide-react'
import { useMissions } from '../../../hooks/useMissions'
import { useClusters } from '../../../hooks/useMCP'
import { useGlobalFilters } from '../../../hooks/useGlobalFilters'
import { useDrillDownActions } from '../../../hooks/useDrillDown'
import { cn } from '../../../lib/cn'
import { useApiKeyCheck, ApiKeyPromptModal } from './shared'
import type { ConsoleMissionCardProps } from './shared'

// Card 2: Kubeconfig Audit - Detect stale/unreachable clusters
export function ConsoleKubeconfigAuditCard(_props: ConsoleMissionCardProps) {
  const { startMission, missions } = useMissions()
  const { deduplicatedClusters: allClusters } = useClusters()
  const { selectedClusters, isAllClustersSelected, customFilter } = useGlobalFilters()
  const { drillToCluster } = useDrillDownActions()
  const { showKeyPrompt, checkKeyAndRun, goToSettings, dismissPrompt } = useApiKeyCheck()

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
      result = result.filter(c =>
        c.name.toLowerCase().includes(query) ||
        (c.errorMessage?.toLowerCase() || '').includes(query)
      )
    }

    return result
  }, [allClusters, selectedClusters, isAllClustersSelected, customFilter])

  const unreachableClusters = clusters.filter(c => c.reachable === false || c.nodeCount === 0)

  const runningAuditMission = missions.find(m => m.title.includes('Kubeconfig') && m.status === 'running')

  const doStartAudit = () => {
    startMission({
      title: 'Kubeconfig Audit',
      description: 'Analyzing kubeconfig for stale or problematic clusters',
      type: 'analyze',
      initialPrompt: `Please audit my kubeconfig and help me clean it up.

Current clusters (${clusters.length} total):
${clusters.map(c => `- ${c.name}: ${c.reachable === false ? 'OFFLINE' : c.healthy ? 'healthy' : 'unhealthy'} (${c.nodeCount || 0} nodes)`).join('\n')}

Offline clusters (${unreachableClusters.length}):
${unreachableClusters.map(c => `- ${c.name}: ${c.errorMessage || 'Connection failed'}`).join('\n') || 'None'}

Please:
1. Identify clusters that should be removed from kubeconfig
2. Check for duplicate or redundant contexts
3. Verify cluster naming conventions
4. Suggest cleanup commands (kubectl config delete-context, etc.)
5. Identify any security concerns (old credentials, etc.)`,
      context: {
        clusters: clusters.map(c => ({
          name: c.name,
          reachable: c.reachable,
          healthy: c.healthy,
          nodeCount: c.nodeCount,
          errorMessage: c.errorMessage,
        })),
      },
    })
  }

  const handleStartAudit = () => checkKeyAndRun(doStartAudit)

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

      {/* Audit Summary */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div
          className="p-3 rounded-lg bg-cyan-500/10 border border-cyan-500/20 cursor-default"
          title={`${clusters.length} total cluster context${clusters.length !== 1 ? 's' : ''} in kubeconfig`}
        >
          <div className="text-2xl font-bold text-foreground">{clusters.length}</div>
          <div className="text-xs text-cyan-400">Total Contexts</div>
        </div>
        <div
          className={cn(
            'p-3 rounded-lg border',
            unreachableClusters.length > 0
              ? 'bg-yellow-500/10 border-yellow-500/20 cursor-pointer hover:bg-yellow-500/20 transition-colors'
              : 'bg-green-500/10 border-green-500/20 cursor-default'
          )}
          onClick={() => unreachableClusters.length > 0 && unreachableClusters[0] && drillToCluster(unreachableClusters[0].name)}
          title={unreachableClusters.length > 0 ? `${unreachableClusters.length} offline cluster${unreachableClusters.length !== 1 ? 's' : ''} - Click to view first` : 'All clusters are reachable'}
        >
          <div className="text-2xl font-bold text-foreground">{unreachableClusters.length}</div>
          <div className={cn('text-xs', unreachableClusters.length > 0 ? 'text-yellow-400' : 'text-green-400')}>
            Offline
          </div>
        </div>
      </div>

      {/* Offline Clusters Preview */}
      <div className="flex-1 space-y-2 overflow-y-auto mb-4">
        {unreachableClusters.slice(0, 3).map((cluster, i) => (
          <div
            key={i}
            className="p-2 rounded bg-yellow-500/10 text-xs cursor-pointer hover:bg-yellow-500/20 transition-colors group flex items-center justify-between"
            onClick={() => drillToCluster(cluster.name)}
            title={`Click to view details for ${cluster.name}`}
          >
            <div className="min-w-0">
              <div className="font-medium text-foreground truncate">{cluster.name}</div>
              <div className="text-yellow-400 truncate">{cluster.errorMessage || 'Connection failed'}</div>
            </div>
            <ChevronRight className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 flex-shrink-0" />
          </div>
        ))}
        {unreachableClusters.length === 0 && (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground" title="All clusters are reachable">
            <CheckCircle className="w-4 h-4 mr-2 text-green-400" />
            All clusters reachable
          </div>
        )}
      </div>

      {/* Action Button */}
      <button
        onClick={handleStartAudit}
        disabled={!!runningAuditMission}
        className={cn(
          'w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-all',
          runningAuditMission
            ? 'bg-cyan-500/20 text-cyan-400 cursor-wait'
            : 'bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400'
        )}
      >
        {runningAuditMission ? (
          <>
            <Clock className="w-4 h-4 animate-pulse" />
            Auditing...
          </>
        ) : (
          <>
            <Stethoscope className="w-4 h-4" />
            Run Audit
          </>
        )}
      </button>
    </div>
  )
}
