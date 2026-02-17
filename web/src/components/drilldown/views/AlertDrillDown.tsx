import { useState, useEffect, useRef } from 'react'
import { useLocalAgent } from '../../../hooks/useLocalAgent'
import { useDrillDownActions } from '../../../hooks/useDrillDown'
import { useMissions } from '../../../hooks/useMissions'
import { ClusterBadge } from '../../ui/ClusterBadge'
import {
  Bell, Info, Tag, Loader2, Copy, Check,
  Layers, Server, AlertTriangle, Clock, ExternalLink, Stethoscope,
  Code
} from 'lucide-react'
import { cn } from '../../../lib/cn'
import { LOCAL_AGENT_WS_URL } from '../../../lib/constants'
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

type TabType = 'overview' | 'labels' | 'source' | 'history' | 'ai'

// Alert severity styles
const getSeverityStyle = (severity: string) => {
  const lower = severity?.toLowerCase() || ''
  if (lower === 'critical' || lower === 'page') {
    return { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30', icon: 'text-red-400' }
  }
  if (lower === 'warning' || lower === 'warn') {
    return { bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/30', icon: 'text-orange-400' }
  }
  if (lower === 'info') {
    return { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30', icon: 'text-blue-400' }
  }
  return { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/30', icon: 'text-yellow-400' }
}

// Alert state styles
const getStateStyle = (state: string) => {
  const lower = state?.toLowerCase() || ''
  if (lower === 'firing') {
    return { bg: 'bg-red-500/20', text: 'text-red-400' }
  }
  if (lower === 'pending') {
    return { bg: 'bg-yellow-500/20', text: 'text-yellow-400' }
  }
  if (lower === 'resolved' || lower === 'inactive') {
    return { bg: 'bg-green-500/20', text: 'text-green-400' }
  }
  return { bg: 'bg-gray-500/20', text: 'text-gray-400' }
}

export function AlertDrillDown({ data }: Props) {
  const { t } = useTranslation()
  const cluster = data.cluster as string
  const namespace = data.namespace as string | undefined
  const alertName = data.alert as string

  // Additional alert data passed from the card
  const alertSeverity = (data.severity as string) || 'warning'
  const alertState = (data.state as string) || 'firing'
  const alertMessage = data.message as string | undefined
  const alertStartsAt = data.startsAt as string | undefined
  const alertLabels = (data.labels as Record<string, string>) || {}
  const alertAnnotations = (data.annotations as Record<string, string>) || {}
  const alertSource = data.source as string | undefined

  const { isConnected: agentConnected } = useLocalAgent()
  const { drillToNamespace, drillToCluster, drillToPod, drillToDeployment, drillToAlertRule } = useDrillDownActions()
  const { startMission } = useMissions()

  const [activeTab, setActiveTab] = useState<TabType>('overview')
  const [sourceRule, setSourceRule] = useState<string | null>(null)
  const [sourceLoading, setSourceLoading] = useState(false)
  const [aiAnalysis] = useState<string | null>(null)
  const [aiAnalysisLoading] = useState(false)
  const [copiedField, setCopiedField] = useState<string | null>(null)

  // Resource context for AI actions
  const resourceContext: ResourceContext = {
    kind: 'Alert',
    name: alertName,
    cluster,
    namespace,
    status: alertState,
    labels: alertLabels,
  }

  // Collect issues from alert data
  const issues = alertMessage
    ? [{ name: alertName, message: alertMessage, severity: alertSeverity }]
    : []

  // Use modal AI hook
  const { defaultAIActions, handleAIAction, isAgentConnected } = useModalAI({
    resource: resourceContext,
    issues,
    additionalContext: {
      alertSeverity,
      alertState,
      alertAnnotations,
      alertStartsAt,
      alertSource,
    },
  })

  // Helper to run kubectl commands
  const runKubectl = (args: string[]): Promise<string> => {
    return new Promise((resolve) => {
      const ws = new WebSocket(LOCAL_AGENT_WS_URL)
      const requestId = `kubectl-${Date.now()}-${Math.random().toString(36).slice(2)}`
      let output = ''

      const timeout = setTimeout(() => {
        ws.close()
        resolve(output || '')
      }, 10000)

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

  // Fetch source alert rule
  const fetchSourceRule = async () => {
    if (!agentConnected || sourceRule || !alertSource) return
    setSourceLoading(true)
    try {
      // Try to get the PrometheusRule that triggered this alert
      const output = await runKubectl([
        'get', 'prometheusrules.monitoring.coreos.com',
        '-A', '-o', 'json'
      ])
      if (output) {
        const rules = JSON.parse(output)
        // Find the rule that matches
        for (const rule of rules.items || []) {
          for (const group of rule.spec?.groups || []) {
            for (const r of group.rules || []) {
              if (r.alert === alertName) {
                setSourceRule(JSON.stringify(r, null, 2))
                break
              }
            }
          }
        }
      }
    } catch {
      // Ignore errors
    }
    setSourceLoading(false)
  }

  // Track if we've already loaded data
  const hasLoadedRef = useRef(false)

  useEffect(() => {
    if (!agentConnected || hasLoadedRef.current) return
    hasLoadedRef.current = true
    fetchSourceRule()
  }, [agentConnected])

  const handleCopy = (field: string, value: string) => {
    navigator.clipboard.writeText(value)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 2000)
  }

  // Start AI diagnosis
  const handleDiagnose = () => {
    const prompt = `Analyze this ${alertSeverity} alert "${alertName}" which is currently ${alertState}.

Alert Details:
- Name: ${alertName}
- Severity: ${alertSeverity}
- State: ${alertState}
- Message: ${alertMessage || 'No message provided'}
- Started: ${alertStartsAt || 'Unknown'}
- Source: ${alertSource || 'Unknown'}

Labels:
${Object.entries(alertLabels).map(([k, v]) => `- ${k}: ${v}`).join('\n')}

Please:
1. Explain what this alert means
2. Identify the likely root cause
3. Suggest steps to investigate
4. Recommend remediation actions`

    startMission({
      title: `Diagnose Alert: ${alertName}`,
      description: `Analyze ${alertSeverity} alert and provide remediation guidance`,
      type: 'troubleshoot',
      cluster,
      initialPrompt: prompt,
      context: {
        kind: 'Alert',
        name: alertName,
        namespace,
        cluster,
        severity: alertSeverity,
        state: alertState,
        labels: alertLabels,
      },
    })
  }

  const severityStyle = getSeverityStyle(alertSeverity)
  const stateStyle = getStateStyle(alertState)
  const labelEntries = Object.entries(alertLabels)
  const displayedLabels = labelEntries.slice(0, 6)

  const TABS: { id: TabType; label: string; icon: typeof Info }[] = [
    { id: 'overview', label: 'Overview', icon: Info },
    { id: 'labels', label: 'Labels', icon: Tag },
    { id: 'source', label: 'Source', icon: Code },
    { id: 'ai', label: 'AI Analysis', icon: Stethoscope },
  ]

  // Extract related resource from labels
  const relatedPod = alertLabels.pod
  const relatedNamespace = alertLabels.namespace || namespace
  const relatedDeployment = alertLabels.deployment
  const alertRuleName = alertLabels.alertname || alertName

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

          {/* Status badges */}
          <div className="flex items-center gap-2">
            <span className={cn('px-2.5 py-1 rounded-lg text-xs font-medium', severityStyle.bg, severityStyle.text, 'border', severityStyle.border)}>
              {alertSeverity.toUpperCase()}
            </span>
            <span className={cn('px-2.5 py-1 rounded-lg text-xs font-medium', stateStyle.bg, stateStyle.text)}>
              {alertState.toUpperCase()}
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
            {/* Alert Info Card */}
            <div className={cn('p-4 rounded-lg border', severityStyle.bg, severityStyle.border)}>
              <div className="flex items-start gap-3">
                <AlertTriangle className={cn('w-8 h-8 mt-1', severityStyle.icon)} />
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-semibold text-foreground">{alertName}</h3>
                  {alertMessage && (
                    <p className="text-sm text-muted-foreground mt-1">{alertMessage}</p>
                  )}
                  <div className="flex flex-wrap gap-4 mt-3 text-xs text-muted-foreground">
                    {alertStartsAt && (
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span>Started: {new Date(alertStartsAt).toLocaleString()}</span>
                      </div>
                    )}
                    {alertSource && (
                      <div className="flex items-center gap-1">
                        <ExternalLink className="w-3 h-3" />
                        <span>Source: {alertSource}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Annotations */}
            {Object.keys(alertAnnotations).length > 0 && (
              <div className="p-4 rounded-lg border border-border bg-card/50">
                <h4 className="text-sm font-medium text-foreground mb-3">{t('common.annotations')}</h4>
                <div className="space-y-2">
                  {Object.entries(alertAnnotations).map(([key, value]) => (
                    <div key={key} className="flex items-start gap-2 text-sm">
                      <span className="text-muted-foreground min-w-[120px]">{key}:</span>
                      <span className="text-foreground break-all">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Related Resources */}
            <div className="p-4 rounded-lg border border-border bg-card/50">
              <h4 className="text-sm font-medium text-foreground mb-3">Related Resources</h4>
              <div className="flex flex-wrap gap-2">
                {relatedPod && relatedNamespace && (
                  <button
                    onClick={() => drillToPod(cluster, relatedNamespace, relatedPod)}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20 transition-colors text-sm"
                  >
                    <span>Pod: {relatedPod}</span>
                  </button>
                )}
                {relatedDeployment && relatedNamespace && (
                  <button
                    onClick={() => drillToDeployment(cluster, relatedNamespace, relatedDeployment)}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/30 text-green-400 hover:bg-green-500/20 transition-colors text-sm"
                  >
                    <span>Deployment: {relatedDeployment}</span>
                  </button>
                )}
                {alertRuleName && (
                  <button
                    onClick={() => drillToAlertRule(cluster, namespace || 'monitoring', alertRuleName)}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 transition-colors text-sm"
                  >
                    <Bell className="w-3 h-3" />
                    <span>Alert Rule</span>
                  </button>
                )}
              </div>
            </div>

            {/* Quick Labels Preview */}
            {labelEntries.length > 0 && (
              <div className="p-4 rounded-lg border border-border bg-card/50">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-medium text-foreground">{t('common.labels')}</h4>
                  <span className="text-xs text-muted-foreground">{labelEntries.length} labels</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {displayedLabels.map(([key, value]) => (
                    <span
                      key={key}
                      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-secondary/50 text-xs"
                    >
                      <span className="text-muted-foreground">{key}:</span>
                      <span className="text-foreground font-mono">{value}</span>
                    </span>
                  ))}
                  {labelEntries.length > 6 && (
                    <button
                      onClick={() => setActiveTab('labels')}
                      className="text-xs text-primary hover:underline"
                    >
                      +{labelEntries.length - 6} more
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'labels' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-foreground">All Labels ({labelEntries.length})</h4>
            </div>
            <div className="space-y-2">
              {labelEntries.map(([key, value]) => (
                <div
                  key={key}
                  className="flex items-center justify-between p-3 rounded-lg border border-border bg-card/50 hover:bg-card/80 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Tag className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <div className="min-w-0">
                      <span className="text-sm text-muted-foreground">{key}</span>
                      <span className="text-sm text-muted-foreground mx-2">=</span>
                      <span className="text-sm text-foreground font-mono break-all">{value}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleCopy(key, `${key}=${value}`)}
                    className="p-1.5 rounded hover:bg-secondary transition-colors flex-shrink-0"
                    title="Copy label"
                  >
                    {copiedField === key ? (
                      <Check className="w-4 h-4 text-green-400" />
                    ) : (
                      <Copy className="w-4 h-4 text-muted-foreground" />
                    )}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'source' && (
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-foreground">Alert Rule Source</h4>
            {sourceLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : sourceRule ? (
              <pre className="p-4 rounded-lg bg-card border border-border overflow-x-auto text-xs font-mono text-foreground">
                {sourceRule}
              </pre>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Code className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>Alert rule source not available</p>
                <p className="text-xs mt-1">Connect the agent to fetch PrometheusRule definitions</p>
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
                Diagnose Alert
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
                <p>Click "Diagnose Alert" to get AI-powered analysis</p>
                <p className="text-xs mt-1">AI will analyze the alert and suggest remediation steps</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
