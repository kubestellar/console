import { useState } from 'react'
import { useDrillDownActions, useDrillDown } from '../../../hooks/useDrillDown'
import { useMissions } from '../../../hooks/useMissions'
import {
  Shield, Loader2,
  Layers, RefreshCw, Stethoscope,
  CheckCircle,
  FileText
} from 'lucide-react'
import { cn } from '../../../lib/cn'
import { TOUCH_TARGET_SIZE_CLASS } from '../../../lib/constants/ui'
import { ConsoleAIIcon } from '../../ui/ConsoleAIIcon'
import {
  AIActionBar,
  useModalAI,
  type ResourceContext,
} from '../../modals'
import { useTranslation } from 'react-i18next'
import { usePolicyDrillDown } from './usePolicyDrillDown'
import {
  type TabType,
  getStatusStyle,
  getTabsWithCount,
  PolicyTabBar,
  PolicyDrillDownHeader,
  ViolationRow,
  PolicyRulesList,
} from './PolicyDrillDown.parts'

interface Props {
  data: Record<string, unknown>
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

  const { drillToNamespace, drillToCluster, drillToPod } = useDrillDownActions()
  const { state, pop, close: closeDrillDown } = useDrillDown()
  const { startMission } = useMissions()

  const [activeTab, setActiveTab] = useState<TabType>('overview')
  const [aiAnalysis] = useState<string | null>(null)
  const [aiAnalysisLoading] = useState(false)

  // Use extracted hook for data loading
  const {
    agentConnected,
    violations,
    violationsLoading,
    policySpec,
    specLoading,
  } = usePolicyDrillDown(cluster, policyName, policyType, policyKind, namespace)

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
1. Assess the policy — effectiveness, violations, and coverage gaps.
2. Tell me what you found, then ask:
   - "Should I fix the violations?"
   - "Should I adjust the policy rules?"
   - "Show me more details first"
3. If I pick an action, apply and verify. Then ask:
   - "Should I check related policies?"
   - "All done"`

    closeDrillDown() // Close panel so mission sidebar is visible
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

  const TABS = getTabsWithCount(violationCount)

  return (
    <div className="flex flex-col h-full -m-6">
      {/* Header */}
      <PolicyDrillDownHeader
        cluster={cluster}
        namespace={namespace}
        policyType={policyType}
        policyStatus={policyStatus}
        statusStyle={statusStyle}
        canGoBack={state.stack.length > 1}
        onBack={() => state.stack.length > 1 ? pop() : closeDrillDown()}
        onNamespaceClick={namespace ? () => drillToNamespace(cluster, namespace) : undefined}
        onClusterClick={() => drillToCluster(cluster)}
      />

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
      <PolicyTabBar
        activeTab={activeTab}
        tabs={TABS}
        onSelect={setActiveTab}
      />

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Policy Info Card */}
            <div className="p-4 rounded-lg bg-linear-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/20">
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
              <PolicyRulesList rules={policySpec.rules} />
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
                  <ViolationRow
                    key={i}
                    violation={violation}
                    onClick={violation.kind === 'Pod' && violation.namespace
                      ? () => drillToPod(cluster, violation.namespace!, violation.resource)
                      : undefined
                    }
                  />
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
                <p>{t('drilldown.policy.specNotAvailable')}</p>
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
                className={cn('flex items-center gap-2 rounded-lg bg-purple-500/20 px-3 py-2 text-sm text-purple-400 transition-colors hover:bg-purple-500/30 disabled:cursor-not-allowed disabled:opacity-50', TOUCH_TARGET_SIZE_CLASS)}
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
                <p>{t('drilldown.policy.clickAnalyze')}</p>
                <p className="text-xs mt-1">{t('drilldown.policy.analyzeHint')}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
