import { useState, useEffect, useRef } from 'react'
import { useLocalAgent } from '../../../hooks/useLocalAgent'
import { useDrillDownActions } from '../../../hooks/useDrillDown'
import { useMissions } from '../../../hooks/useMissions'
import { ClusterBadge } from '../../ui/ClusterBadge'
import {
  Layers, Info, Loader2, Server, RefreshCw, Stethoscope,
  CheckCircle, XCircle, AlertTriangle,
  FileText, GitBranch, Clock, Package
} from 'lucide-react'
import { cn } from '../../../lib/cn'
import { ConsoleAIIcon } from '../../ui/ConsoleAIIcon'
import {
  AIActionBar,
  useModalAI,
  type ResourceContext,
} from '../../modals'

interface Props {
  data: Record<string, unknown>
}

type TabType = 'overview' | 'resources' | 'conditions' | 'ai'

// Status styles
const getStatusStyle = (status: string) => {
  const lower = status?.toLowerCase() || ''
  if (lower === 'ready' || lower === 'true' || lower === 'applied' || lower === 'succeeded') {
    return { bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500/30', icon: CheckCircle }
  }
  if (lower === 'reconciling' || lower === 'progressing') {
    return { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30', icon: RefreshCw }
  }
  if (lower === 'failed' || lower === 'false' || lower === 'error') {
    return { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30', icon: XCircle }
  }
  if (lower === 'stalled' || lower === 'suspended') {
    return { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/30', icon: AlertTriangle }
  }
  return { bg: 'bg-gray-500/20', text: 'text-gray-400', border: 'border-gray-500/30', icon: AlertTriangle }
}

interface AppliedResource {
  kind: string
  name: string
  namespace?: string
  apiVersion?: string
}

interface InventoryEntryRaw {
  id?: string
  v?: string
}

interface Condition {
  type: string
  status: string
  reason?: string
  message?: string
  lastTransitionTime?: string
}

interface ConditionRaw {
  type: string
  status: string
  reason?: string
  message?: string
  lastTransitionTime?: string
}

export function KustomizationDrillDown({ data }: Props) {
  const cluster = data.cluster as string
  const namespace = data.namespace as string
  const kustomizationName = data.kustomization as string

  // Additional kustomization data
  const kustomizationStatus = (data.status as string) || 'Unknown'
  const sourceRef = data.sourceRef as { kind?: string; name?: string } | undefined
  const path = data.path as string | undefined
  const interval = data.interval as string | undefined
  const lastAppliedRevision = data.lastAppliedRevision as string | undefined
  const suspended = data.suspended as boolean | undefined

  const { isConnected: agentConnected } = useLocalAgent()
  const { drillToNamespace, drillToCluster, drillToPod, drillToDeployment } = useDrillDownActions()
  const { startMission } = useMissions()

  const [activeTab, setActiveTab] = useState<TabType>('overview')
  const [appliedResources, setAppliedResources] = useState<AppliedResource[] | null>(null)
  const [resourcesLoading, setResourcesLoading] = useState(false)
  const [conditions, setConditions] = useState<Condition[] | null>(null)
  const [conditionsLoading, setConditionsLoading] = useState(false)
  const [aiAnalysis] = useState<string | null>(null)
  const [aiAnalysisLoading] = useState(false)

  // Resource context for AI actions
  const resourceContext: ResourceContext = {
    kind: 'Custom',
    name: kustomizationName,
    cluster,
    namespace,
    status: kustomizationStatus,
  }

  // Check for issues
  const hasIssues = kustomizationStatus.toLowerCase() === 'failed' ||
    kustomizationStatus.toLowerCase() === 'false' ||
    suspended === true
  const issues = hasIssues
    ? [{ name: kustomizationName, message: suspended ? 'Kustomization suspended' : `Status: ${kustomizationStatus}`, severity: 'warning' }]
    : []

  // Use modal AI hook
  const { defaultAIActions, handleAIAction, isAgentConnected } = useModalAI({
    resource: resourceContext,
    issues,
    additionalContext: {
      path,
      sourceRef,
      lastAppliedRevision,
      suspended,
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

  // Fetch kustomization details
  const fetchDetails = async () => {
    if (!agentConnected || appliedResources) return
    setResourcesLoading(true)
    setConditionsLoading(true)
    try {
      const output = await runKubectl([
        'get', 'kustomization', kustomizationName, '-n', namespace, '-o', 'json'
      ])
      if (output) {
        const ks = JSON.parse(output)
        // Get applied resources from inventory
        const inventory = ks.status?.inventory?.entries || []
        setAppliedResources(inventory.map((entry: InventoryEntryRaw) => {
          // Parse inventory entry format: namespace_name_group_kind
          const parts = entry.id?.split('_') || []
          return {
            namespace: parts[0] || undefined,
            name: parts[1] || entry.id || 'Unknown',
            kind: parts[3] || 'Unknown',
            apiVersion: entry.v || undefined,
          }
        }))

        // Get conditions
        const conds = ks.status?.conditions || []
        setConditions(conds.map((c: ConditionRaw) => ({
          type: c.type,
          status: c.status,
          reason: c.reason,
          message: c.message,
          lastTransitionTime: c.lastTransitionTime,
        })))
      }
    } catch {
      setAppliedResources([])
      setConditions([])
    }
    setResourcesLoading(false)
    setConditionsLoading(false)
  }

  // Track if we've already loaded data
  const hasLoadedRef = useRef(false)

  useEffect(() => {
    if (!agentConnected || hasLoadedRef.current) return
    hasLoadedRef.current = true
    fetchDetails()
  }, [agentConnected])

  // Navigate to resource
  const handleResourceClick = (resource: AppliedResource) => {
    if (resource.kind === 'Pod' && resource.namespace) {
      drillToPod(cluster, resource.namespace, resource.name)
    } else if (resource.kind === 'Deployment' && resource.namespace) {
      drillToDeployment(cluster, resource.namespace, resource.name)
    }
  }

  // Start AI diagnosis
  const handleDiagnose = () => {
    const readyCondition = conditions?.find(c => c.type === 'Ready')
    const prompt = `Analyze this Flux Kustomization "${kustomizationName}" in namespace "${namespace}".

Kustomization Details:
- Name: ${kustomizationName}
- Status: ${kustomizationStatus}
- Suspended: ${suspended ? 'Yes' : 'No'}
- Path: ${path || '/'}
- Source: ${sourceRef?.kind || 'Unknown'}/${sourceRef?.name || 'Unknown'}
- Interval: ${interval || 'Unknown'}
- Last Applied Revision: ${lastAppliedRevision || 'None'}

${readyCondition ? `
Ready Condition:
- Status: ${readyCondition.status}
- Reason: ${readyCondition.reason || 'Unknown'}
- Message: ${readyCondition.message || 'None'}
` : ''}

Applied Resources: ${appliedResources?.length || 0}

Please:
1. Assess the kustomization health and sync status
2. Identify any drift or reconciliation issues
3. Check for dependency problems
4. Analyze the Ready condition for root causes
5. Suggest improvements for GitOps best practices`

    startMission({
      title: `Diagnose Kustomization: ${kustomizationName}`,
      description: `Analyze Flux Kustomization health and sync status`,
      type: 'troubleshoot',
      cluster,
      initialPrompt: prompt,
      context: {
        kind: 'Kustomization',
        name: kustomizationName,
        namespace,
        cluster,
        status: kustomizationStatus,
        sourceRef,
        path,
      },
    })
  }

  const statusStyle = getStatusStyle(kustomizationStatus)
  const StatusIcon = statusStyle.icon

  const TABS: { id: TabType; label: string; icon: typeof Info }[] = [
    { id: 'overview', label: 'Overview', icon: Info },
    { id: 'resources', label: `Resources (${appliedResources?.length || 0})`, icon: Package },
    { id: 'conditions', label: 'Conditions', icon: FileText },
    { id: 'ai', label: 'AI Analysis', icon: Stethoscope },
  ]

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
            {suspended && (
              <span className="px-2.5 py-1 rounded-lg text-xs font-medium bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
                Suspended
              </span>
            )}
            <span className={cn('px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1', statusStyle.bg, statusStyle.text, 'border', statusStyle.border)}>
              <StatusIcon className="w-3 h-3" />
              {kustomizationStatus}
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
            {/* Kustomization Info Card */}
            <div className="p-4 rounded-lg bg-gradient-to-r from-indigo-500/10 to-purple-500/10 border border-indigo-500/20">
              <div className="flex items-start gap-3">
                <Layers className="w-8 h-8 text-indigo-400 mt-1" />
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-semibold text-foreground">{kustomizationName}</h3>
                  <div className="flex flex-wrap gap-4 mt-2 text-sm text-muted-foreground">
                    {path && (
                      <div className="flex items-center gap-1.5">
                        <FileText className="w-4 h-4" />
                        <span>Path: {path}</span>
                      </div>
                    )}
                    {interval && (
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-4 h-4" />
                        <span>Interval: {interval}</span>
                      </div>
                    )}
                    {sourceRef && (
                      <div className="flex items-center gap-1.5">
                        <GitBranch className="w-4 h-4" />
                        <span>Source: {sourceRef.kind}/{sourceRef.name}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 rounded-lg border border-border bg-card/50">
                <div className={cn('text-2xl font-bold', statusStyle.text)}>
                  <StatusIcon className="w-8 h-8" />
                </div>
                <div className="text-xs text-muted-foreground mt-1">Status</div>
              </div>
              <div className="p-4 rounded-lg border border-border bg-card/50">
                <div className="text-2xl font-bold text-foreground">{appliedResources?.length || '-'}</div>
                <div className="text-xs text-muted-foreground">Resources</div>
              </div>
              <div className="p-4 rounded-lg border border-border bg-card/50">
                <div className={cn('text-sm font-medium', suspended ? 'text-yellow-400' : 'text-green-400')}>
                  {suspended ? 'Yes' : 'No'}
                </div>
                <div className="text-xs text-muted-foreground">Suspended</div>
              </div>
              <div className="p-4 rounded-lg border border-border bg-card/50">
                <div className="text-sm font-mono text-foreground truncate" title={lastAppliedRevision}>
                  {lastAppliedRevision?.slice(0, 12) || '-'}
                </div>
                <div className="text-xs text-muted-foreground">Last Revision</div>
              </div>
            </div>

            {/* Source Reference */}
            {sourceRef && (
              <div className="p-4 rounded-lg border border-border bg-card/50">
                <h4 className="text-sm font-medium text-foreground mb-3">Source Reference</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Kind:</span>
                    <span className="ml-2 text-foreground">{sourceRef.kind || 'Unknown'}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Name:</span>
                    <span className="ml-2 text-foreground">{sourceRef.name || 'Unknown'}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'resources' && (
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-foreground">Applied Resources ({appliedResources?.length || 0})</h4>
            {resourcesLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : appliedResources && appliedResources.length > 0 ? (
              <div className="space-y-2">
                {appliedResources.map((resource, i) => (
                  <div
                    key={i}
                    onClick={() => handleResourceClick(resource)}
                    className={cn(
                      'flex items-center justify-between p-3 rounded-lg border border-border bg-card/50',
                      (resource.kind === 'Pod' || resource.kind === 'Deployment') && resource.namespace
                        ? 'cursor-pointer hover:bg-card/80 transition-colors'
                        : ''
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <Package className="w-4 h-4 text-indigo-400" />
                      <div>
                        <span className="text-sm font-medium text-foreground">{resource.name}</span>
                        {resource.namespace && (
                          <span className="text-xs text-muted-foreground ml-2">({resource.namespace})</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{resource.kind}</span>
                      {(resource.kind === 'Pod' || resource.kind === 'Deployment') && resource.namespace && (
                        <svg className="w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No resources found</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'conditions' && (
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-foreground">Conditions</h4>
            {conditionsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : conditions && conditions.length > 0 ? (
              <div className="space-y-3">
                {conditions.map((condition, i) => {
                  const condStyle = getStatusStyle(condition.status)
                  const CondIcon = condStyle.icon
                  return (
                    <div key={i} className={cn('p-4 rounded-lg border', condStyle.border, condStyle.bg)}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <CondIcon className={cn('w-4 h-4', condStyle.text)} />
                          <span className="text-sm font-medium text-foreground">{condition.type}</span>
                        </div>
                        <span className={cn('px-2 py-0.5 rounded text-xs font-medium', condStyle.bg, condStyle.text)}>
                          {condition.status}
                        </span>
                      </div>
                      {condition.reason && (
                        <div className="text-sm text-foreground mb-1">
                          Reason: {condition.reason}
                        </div>
                      )}
                      {condition.message && (
                        <div className="text-sm text-muted-foreground">{condition.message}</div>
                      )}
                      {condition.lastTransitionTime && (
                        <div className="text-xs text-muted-foreground mt-2">
                          Last Transition: {new Date(condition.lastTransitionTime).toLocaleString()}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No conditions available</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'ai' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-foreground flex items-center gap-2">
                <ConsoleAIIcon className="w-5 h-5" />
                AI Analysis
              </h4>
              <button
                onClick={handleDiagnose}
                disabled={!isAgentConnected}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
              >
                <Stethoscope className="w-4 h-4" />
                Analyze Kustomization
              </button>
            </div>

            {!isAgentConnected ? (
              <div className="text-center py-12 text-muted-foreground">
                <ConsoleAIIcon className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>AI agent not connected</p>
                <p className="text-xs mt-1">Configure the local agent in Settings to enable AI analysis</p>
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
                <p>Click "Analyze Kustomization" to get AI-powered analysis</p>
                <p className="text-xs mt-1">AI will analyze the kustomization and suggest improvements</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
