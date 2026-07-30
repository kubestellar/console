import { useState } from 'react'
import { Info, FileText, Package, Stethoscope } from 'lucide-react'
import { useDrillDownActions, useDrillDown } from '../../../hooks/useDrillDown'
import { useMissions } from '../../../hooks/useMissions'
import {
  AIActionBar,
  useModalAI,
  type ResourceContext,
} from '../../modals'
import { useTranslation } from 'react-i18next'
import {
  type Props,
  type TabType,
  getPhaseStyle,
} from './operator-drilldown'
import {
  OperatorOverviewTab,
  OperatorCSVTab,
  OperatorCRDsTab,
  OperatorAITab,
  OperatorDrillDownHeader,
  OperatorTabBar,
} from './OperatorDrillDown.parts'
import { useOperatorDrillDown } from './useOperatorDrillDown'

export function OperatorDrillDown({ data }: Props) {
  const { t } = useTranslation()
  const cluster = data.cluster as string
  const namespace = data.namespace as string
  const operatorName = data.operator as string

  const subscriptionName = data.subscription as string | undefined
  const operatorPhase = (data.phase as string) || 'Unknown'
  const channel = data.channel as string | undefined
  const source = data.source as string | undefined
  const sourceNamespace = data.sourceNamespace as string | undefined
  const currentCSV = data.currentCSV as string | undefined

  const { drillToNamespace, drillToCluster, drillToCRD } = useDrillDownActions()
  const { state, pop, close: closeDrillDown } = useDrillDown()
  const { startMission } = useMissions()

  const [activeTab, setActiveTab] = useState<TabType>('overview')

  const { csvInfo, csvLoading, operatorCRDs, crdsLoading } = useOperatorDrillDown(
    cluster, namespace, operatorName, currentCSV, operatorPhase, subscriptionName,
  )

  const resourceContext: ResourceContext = {
    kind: 'Operator',
    name: operatorName,
    cluster,
    namespace,
    status: operatorPhase,
  }

  const hasIssues = operatorPhase.toLowerCase() === 'failed' || operatorPhase.toLowerCase() === 'unknown'
  const issues = hasIssues
    ? [{ name: operatorName, message: `Operator phase: ${operatorPhase}`, severity: 'warning' }]
    : []

  const { defaultAIActions, handleAIAction, isAgentConnected } = useModalAI({
    resource: resourceContext,
    issues,
    additionalContext: { channel, source, currentCSV },
  })

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
1. Assess the operator health — installation status, subscription, and CSV state.
2. Tell me what you found, then ask:
   - "Should I fix the issues?"
   - "Should I upgrade to a newer version?"
   - "Show me more details first"
3. If I pick an action, apply and verify. Then ask:
   - "Should I check other operators on this cluster?"
   - "All done"`

    closeDrillDown()
    startMission({
      title: `Diagnose Operator: ${operatorName}`,
      description: `Analyze OLM operator health and configuration`,
      type: 'troubleshoot',
      cluster,
      initialPrompt: prompt,
      context: { kind: 'Operator', name: operatorName, namespace, cluster, phase: operatorPhase, channel },
    })
  }

  const phaseStyle = getPhaseStyle(operatorPhase)

  const TABS: { id: TabType; label: string; icon: typeof Info }[] = [
    { id: 'overview', label: t('drilldown.tabs.overview'), icon: Info },
    { id: 'csv', label: t('drilldown.tabs.csvDetails'), icon: FileText },
    { id: 'crds', label: t('drilldown.tabs.crds'), icon: Package },
    { id: 'ai', label: t('drilldown.tabs.aiAnalysis'), icon: Stethoscope },
  ]

  return (
    <div className="flex flex-col h-full -m-6">
      <OperatorDrillDownHeader
        cluster={cluster}
        namespace={namespace}
        operatorPhase={operatorPhase}
        phaseStyle={phaseStyle}
        canGoBack={state.stack.length > 1}
        onBack={pop}
        onNamespaceClick={() => drillToNamespace(cluster, namespace)}
        onClusterClick={() => drillToCluster(cluster)}
      />

      <div className="px-6 pb-4">
        <AIActionBar
          resource={resourceContext}
          actions={defaultAIActions}
          onAction={handleAIAction}
          issueCount={issues.length}
          compact={false}
        />
      </div>

      <OperatorTabBar tabs={TABS} activeTab={activeTab} onSelect={(id) => setActiveTab(id as TabType)} />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {activeTab === 'overview' && (
          <OperatorOverviewTab
            csvInfo={csvInfo}
            operatorName={operatorName}
            channel={channel}
            source={source}
            sourceNamespace={sourceNamespace}
            subscriptionName={subscriptionName}
            operatorCRDs={operatorCRDs}
            phaseStyle={phaseStyle}
          />
        )}
        {activeTab === 'csv' && (
          <OperatorCSVTab csvInfo={csvInfo} csvLoading={csvLoading} phaseStyle={phaseStyle} />
        )}
        {activeTab === 'crds' && (
          <OperatorCRDsTab
            operatorCRDs={operatorCRDs}
            crdsLoading={crdsLoading}
            onCRDClick={(crdName) => drillToCRD(cluster, crdName)}
          />
        )}
        {activeTab === 'ai' && (
          <OperatorAITab
            isAgentConnected={isAgentConnected}
            aiAnalysis={null}
            aiAnalysisLoading={false}
            onDiagnose={handleDiagnose}
          />
        )}
      </div>
    </div>
  )
}
