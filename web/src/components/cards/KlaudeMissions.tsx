import { useMemo, useState, useCallback } from 'react'
import { Stethoscope, AlertCircle, Play, CheckCircle, Clock, ChevronRight, Key, Settings } from 'lucide-react'
import { useMissions } from '../../hooks/useMissions'
import { useClusters } from '../../hooks/useMCP'
import { useCachedPodIssues, useCachedDeploymentIssues } from '../../hooks/useCachedData'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { cn } from '../../lib/cn'
import { RefreshButton } from '../ui/RefreshIndicator'
import { useNavigate } from 'react-router-dom'

const ANTHROPIC_KEY_STORAGE = 'kubestellar-anthropic-key'

// Hook to check and prompt for API key
function useApiKeyCheck() {
  const [showKeyPrompt, setShowKeyPrompt] = useState(false)
  const navigate = useNavigate()

  const hasApiKey = useCallback(() => {
    const key = localStorage.getItem(ANTHROPIC_KEY_STORAGE)
    return !!key && key.trim().length > 0
  }, [])

  const checkKeyAndRun = useCallback((onSuccess: () => void) => {
    if (hasApiKey()) {
      onSuccess()
    } else {
      setShowKeyPrompt(true)
    }
  }, [hasApiKey])

  const goToSettings = useCallback(() => {
    setShowKeyPrompt(false)
    navigate('/settings')
  }, [navigate])

  const dismissPrompt = useCallback(() => {
    setShowKeyPrompt(false)
  }, [])

  return { showKeyPrompt, checkKeyAndRun, goToSettings, dismissPrompt, hasApiKey }
}

// Reusable API Key Prompt Modal
function ApiKeyPromptModal({ isOpen, onDismiss, onGoToSettings }: {
  isOpen: boolean
  onDismiss: () => void
  onGoToSettings: () => void
}) {
  if (!isOpen) return null

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/50 backdrop-blur-sm rounded-lg">
      <div className="bg-card border border-border rounded-lg p-4 m-4 shadow-xl max-w-sm">
        <div className="flex items-center gap-2 mb-3">
          <div className="p-1.5 rounded bg-orange-500/20">
            <Key className="w-4 h-4 text-orange-400" />
          </div>
          <h3 className="text-sm font-medium text-foreground">API Key Required</h3>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          Configure your Anthropic API key in Settings to use AI-powered diagnostics and repair features.
        </p>
        <div className="flex gap-2">
          <button
            onClick={onGoToSettings}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-purple-500 text-white text-xs font-medium hover:bg-purple-600 transition-colors"
          >
            <Settings className="w-3.5 h-3.5" />
            Go to Settings
          </button>
          <button
            onClick={onDismiss}
            className="px-3 py-2 rounded-lg bg-secondary text-muted-foreground text-xs hover:bg-secondary/80 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// Klaude Mission Cards - Quick actions for AI-powered cluster management

interface KlaudeMissionCardProps {
  config?: Record<string, unknown>
}

// Card 1: Klaude Issues Overview - Shows issues Klaude can help fix
export function KlaudeIssuesCard(_props: KlaudeMissionCardProps) {
  const { startMission, missions } = useMissions()
  const { isRefreshing: clustersRefreshing, refetch: refetchClusters, isFailed, consecutiveFailures, lastRefresh } = useClusters()
  const { issues: allPodIssues, isRefreshing: podRefreshing, refetch: refetchPods } = useCachedPodIssues()
  const { issues: allDeploymentIssues, isRefreshing: depRefreshing, refetch: refetchDeps } = useCachedDeploymentIssues()
  const { selectedClusters, isAllClustersSelected, customFilter } = useGlobalFilters()
  const { showKeyPrompt, checkKeyAndRun, goToSettings, dismissPrompt } = useApiKeyCheck()

  const isRefreshing = clustersRefreshing || podRefreshing || depRefreshing
  const refetch = () => {
    refetchClusters()
    refetchPods()
    refetchDeps()
  }
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
          <RefreshButton
            isRefreshing={isRefreshing}
            isFailed={isFailed}
            consecutiveFailures={consecutiveFailures}
            lastRefresh={lastRefresh}
            onRefresh={refetch}
            size="sm"
          />
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
            Ask Klaude to Fix
          </>
        )}
      </button>
    </div>
  )
}

// Card 2: Kubeconfig Audit - Detect stale/unreachable clusters
export function KlaudeKubeconfigAuditCard(_props: KlaudeMissionCardProps) {
  const { startMission, missions } = useMissions()
  const { clusters: allClusters, isLoading, isRefreshing, refetch, isFailed, consecutiveFailures, lastRefresh } = useClusters()
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
        <RefreshButton
          isRefreshing={isRefreshing || isLoading}
          isFailed={isFailed}
          consecutiveFailures={consecutiveFailures}
          lastRefresh={lastRefresh}
          onRefresh={refetch}
          size="sm"
        />
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

// Card 3: Cluster Health Check - Overall health assessment
export function KlaudeHealthCheckCard(_props: KlaudeMissionCardProps) {
  const { startMission, missions } = useMissions()
  const { clusters: allClusters, isLoading, isRefreshing, refetch, isFailed, consecutiveFailures, lastRefresh } = useClusters()
  const { issues: allPodIssues } = useCachedPodIssues()
  const { issues: allDeploymentIssues } = useCachedDeploymentIssues()
  const { selectedClusters, isAllClustersSelected, customFilter } = useGlobalFilters()
  const { drillToCluster, drillToPod } = useDrillDownActions()
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
${clusters.map(c => `- ${c.name}: ${c.healthy ? '✓ healthy' : c.reachable === false ? '✗ offline' : '⚠ unhealthy'} (${c.nodeCount || 0} nodes, ${c.podCount || 0} pods)`).join('\n')}

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
        <RefreshButton
          isRefreshing={isRefreshing || isLoading}
          isFailed={isFailed}
          consecutiveFailures={consecutiveFailures}
          lastRefresh={lastRefresh}
          onRefresh={refetch}
          size="sm"
        />
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
          <div className="text-[10px] text-muted-foreground">Healthy</div>
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
          <div className="text-[10px] text-muted-foreground">Unhealthy</div>
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
          <div className="text-[10px] text-muted-foreground">Offline</div>
        </div>
      </div>

      {/* Issues Summary */}
      {totalIssues > 0 && (
        <div
          className="mb-4 p-2 rounded bg-orange-500/10 border border-orange-500/20 cursor-pointer hover:bg-orange-500/20 transition-colors"
          onClick={() => {
            if (podIssues.length > 0 && podIssues[0]) {
              drillToPod(podIssues[0].cluster || 'default', podIssues[0].namespace, podIssues[0].name)
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

// Export all Klaude cards
export const KLAUDE_CARDS = {
  klaude_issues: KlaudeIssuesCard,
  klaude_kubeconfig_audit: KlaudeKubeconfigAuditCard,
  klaude_health_check: KlaudeHealthCheckCard,
}
