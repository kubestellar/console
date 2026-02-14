import { useState, useMemo, useCallback } from 'react'
import { AlertCircle, Play, Clock, ChevronDown, ChevronRight, RotateCcw, ArrowUpCircle, Stethoscope, Server, Box, Layers } from 'lucide-react'
import { useMissions } from '../../../hooks/useMissions'
import { useClusters } from '../../../hooks/useMCP'
import { useCachedPodIssues, useCachedDeploymentIssues } from '../../../hooks/useCachedData'
import { useGlobalFilters } from '../../../hooks/useGlobalFilters'
import { useDrillDownActions } from '../../../hooks/useDrillDown'
import { useKubectl } from '../../../hooks/useKubectl'
import { cn } from '../../../lib/cn'
import { useApiKeyCheck, ApiKeyPromptModal } from './shared'
import type { ConsoleMissionCardProps } from './shared'
import { useCardLoadingState } from '../CardDataContext'

type ViewMode = 'summary' | 'issues'

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  CrashLoopBackOff: { bg: 'bg-red-500', text: 'text-red-400' },
  ImagePullBackOff: { bg: 'bg-orange-500', text: 'text-orange-400' },
  ErrImagePull: { bg: 'bg-orange-500', text: 'text-orange-400' },
  Pending: { bg: 'bg-yellow-500', text: 'text-yellow-400' },
  Error: { bg: 'bg-red-500', text: 'text-red-400' },
  OOMKilled: { bg: 'bg-red-600', text: 'text-red-400' },
  CreateContainerConfigError: { bg: 'bg-purple-500', text: 'text-purple-400' },
  'Replica Mismatch': { bg: 'bg-blue-500', text: 'text-blue-400' },
}

const DEFAULT_COLOR = { bg: 'bg-muted', text: 'text-muted-foreground' }

