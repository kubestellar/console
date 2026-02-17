import { useState, useEffect, useRef } from 'react'
import { useLocalAgent } from '../../../hooks/useLocalAgent'
import { useDrillDownActions } from '../../../hooks/useDrillDown'
import { useMissions } from '../../../hooks/useMissions'
import { ClusterBadge } from '../../ui/ClusterBadge'
import {
  Shield, Info, Loader2,
  Layers, Server, RefreshCw, Stethoscope,
  CheckCircle, XCircle, AlertTriangle,
  FileText, AlertCircle
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

type TabType = 'overview' | 'violations' | 'spec' | 'ai'

// Policy status styles
const getStatusStyle = (status: string) => {
  const lower = status?.toLowerCase() || ''
  if (lower === 'active' || lower === 'ready' || lower === 'enforced') {
    return { bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500/30', icon: CheckCircle }
  }
  if (lower === 'audit' || lower === 'warn') {
    return { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/30', icon: AlertTriangle }
  }
  if (lower === 'failed' || lower === 'error' || lower === 'inactive') {
    return { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30', icon: XCircle }
  }
  return { bg: 'bg-gray-500/20', text: 'text-gray-400', border: 'border-gray-500/30', icon: AlertCircle }
}

interface Violation {
  resource: string
  kind: string
  namespace?: string
  message: string
  timestamp?: string
}

interface ViolationRaw {
  name?: string
  kind?: string
  namespace?: string
  message?: string
}

interface PolicySpec {
  match?: Record<string, unknown>
  parameters?: Record<string, unknown>
  validationFailureAction?: string
  background?: boolean
  rules?: Array<{
    name: string
    match?: Record<string, unknown>
    validate?: Record<string, unknown>
    mutate?: Record<string, unknown>
  }>
}

export function PolicyDrillDown({ data }: Props) {
  const { t } = useTranslation()
  const cluster = data.cluster as string
  const namespace = data.namespace as string | undefined
  const policyName = data.policy as string
  const policyType = (data.policyType as string) || 'opa' // 'opa' or 'kyverno'

  // Additional policy data
  const policyKind = (data.kind as string) || (policyType === 'kyverno' ? 'ClusterPolicy' : 'Constraint')
  const policyStatus = (data.status as string) || 'Unknown'
  const constraintTemplate = data.constraintTemplate as string | undefined
  const violationCount = (data.violationCount as number) || 0

  const { isConnected: agentConnected } = useLocalAgent()
  const { drillToNamespace, drillToCluster, drillToPod } = useDrillDownActions()
  const { startMission } = useMissions()

  const [activeTab, setActiveTab] = useState<TabType>('overview')
  const [violations, setViolations] = useState<Violation[] | null>(null)
  const [violationsLoading, setViolationsLoading] = useState(false)
  const [policySpec, setPolicySpec] = useState<PolicySpec | null>(null)
  const [specLoading, setSpecLoading] = useState(false)
  const [aiAnalysis] = useState<string | null>(null)
  const [aiAnalysisLoading] = useState(false)

  // Resource context for AI actions
  const resourceContext: ResourceContext = {
    kind: 'Policy',
    name: policyName,
    cluster,
    namespace,
    status: policyStatus,
  }

  // Check for issues
  const hasIssues = violationCount > 0 ||
    policyStatus.toLowerCase() === 'failed' ||
    policyStatus.toLowerCase() === 'error'
  const issues = hasIssues
    ? [{ name: policyName, message: `${violationCount} violations found`, severity: 'warning' }]
    : []

  // Use modal AI hook
  const { defaultAIActions, handleAIAction, isAgentConnected } = useModalAI({
    resource: resourceContext,
    issues,
    additionalContext: {
      policyType,
      constraintTemplate,
      violationCount,
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

  // Fetch violations
  const fetchViolations = async () => {
    if (!agentConnected || violations) return
    setViolationsLoading(true)
    try {
      let output: string
      if (policyType === 'kyverno') {
        // For Kyverno, fetch policy reports
        output = await runKubectl([
          'get', 'policyreport,clusterpolicyreport', '-A', '-o', 'json'
        ])
        if (output) {
          const data = JSON.parse(output)
          const items = data.items || []
          const policyViolations: Violation[] = []

          for (const report of items) {
            const results = report.results || []
            for (const result of results) {
              if (result.policy === policyName && result.result === 'fail') {
                policyViolations.push({
                  resource: result.resources?.[0]?.name || 'Unknown',
                  kind: result.resources?.[0]?.kind || 'Unknown',
                  namespace: result.resources?.[0]?.namespace,
                  message: result.message || 'Policy violation',
                  timestamp: result.timestamp,
                })
              }
            }
          }
          setViolations(policyViolations)
        }
      } else {
        // For OPA Gatekeeper, fetch constraint status
        output = await runKubectl([
          'get', policyKind.toLowerCase(), policyName, '-o', 'json'
        ])
        if (output) {
          const constraint = JSON.parse(output)
          const statusViolations = constraint.status?.violations || []
          setViolations(statusViolations.map((v: ViolationRaw) => ({
            resource: v.name || 'Unknown',
            kind: v.kind || 'Unknown',
            namespace: v.namespace,
            message: v.message || 'Policy violation',
          })))
        }
      }
    } catch {
      setViolations([])
    }
    setViolationsLoading(false)
  }

  // Fetch policy spec
  const fetchSpec = async () => {
    if (!agentConnected || policySpec) return
    setSpecLoading(true)
    try {
      let output: string
      if (policyType === 'kyverno') {
        const resource = namespace ? `policy/${policyName}` : `clusterpolicy/${policyName}`
        const nsArgs = namespace ? ['-n', namespace] : []
        output = await runKubectl(['get', resource, ...nsArgs, '-o', 'json'])
      } else {
        output = await runKubectl([
          'get', policyKind.toLowerCase(), policyName, '-o', 'json'
        ])
      }

      if (output) {
        const policy = JSON.parse(output)
        setPolicySpec(policy.spec || {})
      }
    } catch {
      setPolicySpec({})
    }
    setSpecLoading(false)
  }

  // Track if we've already loaded data
  const hasLoadedRef = useRef(false)

  useEffect(() => {
    if (!agentConnected || hasLoadedRef.current) return
    hasLoadedRef.current = true

    const loadData = async () => {
      await Promise.all([fetchViolations(), fetchSpec()])
    }
    loadData()
  }, [agentConnected])

  // Start AI diagnosis
  const handleDiagnose = () => {
    const prompt = `Analyze this ${policyType === 'kyverno' ? 'Kyverno' : 'OPA Gatekeeper'} policy "${policyName}".

Policy Details:
- Name: ${policyName}
- Kind: ${policyKind}
- Status: ${policyStatus}
- Violation Count: ${violationCount}
${constraintTemplate ? `- Constraint Template: ${constraintTemplate}` : ''}

${violations && violations.length > 0 ? `
Current Violations (${violations.length}):
${violations.slice(0, 5).map(v => `- ${v.kind}/${v.resource}${v.namespace ? ` in ${v.namespace}` : ''}: ${v.message}`).join('\n')}
${violations.length > 5 ? `... and ${violations.length - 5} more` : ''}
` : 'No violations found.'}

Please:
1. Assess the policy effectiveness and coverage
2. Analyze the violations and their root causes
3. Check for policy conflicts or gaps
4. Suggest remediation for existing violations
5. Recommend policy improvements or best practices`

    startMission({
      title: `Diagnose Policy: ${policyName}`,
      description: `Analyze ${policyType === 'kyverno' ? 'Kyverno' : 'OPA'} policy and violations`,
      type: 'troubleshoot',
      cluster,
      initialPrompt: prompt,
      context: {
        kind: policyKind,
        name: policyName,
        namespace,
        cluster,
        policyType,
        violationCount,
      },
    })
  }

  const statusStyle = getStatusStyle(policyStatus)
  const StatusIcon = statusStyle.icon

  const TABS: { id: TabType; label: string; icon: typeof Info }[] = [
    { id: 'overview', label: 'Overview', icon: Info },
    { id: 'violations', label: `Violations (${violationCount})`, icon: AlertCircle },
    { id: 'spec', label: 'Policy Spec', icon: FileText },
    { id: 'ai', label: 'AI Analysis', icon: Stethoscope },
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
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{policyType === 'kyverno' ? 'Kyverno' : 'OPA'}</span>
            <span className={cn('px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1', statusStyle.bg, statusStyle.text, 'border', statusStyle.border)}>
              <StatusIcon className="w-3 h-3" />
              {policyStatus}
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
          issueCount={violationCount}
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
            {/* Policy Info Card */}
            <div className="p-4 rounded-lg bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/20">
              <div className="flex items-start gap-3">
                <Shield className="w-8 h-8 text-blue-400 mt-1" />
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-semibold text-foreground">{policyName}</h3>
                  <div className="flex flex-wrap gap-4 mt-2 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <FileText className="w-4 h-4" />
                      <span>Kind: {policyKind}</span>
                    </div>
                    {constraintTemplate && (
                      <div className="flex items-center gap-1.5">
                        <Layers className="w-4 h-4" />
                        <span>Template: {constraintTemplate}</span>
                      </div>
                    )}
                    {policySpec?.validationFailureAction && (
                      <div className="flex items-center gap-1.5">
                        <RefreshCw className="w-4 h-4" />
                        <span>Action: {policySpec.validationFailureAction}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-lg border border-border bg-card/50">
                <div className={cn('text-2xl font-bold', statusStyle.text)}>
                  <StatusIcon className="w-8 h-8" />
                </div>
                <div className="text-xs text-muted-foreground mt-1">{t('common.status')}</div>
              </div>
              <div className="p-4 rounded-lg border border-border bg-card/50">
                <div className={cn('text-2xl font-bold', violationCount > 0 ? 'text-red-400' : 'text-green-400')}>
                  {violationCount}
                </div>
                <div className="text-xs text-muted-foreground">Violations</div>
              </div>
              <div className="p-4 rounded-lg border border-border bg-card/50">
                <div className="text-sm font-medium text-foreground capitalize">{policyType}</div>
                <div className="text-xs text-muted-foreground">Engine</div>
              </div>
            </div>

            {/* Policy Rules (Kyverno) */}
            {policyType === 'kyverno' && policySpec?.rules && policySpec.rules.length > 0 && (
              <div className="p-4 rounded-lg border border-border bg-card/50">
                <h4 className="text-sm font-medium text-foreground mb-3">Rules ({policySpec.rules.length})</h4>
                <div className="space-y-2">
                  {policySpec.rules.map((rule, i) => (
                    <div key={i} className="p-3 rounded-lg bg-secondary/50 flex items-center justify-between">
                      <span className="text-sm font-medium text-foreground">{rule.name}</span>
                      <div className="flex gap-2">
                        {rule.validate && <span className="px-2 py-0.5 rounded text-xs bg-blue-500/20 text-blue-400">Validate</span>}
                        {rule.mutate && <span className="px-2 py-0.5 rounded text-xs bg-purple-500/20 text-purple-400">Mutate</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'violations' && (
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-foreground">Violations ({violations?.length || 0})</h4>
            {violationsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : violations && violations.length > 0 ? (
              <div className="space-y-2">
                {violations.map((violation, i) => (
                  <div
                    key={i}
                    onClick={() => {
                      if (violation.kind === 'Pod' && violation.namespace) {
                        drillToPod(cluster, violation.namespace, violation.resource)
                      }
                    }}
                    className={cn(
                      'flex items-start gap-3 p-3 rounded-lg border border-red-500/30 bg-red-500/10',
                      violation.kind === 'Pod' && violation.namespace && 'cursor-pointer hover:bg-red-500/20 transition-colors'
                    )}
                  >
                    <XCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground">{violation.kind}/{violation.resource}</span>
                        {violation.namespace && (
                          <span className="text-xs text-muted-foreground">in {violation.namespace}</span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{violation.message}</p>
                      {violation.timestamp && (
                        <span className="text-xs text-muted-foreground">{violation.timestamp}</span>
                      )}
                    </div>
                    {violation.kind === 'Pod' && violation.namespace && (
                      <svg className="w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <CheckCircle className="w-12 h-12 mx-auto mb-3 opacity-50 text-green-400" />
                <p className="text-green-400">No violations found</p>
                <p className="text-xs mt-1">All resources comply with this policy</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'spec' && (
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-foreground">Policy Specification</h4>
            {specLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : policySpec ? (
              <div className="p-4 rounded-lg border border-border bg-card/50">
                <pre className="text-sm text-foreground font-mono whitespace-pre-wrap overflow-x-auto">
                  {JSON.stringify(policySpec, null, 2)}
                </pre>
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>Policy specification not available</p>
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
                Analyze Policy
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
                <p>Click "Analyze Policy" to get AI-powered analysis</p>
                <p className="text-xs mt-1">AI will analyze the policy and suggest improvements</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
