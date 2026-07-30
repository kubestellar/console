import { useDrillDownActions } from '../../../hooks/useDrillDown'
import { AIActionBar } from '../../modals'
import { useKustomizationDrillDown } from './useKustomizationDrillDown'
import type { AppliedResource } from './useKustomizationDrillDown'
import {
  KustomizationDrillDownHeader, KustomizationTabBar, KustomizationOverviewTab,
  KustomizationResourcesTab, KustomizationConditionsTab, KustomizationAITab,
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

  const {
    activeTab, setActiveTab,
    appliedResources, resourcesLoading,
    conditions, conditionsLoading,
    aiAnalysis, aiAnalysisLoading,
    resourceContext, issues,
    defaultAIActions, handleAIAction, isAgentConnected,
    handleDiagnose,
  } = useKustomizationDrillDown({
    cluster, namespace, kustomizationName, kustomizationStatus,
    sourceRef, path, interval, lastAppliedRevision, suspended,
  })

  const handleResourceClick = (resource: AppliedResource) => {
    if (resource.kind === 'Pod' && resource.namespace) {
      drillToPod(cluster, resource.namespace, resource.name)
    } else if (resource.kind === 'Deployment' && resource.namespace) {
      drillToDeployment(cluster, resource.namespace, resource.name)
    }
  }

  return (
    <div className="flex flex-col h-full -m-6">
      <KustomizationDrillDownHeader
        cluster={cluster}
        namespace={namespace}
        kustomizationStatus={kustomizationStatus}
        suspended={suspended}
        onDrillToNamespace={drillToNamespace}
        onDrillToCluster={drillToCluster}
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
        appliedResourcesCount={appliedResources?.length || 0}
        onChange={setActiveTab}
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {activeTab === 'overview' && (
          <KustomizationOverviewTab
            kustomizationName={kustomizationName}
            kustomizationStatus={kustomizationStatus}
            path={path}
            interval={interval}
            sourceRef={sourceRef}
            appliedResourcesCount={appliedResources?.length}
            suspended={suspended}
            lastAppliedRevision={lastAppliedRevision}
          />
        )}

        {activeTab === 'resources' && (
          <KustomizationResourcesTab
            appliedResources={appliedResources}
            resourcesLoading={resourcesLoading}
            onResourceClick={handleResourceClick}
          />
        )}

        {activeTab === 'conditions' && (
          <KustomizationConditionsTab
            conditions={conditions}
            conditionsLoading={conditionsLoading}
          />
        )}

        {activeTab === 'ai' && (
          <KustomizationAITab
            isAgentConnected={isAgentConnected}
            aiAnalysisLoading={aiAnalysisLoading}
            aiAnalysis={aiAnalysis}
            onDiagnose={handleDiagnose}
          />
        )}
      </div>
    </div>
  )
}
