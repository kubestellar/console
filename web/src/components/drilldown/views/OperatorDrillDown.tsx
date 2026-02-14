import { useState, useEffect, useRef } from 'react'
import { useLocalAgent } from '../../../hooks/useLocalAgent'
import { useDrillDownActions } from '../../../hooks/useDrillDown'
import { useMissions } from '../../../hooks/useMissions'
import { ClusterBadge } from '../../ui/ClusterBadge'
import {
  Settings, Info, Loader2,
  Layers, Server, RefreshCw, Stethoscope,
  CheckCircle, XCircle, AlertTriangle,
  Package, FileText, ExternalLink
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

type TabType = 'overview' | 'csv' | 'crds' | 'ai'

// Operator phase styles
const getPhaseStyle = (phase: string) => {
  const lower = phase?.toLowerCase() || ''
  if (lower === 'succeeded' || lower === 'installed') {
    return { bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500/30', icon: CheckCircle }
  }
  if (lower === 'installing' || lower === 'pending' || lower === 'installready') {
    return { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30', icon: RefreshCw }
  }
  if (lower === 'failed' || lower === 'unknown') {
    return { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30', icon: XCircle }
  }
  if (lower === 'upgrading' || lower === 'replacing') {
    return { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/30', icon: RefreshCw }
  }
  return { bg: 'bg-gray-500/20', text: 'text-gray-400', border: 'border-gray-500/30', icon: AlertTriangle }
}

interface CSVInfo {
  name: string
  displayName: string
  version: string
  phase: string
  description?: string
  provider?: string
  maturity?: string
  maintainers?: Array<{ name: string; email?: string }>
  links?: Array<{ name: string; url: string }>
  installModes?: Array<{ type: string; supported: boolean }>
}

interface CRDInfo {
  name: string
  kind: string
  version: string
  description?: string
}

interface CRDRaw {
  name: string
  kind: string
  version: string
  description?: string
}

export function OperatorDrillDown({ data }: Props) {
  const { t } = useTranslation()
  const cluster = data.cluster as string
  const namespace = data.namespace as string
  const operatorName = data.operator as string

  // Additional operator data passed from the card
  const subscriptionName = data.subscription as string | undefined
  const operatorPhase = (data.phase as string) || 'Unknown'
  const channel = data.channel as string | undefined
  const source = data.source as string | undefined
  const sourceNamespace = data.sourceNamespace as string | undefined
  const currentCSV = data.currentCSV as string | undefined

  const { isConnected: agentConnected } = useLocalAgent()
  const { drillToNamespace, drillToCluster, drillToCRD } = useDrillDownActions()
  const { startMission } = useMissions()

  const [activeTab, setActiveTab] = useState<TabType>('overview')
  const [csvInfo, setCsvInfo] = useState<CSVInfo | null>(null)
  const [csvLoading, setCsvLoading] = useState(false)
  const [operatorCRDs, setOperatorCRDs] = useState<CRDInfo[] | null>(null)
  const [crdsLoading, setCrdsLoading] = useState(false)
  const [subscriptionYaml, setSubscriptionYaml] = useState<string | null>(null)
  const [aiAnalysis] = useState<string | null>(null)
  const [aiAnalysisLoading] = useState(false)

  // Resource context for AI actions
  const resourceContext: ResourceContext = {
    kind: 'Operator',
    name: operatorName,
    cluster,
    namespace,
    status: operatorPhase,
  }

  // Check for issues
  const hasIssues = operatorPhase.toLowerCase() === 'failed' ||
    operatorPhase.toLowerCase() === 'unknown'
  const issues = hasIssues
    ? [{ name: operatorName, message: `Operator phase: ${operatorPhase}`, severity: 'warning' }]
    : []

  // Use modal AI hook
  const { defaultAIActions, handleAIAction, isAgentConnected } = useModalAI({
    resource: resourceContext,
    issues,
    additionalContext: {
      channel,
      source,
      currentCSV,
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

  // Fetch CSV info
  const fetchCSVInfo = async () => {
    if (!agentConnected || csvInfo) return
    setCsvLoading(true)
    try {
      const csvName = currentCSV || operatorName
      const output = await runKubectl([
        'get', 'clusterserviceversion', csvName, '-n', namespace, '-o', 'json'
      ])
      if (output) {
        const csv = JSON.parse(output)
        setCsvInfo({
          name: csv.metadata?.name || csvName,
          displayName: csv.spec?.displayName || csv.metadata?.name || csvName,
          version: csv.spec?.version || 'Unknown',
          phase: csv.status?.phase || 'Unknown',
          description: csv.spec?.description,
          provider: csv.spec?.provider?.name,
          maturity: csv.spec?.maturity,
          maintainers: csv.spec?.maintainers,
          links: csv.spec?.links,
          installModes: csv.spec?.installModes,
        })
      }
    } catch {
      // Fallback - create from available data
      setCsvInfo({
        name: currentCSV || operatorName,
        displayName: operatorName,
        version: 'Unknown',
        phase: operatorPhase,
      })
    }
    setCsvLoading(false)
  }

  // Fetch operator CRDs
  const fetchCRDs = async () => {
    if (!agentConnected || operatorCRDs) return
    setCrdsLoading(true)
    try {
      const csvName = currentCSV || operatorName
      const output = await runKubectl([
        'get', 'clusterserviceversion', csvName, '-n', namespace, '-o', 'json'
      ])
      if (output) {
        const csv = JSON.parse(output)
        const crds = csv.spec?.customresourcedefinitions?.owned || []
        setOperatorCRDs(crds.map((crd: CRDRaw) => ({
          name: crd.name,
          kind: crd.kind,
          version: crd.version,
          description: crd.description,
        })))
      }
    } catch {
      setOperatorCRDs([])
    }
    setCrdsLoading(false)
  }

  // Fetch subscription YAML
  const fetchSubscription = async () => {
    if (!agentConnected || subscriptionYaml) return
    try {
      const subName = subscriptionName || operatorName
      const output = await runKubectl([
        'get', 'subscription', subName, '-n', namespace, '-o', 'yaml'
      ])
      setSubscriptionYaml(output || 'Subscription not found')
    } catch {
      setSubscriptionYaml('Error fetching subscription')
    }
  }

  // Track if we've already loaded data
  const hasLoadedRef = useRef(false)

  useEffect(() => {
    if (!agentConnected || hasLoadedRef.current) return
    hasLoadedRef.current = true

    const loadData = async () => {
      await Promise.all([fetchCSVInfo(), fetchCRDs(), fetchSubscription()])
    }
    loadData()
  }, [agentConnected])

  // Start AI diagnosis
  const handleDiagnose = () => {
    const prompt = `Analyze this Operator "${operatorName}" in namespace "${namespace}".

Operator Details:
- Name: ${operatorName}
- Phase: ${operatorPhase}
- Channel: ${channel || 'default'}
- Source: ${source || 'Unknown'} / ${sourceNamespace || 'Unknown'}
- Current CSV: ${currentCSV || 'Unknown'}

${csvInfo ? `
CSV Information:
- Display Name: ${csvInfo.displayName}
- Version: ${csvInfo.version}
- Provider: ${csvInfo.provider || 'Unknown'}
- Maturity: ${csvInfo.maturity || 'Unknown'}
` : ''}

Please:
1. Assess the operator health and installation status
2. Check for version updates or deprecated APIs
3. Verify the subscription configuration
4. Identify any issues or misconfigurations
5. Suggest best practices for operator management`

    startMission({
      title: `Diagnose Operator: ${operatorName}`,
      description: `Analyze OLM operator health and configuration`,
      type: 'troubleshoot',
      cluster,
      initialPrompt: prompt,
      context: {
        kind: 'Operator',
        name: operatorName,
        namespace,
        cluster,
        phase: operatorPhase,
        channel,
      },
    })
  }

  const phaseStyle = getPhaseStyle(operatorPhase)
  const PhaseIcon = phaseStyle.icon

  const TABS: { id: TabType; label: string; icon: typeof Info }[] = [
    { id: 'overview', label: t('drilldown.tabs.overview'), icon: Info },
    { id: 'csv', label: t('drilldown.tabs.csvDetails'), icon: FileText },
    { id: 'crds', label: t('drilldown.tabs.crds'), icon: Package },
    { id: 'ai', label: t('drilldown.tabs.aiAnalysis'), icon: Stethoscope },
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

          {/* Phase badge */}
          <span className={cn('px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1', phaseStyle.bg, phaseStyle.text, 'border', phaseStyle.border)}>
            <PhaseIcon className="w-3 h-3" />
            {operatorPhase}
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
            {/* Operator Info Card */}
            <div className="p-4 rounded-lg bg-gradient-to-r from-purple-500/10 to-indigo-500/10 border border-purple-500/20">
              <div className="flex items-start gap-3">
                <Settings className="w-8 h-8 text-purple-400 mt-1" />
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-semibold text-foreground">
                    {csvInfo?.displayName || operatorName}
                  </h3>
                  {csvInfo?.description && (
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{csvInfo.description}</p>
                  )}
                  <div className="flex flex-wrap gap-4 mt-3 text-sm text-muted-foreground">
                    {csvInfo?.version && (
                      <div className="flex items-center gap-1.5">
                        <Package className="w-4 h-4" />
                        <span>Version: {csvInfo.version}</span>
                      </div>
                    )}
                    {channel && (
                      <div className="flex items-center gap-1.5">
                        <RefreshCw className="w-4 h-4" />
                        <span>Channel: {channel}</span>
                      </div>
                    )}
                    {csvInfo?.provider && (
                      <div className="flex items-center gap-1.5">
                        <Settings className="w-4 h-4" />
                        <span>Provider: {csvInfo.provider}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Subscription Info */}
            <div className="p-4 rounded-lg border border-border bg-card/50">
              <h4 className="text-sm font-medium text-foreground mb-3">{t('drilldown.operator.subscription')}</h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">{t('drilldown.operator.name')}</span>
                  <span className="ml-2 text-foreground">{subscriptionName || operatorName}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">{t('drilldown.operator.channel')}</span>
                  <span className="ml-2 text-foreground">{channel || 'default'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">{t('drilldown.fields.source')}</span>
                  <span className="ml-2 text-foreground">{source || 'Unknown'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">{t('drilldown.operator.sourceNs')}</span>
                  <span className="ml-2 text-foreground">{sourceNamespace || 'Unknown'}</span>
                </div>
              </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-lg border border-border bg-card/50">
                <div className={cn('text-2xl font-bold', phaseStyle.text)}>
                  <PhaseIcon className="w-8 h-8" />
                </div>
                <div className="text-xs text-muted-foreground mt-1">{t('common.status')}</div>
              </div>
              <div className="p-4 rounded-lg border border-border bg-card/50">
                <div className="text-2xl font-bold text-foreground">{operatorCRDs?.length || '-'}</div>
                <div className="text-xs text-muted-foreground">{t('drilldown.tabs.crds')}</div>
              </div>
              <div className="p-4 rounded-lg border border-border bg-card/50">
                <div className="text-sm font-mono text-foreground truncate">{csvInfo?.version || '-'}</div>
                <div className="text-xs text-muted-foreground">{t('common.version')}</div>
              </div>
            </div>

            {/* Links */}
            {csvInfo?.links && csvInfo.links.length > 0 && (
              <div className="p-4 rounded-lg border border-border bg-card/50">
                <h4 className="text-sm font-medium text-foreground mb-3">{t('drilldown.operator.links')}</h4>
                <div className="flex flex-wrap gap-2">
                  {csvInfo.links.map((link, i) => (
                    <a
                      key={i}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-secondary/50 text-sm text-foreground hover:bg-secondary transition-colors"
                    >
                      <ExternalLink className="w-3 h-3" />
                      {link.name}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'csv' && (
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-foreground">{t('drilldown.operator.csvDetails')}</h4>
            {csvLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : csvInfo ? (
              <div className="space-y-4">
                <div className="p-4 rounded-lg border border-border bg-card/50">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Name:</span>
                      <span className="ml-2 text-foreground font-mono">{csvInfo.name}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Display Name:</span>
                      <span className="ml-2 text-foreground">{csvInfo.displayName}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Version:</span>
                      <span className="ml-2 text-foreground">{csvInfo.version}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Phase:</span>
                      <span className={cn('ml-2 px-2 py-0.5 rounded text-xs', phaseStyle.bg, phaseStyle.text)}>{csvInfo.phase}</span>
                    </div>
                    {csvInfo.maturity && (
                      <div>
                        <span className="text-muted-foreground">Maturity:</span>
                        <span className="ml-2 text-foreground capitalize">{csvInfo.maturity}</span>
                      </div>
                    )}
                    {csvInfo.provider && (
                      <div>
                        <span className="text-muted-foreground">Provider:</span>
                        <span className="ml-2 text-foreground">{csvInfo.provider}</span>
                      </div>
                    )}
                  </div>
                </div>

                {csvInfo.maintainers && csvInfo.maintainers.length > 0 && (
                  <div className="p-4 rounded-lg border border-border bg-card/50">
                    <h5 className="text-sm font-medium text-foreground mb-2">{t('drilldown.operator.maintainers')}</h5>
                    <div className="space-y-1">
                      {csvInfo.maintainers.map((m, i) => (
                        <div key={i} className="text-sm text-muted-foreground">
                          {m.name} {m.email && `<${m.email}>`}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {csvInfo.installModes && (
                  <div className="p-4 rounded-lg border border-border bg-card/50">
                    <h5 className="text-sm font-medium text-foreground mb-2">{t('drilldown.operator.installModes')}</h5>
                    <div className="flex flex-wrap gap-2">
                      {csvInfo.installModes.map((mode) => (
                        <span
                          key={mode.type}
                          className={cn(
                            'px-2 py-1 rounded text-xs',
                            mode.supported
                              ? 'bg-green-500/20 text-green-400'
                              : 'bg-red-500/20 text-red-400'
                          )}
                        >
                          {mode.type}: {mode.supported ? t('drilldown.operator.yes') : t('drilldown.operator.no')}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>{t('drilldown.operator.csvNotAvailable')}</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'crds' && (
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-foreground">{t('drilldown.operator.ownedCRDs', { count: operatorCRDs?.length || 0 })}</h4>
            {crdsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : operatorCRDs && operatorCRDs.length > 0 ? (
              <div className="space-y-2">
                {operatorCRDs.map((crd) => (
                  <div
                    key={crd.name}
                    onClick={() => drillToCRD(cluster, crd.name)}
                    className="flex items-center justify-between p-3 rounded-lg border border-border bg-card/50 hover:bg-card/80 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <Package className="w-4 h-4 text-purple-400" />
                      <div>
                        <span className="text-sm font-medium text-foreground">{crd.kind}</span>
                        <span className="text-xs text-muted-foreground ml-2">({crd.version})</span>
                        {crd.description && (
                          <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-md">{crd.description}</p>
                        )}
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground font-mono">{crd.name}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>{t('drilldown.operator.noCRDs')}</p>
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
                {t('drilldown.operator.analyzeOperator')}
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
                <p>{t('drilldown.operator.clickAnalyze')}</p>
                <p className="text-xs mt-1">{t('drilldown.operator.analyzeHint')}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