export function ConsoleHealthCheckCard(_props: ConsoleMissionCardProps) {
  const { startMission, missions } = useMissions()
  const { deduplicatedClusters: allClusters, isLoading } = useClusters()
  const { issues: allPodIssues } = useCachedPodIssues()
  const { issues: allDeploymentIssues } = useCachedDeploymentIssues()
  const { selectedClusters, isAllClustersSelected, customFilter } = useGlobalFilters()
  const { drillToCluster, drillToPod } = useDrillDownActions()
  const { showKeyPrompt, checkKeyAndRun, goToSettings, dismissPrompt } = useApiKeyCheck()
  const { execute } = useKubectl()

  const [view, setView] = useState<ViewMode>('summary')
  const [expandedIssue, setExpandedIssue] = useState<string | null>(null)
  const [repairOutput, setRepairOutput] = useState<Record<string, string>>({})
  const [repairing, setRepairing] = useState<Record<string, boolean>>({})

  useCardLoadingState({ isLoading, hasAnyData: allClusters.length > 0 })

  // Filter clusters by global filter
  const clusters = useMemo(() => {
    let result = allClusters
    if (!isAllClustersSelected) {
      result = result.filter(c => selectedClusters.includes(c.name))
    }
    if (customFilter.trim()) {
      const query = customFilter.toLowerCase()
      result = result.filter(c => c.name.toLowerCase().includes(query))
    }
    return result
  }, [allClusters, selectedClusters, isAllClustersSelected, customFilter])

  const podIssues = useMemo(() => {
    if (isAllClustersSelected) return allPodIssues
    return allPodIssues.filter(p => !p.cluster || selectedClusters.includes(p.cluster))
  }, [allPodIssues, selectedClusters, isAllClustersSelected])

  const deploymentIssues = useMemo(() => {
    if (isAllClustersSelected) return allDeploymentIssues
    return allDeploymentIssues.filter(d => !d.cluster || selectedClusters.includes(d.cluster))
  }, [allDeploymentIssues, selectedClusters, isAllClustersSelected])

  const healthyClusters = clusters.filter(c => c.healthy && c.reachable !== false).length
  const unhealthyClusters = clusters.filter(c => !c.healthy && c.reachable !== false).length
  const unreachableClusters = clusters.filter(c => c.reachable === false).length
  const totalNodes = clusters.reduce((sum, c) => sum + (c.nodeCount || 0), 0)
  const totalPods = clusters.reduce((sum, c) => sum + (c.podCount || 0), 0)
  const totalIssues = podIssues.length + deploymentIssues.length

  const healthScore = clusters.length > 0
    ? Math.round((healthyClusters / clusters.length) * 100)
    : 0

  // Group pod issues by status
  const issuesByStatus = useMemo(() => {
    const groups: Record<string, number> = {}
    for (const p of podIssues) {
      const key = p.reason || p.status || 'Unknown'
      groups[key] = (groups[key] || 0) + 1
    }
    if (deploymentIssues.length > 0) {
      groups['Replica Mismatch'] = deploymentIssues.length
    }
    return Object.entries(groups)
      .sort(([, a], [, b]) => b - a)
  }, [podIssues, deploymentIssues])

  // Group issues by cluster
  const issuesByCluster = useMemo(() => {
    const groups: Record<string, { pods: number; deploys: number }> = {}
    for (const p of podIssues) {
      const cluster = p.cluster || 'unknown'
      if (!groups[cluster]) groups[cluster] = { pods: 0, deploys: 0 }
      groups[cluster].pods++
    }
    for (const d of deploymentIssues) {
      const cluster = d.cluster || 'unknown'
      if (!groups[cluster]) groups[cluster] = { pods: 0, deploys: 0 }
      groups[cluster].deploys++
    }
    return Object.entries(groups)
      .map(([name, counts]) => ({ name, ...counts, total: counts.pods + counts.deploys }))
      .sort((a, b) => b.total - a.total)
  }, [podIssues, deploymentIssues])

  // Combined sorted issue list for drill-down
  const allIssues = useMemo(() => {
    const items: Array<{
      id: string
      kind: 'Pod' | 'Deployment'
      name: string
      namespace: string
      cluster: string
      status: string
      details: string[]
      restarts?: number
      replicas?: string
    }> = []

    for (const p of podIssues) {
      items.push({
        id: `pod-${p.cluster}-${p.namespace}-${p.name}`,
        kind: 'Pod',
        name: p.name,
        namespace: p.namespace,
        cluster: p.cluster || 'unknown',
        status: p.reason || p.status,
        details: p.issues || [],
        restarts: p.restarts,
      })
    }
    for (const d of deploymentIssues) {
      items.push({
        id: `deploy-${d.cluster}-${d.namespace}-${d.name}`,
        kind: 'Deployment',
        name: d.name,
        namespace: d.namespace,
        cluster: d.cluster || 'unknown',
        status: 'Replica Mismatch',
        details: d.message ? [d.message] : [`${d.readyReplicas}/${d.replicas} replicas ready`],
        replicas: `${d.readyReplicas}/${d.replicas}`,
      })
    }

    // Sort: highest restarts first for pods, then alphabetically
    items.sort((a, b) => (b.restarts || 0) - (a.restarts || 0))
    return items
  }, [podIssues, deploymentIssues])

  const runningHealthMission = missions.find(m => m.type === 'troubleshoot' && m.status === 'running')

  // Repair actions
  const handleRestartPod = useCallback(async (cluster: string, namespace: string, name: string) => {
    const key = `pod-${cluster}-${namespace}-${name}`
    setRepairing(prev => ({ ...prev, [key]: true }))
    try {
      const result = await execute(cluster, ['delete', 'pod', name, '-n', namespace])
      setRepairOutput(prev => ({ ...prev, [key]: result || `Pod ${name} deleted — will be recreated by its controller` }))
    } catch (err) {
      setRepairOutput(prev => ({ ...prev, [key]: `Error: ${err instanceof Error ? err.message : String(err)}` }))
    } finally {
      setRepairing(prev => ({ ...prev, [key]: false }))
    }
  }, [execute])

  const handleRolloutRestart = useCallback(async (cluster: string, namespace: string, name: string) => {
    const key = `deploy-${cluster}-${namespace}-${name}`
    setRepairing(prev => ({ ...prev, [key]: true }))
    try {
      const result = await execute(cluster, ['rollout', 'restart', 'deployment', name, '-n', namespace])
      setRepairOutput(prev => ({ ...prev, [key]: result || `Deployment ${name} rollout restart initiated` }))
    } catch (err) {
      setRepairOutput(prev => ({ ...prev, [key]: `Error: ${err instanceof Error ? err.message : String(err)}` }))
    } finally {
      setRepairing(prev => ({ ...prev, [key]: false }))
    }
  }, [execute])

  const handleDiagnoseIssue = useCallback((issue: typeof allIssues[number]) => {
    checkKeyAndRun(() => {
      startMission({
        title: `Diagnose: ${issue.name}`,
        description: `Troubleshoot ${issue.kind.toLowerCase()} ${issue.name} in ${issue.namespace}`,
        type: 'troubleshoot',
        initialPrompt: `Please diagnose and help me fix this Kubernetes issue:

${issue.kind}: ${issue.name}
Namespace: ${issue.namespace}
Cluster: ${issue.cluster}
Status: ${issue.status}
${issue.restarts ? `Restarts: ${issue.restarts}` : ''}
${issue.details.length > 0 ? `Issues:\n${issue.details.map(d => `- ${d}`).join('\n')}` : ''}

Please:
1. Analyze the root cause of this issue
2. Check pod events, logs, and resource constraints
3. Suggest specific commands to fix the problem
4. Explain what likely caused this so it can be prevented`,
        context: { issue },
      })
    })
  }, [checkKeyAndRun, startMission])

  const doStartHealthCheck = () => {
    startMission({
      title: 'Cluster Health Check',
      description: 'Comprehensive health analysis across all clusters',
      type: 'troubleshoot',
      initialPrompt: `Please perform a comprehensive health check of my Kubernetes infrastructure.

Cluster Overview:
- Total clusters: ${clusters.length} (${healthyClusters} healthy, ${unhealthyClusters} unhealthy, ${unreachableClusters} offline)
- Total nodes: ${totalNodes}, Total pods: ${totalPods}
- Total issues: ${totalIssues}

Issue Breakdown:
${issuesByStatus.map(([status, count]) => `- ${status}: ${count}`).join('\n')}

Issues by Cluster:
${issuesByCluster.map(c => `- ${c.name}: ${c.pods} pod issues, ${c.deploys} deployment issues`).join('\n')}

Clusters:
${clusters.map(c => `- ${c.name}: ${c.healthy ? '\u2713 healthy' : c.reachable === false ? '\u2717 offline' : '\u26A0 unhealthy'} (${c.nodeCount || 0} nodes, ${c.podCount || 0} pods${c.cpuCores ? `, ${c.cpuCores} CPU` : ''}${c.memoryGB ? `, ${c.memoryGB}GB RAM` : ''})`).join('\n')}

Top 10 Pod Issues:
${podIssues.slice(0, 10).map(p => `- ${p.name} (${p.namespace}/${p.cluster}): ${p.reason || p.status}${p.restarts ? ` [${p.restarts} restarts]` : ''}`).join('\n')}

Please provide:
1. Critical issues requiring immediate attention (prioritized)
2. Root cause analysis for recurring issue patterns
3. Specific remediation steps for each critical issue
4. Resource utilization analysis
5. Recommendations for improving reliability`,
      context: {
        clusters: clusters.map(c => ({
          name: c.name, healthy: c.healthy, reachable: c.reachable,
          nodeCount: c.nodeCount, podCount: c.podCount,
          cpuCores: c.cpuCores, memoryGB: c.memoryGB,
        })),
        issuesByStatus: Object.fromEntries(issuesByStatus),
        issuesByCluster,
        totalIssues,
      },
    })
  }

  const handleStartHealthCheck = () => checkKeyAndRun(doStartHealthCheck)

  const maxIssueCount = issuesByStatus.length > 0 ? issuesByStatus[0][1] : 1

  return (
    <div className="h-full flex flex-col relative overflow-hidden">
      <ApiKeyPromptModal isOpen={showKeyPrompt} onDismiss={dismissPrompt} onGoToSettings={goToSettings} />

      {/* Compact health header */}
      <div className="flex items-center gap-3 mb-3">
        <div className={cn(
          'w-12 h-12 rounded-full border-[3px] flex items-center justify-center shrink-0',
          healthScore >= 80 ? 'border-green-500 bg-green-500/10' :
          healthScore >= 60 ? 'border-yellow-500 bg-yellow-500/10' :
          'border-red-500 bg-red-500/10'
        )}>
          <div className={cn(
            'text-sm font-bold',
            healthScore >= 80 ? 'text-green-400' :
            healthScore >= 60 ? 'text-yellow-400' :
            'text-red-400'
          )}>{healthScore}%</div>
        </div>
        <div className="flex gap-2 flex-1 min-w-0">
          <div
            className={cn('flex-1 text-center p-1.5 rounded cursor-pointer transition-colors', healthyClusters > 0 ? 'bg-green-500/10 hover:bg-green-500/20' : 'bg-muted/20')}
            onClick={() => { const c = clusters.find(c => c.healthy && c.reachable !== false); if (c) drillToCluster(c.name) }}
          >
            <div className="text-sm font-bold text-green-400">{healthyClusters}</div>
            <div className="text-[9px] text-muted-foreground">Healthy</div>
          </div>
          <div
            className={cn('flex-1 text-center p-1.5 rounded cursor-pointer transition-colors', unhealthyClusters > 0 ? 'bg-orange-500/10 hover:bg-orange-500/20' : 'bg-muted/20')}
            onClick={() => { const c = clusters.find(c => !c.healthy && c.reachable !== false); if (c) drillToCluster(c.name) }}
          >
            <div className="text-sm font-bold text-orange-400">{unhealthyClusters}</div>
            <div className="text-[9px] text-muted-foreground">Degraded</div>
          </div>
          <div
            className={cn('flex-1 text-center p-1.5 rounded cursor-pointer transition-colors', unreachableClusters > 0 ? 'bg-red-500/10 hover:bg-red-500/20' : 'bg-muted/20')}
            onClick={() => { const c = clusters.find(c => c.reachable === false); if (c) drillToCluster(c.name) }}
          >
            <div className="text-sm font-bold text-red-400">{unreachableClusters}</div>
            <div className="text-[9px] text-muted-foreground">Offline</div>
          </div>
        </div>
      </div>

      {/* View toggle */}
      {totalIssues > 0 && (
        <div className="flex gap-1 mb-2">
          <button
            onClick={() => setView('summary')}
            className={cn('px-2 py-0.5 text-[10px] rounded-full transition-colors',
              view === 'summary' ? 'bg-primary text-primary-foreground' : 'bg-muted/30 text-muted-foreground hover:bg-muted/50'
            )}
          >
            Breakdown
          </button>
          <button
            onClick={() => setView('issues')}
            className={cn('px-2 py-0.5 text-[10px] rounded-full transition-colors',
              view === 'issues' ? 'bg-primary text-primary-foreground' : 'bg-muted/30 text-muted-foreground hover:bg-muted/50'
            )}
          >
            Issues ({totalIssues})
          </button>
        </div>
      )}

      {/* Scrollable content area */}
      <div className="flex-1 overflow-y-auto min-h-0 space-y-3 pr-0.5">
        {totalIssues === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <div className="text-green-400 text-sm font-medium">No issues detected</div>
            <div className="text-[10px] text-muted-foreground mt-1">All pods and deployments are healthy</div>
          </div>
        ) : view === 'summary' ? (
          <>
            {/* Issue breakdown by type */}
            <div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">By Type</div>
              <div className="space-y-1">
                {issuesByStatus.map(([status, count]) => {
                  const colors = STATUS_COLORS[status] || DEFAULT_COLOR
                  const pct = Math.max(8, (count / maxIssueCount) * 100)
                  return (
                    <div key={status} className="flex items-center gap-2">
                      <div className="w-[100px] text-[10px] text-muted-foreground truncate shrink-0" title={status}>{status}</div>
                      <div className="flex-1 h-3.5 bg-muted/20 rounded-sm overflow-hidden">
                        <div
                          className={cn('h-full rounded-sm transition-all', colors.bg, 'opacity-60')}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className={cn('text-[10px] font-mono w-6 text-right shrink-0', colors.text)}>{count}</div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Per-cluster breakdown */}
            {issuesByCluster.length > 0 && (
              <div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">By Cluster</div>
                <div className="space-y-1">
                  {issuesByCluster.slice(0, 8).map(cluster => {
                    const maxCluster = issuesByCluster[0].total
                    const pct = Math.max(8, (cluster.total / maxCluster) * 100)
                    return (
                      <div
                        key={cluster.name}
                        className="flex items-center gap-2 cursor-pointer hover:bg-muted/20 rounded px-1 -mx-1 transition-colors"
                        onClick={() => drillToCluster(cluster.name)}
                        title={`${cluster.name}: ${cluster.pods} pod issues, ${cluster.deploys} deployment issues — Click to view`}
                      >
                        <Server className="w-2.5 h-2.5 text-muted-foreground shrink-0" />
                        <div className="w-[85px] text-[10px] text-foreground truncate shrink-0">{cluster.name}</div>
                        <div className="flex-1 h-3 bg-muted/20 rounded-sm overflow-hidden flex">
                          {cluster.pods > 0 && (
                            <div
                              className="h-full bg-red-500/50"
                              style={{ width: `${(cluster.pods / cluster.total) * pct}%` }}
                              title={`${cluster.pods} pod issues`}
                            />
                          )}
                          {cluster.deploys > 0 && (
                            <div
                              className="h-full bg-blue-500/50"
                              style={{ width: `${(cluster.deploys / cluster.total) * pct}%` }}
                              title={`${cluster.deploys} deployment issues`}
                            />
                          )}
                        </div>
                        <div className="text-[10px] font-mono w-6 text-right text-muted-foreground shrink-0">{cluster.total}</div>
                      </div>
                    )
                  })}
                  {issuesByCluster.length > 8 && (
                    <div className="text-[10px] text-muted-foreground pl-5">
                      +{issuesByCluster.length - 8} more clusters
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Quick peek at top issues */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Top Issues</div>
                <button
                  onClick={() => setView('issues')}
                  className="text-[10px] text-primary hover:text-primary/80 transition-colors"
                >
                  View all →
                </button>
              </div>
              <div className="space-y-0.5">
                {allIssues.slice(0, 5).map(issue => {
                  const colors = STATUS_COLORS[issue.status] || DEFAULT_COLOR
                  return (
                    <div
                      key={issue.id}
                      className="flex items-center gap-1.5 text-[10px] py-1 px-1 -mx-1 rounded cursor-pointer hover:bg-muted/20 transition-colors"
                      onClick={() => {
                        if (issue.kind === 'Pod') {
                          drillToPod(issue.cluster, issue.namespace, issue.name)
                        } else {
                          drillToCluster(issue.cluster)
                        }
                      }}
                      title={`${issue.kind}: ${issue.name} in ${issue.namespace} on ${issue.cluster}`}
                    >
                      {issue.kind === 'Pod' ? (
                        <Box className="w-2.5 h-2.5 text-red-400 shrink-0" />
                      ) : (
                        <Layers className="w-2.5 h-2.5 text-blue-400 shrink-0" />
                      )}
                      <span className="text-foreground truncate flex-1">{issue.name}</span>
                      <span className={cn('px-1 rounded text-[9px] shrink-0', `${colors.bg}/20`, colors.text)}>
                        {issue.status}
                      </span>
                      {issue.restarts !== undefined && issue.restarts > 0 && (
                        <span className="text-orange-400 shrink-0">×{issue.restarts}</span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </>
        ) : (
          /* Issues list view */
          <div className="space-y-1">
            {allIssues.map(issue => {
              const isExpanded = expandedIssue === issue.id
              const colors = STATUS_COLORS[issue.status] || DEFAULT_COLOR
              const key = issue.id
              const isRepairing = repairing[key]
              const output = repairOutput[key]

              return (
                <div key={issue.id} className={cn('rounded border transition-colors', isExpanded ? 'border-border/50 bg-muted/10' : 'border-transparent')}>
                  <button
                    className="w-full flex items-center gap-1.5 text-[10px] py-1.5 px-2 text-left hover:bg-muted/20 rounded transition-colors"
                    onClick={() => setExpandedIssue(isExpanded ? null : issue.id)}
                  >
                    {isExpanded ? <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" /> : <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />}
                    {issue.kind === 'Pod' ? (
                      <Box className="w-3 h-3 text-red-400 shrink-0" />
                    ) : (
                      <Layers className="w-3 h-3 text-blue-400 shrink-0" />
                    )}
                    <span className="text-foreground truncate flex-1 font-medium">{issue.name}</span>
                    <span className={cn('px-1 py-0.5 rounded text-[9px] shrink-0', `${colors.bg}/20`, colors.text)}>
                      {issue.status}
                    </span>
                  </button>

                  {isExpanded && (
                    <div className="px-2 pb-2 ml-5 space-y-1.5">
                      <div className="text-[10px] space-y-0.5 text-muted-foreground">
                        <div>Namespace: <span className="text-foreground font-mono">{issue.namespace}</span></div>
                        <div>Cluster: <span className="text-foreground font-mono">{issue.cluster}</span></div>
                        {issue.restarts !== undefined && issue.restarts > 0 && (
                          <div>Restarts: <span className="text-orange-400 font-bold">{issue.restarts}</span></div>
                        )}
                        {issue.replicas && (
                          <div>Replicas: <span className="text-blue-400">{issue.replicas} ready</span></div>
                        )}
                        {issue.details.length > 0 && (
                          <div className="mt-1">
                            <div className="text-muted-foreground mb-0.5">Issues:</div>
                            {issue.details.map((d, i) => (
                              <div key={i} className="text-red-400/80 pl-2 border-l border-red-500/20">{d}</div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Action buttons */}
                      <div className="flex flex-wrap gap-1 mt-2">
                        {issue.kind === 'Pod' && (
                          <button
                            disabled={isRepairing}
                            onClick={() => handleRestartPod(issue.cluster, issue.namespace, issue.name)}
                            className="flex items-center gap-1 px-2 py-1 text-[10px] rounded bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors disabled:opacity-40"
                          >
                            <RotateCcw className="w-2.5 h-2.5" />
                            Restart Pod
                          </button>
                        )}
                        {issue.kind === 'Deployment' && (
                          <button
                            disabled={isRepairing}
                            onClick={() => handleRolloutRestart(issue.cluster, issue.namespace, issue.name)}
                            className="flex items-center gap-1 px-2 py-1 text-[10px] rounded bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 transition-colors disabled:opacity-40"
                          >
                            <ArrowUpCircle className="w-2.5 h-2.5" />
                            Rollout Restart
                          </button>
                        )}
                        <button
                          onClick={() => handleDiagnoseIssue(issue)}
                          className="flex items-center gap-1 px-2 py-1 text-[10px] rounded bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 transition-colors"
                        >
                          <Stethoscope className="w-2.5 h-2.5" />
                          Diagnose
                        </button>
                        <button
                          onClick={() => {
                            if (issue.kind === 'Pod') drillToPod(issue.cluster, issue.namespace, issue.name)
                            else drillToCluster(issue.cluster)
                          }}
                          className="flex items-center gap-1 px-2 py-1 text-[10px] rounded bg-muted/30 hover:bg-muted/50 text-muted-foreground transition-colors"
                        >
                          View Details
                        </button>
                      </div>

                      {/* Repair output */}
                      {output && (
                        <div className="mt-1 p-1.5 rounded bg-black/30 text-[10px] font-mono text-green-400 whitespace-pre-wrap">
                          {output}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 mt-2 pt-2 border-t border-border/20 shrink-0">
        <button
          onClick={handleStartHealthCheck}
          disabled={!!runningHealthMission}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg font-medium text-xs transition-all',
            runningHealthMission
              ? 'bg-green-500/20 text-green-400 cursor-wait'
              : 'bg-green-500/20 hover:bg-green-500/30 text-green-400'
          )}
        >
          {runningHealthMission ? (
            <><Clock className="w-3.5 h-3.5 animate-pulse" /> Analyzing...</>
          ) : (
            <><Play className="w-3.5 h-3.5" /> Full Diagnosis</>
          )}
        </button>
        {totalIssues > 0 && (
          <button
            onClick={() => setView(view === 'issues' ? 'summary' : 'issues')}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs bg-muted/30 hover:bg-muted/50 text-muted-foreground transition-all"
          >
            <AlertCircle className="w-3.5 h-3.5" />
            {view === 'issues' ? 'Summary' : `${totalIssues} Issues`}
          </button>
        )}
      </div>
    </div>
  )
}
