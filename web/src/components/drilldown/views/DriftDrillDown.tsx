import { useState } from 'react'
import { Info, Diff, FileText, Stethoscope } from 'lucide-react'
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
  type DriftChange,
  getDriftSeverityStyle,
  getChangeTypeStyle,
} from './drift-drilldown'
import {
  DriftDrillDownHeader,
  DriftTabBar,
  DriftOverviewTab,
  DriftChangesTab,
  DriftDiffTab,
  DriftAITab,
} from './DriftDrillDown.parts'
import { useDriftDrillDown } from './useDriftDrillDown'

export function DriftDrillDown({ data }: Props) {
  const { t } = useTranslation()
  const cluster = data.cluster as string
  const namespace = data.namespace as string | undefined
  const resourceName = data.resource as string | undefined

  const driftStatus = (data.status as string) || 'Unknown'
  const driftSeverity = (data.severity as string) || driftStatus
  const gitRepo = data.gitRepo as string | undefined
  const gitBranch = data.gitBranch as string | undefined
  const gitPath = data.gitPath as string | undefined
  const lastChecked = data.lastChecked as string | undefined
  const driftedResources = (data.driftedResources as number) || 0

  const { drillToNamespace, drillToCluster, drillToPod, drillToDeployment } = useDrillDownActions()
  const { close: closeDrillDown } = useDrillDown()
  const { startMission } = useMissions()

  const [activeTab, setActiveTab] = useState<TabType>('overview')

  const { changes, changesLoading, changesError, selectedChange, setSelectedChange } = useDriftDrillDown(
    cluster, namespace,
  )

  const resourceContext: ResourceContext = {
    kind: 'Custom',
    name: resourceName || 'GitOps Drift',
    cluster,
    namespace,
    status: driftStatus,
  }

  const hasIssues = driftedResources > 0 || driftSeverity.toLowerCase() === 'high'
  const issues = hasIssues
    ? [{ name: 'Drift', message: `${driftedResources} drifted resources`, severity: 'warning' }]
    : []

  const { defaultAIActions, handleAIAction, isAgentConnected } = useModalAI({
    resource: resourceContext,
    issues,
    additionalContext: { gitRepo, gitBranch, gitPath, driftedResources },
  })

  const handleResourceClick = (change: DriftChange) => {
    if (change.kind === 'Pod' && change.namespace) {
      drillToPod(cluster, change.namespace, change.name)
    } else if (change.kind === 'Deployment' && change.namespace) {
      drillToDeployment(cluster, change.namespace, change.name)
    } else if (change.namespace) {
      drillToNamespace(cluster, change.namespace)
    }
    setSelectedChange(change)
  }

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
1. Analyze the drift — identify root cause and affected resources.
2. Tell me what you found, then ask:
   - "Should I sync to resolve the drift?"
   - "This looks intentional — want to update the Git source instead?"
   - "Show me the diff first"
3. If I pick an action, apply and verify. Then ask:
   - "Should I check for drift in other namespaces?"
   - "All done"`

    closeDrillDown()
    startMission({
      title: `Analyze GitOps Drift: ${cluster}`,
      description: `Investigate configuration drift between Git and cluster`,
      type: 'troubleshoot',
      cluster,
      initialPrompt: prompt,
      context: { kind: 'Drift', name: 'GitOps Drift Analysis', namespace, cluster, gitRepo, driftedResources },
    })
  }

  const severityStyle = getDriftSeverityStyle(driftSeverity)

  const TABS: { id: TabType; label: string; icon: typeof Info }[] = [
    { id: 'overview', label: t('drilldown.tabs.overview'), icon: Info },
    { id: 'changes', label: `${t('drilldown.tabs.changes')} (${changes?.length || driftedResources || 0})`, icon: Diff },
    { id: 'diff', label: t('drilldown.tabs.diffView'), icon: FileText },
    { id: 'ai', label: t('drilldown.tabs.aiAnalysis'), icon: Stethoscope },
  ]

  return (
    <div className="flex flex-col h-full -m-6">
      <DriftDrillDownHeader
        cluster={cluster}
        namespace={namespace}
        driftSeverity={driftSeverity}
        severityStyle={severityStyle}
        onNamespaceClick={namespace ? () => drillToNamespace(cluster, namespace) : undefined}
        onClusterClick={() => drillToCluster(cluster)}
      />

      <div className="px-6 pb-4">
        <AIActionBar
          resource={resourceContext}
          actions={defaultAIActions}
          onAction={handleAIAction}
          issueCount={driftedResources}
          compact={false}
        />
      </div>

      <DriftTabBar tabs={TABS} activeTab={activeTab} onSelect={(id) => setActiveTab(id as TabType)} />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {activeTab === 'overview' && (
          <DriftOverviewTab
            driftedResources={driftedResources}
            driftSeverity={driftSeverity}
            gitRepo={gitRepo}
            gitBranch={gitBranch}
            gitPath={gitPath}
            lastChecked={lastChecked}
            severityStyle={severityStyle}
          />
        )}
        {activeTab === 'changes' && (
          <DriftChangesTab
            changes={changes}
            changesLoading={changesLoading}
            changesError={changesError}
            selectedChange={selectedChange}
            onChangeClick={handleResourceClick}
            getChangeTypeStyle={getChangeTypeStyle}
          />
        )}
        {activeTab === 'diff' && (
          <DriftDiffTab selectedChange={selectedChange} />
        )}
        {activeTab === 'ai' && (
          <DriftAITab
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
