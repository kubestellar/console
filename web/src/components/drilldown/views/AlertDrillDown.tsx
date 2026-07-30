import { useState } from 'react'
import { useDrillDownActions, useDrillDown } from '../../../hooks/useDrillDown'
import { useMissions } from '../../../hooks/useMissions'
import { useTabKeyboardNav } from '../../../hooks/useKeyboardNav'
import { AIActionBar } from '../../modals'
import { useTranslation } from 'react-i18next'
import { type TabType } from './AlertDrillDown.types'
import { useAlertDrillDown } from './useAlertDrillDown'
import {
  ALERT_TABS,
  AlertDrillDownHeader,
  AlertOverviewTab,
  AlertLabelsTab,
  AlertSourceTab,
  AlertAITab,
} from './AlertDrillDown.parts'

interface Props {
  data: Record<string, unknown>
}

export function AlertDrillDown({ data }: Props) {
  const { t } = useTranslation()

  const {
    cluster,
    namespace,
    alertName,
    alertSeverity,
    alertState,
    alertMessage,
    alertStartsAt,
    alertLabels,
    alertAnnotations,
    alertSource,
    sourceRule,
    sourceLoading,
    copiedField,
    handleCopy,
    resourceContext,
    issues,
    defaultAIActions,
    handleAIAction,
    isAgentConnected,
  } = useAlertDrillDown(data)

  const { drillToNamespace, drillToCluster, drillToPod, drillToDeployment, drillToAlertRule } = useDrillDownActions()
  const { close: closeDrillDown } = useDrillDown()
  const { startMission } = useMissions()

  const [activeTab, setActiveTab] = useState<TabType>('overview')
  const { tabListProps, getTabProps, getTabPanelProps } = useTabKeyboardNav<TabType>({
    tabs: ['overview', 'labels', 'source', 'ai'],
    activeTab,
    onChange: setActiveTab,
  })

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
1. Investigate the alert — explain what it means and identify the root cause.
2. Tell me what you found, then ask:
   - "Should I apply the fix?"
   - "Show me the investigation details first"
3. If I say fix it, apply and verify. Then ask:
   - "Should I silence this alert or set up a preventive rule?"
   - "All done"`

    closeDrillDown()
    startMission({
      title: t('drilldown.alertDetail.diagnoseMissionTitle', { alertName }),
      description: t('drilldown.alertDetail.diagnoseMissionDescription', { severity: alertSeverity }),
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

  const relatedPod = alertLabels.pod
  const relatedNamespace = alertLabels.namespace || namespace
  const relatedDeployment = alertLabels.deployment
  const alertRuleName = alertLabels.alertname || alertName
  const labelEntries = Object.entries(alertLabels)

  return (
    <div className="flex flex-col h-full -m-6">
      <AlertDrillDownHeader
        cluster={cluster}
        namespace={namespace}
        alertSeverity={alertSeverity}
        alertState={alertState}
        onNamespaceClick={() => namespace && drillToNamespace(cluster, namespace)}
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

      {/* Tabs */}
      <div className="border-b border-border px-6">
        <div {...tabListProps} className="flex gap-1">
          {ALERT_TABS.map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                {...getTabProps(tab.id)}
                className={`px-4 py-2 text-sm font-medium flex items-center gap-2 border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'text-primary border-primary'
                    : 'text-muted-foreground border-transparent hover:text-foreground hover:border-border'
                }`}
              >
                <Icon className="w-4 h-4" />
                {t(tab.labelKey)}
              </button>
            )
          })}
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {activeTab === 'overview' && (
          <div {...getTabPanelProps('overview')}>
            <AlertOverviewTab
              alertName={alertName}
              alertMessage={alertMessage}
              alertStartsAt={alertStartsAt}
              alertSource={alertSource}
              alertSeverity={alertSeverity}
              alertAnnotations={alertAnnotations}
              alertLabels={alertLabels}
              relatedPod={relatedPod}
              relatedNamespace={relatedNamespace}
              relatedDeployment={relatedDeployment}
              alertRuleName={alertRuleName}
              onPodClick={() => relatedPod && relatedNamespace && drillToPod(cluster, relatedNamespace, relatedPod)}
              onDeploymentClick={() => relatedDeployment && relatedNamespace && drillToDeployment(cluster, relatedNamespace, relatedDeployment)}
              onAlertRuleClick={() => drillToAlertRule(cluster, namespace || 'monitoring', alertRuleName)}
              onShowAllLabels={() => setActiveTab('labels')}
            />
          </div>
        )}

        {activeTab === 'labels' && (
          <div {...getTabPanelProps('labels')}>
            <AlertLabelsTab
              labelEntries={labelEntries}
              copiedField={copiedField}
              onCopy={handleCopy}
            />
          </div>
        )}

        {activeTab === 'source' && (
          <div {...getTabPanelProps('source')}>
            <AlertSourceTab sourceLoading={sourceLoading} sourceRule={sourceRule} />
          </div>
        )}

        {activeTab === 'ai' && (
          <div {...getTabPanelProps('ai')}>
            <AlertAITab
              isAgentConnected={isAgentConnected}
              aiAnalysis={null}
              aiAnalysisLoading={false}
              onDiagnose={handleDiagnose}
            />
          </div>
        )}
      </div>
    </div>
  )
}
