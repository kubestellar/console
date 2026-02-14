import { useState, useEffect, useRef } from 'react'
import { useLocalAgent } from '../../../hooks/useLocalAgent'
import { useDrillDownActions } from '../../../hooks/useDrillDown'
import { useMissions } from '../../../hooks/useMissions'
import { ClusterBadge } from '../../ui/ClusterBadge'
import {
  GitBranch, Info, Loader2, Server, Stethoscope,
  AlertTriangle, CheckCircle, XCircle,
  FileText, Layers, ArrowRight, Diff
} from 'lucide-react'
import { cn } from '../../../lib/cn'
import { ConsoleAIIcon } from '../../ui/ConsoleAIIcon'
import {
  AIActionBar,
  useModalAI,
  type ResourceContext,
} from '../../modals'
import { useTranslation } from 'react-i18next'

interface Props {
  data: Record<string, unknown>
}

type TabType = 'overview' | 'changes' | 'diff' | 'ai'

// Drift severity styles
const getDriftSeverityStyle = (severity: string) => {
  const lower = severity?.toLowerCase() || ''
  if (lower === 'none' || lower === 'synced') {
    return { bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500/30', icon: CheckCircle }
  }
  if (lower === 'low' || lower === 'minor') {
    return { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/30', icon: AlertTriangle }
  }
  if (lower === 'medium' || lower === 'moderate') {
    return { bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/30', icon: AlertTriangle }
  }
  if (lower === 'high' || lower === 'critical' || lower === 'drifted') {
    return { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30', icon: XCircle }
  }
  return { bg: 'bg-gray-500/20', text: 'text-gray-400', border: 'border-gray-500/30', icon: AlertTriangle }
}

// Change type styles
const getChangeTypeStyle = (changeType: string) => {
  const lower = changeType?.toLowerCase() || ''
  if (lower === 'added' || lower === 'create') {
    return { bg: 'bg-green-500/20', text: 'text-green-400', label: 'Added' }
  }
  if (lower === 'modified' || lower === 'update' || lower === 'changed') {
    return { bg: 'bg-yellow-500/20', text: 'text-yellow-400', label: 'Modified' }
  }
  if (lower === 'deleted' || lower === 'remove') {
    return { bg: 'bg-red-500/20', text: 'text-red-400', label: 'Deleted' }
  }
  return { bg: 'bg-gray-500/20', text: 'text-gray-400', label: changeType }
}

interface DriftChange {
  kind: string
  name: string
  namespace?: string
  changeType: 'added' | 'modified' | 'deleted'
  gitValue?: string
  clusterValue?: string
  diff?: string
  fields?: Array<{ path: string; gitValue: string; clusterValue: string }>
}

export function DriftDrillDown({ data }: Props) {
  const { t } = useTranslation()
  const cluster = data.cluster as string
  const namespace = data.namespace as string | undefined
  const resourceName = data.resource as string | undefined

  // Drift detection data
  const driftStatus = (data.status as string) || 'Unknown'
  const driftSeverity = (data.severity as string) || driftStatus
  const gitRepo = data.gitRepo as string | undefined
  const gitBranch = data.gitBranch as string | undefined
  const gitPath = data.gitPath as string | undefined
  const lastChecked = data.lastChecked as string | undefined
  const driftedResources = (data.driftedResources as number) || 0

  const { isConnected: agentConnected } = useLocalAgent()
  const { drillToNamespace, drillToCluster, drillToPod, drillToDeployment } = useDrillDownActions()
  const { startMission } = useMissions()

  const [activeTab, setActiveTab] = useState<TabType>('overview')
  const [changes, setChanges] = useState<DriftChange[] | null>(null)
  const [changesLoading, setChangesLoading] = useState(false)
  const [selectedChange, setSelectedChange] = useState<DriftChange | null>(null)
  const [aiAnalysis] = useState<string | null>(null)
  const [aiAnalysisLoading] = useState(false)

  // Resource context for AI actions
  const resourceContext: ResourceContext = {
    kind: 'Custom',
    name: resourceName || 'GitOps Drift',
    cluster,
    namespace,
    status: driftStatus,
  }

  // Check for issues
  const hasIssues = driftedResources > 0 || driftSeverity.toLowerCase() === 'high'
  const issues = hasIssues
    ? [{ name: 'Drift', message: `${driftedResources} drifted resources`, severity: 'warning' }]
    : []

  // Use modal AI hook
  const { defaultAIActions, handleAIAction, isAgentConnected } = useModalAI({
    resource: resourceContext,
    issues,
    additionalContext: {
      gitRepo,
      gitBranch,
      gitPath,
      driftedResources,
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

  // Fetch drift details
  const fetchDriftDetails = async () => {
    if (!agentConnected || changes) return
    setChangesLoading(true)
    try {
      // Try to get drift from Flux or ArgoCD
      // First try Flux Kustomization
      if (namespace) {
        const output = await runKubectl([
          'get', 'kustomization', '-n', namespace, '-o', 'json'
        ])
        if (output) {
          const ksList = JSON.parse(output)
          const items = ksList.items || []
          const driftChanges: DriftChange[] = []

          for (const ks of items) {
            // Check for drift annotations
            if (ks.metadata?.annotations?.['kustomize.toolkit.fluxcd.io/driftDetection'] === 'enabled') {
              const lastApplied = ks.status?.lastAppliedRevision
              const lastHandled = ks.status?.lastHandledReconcileAt
              if (lastApplied !== lastHandled) {
                driftChanges.push({
                  kind: 'Kustomization',
                  name: ks.metadata?.name || 'Unknown',
                  namespace: ks.metadata?.namespace,
                  changeType: 'modified',
                })
              }
            }
          }

          if (driftChanges.length > 0) {
            setChanges(driftChanges)
            return
          }
        }
      }

      // If no Flux data, try ArgoCD Applications
      const argoOutput = await runKubectl([
        'get', 'applications.argoproj.io', '-A', '-o', 'json'
      ])
      if (argoOutput) {
        const appList = JSON.parse(argoOutput)
        const apps = appList.items || []
        const driftChanges: DriftChange[] = []

        for (const app of apps) {
          const syncStatus = app.status?.sync?.status
          const resources = app.status?.resources || []

          if (syncStatus === 'OutOfSync') {
            for (const res of resources) {
              if (res.status === 'OutOfSync') {
                driftChanges.push({
                  kind: res.kind || 'Unknown',
                  name: res.name || 'Unknown',
                  namespace: res.namespace,
                  changeType: 'modified',
                })
              }
            }
          }
        }

        setChanges(driftChanges)
      } else {
        setChanges([])
      }
    } catch {
      setChanges([])
    }
    setChangesLoading(false)
  }

  // Track if we've already loaded data
  const hasLoadedRef = useRef(false)

  useEffect(() => {
    if (!agentConnected || hasLoadedRef.current) return
    hasLoadedRef.current = true
    fetchDriftDetails()
  }, [agentConnected])

  // Navigate to resource
  const handleResourceClick = (change: DriftChange) => {
    if (change.kind === 'Pod' && change.namespace) {
      drillToPod(cluster, change.namespace, change.name)
    } else if (change.kind === 'Deployment' && change.namespace) {
      drillToDeployment(cluster, change.namespace, change.name)
    } else if (change.namespace) {
      drillToNamespace(cluster, change.namespace)
    }
  }

  // Start AI diagnosis
  const handleDiagnose = () => {
    const prompt = `Analyze GitOps drift for cluster "${cluster}".

Drift Status:
- Status: ${driftStatus}
- Severity: ${driftSeverity}
- Drifted Resources: ${driftedResources}

Git Source:
- Repository: ${gitRepo || 'Unknown'}
- Branch: ${gitBranch || 'Unknown'}
- Path: ${gitPath || '/'}
- Last Checked: ${lastChecked || 'Unknown'}

${changes && changes.length > 0 ? `
Detected Changes (${changes.length}):
${changes.slice(0, 10).map(c => `- ${c.changeType.toUpperCase()}: ${c.kind}/${c.name}${c.namespace ? ` in ${c.namespace}` : ''}`).join('\n')}
${changes.length > 10 ? `... and ${changes.length - 10} more` : ''}
` : 'No specific drift changes detected.'}

Please:
1. Analyze the root cause of the drift
2. Identify which resources need attention
3. Determine if drift is intentional or accidental
4. Suggest remediation steps (sync vs. manual fix)
5. Recommend GitOps best practices to prevent future drift`

    startMission({
      title: `Analyze GitOps Drift: ${cluster}`,
      description: `Investigate configuration drift between Git and cluster`,
      type: 'troubleshoot',
      cluster,
      initialPrompt: prompt,
      context: {
        kind: 'Drift',
        name: 'GitOps Drift Analysis',
        namespace,
        cluster,
        gitRepo,
        driftedResources,
      },
    })
  }

  const severityStyle = getDriftSeverityStyle(driftSeverity)
  const SeverityIcon = severityStyle.icon

  const TABS: { id: TabType; label: string; icon: typeof Info }[] = [
    { id: 'overview', label: t('drilldown.tabs.overview'), icon: Info },
    { id: 'changes', label: `${t('drilldown.tabs.changes')} (${changes?.length || driftedResources || 0})`, icon: Diff },
    { id: 'diff', label: t('drilldown.tabs.diffView'), icon: FileText },
    { id: 'ai', label: t('drilldown.tabs.aiAnalysis'), icon: Stethoscope },
  ]

  return (
    <div className="flex flex-col h-full -m-6">
      {/* Header */}
      <div className="px-6 pt-6 pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6 text-sm">
            {namespace && (
              <button
                onClick={() => drillToNamespace(cluster, namespace)}
                className="flex items-center gap-2 hover:bg-purple-500/10 border border-transparent hover:border-purple-500/30 px-3 py-1.5 rounded-lg transition-all group cursor-pointer"
              >
                <Layers className="w-4 h-4 text-purple-400" />
                <span className="text-muted-foreground">{t('drilldown.fields.namespace')}</span>
                <span className="font-mono text-purple-400 group-hover:text-purple-300 transition-colors">{namespace}</span>
                <svg className="w-3 h-3 text-purple-400/50 group-hover:text-purple-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            )}
            <button
              onClick={() => drillToCluster(cluster)}
              className="flex items-center gap-2 hover:bg-blue-500/10 border border-transparent hover:border-blue-500/30 px-3 py-1.5 rounded-lg transition-all group cursor-pointer"
            >
              <Server className="w-4 h-4 text-blue-400" />
              <span className="text-muted-foreground">{t('drilldown.fields.cluster')}</span>
              <ClusterBadge cluster={cluster.split('/').pop() || cluster} size="sm" />
              <svg className="w-3 h-3 text-blue-400/50 group-hover:text-blue-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* Status badge */}
          <span className={cn('px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1', severityStyle.bg, severityStyle.text, 'border', severityStyle.border)}>
            <SeverityIcon className="w-3 h-3" />
            {driftSeverity === 'None' || driftStatus === 'Synced' ? 'In Sync' : 'Drifted'}
          </span>
        </div>
      </div>

      {/* AI Action Bar */}
      <div className="px-6 pb-4">
        <AIActionBar
          resource={resourceContext}
          actions={defaultAIActions}
          onAction={handleAIAction}
          issueCount={driftedResources}
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
            {/* Drift Status Card */}
            <div className={cn(
              'p-4 rounded-lg border',
              driftedResources > 0 ? 'bg-gradient-to-r from-red-500/10 to-orange-500/10 border-red-500/20' : 'bg-gradient-to-r from-green-500/10 to-emerald-500/10 border-green-500/20'
            )}>
              <div className="flex items-start gap-3">
                <GitBranch className={cn('w-8 h-8 mt-1', driftedResources > 0 ? 'text-red-400' : 'text-green-400')} />
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-semibold text-foreground">
                    {driftedResources > 0 ? 'Configuration Drift Detected' : 'No Drift Detected'}
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    {driftedResources > 0
                      ? `${driftedResources} resource(s) have drifted from the desired Git state`
                      : 'Cluster configuration matches Git repository state'}
                  </p>
                  <div className="flex flex-wrap gap-4 mt-3 text-sm text-muted-foreground">
                    {gitRepo && (
                      <div className="flex items-center gap-1.5">
                        <GitBranch className="w-4 h-4" />
                        <span>{gitRepo}</span>
                      </div>
                    )}
                    {gitBranch && (
                      <div className="flex items-center gap-1.5">
                        <ArrowRight className="w-4 h-4" />
                        <span>Branch: {gitBranch}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 rounded-lg border border-border bg-card/50">
                <div className={cn('text-2xl font-bold', severityStyle.text)}>
                  <SeverityIcon className="w-8 h-8" />
                </div>
                <div className="text-xs text-muted-foreground mt-1">{t('common.status')}</div>
              </div>
              <div className="p-4 rounded-lg border border-border bg-card/50">
                <div className={cn('text-2xl font-bold', driftedResources > 0 ? 'text-red-400' : 'text-green-400')}>
                  {driftedResources}
                </div>
                <div className="text-xs text-muted-foreground">{t('drilldown.drift.driftedResources')}</div>
              </div>
              <div className="p-4 rounded-lg border border-border bg-card/50">
                <div className="text-sm font-mono text-foreground truncate">{gitPath || '/'}</div>
                <div className="text-xs text-muted-foreground">{t('drilldown.drift.gitPath')}</div>
              </div>
              <div className="p-4 rounded-lg border border-border bg-card/50">
                <div className="text-sm text-foreground">
                  {lastChecked ? new Date(lastChecked).toLocaleString() : '-'}
                </div>
                <div className="text-xs text-muted-foreground">{t('drilldown.drift.lastChecked')}</div>
              </div>
            </div>

            {/* Git Source Info */}
            {gitRepo && (
              <div className="p-4 rounded-lg border border-border bg-card/50">
                <h4 className="text-sm font-medium text-foreground mb-3">{t('drilldown.drift.gitSource')}</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Repository:</span>
                    <span className="ml-2 text-foreground font-mono">{gitRepo}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Branch:</span>
                    <span className="ml-2 text-foreground">{gitBranch || 'main'}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Path:</span>
                    <span className="ml-2 text-foreground font-mono">{gitPath || '/'}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'changes' && (
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-foreground">Drifted Resources ({changes?.length || 0})</h4>
            {changesLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : changes && changes.length > 0 ? (
              <div className="space-y-2">
                {changes.map((change, i) => {
                  const changeStyle = getChangeTypeStyle(change.changeType)
                  return (
                    <div
                      key={i}
                      onClick={() => {
                        handleResourceClick(change)
                        setSelectedChange(change)
                      }}
                      className={cn(
                        'flex items-center justify-between p-3 rounded-lg border border-border bg-card/50',
                        (change.kind === 'Pod' || change.kind === 'Deployment') && change.namespace
                          ? 'cursor-pointer hover:bg-card/80 transition-colors'
                          : ''
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <span className={cn('px-2 py-0.5 rounded text-xs font-medium', changeStyle.bg, changeStyle.text)}>
                          {changeStyle.label}
                        </span>
                        <div>
                          <span className="text-sm font-medium text-foreground">{change.kind}/{change.name}</span>
                          {change.namespace && (
                            <span className="text-xs text-muted-foreground ml-2">({change.namespace})</span>
                          )}
                        </div>
                      </div>
                      {(change.kind === 'Pod' || change.kind === 'Deployment') && change.namespace && (
                        <svg className="w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <CheckCircle className="w-12 h-12 mx-auto mb-3 opacity-50 text-green-400" />
                <p className="text-green-400">{t('drilldown.drift.noDrifted')}</p>
                <p className="text-xs mt-1">{t('drilldown.drift.allMatch')}</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'diff' && (
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-foreground">{t('drilldown.drift.configDiff')}</h4>
            {selectedChange ? (
              <div className="space-y-4">
                <div className="p-3 rounded-lg bg-secondary/50">
                  <span className="text-sm text-foreground">
                    {selectedChange.kind}/{selectedChange.name}
                    {selectedChange.namespace && ` in ${selectedChange.namespace}`}
                  </span>
                </div>
                {selectedChange.diff ? (
                  <div className="p-4 rounded-lg border border-border bg-card/50">
                    <pre className="text-sm font-mono whitespace-pre-wrap overflow-x-auto">
                      {selectedChange.diff}
                    </pre>
                  </div>
                ) : selectedChange.fields && selectedChange.fields.length > 0 ? (
                  <div className="space-y-2">
                    {selectedChange.fields.map((field, i) => (
                      <div key={i} className="p-3 rounded-lg border border-border bg-card/50">
                        <div className="text-xs text-muted-foreground mb-2 font-mono">{field.path}</div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <span className="text-xs text-muted-foreground">Git:</span>
                            <pre className="text-sm text-green-400 mt-1">{field.gitValue}</pre>
                          </div>
                          <div>
                            <span className="text-xs text-muted-foreground">{t('drilldown.fields.cluster')}</span>
                            <pre className="text-sm text-red-400 mt-1">{field.clusterValue}</pre>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>{t('drilldown.drift.diffNotAvailable')}</p>
                    <p className="text-xs mt-1">{t('drilldown.drift.selectResourceChanges')}</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Diff className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>{t('drilldown.drift.selectResourceDiff')}</p>
                <p className="text-xs mt-1">{t('drilldown.drift.chooseDrifted')}</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'ai' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-foreground flex items-center gap-2">
                <ConsoleAIIcon className="w-5 h-5" />
                {t('drilldown.ai.title')}
              </h4>
              <button
                onClick={handleDiagnose}
                disabled={!isAgentConnected}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
              >
                <Stethoscope className="w-4 h-4" />
                Analyze Drift
              </button>
            </div>

            {!isAgentConnected ? (
              <div className="text-center py-12 text-muted-foreground">
                <ConsoleAIIcon className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>{t('drilldown.ai.notConnected')}</p>
                <p className="text-xs mt-1">{t('drilldown.ai.configureAgent')}</p>
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
                <p>{t('drilldown.drift.clickAnalyze')}</p>
                <p className="text-xs mt-1">{t('drilldown.drift.analyzeHint')}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
