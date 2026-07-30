import { useDrillDownActions } from '../../../hooks/useDrillDown'
import { AIActionBar } from '../../modals'
import { useAlertDrillDown } from './useAlertDrillDown'
import {
  AlertDrillDownHeader, AlertTabBar, AlertOverviewTab,
  AlertLabelsTab, AlertSourceTab, AlertAITab,
} from './AlertDrillDown.parts'

interface Props {
  data: Record<string, unknown>
}

export function AlertDrillDown({ data }: Props) {
  const cluster = data.cluster as string
  const namespace = data.namespace as string | undefined
  const alertName = data.alert as string
  const alertSeverity = (data.severity as string) || 'warning'
  const alertState = (data.state as string) || 'firing'
  const alertMessage = data.message as string | undefined
  const alertStartsAt = data.startsAt as string | undefined
  const alertLabels = (data.labels as Record<string, string>) || {}
  const alertAnnotations = (data.annotations as Record<string, string>) || {}
  const alertSource = data.source as string | undefined

  const { drillToNamespace, drillToCluster, drillToPod, drillToDeployment, drillToAlertRule } = useDrillDownActions()

  const {
    activeTab, setActiveTab,
    tabListProps, getTabProps, getTabPanelProps,
    sourceRule, sourceLoading,
    aiAnalysis, aiAnalysisLoading,
    copiedField, handleCopy,
    resourceContext, issues,
    defaultAIActions, handleAIAction, isAgentConnected,
    handleDiagnose,
  } = useAlertDrillDown({
    cluster, namespace, alertName, alertSeverity, alertState,
    alertMessage, alertStartsAt, alertLabels, alertAnnotations, alertSource,
  })

  const labelEntries = Object.entries(alertLabels)
  const relatedPod = alertLabels.pod
  const relatedNamespace = alertLabels.namespace || namespace
  const relatedDeployment = alertLabels.deployment
  const alertRuleName = alertLabels.alertname || alertName

  return (
    <div className="flex flex-col h-full -m-6">
      <AlertDrillDownHeader
        cluster={cluster}
        namespace={namespace}
        alertSeverity={alertSeverity}
        alertState={alertState}
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

      <AlertTabBar activeTab={activeTab} tabListProps={tabListProps} getTabProps={getTabProps} />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {activeTab === 'overview' && (
          <AlertOverviewTab
            tabPanelProps={getTabPanelProps('overview')}
            alertName={alertName}
            alertMessage={alertMessage}
            alertStartsAt={alertStartsAt}
            alertSource={alertSource}
            alertSeverity={alertSeverity}
            alertAnnotations={alertAnnotations}
            labelEntries={labelEntries}
            relatedPod={relatedPod}
            relatedNamespace={relatedNamespace}
            relatedDeployment={relatedDeployment}
            alertRuleName={alertRuleName}
            cluster={cluster}
            namespace={namespace}
            onDrillToPod={drillToPod}
            onDrillToDeployment={drillToDeployment}
            onDrillToAlertRule={drillToAlertRule}
            onShowAllLabels={() => setActiveTab('labels')}
          />
        )}

        {activeTab === 'labels' && (
          <AlertLabelsTab
            tabPanelProps={getTabPanelProps('labels')}
            labelEntries={labelEntries}
            copiedField={copiedField}
            onCopy={handleCopy}
          />
        )}

        {activeTab === 'source' && (
          <AlertSourceTab
            tabPanelProps={getTabPanelProps('source')}
            sourceLoading={sourceLoading}
            sourceRule={sourceRule}
          />
        )}

        {activeTab === 'ai' && (
          <AlertAITab
            tabPanelProps={getTabPanelProps('ai')}
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
