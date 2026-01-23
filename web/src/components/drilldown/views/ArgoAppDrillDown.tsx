import { useState, useEffect, useRef } from 'react'
import { useLocalAgent } from '../../../hooks/useLocalAgent'
import { useDrillDownActions } from '../../../hooks/useDrillDown'
import { useMissions } from '../../../hooks/useMissions'
import { ClusterBadge } from '../../ui/ClusterBadge'
import {
  GitBranch, Info, Loader2, Copy, Check,
  Layers, Server, RefreshCw, Stethoscope,
  History, Box, ExternalLink, CheckCircle, XCircle,
  AlertTriangle, GitCommit, FolderGit
} from 'lucide-react'
import { cn } from '../../../lib/cn'
import { KlaudeIcon } from '../../ui/KlaudeIcon'
import {
  AIActionBar,
  useModalAI,
  type ResourceContext,
} from '../../modals'

interface Props {
  data: Record<string, unknown>
}

type TabType = 'overview' | 'resources' | 'history' | 'diff' | 'ai'

// Sync status styles
const getSyncStatusStyle = (status: string) => {
  const lower = status?.toLowerCase() || ''
  if (lower === 'synced') {
    return { bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500/30', icon: CheckCircle }
  }
  if (lower === 'outofSync' || lower === 'out of sync' || lower === 'outofsync') {
    return { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/30', icon: AlertTriangle }
  }
  if (lower === 'unknown') {
    return { bg: 'bg-gray-500/20', text: 'text-gray-400', border: 'border-gray-500/30', icon: AlertTriangle }
  }
  return { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30', icon: RefreshCw }
}

// Health status styles
const getHealthStatusStyle = (status: string) => {
  const lower = status?.toLowerCase() || ''
  if (lower === 'healthy') {
    return { bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500/30' }
  }
  if (lower === 'degraded') {
    return { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30' }
  }
  if (lower === 'progressing') {
    return { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30' }
  }
  if (lower === 'suspended') {
    return { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/30' }
  }
  if (lower === 'missing') {
    return { bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/30' }
  }
  return { bg: 'bg-gray-500/20', text: 'text-gray-400', border: 'border-gray-500/30' }
}

interface ArgoResource {
  kind: string
  name: string
  namespace: string
  status: string
  health?: string
  syncWave?: number
}

interface SyncHistory {
  revision: string
  deployedAt: string
  status: string
  message?: string
}

export function ArgoAppDrillDown({ data }: Props) {
  const cluster = data.cluster as string
  const namespace = data.namespace as string
  const appName = data.app as string

  // Additional app data passed from the card
  const syncStatus = (data.syncStatus as string) || 'Unknown'
  const healthStatus = (data.healthStatus as string) || 'Unknown'
  const repoURL = data.repoURL as string | undefined
  const targetRevision = data.targetRevision as string | undefined
  const path = data.path as string | undefined
  const project = data.project as string | undefined

  const { isConnected: agentConnected } = useLocalAgent()
  const { drillToNamespace, drillToCluster, drillToPod, drillToDeployment, drillToService } = useDrillDownActions()
  const { startMission } = useMissions()

  const [activeTab, setActiveTab] = useState<TabType>('overview')
  const [appResources, setAppResources] = useState<ArgoResource[] | null>(null)
  const [resourcesLoading, setResourcesLoading] = useState(false)
  const [syncHistory, setSyncHistory] = useState<SyncHistory[] | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [diffOutput, setDiffOutput] = useState<string | null>(null)
  const [diffLoading, setDiffLoading] = useState(false)
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [aiAnalysis] = useState<string | null>(null)
  const [aiAnalysisLoading] = useState(false)

  // Resource context for AI actions
  const resourceContext: ResourceContext = {
    kind: 'ArgoApplication',
    name: appName,
    cluster,
    namespace,
    status: `${syncStatus} / ${healthStatus}`,
  }

  // Check for issues
  const hasIssues = syncStatus.toLowerCase() !== 'synced' ||
    healthStatus.toLowerCase() === 'degraded' ||
    healthStatus.toLowerCase() === 'missing'
  const issues = hasIssues
    ? [{ name: appName, message: `Sync: ${syncStatus}, Health: ${healthStatus}`, severity: healthStatus.toLowerCase() === 'degraded' ? 'critical' : 'warning' }]
    : []

  // Use modal AI hook
  const { defaultAIActions, handleAIAction, isAgentConnected } = useModalAI({
    resource: resourceContext,
    issues,
    additionalContext: {
      repoURL,
      targetRevision,
      path,
      project,
    },
  })

  // Helper to run kubectl commands
  const runKubectl = (args: string[]): Promise<string> => {
    return new Promise((resolve) => {
      const ws = new WebSocket('ws://127.0.0.1:8585/ws')
      const requestId = `kubectl-${Date.now()}-${Math.random().toString(36).slice(2)}`
      let output = ''

      const timeout = setTimeout(() => {
        ws.close()
        resolve(output || '')
      }, 15000)

      ws.onopen = () => {
        ws.send(JSON.stringify({
          id: requestId,
          type: 'kubectl',
          payload: { context: cluster, args }
        }))
      }
      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data)
        if (msg.id === requestId && msg.payload?.output) {
          output = msg.payload.output
        }
        clearTimeout(timeout)
        ws.close()
        resolve(output)
      }
      ws.onerror = () => {
        clearTimeout(timeout)
        ws.close()
        resolve(output || '')
      }
    })
  }

  // Fetch app resources
  const fetchResources = async () => {
    if (!agentConnected || appResources) return
    setResourcesLoading(true)
    try {
      const output = await runKubectl([
        'get', 'application.argoproj.io', appName, '-n', namespace, '-o', 'json'
      ])
      if (output) {
        const app = JSON.parse(output)
        const resources = app.status?.resources || []
        setAppResources(resources.map((r: any) => ({
          kind: r.kind,
          name: r.name,
          namespace: r.namespace || namespace,
          status: r.status,
          health: r.health?.status,
          syncWave: r.syncWave,
        })))
      }
    } catch {
      setAppResources([])
    }
    setResourcesLoading(false)
  }

  // Fetch sync history
  const fetchHistory = async () => {
    if (!agentConnected || syncHistory) return
    setHistoryLoading(true)
    try {
      const output = await runKubectl([
        'get', 'application.argoproj.io', appName, '-n', namespace, '-o', 'json'
      ])
      if (output) {
        const app = JSON.parse(output)
        const history = app.status?.history || []
        setSyncHistory(history.map((h: any) => ({
          revision: h.revision?.substring(0, 7) || 'Unknown',
          deployedAt: h.deployedAt,
          status: h.deployStartedAt ? 'Deployed' : 'Unknown',
          message: h.source?.repoURL,
        })).reverse())
      }
    } catch {
      setSyncHistory([])
    }
    setHistoryLoading(false)
  }

  // Fetch diff (live vs desired)
  const fetchDiff = async () => {
    if (!agentConnected || diffOutput) return
    setDiffLoading(true)
    try {
      // Try to get diff using argocd CLI if available, otherwise show app manifest
      const output = await runKubectl([
        'get', 'application.argoproj.io', appName, '-n', namespace, '-o', 'yaml'
      ])
      setDiffOutput(output || 'No diff available')
    } catch {
      setDiffOutput('Error fetching diff')
    }
    setDiffLoading(false)
  }

  // Track if we've already loaded data
  const hasLoadedRef = useRef(false)

  useEffect(() => {
    if (!agentConnected || hasLoadedRef.current) return
    hasLoadedRef.current = true

    const loadData = async () => {
      await Promise.all([fetchResources(), fetchHistory()])
    }
    loadData()
  }, [agentConnected])

  // Load diff when tab is selected
  useEffect(() => {
    if (activeTab === 'diff' && !diffOutput && !diffLoading) {
      fetchDiff()
    }
  }, [activeTab])

  const handleCopy = (field: string, value: string) => {
    navigator.clipboard.writeText(value)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 2000)
  }

  // Start AI diagnosis
  const handleDiagnose = () => {
    const prompt = `Analyze this ArgoCD application "${appName}" in namespace "${namespace}".

Application Details:
- Name: ${appName}
- Project: ${project || 'default'}
- Sync Status: ${syncStatus}
- Health Status: ${healthStatus}
- Repository: ${repoURL || 'Unknown'}
- Target Revision: ${targetRevision || 'HEAD'}
- Path: ${path || '/'}

Please:
1. Assess the overall health of this GitOps application
2. Identify any sync or health issues
3. Check for common ArgoCD misconfigurations
4. Suggest remediation steps if needed
5. Recommend best practices for this deployment`

    startMission({
      title: `Diagnose ArgoApp: ${appName}`,
      description: `Analyze ArgoCD application health and sync status`,
      type: 'troubleshoot',
      cluster,
      initialPrompt: prompt,
      context: {
        kind: 'ArgoApplication',
        name: appName,
        namespace,
        cluster,
        syncStatus,
        healthStatus,
      },
    })
  }

  const syncStyle = getSyncStatusStyle(syncStatus)
  const healthStyle = getHealthStatusStyle(healthStatus)
  const SyncIcon = syncStyle.icon

  const TABS: { id: TabType; label: string; icon: typeof Info }[] = [
    { id: 'overview', label: 'Overview', icon: Info },
    { id: 'resources', label: 'Resources', icon: Box },
    { id: 'history', label: 'History', icon: History },
    { id: 'diff', label: 'Manifest', icon: GitCommit },
    { id: 'ai', label: 'AI Analysis', icon: Stethoscope },
  ]

  // Resource click handler
  const handleResourceClick = (resource: ArgoResource) => {
    if (resource.kind === 'Deployment') {
      drillToDeployment(cluster, resource.namespace, resource.name)
    } else if (resource.kind === 'Service') {
      drillToService(cluster, resource.namespace, resource.name)
    } else if (resource.kind === 'Pod') {
      drillToPod(cluster, resource.namespace, resource.name)
    }
  }

  return (
    <div className="flex flex-col h-full -m-6">
      {/* Header */}
      <div className="px-6 pt-6 pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6 text-sm">
            <button
              onClick={() => drillToNamespace(cluster, namespace)}
              className="flex items-center gap-2 hover:bg-purple-500/10 border border-transparent hover:border-purple-500/30 px-3 py-1.5 rounded-lg transition-all group cursor-pointer"
            >
              <Layers className="w-4 h-4 text-purple-400" />
              <span className="text-muted-foreground">Namespace:</span>
              <span className="font-mono text-purple-400 group-hover:text-purple-300 transition-colors">{namespace}</span>
              <svg className="w-3 h-3 text-purple-400/50 group-hover:text-purple-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
            <button
              onClick={() => drillToCluster(cluster)}
              className="flex items-center gap-2 hover:bg-blue-500/10 border border-transparent hover:border-blue-500/30 px-3 py-1.5 rounded-lg transition-all group cursor-pointer"
            >
              <Server className="w-4 h-4 text-blue-400" />
              <span className="text-muted-foreground">Cluster:</span>
              <ClusterBadge cluster={cluster.split('/').pop() || cluster} size="sm" />
              <svg className="w-3 h-3 text-blue-400/50 group-hover:text-blue-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* Status badges */}
          <div className="flex items-center gap-2">
            <span className={cn('px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1', syncStyle.bg, syncStyle.text, 'border', syncStyle.border)}>
              <SyncIcon className="w-3 h-3" />
              {syncStatus}
            </span>
            <span className={cn('px-2.5 py-1 rounded-lg text-xs font-medium', healthStyle.bg, healthStyle.text, 'border', healthStyle.border)}>
              {healthStatus}
            </span>
          </div>
        </div>
      </div>

      {/* AI Action Bar */}
      <div className="px-6 pb-4">
        <AIActionBar
          resource={resourceContext}
          actions={defaultAIActions}
          onAction={handleAIAction}
          issueCount={issues.length}
          compact={false}
        />
      </div>

      {/* Tabs */}
      <div className="border-b border-border px-6">
        <div className="flex gap-1">
          {TABS.map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'px-4 py-2 text-sm font-medium flex items-center gap-2 border-b-2 transition-colors',
                  activeTab === tab.id
                    ? 'text-primary border-primary'
                    : 'text-muted-foreground border-transparent hover:text-foreground hover:border-border'
                )}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* App Info Card */}
            <div className="p-4 rounded-lg bg-gradient-to-r from-orange-500/10 to-red-500/10 border border-orange-500/20">
              <div className="flex items-start gap-3">
                <GitBranch className="w-8 h-8 text-orange-400 mt-1" />
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-semibold text-foreground">{appName}</h3>
                  <div className="flex flex-wrap gap-4 mt-2 text-sm text-muted-foreground">
                    {project && (
                      <div className="flex items-center gap-1.5">
                        <FolderGit className="w-4 h-4" />
                        <span>Project: {project}</span>
                      </div>
                    )}
                    {targetRevision && (
                      <div className="flex items-center gap-1.5">
                        <GitCommit className="w-4 h-4" />
                        <span>Revision: {targetRevision}</span>
                      </div>
                    )}
                  </div>
                  {repoURL && (
                    <div className="flex items-center gap-1.5 mt-2 text-xs text-muted-foreground">
                      <ExternalLink className="w-3 h-3" />
                      <a
                        href={repoURL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-foreground truncate max-w-md"
                      >
                        {repoURL}
                      </a>
                      {path && <span className="text-muted-foreground">/{path}</span>}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 rounded-lg border border-border bg-card/50">
                <div className={cn('text-2xl font-bold', syncStyle.text)}>
                  {syncStatus === 'Synced' ? <CheckCircle className="w-8 h-8" /> : <AlertTriangle className="w-8 h-8" />}
                </div>
                <div className="text-xs text-muted-foreground mt-1">Sync Status</div>
              </div>
              <div className="p-4 rounded-lg border border-border bg-card/50">
                <div className={cn('text-2xl font-bold', healthStyle.text)}>
                  {healthStatus === 'Healthy' ? <CheckCircle className="w-8 h-8" /> : <XCircle className="w-8 h-8" />}
                </div>
                <div className="text-xs text-muted-foreground mt-1">Health Status</div>
              </div>
              <div className="p-4 rounded-lg border border-border bg-card/50">
                <div className="text-2xl font-bold text-foreground">{appResources?.length || '-'}</div>
                <div className="text-xs text-muted-foreground">Resources</div>
              </div>
              <div className="p-4 rounded-lg border border-border bg-card/50">
                <div className="text-2xl font-bold text-foreground">{syncHistory?.length || '-'}</div>
                <div className="text-xs text-muted-foreground">Deployments</div>
              </div>
            </div>

            {/* Resource Summary */}
            {appResources && appResources.length > 0 && (
              <div className="p-4 rounded-lg border border-border bg-card/50">
                <h4 className="text-sm font-medium text-foreground mb-3">Managed Resources</h4>
                <div className="flex flex-wrap gap-2">
                  {appResources.slice(0, 8).map((resource, i) => {
                    const resHealthStyle = getHealthStatusStyle(resource.health || 'Unknown')
                    return (
                      <button
                        key={`${resource.kind}-${resource.name}-${i}`}
                        onClick={() => handleResourceClick(resource)}
                        className={cn(
                          'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors border',
                          resHealthStyle.bg, resHealthStyle.text, resHealthStyle.border,
                          'hover:opacity-80'
                        )}
                      >
                        <span>{resource.kind}:</span>
                        <span className="font-mono">{resource.name}</span>
                      </button>
                    )
                  })}
                  {appResources.length > 8 && (
                    <button
                      onClick={() => setActiveTab('resources')}
                      className="text-xs text-primary hover:underline"
                    >
                      +{appResources.length - 8} more
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'resources' && (
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-foreground">Managed Resources ({appResources?.length || 0})</h4>
            {resourcesLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : appResources && appResources.length > 0 ? (
              <div className="space-y-2">
                {appResources.map((resource, i) => {
                  const resHealthStyle = getHealthStatusStyle(resource.health || 'Unknown')
                  return (
                    <div
                      key={`${resource.kind}-${resource.name}-${i}`}
                      onClick={() => handleResourceClick(resource)}
                      className="flex items-center justify-between p-3 rounded-lg border border-border bg-card/50 hover:bg-card/80 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <Box className="w-4 h-4 text-muted-foreground" />
                        <div>
                          <span className="text-sm font-medium text-foreground">{resource.name}</span>
                          <span className="text-xs text-muted-foreground ml-2">({resource.namespace})</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{resource.kind}</span>
                        {resource.health && (
                          <span className={cn('px-2 py-0.5 rounded text-xs', resHealthStyle.bg, resHealthStyle.text)}>
                            {resource.health}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Box className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No resources found</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'history' && (
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-foreground">Sync History</h4>
            {historyLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : syncHistory && syncHistory.length > 0 ? (
              <div className="space-y-2">
                {syncHistory.map((entry, i) => (
                  <div
                    key={`${entry.revision}-${i}`}
                    className="flex items-center justify-between p-3 rounded-lg border border-border bg-card/50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-secondary font-mono text-xs">
                        {entry.revision}
                      </div>
                      <div>
                        <div className="text-sm text-foreground">{entry.status}</div>
                        {entry.message && (
                          <div className="text-xs text-muted-foreground truncate max-w-sm">{entry.message}</div>
                        )}
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {entry.deployedAt ? new Date(entry.deployedAt).toLocaleString() : '-'}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <History className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No sync history available</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'diff' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-foreground">Application Manifest</h4>
              {diffOutput && (
                <button
                  onClick={() => handleCopy('diff', diffOutput)}
                  className="flex items-center gap-1 px-2 py-1 rounded text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {copiedField === 'diff' ? (
                    <Check className="w-3 h-3 text-green-400" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                  Copy
                </button>
              )}
            </div>
            {diffLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : diffOutput ? (
              <pre className="p-4 rounded-lg bg-card border border-border overflow-x-auto text-xs font-mono text-foreground max-h-[500px]">
                {diffOutput}
              </pre>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <GitCommit className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No manifest available</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'ai' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-foreground flex items-center gap-2">
                <KlaudeIcon className="w-5 h-5" />
                AI Analysis
              </h4>
              <button
                onClick={handleDiagnose}
                disabled={!isAgentConnected}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
              >
                <Stethoscope className="w-4 h-4" />
                Analyze Application
              </button>
            </div>

            {!isAgentConnected ? (
              <div className="text-center py-12 text-muted-foreground">
                <KlaudeIcon className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>AI agent not connected</p>
                <p className="text-xs mt-1">Configure the Klaude agent in Settings to enable AI analysis</p>
              </div>
            ) : aiAnalysisLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
              </div>
            ) : aiAnalysis ? (
              <div className="p-4 rounded-lg bg-purple-500/10 border border-purple-500/20">
                <pre className="whitespace-pre-wrap text-sm text-foreground">{aiAnalysis}</pre>
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Stethoscope className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>Click "Analyze Application" to get AI-powered GitOps analysis</p>
                <p className="text-xs mt-1">Klaude will analyze sync status, health, and suggest improvements</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
