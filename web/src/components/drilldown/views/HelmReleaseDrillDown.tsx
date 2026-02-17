import { useState, useEffect, useRef } from 'react'
import { useLocalAgent } from '../../../hooks/useLocalAgent'
import { LOCAL_AGENT_WS_URL } from '../../../lib/constants'
import { useDrillDownActions } from '../../../hooks/useDrillDown'
import { useMissions } from '../../../hooks/useMissions'
import { ClusterBadge } from '../../ui/ClusterBadge'
import {
  Ship, Info, Tag, Loader2, Copy, Check,
  Layers, Server, Clock, GitBranch, FileText,
  RefreshCw, Stethoscope, History, Box
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

type TabType = 'overview' | 'values' | 'history' | 'resources' | 'ai'

// Release status styles
const getStatusStyle = (status: string) => {
  const lower = status?.toLowerCase() || ''
  if (lower === 'deployed' || lower === 'superseded') {
    return { bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500/30' }
  }
  if (lower === 'pending-install' || lower === 'pending-upgrade' || lower === 'pending-rollback') {
    return { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/30' }
  }
  if (lower === 'failed' || lower === 'uninstalling') {
    return { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30' }
  }
  return { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30' }
}

interface HelmRelease {
  name: string
  namespace: string
  revision: string
  updated: string
  status: string
  chart: string
  app_version: string
}

interface HelmHistory {
  revision: number
  updated: string
  status: string
  chart: string
  app_version: string
  description: string
}

interface HelmHistoryRaw {
  revision: number
  updated: string
  status: string
  chart: string
  app_version: string
  description: string
}

export function HelmReleaseDrillDown({ data }: Props) {
  const { t } = useTranslation()
  const cluster = data.cluster as string
  const namespace = data.namespace as string
  const releaseName = data.release as string

  // Additional release data passed from the card
  const chartName = data.chart as string | undefined
  const chartVersion = data.chartVersion as string | undefined
  const appVersion = data.appVersion as string | undefined
  const releaseStatus = (data.status as string) || 'unknown'
  const releaseRevision = data.revision as string | undefined

  const { isConnected: agentConnected } = useLocalAgent()
  const { drillToNamespace, drillToCluster, drillToDeployment, drillToService } = useDrillDownActions()
  const { startMission } = useMissions()

  const [activeTab, setActiveTab] = useState<TabType>('overview')
  const [releaseInfo, setReleaseInfo] = useState<HelmRelease | null>(null)
  const [releaseValues, setReleaseValues] = useState<string | null>(null)
  const [valuesLoading, setValuesLoading] = useState(false)
  const [releaseHistory, setReleaseHistory] = useState<HelmHistory[] | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [releaseResources, setReleaseResources] = useState<string | null>(null)
  const [resourcesLoading, setResourcesLoading] = useState(false)
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [aiAnalysis] = useState<string | null>(null)
  const [aiAnalysisLoading] = useState(false)

  // Resource context for AI actions
  const resourceContext: ResourceContext = {
    kind: 'HelmRelease',
    name: releaseName,
    cluster,
    namespace,
    status: releaseStatus,
  }

  // Check for issues
  const hasIssues = releaseStatus.toLowerCase() === 'failed' ||
    releaseStatus.toLowerCase().includes('pending')
  const issues = hasIssues
    ? [{ name: releaseName, message: `Release status: ${releaseStatus}`, severity: 'warning' }]
    : []

  // Use modal AI hook
  const { defaultAIActions, handleAIAction, isAgentConnected } = useModalAI({
    resource: resourceContext,
    issues,
    additionalContext: {
      chartName,
      chartVersion,
      appVersion,
      releaseRevision,
    },
  })

  // Helper to run helm commands via the agent
  const runHelm = (args: string[]): Promise<string> => {
    return new Promise((resolve) => {
      const ws = new WebSocket(LOCAL_AGENT_WS_URL)
      const requestId = `helm-${Date.now()}-${Math.random().toString(36).slice(2)}`
      let output = ''

      const timeout = setTimeout(() => {
        ws.close()
        resolve(output || '')
      }, 15000) // Helm commands can take longer

      ws.onopen = () => {
        ws.send(JSON.stringify({
          id: requestId,
          type: 'helm',
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

  // Fetch release info
  const fetchReleaseInfo = async () => {
    if (!agentConnected) return
    try {
      const output = await runHelm(['status', releaseName, '-n', namespace, '-o', 'json'])
      if (output) {
        const info = JSON.parse(output)
        setReleaseInfo({
          name: info.name,
          namespace: info.namespace,
          revision: String(info.version || releaseRevision || '1'),
          updated: info.info?.last_deployed || '',
          status: info.info?.status || releaseStatus,
          chart: info.chart?.metadata?.name || chartName || '',
          app_version: info.chart?.metadata?.appVersion || appVersion || '',
        })
      }
    } catch {
      // Ignore parse errors
    }
  }

  // Fetch release values
  const fetchValues = async () => {
    if (!agentConnected || releaseValues) return
    setValuesLoading(true)
    try {
      const output = await runHelm(['get', 'values', releaseName, '-n', namespace, '-o', 'yaml'])
      setReleaseValues(output || 'No custom values configured')
    } catch {
      setReleaseValues('Error fetching values')
    }
    setValuesLoading(false)
  }

  // Fetch release history
  const fetchHistory = async () => {
    if (!agentConnected || releaseHistory) return
    setHistoryLoading(true)
    try {
      const output = await runHelm(['history', releaseName, '-n', namespace, '-o', 'json'])
      if (output) {
        const history = JSON.parse(output)
        setReleaseHistory(history.map((h: HelmHistoryRaw) => ({
          revision: h.revision,
          updated: h.updated,
          status: h.status,
          chart: h.chart,
          app_version: h.app_version,
          description: h.description,
        })))
      }
    } catch {
      setReleaseHistory([])
    }
    setHistoryLoading(false)
  }

  // Fetch release resources (manifest)
  const fetchResources = async () => {
    if (!agentConnected || releaseResources) return
    setResourcesLoading(true)
    try {
      const output = await runHelm(['get', 'manifest', releaseName, '-n', namespace])
      setReleaseResources(output || 'No resources found')
    } catch {
      setReleaseResources('Error fetching resources')
    }
    setResourcesLoading(false)
  }

  // Track if we've already loaded data
  const hasLoadedRef = useRef(false)

  useEffect(() => {
    if (!agentConnected || hasLoadedRef.current) return
    hasLoadedRef.current = true

    const loadData = async () => {
      await fetchReleaseInfo()
      await Promise.all([fetchHistory(), fetchValues()])
    }
    loadData()
  }, [agentConnected])

  // Load resources when tab is selected
  useEffect(() => {
    if (activeTab === 'resources' && !releaseResources && !resourcesLoading) {
      fetchResources()
    }
  }, [activeTab])

  const handleCopy = (field: string, value: string) => {
    navigator.clipboard.writeText(value)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 2000)
  }

  // Start AI diagnosis
  const handleDiagnose = () => {
    const prompt = `Analyze this Helm release "${releaseName}" in namespace "${namespace}".

Release Details:
- Name: ${releaseName}
- Chart: ${chartName || releaseInfo?.chart || 'Unknown'}
- Version: ${chartVersion || 'Unknown'}
- App Version: ${appVersion || releaseInfo?.app_version || 'Unknown'}
- Status: ${releaseStatus}
- Revision: ${releaseRevision || releaseInfo?.revision || 'Unknown'}

Please:
1. Check if the release is healthy
2. Identify any issues or misconfigurations
3. Compare with best practices for this chart
4. Suggest improvements or upgrades if available`

    startMission({
      title: `Diagnose Helm: ${releaseName}`,
      description: `Analyze Helm release health and configuration`,
      type: 'troubleshoot',
      cluster,
      initialPrompt: prompt,
      context: {
        kind: 'HelmRelease',
        name: releaseName,
        namespace,
        cluster,
        chart: chartName || releaseInfo?.chart,
        status: releaseStatus,
      },
    })
  }

  const statusStyle = getStatusStyle(releaseStatus)

  const TABS: { id: TabType; label: string; icon: typeof Info }[] = [
    { id: 'overview', label: t('drilldown.tabs.overview'), icon: Info },
    { id: 'values', label: t('drilldown.tabs.values'), icon: FileText },
    { id: 'history', label: t('drilldown.tabs.history'), icon: History },
    { id: 'resources', label: t('drilldown.tabs.resources'), icon: Box },
    { id: 'ai', label: t('drilldown.tabs.aiAnalysis'), icon: Stethoscope },
  ]

  // Parse resources to find deployments, services, etc.
  const parseResources = (manifest: string) => {
    const resources: Array<{ kind: string; name: string; namespace: string }> = []
    try {
      const docs = manifest.split('---').filter(d => d.trim())
      for (const doc of docs) {
        const kindMatch = doc.match(/kind:\s*(\w+)/)
        const nameMatch = doc.match(/name:\s*([^\s]+)/)
        const nsMatch = doc.match(/namespace:\s*([^\s]+)/)
        if (kindMatch && nameMatch) {
          resources.push({
            kind: kindMatch[1],
            name: nameMatch[1],
            namespace: nsMatch?.[1] || namespace,
          })
        }
      }
    } catch {
      // Ignore parsing errors
    }
    return resources
  }

  const parsedResources = releaseResources ? parseResources(releaseResources) : []

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
              <span className="text-muted-foreground">{t('drilldown.fields.namespace')}</span>
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
              <span className="text-muted-foreground">{t('drilldown.fields.cluster')}</span>
              <ClusterBadge cluster={cluster.split('/').pop() || cluster} size="sm" />
              <svg className="w-3 h-3 text-blue-400/50 group-hover:text-blue-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* Status badge */}
          <span className={cn('px-2.5 py-1 rounded-lg text-xs font-medium', statusStyle.bg, statusStyle.text, 'border', statusStyle.border)}>
            {releaseStatus.toUpperCase()}
          </span>
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
            {/* Release Info Card */}
            <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <div className="flex items-start gap-3">
                <Ship className="w-8 h-8 text-blue-400 mt-1" />
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-semibold text-foreground">{releaseName}</h3>
                  <div className="flex flex-wrap gap-4 mt-2 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <GitBranch className="w-4 h-4" />
                      <span>Chart: {chartName || releaseInfo?.chart || t('common.loading')}</span>
                    </div>
                    {(chartVersion || releaseInfo?.app_version) && (
                      <div className="flex items-center gap-1.5">
                        <Tag className="w-4 h-4" />
                        <span>App: {appVersion || releaseInfo?.app_version}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-1.5">
                      <RefreshCw className="w-4 h-4" />
                      <span>Revision: {releaseRevision || releaseInfo?.revision || '1'}</span>
                    </div>
                  </div>
                  {releaseInfo?.updated && (
                    <div className="flex items-center gap-1.5 mt-2 text-xs text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      <span>Updated: {new Date(releaseInfo.updated).toLocaleString()}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 rounded-lg border border-border bg-card/50">
                <div className="text-2xl font-bold text-foreground">{releaseHistory?.length || '-'}</div>
                <div className="text-xs text-muted-foreground">{t('drilldown.helm.revisions')}</div>
              </div>
              <div className="p-4 rounded-lg border border-border bg-card/50">
                <div className="text-2xl font-bold text-foreground">{parsedResources.filter(r => r.kind === 'Deployment').length}</div>
                <div className="text-xs text-muted-foreground">{t('common.deployments')}</div>
              </div>
              <div className="p-4 rounded-lg border border-border bg-card/50">
                <div className="text-2xl font-bold text-foreground">{parsedResources.filter(r => r.kind === 'Service').length}</div>
                <div className="text-xs text-muted-foreground">{t('common.services')}</div>
              </div>
              <div className="p-4 rounded-lg border border-border bg-card/50">
                <div className="text-2xl font-bold text-foreground">{parsedResources.length}</div>
                <div className="text-xs text-muted-foreground">{t('drilldown.helm.totalResources')}</div>
              </div>
            </div>

            {/* Deployed Resources Quick View */}
            {parsedResources.length > 0 && (
              <div className="p-4 rounded-lg border border-border bg-card/50">
                <h4 className="text-sm font-medium text-foreground mb-3">{t('drilldown.helm.deployedResources')}</h4>
                <div className="flex flex-wrap gap-2">
                  {parsedResources.slice(0, 10).map((resource, i) => (
                    <button
                      key={`${resource.kind}-${resource.name}-${i}`}
                      onClick={() => {
                        if (resource.kind === 'Deployment') {
                          drillToDeployment(cluster, resource.namespace, resource.name)
                        } else if (resource.kind === 'Service') {
                          drillToService(cluster, resource.namespace, resource.name)
                        }
                      }}
                      className={cn(
                        'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors',
                        resource.kind === 'Deployment'
                          ? 'bg-green-500/10 border border-green-500/30 text-green-400 hover:bg-green-500/20'
                          : resource.kind === 'Service'
                          ? 'bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20'
                          : 'bg-gray-500/10 border border-gray-500/30 text-gray-400'
                      )}
                    >
                      <span>{resource.kind}:</span>
                      <span className="font-mono">{resource.name}</span>
                    </button>
                  ))}
                  {parsedResources.length > 10 && (
                    <button
                      onClick={() => setActiveTab('resources')}
                      className="text-xs text-primary hover:underline"
                    >
                      +{parsedResources.length - 10} more
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'values' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-foreground">{t('drilldown.helm.releaseValues')}</h4>
              {releaseValues && (
                <button
                  onClick={() => handleCopy('values', releaseValues)}
                  className="flex items-center gap-1 px-2 py-1 rounded text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {copiedField === 'values' ? (
                    <Check className="w-3 h-3 text-green-400" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                  Copy
                </button>
              )}
            </div>
            {valuesLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : releaseValues ? (
              <pre className="p-4 rounded-lg bg-card border border-border overflow-x-auto text-xs font-mono text-foreground max-h-[500px]">
                {releaseValues}
              </pre>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>{t('drilldown.helm.noValues')}</p>
                <p className="text-xs mt-1">{t('drilldown.helm.connectValues')}</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'history' && (
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-foreground">{t('drilldown.helm.releaseHistory')}</h4>
            {historyLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : releaseHistory && releaseHistory.length > 0 ? (
              <div className="space-y-2">
                {releaseHistory.sort((a, b) => b.revision - a.revision).map((rev) => {
                  const revStatus = getStatusStyle(rev.status)
                  return (
                    <div
                      key={rev.revision}
                      className="flex items-center justify-between p-3 rounded-lg border border-border bg-card/50 hover:bg-card/80 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-secondary text-sm font-medium">
                          {rev.revision}
                        </div>
                        <div>
                          <div className="text-sm text-foreground">{rev.chart}</div>
                          <div className="text-xs text-muted-foreground">{rev.description}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={cn('px-2 py-0.5 rounded text-xs', revStatus.bg, revStatus.text)}>
                          {rev.status}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(rev.updated).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <History className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>{t('drilldown.helm.noHistory')}</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'resources' && (
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-foreground">{t('drilldown.helm.manifestResources')}</h4>
            {resourcesLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : parsedResources.length > 0 ? (
              <div className="space-y-2">
                {parsedResources.map((resource, i) => (
                  <div
                    key={`${resource.kind}-${resource.name}-${i}`}
                    className="flex items-center justify-between p-3 rounded-lg border border-border bg-card/50 hover:bg-card/80 transition-colors cursor-pointer"
                    onClick={() => {
                      if (resource.kind === 'Deployment') {
                        drillToDeployment(cluster, resource.namespace, resource.name)
                      } else if (resource.kind === 'Service') {
                        drillToService(cluster, resource.namespace, resource.name)
                      }
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <Box className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm font-medium text-foreground">{resource.name}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{resource.kind}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Box className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>{t('drilldown.helm.noResources')}</p>
                <p className="text-xs mt-1">{t('drilldown.helm.connectManifest')}</p>
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
                {t('drilldown.helm.analyzeRelease')}
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
                <p>{t('drilldown.helm.clickAnalyze')}</p>
                <p className="text-xs mt-1">{t('drilldown.helm.analyzeHint')}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
