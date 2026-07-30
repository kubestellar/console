import { useState } from 'react'
import { useDrillDownActions, useDrillDown } from '../../../hooks/useDrillDown'
import { useMissions } from '../../../hooks/useMissions'
import {
  AIActionBar,
  useModalAI,
  type ResourceContext,
} from '../../modals'
import { getStatusStyle, type TabType, type AppliedResource } from './KustomizationDrillDown.types'
import { useKustomizationDrillDown } from './useKustomizationDrillDown'
import {
  KustomizationDrillDownHeader,
  KustomizationTabBar,
  KustomizationOverviewTab,
  KustomizationResourcesTab,
  KustomizationConditionsTab,
  KustomizationAITab,
} from './KustomizationDrillDown.parts'

interface Props {
  data: Record<string, unknown>
}

export function KustomizationDrillDown({ data }: Props) {
  const cluster = data.cluster as string
  const namespace = data.namespace as string
  const kustomizationName = data.kustomization as string

  const kustomizationStatus = (data.status as string) || 'Unknown'
  const sourceRef = data.sourceRef as { kind?: string; name?: string } | undefined
  const path = data.path as string | undefined
  const interval = data.interval as string | undefined
  const lastAppliedRevision = data.lastAppliedRevision as string | undefined
  const suspended = data.suspended as boolean | undefined

  const { drillToNamespace, drillToCluster, drillToPod, drillToDeployment } = useDrillDownActions()
  const { close: closeDrillDown } = useDrillDown()
  const { startMission } = useMissions()
  const [activeTab, setActiveTab] = useState<TabType>('overview')

  const { appliedResources, resourcesLoading, conditions, conditionsLoading } =
    useKustomizationDrillDown(cluster, namespace, kustomizationName)

  const resourceContext: ResourceContext = {
    kind: 'Custom',
    name: kustomizationName,
    cluster,
    namespace,
    status: kustomizationStatus,
  }

  const hasIssues =
    kustomizationStatus.toLowerCase() === 'failed' ||
    kustomizationStatus.toLowerCase() === 'false' ||
    suspended === true
  const issues = hasIssues
    ? [{ name: kustomizationName, message: suspended ? 'Kustomization suspended' : `Status: ${kustomizationStatus}`, severity: 'warning' }]
    : []

  const { defaultAIActions, handleAIAction, isAgentConnected } = useModalAI({
    resource: resourceContext,
    issues,
    additionalContext: { path, sourceRef, lastAppliedRevision, suspended },
  })

  const handleResourceClick = (resource: AppliedResource) => {
    if (resource.kind === 'Pod' && resource.namespace) {
      drillToPod(cluster, resource.namespace, resource.name)
    } else if (resource.kind === 'Deployment' && resource.namespace) {
      drillToDeployment(cluster, resource.namespace, resource.name)
    }
  }

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
1. Assess the kustomization health — sync status, conditions, and dependencies.
2. Tell me what you found, then ask:
   - "Should I fix the reconciliation issues?"
   - "Show me more details first"
3. If I say fix it, apply and verify. Then ask:
   - "Should I check related Flux resources?"
   - "All done"`

    closeDrillDown()
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

  return (
    <div className="flex flex-col h-full -m-6">
      <KustomizationDrillDownHeader
        cluster={cluster}
        namespace={namespace}
        suspended={suspended}
        kustomizationStatus={kustomizationStatus}
        statusStyle={statusStyle}
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

      <KustomizationTabBar
        activeTab={activeTab}
        resourceCount={appliedResources?.length || 0}
        onSelect={setActiveTab}
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {activeTab === 'overview' && (
          <KustomizationOverviewTab
            kustomizationName={kustomizationName}
            path={path}
            interval={interval}
            sourceRef={sourceRef}
            statusStyle={statusStyle}
            appliedResources={appliedResources}
            suspended={suspended}
            lastAppliedRevision={lastAppliedRevision}
          />
        )}
        {activeTab === 'resources' && (
          <KustomizationResourcesTab
            appliedResources={appliedResources}
            isLoading={resourcesLoading}
            onResourceClick={handleResourceClick}
          />
        )}
        {activeTab === 'conditions' && (
          <KustomizationConditionsTab
            conditions={conditions}
            isLoading={conditionsLoading}
          />
        )}
        {activeTab === 'ai' && (
          <KustomizationAITab
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
