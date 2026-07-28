import { useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useLocalAgent } from '../../../hooks/useLocalAgent'
import { useDrillDownWebSocket } from '../../../hooks/useDrillDownWebSocket'
import { useDrillDownActions, useDrillDown } from '../../../hooks/useDrillDown'
import { FileText, Code, Info, Zap, Box } from 'lucide-react'
import { moveFocusByKey } from '../../../lib/a11y/rovingFocus'
import { getHealthColors } from '../../../lib/statusColors'
import { useTranslation } from 'react-i18next'
import { PageErrorBoundary } from '../../PageErrorBoundary'
import {
  DeploymentHeader,
  DeploymentOverviewPanel,
  DeploymentPodsPanel,
  DeploymentOutputPanel,
  DeploymentTabs,
  useCopyFeedback,
  useDeploymentData,
  type TabType,
  type Props,
} from './deployment-drilldown'

function DeploymentDrillDownContent({ data }: Props) {
  const { t } = useTranslation()
  const cluster = (data.cluster as string) || ''
  const namespace = (data.namespace as string) || ''
  const deploymentName = (data.deployment as string) || ''
  const { isConnected: agentConnected } = useLocalAgent()
  const { drillToNamespace, drillToCluster, drillToPod, drillToReplicaSet } = useDrillDownActions()
  const { state, pop } = useDrillDown()
  const { runKubectl } = useDrillDownWebSocket(cluster)
  const { copiedField, handleCopy } = useCopyFeedback()

  const [activeTab, setActiveTab] = useState<TabType>((data.tab as TabType) || 'overview')

  const {
    replicas,
    readyReplicas,
    pods,
    replicaSets,
    labels,
    eventsOutput,
    eventsLoading,
    describeOutput,
    describeLoading,
    yamlOutput,
    yamlLoading,
    canScale,
    isScaling,
    scaleError,
    isRefreshing,
    liveReason,
    liveMessage,
    handleDecrement,
    handleIncrement,
    handleRefreshAll,
  } = useDeploymentData({ agentConnected, cluster, namespace, deploymentName, data, runKubectl })

  const isHealthy = readyReplicas === replicas && replicas > 0
  const healthColors = getHealthColors(isHealthy)

  const TABS: { id: TabType; label: string; icon: typeof Info }[] = [
    { id: 'overview', label: t('drilldown.tabs.overview', 'Overview'), icon: Info },
    { id: 'pods', label: `${t('drilldown.tabs.pods', 'Pods')} (${pods.length})`, icon: Box },
    { id: 'events', label: t('drilldown.tabs.events', 'Events'), icon: Zap },
    { id: 'describe', label: t('drilldown.tabs.describe', 'Describe'), icon: FileText },
    { id: 'yaml', label: t('drilldown.tabs.yaml', 'YAML'), icon: Code },
  ]

  const handleTabKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const nextTab = moveFocusByKey(event, { selector: '[role="tab"]', orientation: 'horizontal' })
    const nextTabId = nextTab?.dataset.tabId as TabType | undefined
    if (nextTabId) {
      setActiveTab(nextTabId)
    }
  }

  const handleButtonLikeKeyDown = (
    event: ReactKeyboardEvent<HTMLDivElement>,
    action: () => void,
    disabled = false,
  ) => {
    if (disabled) {
      return
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      action()
    }
  }

  return (
    <div className="flex flex-col h-full -m-6">
      <DeploymentHeader
        cluster={cluster}
        namespace={namespace}
        stackDepth={state.stack.length}
        agentConnected={agentConnected}
        isRefreshing={isRefreshing}
        onBack={pop}
        onDrillToNamespace={() => drillToNamespace(cluster, namespace)}
        onDrillToCluster={() => drillToCluster(cluster)}
        onRefreshAll={() => {
          void handleRefreshAll()
        }}
        onButtonLikeKeyDown={handleButtonLikeKeyDown}
      />

      <DeploymentTabs
        tabs={TABS}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onTabKeyDown={handleTabKeyDown}
        ariaLabel={t('drilldown.deployment.tabs', 'Deployment tabs')}
      />

      <div
        id={`deployment-panel-${activeTab}`}
        role="tabpanel"
        tabIndex={0}
        aria-labelledby={`deployment-tab-${activeTab}`}
        className="flex-1 overflow-y-auto p-6 space-y-6"
      >
        {activeTab === 'overview' && (
          <DeploymentOverviewPanel
            isHealthy={isHealthy}
            healthColors={healthColors}
            liveReason={liveReason}
            liveMessage={liveMessage}
            replicas={replicas}
            readyReplicas={readyReplicas}
            canScale={canScale}
            isScaling={isScaling}
            scaleError={scaleError}
            replicaSets={replicaSets}
            labels={labels}
            onScaleDown={handleDecrement}
            onScaleUp={handleIncrement}
            onDrillToReplicaSet={(rsName) => drillToReplicaSet(cluster, namespace, rsName)}
          />
        )}

        {activeTab === 'pods' && (
          <DeploymentPodsPanel
            pods={pods}
            onDrillToPod={(pod) => drillToPod(cluster, namespace, pod.name, { status: pod.status, restarts: pod.restarts })}
          />
        )}

        {activeTab === 'events' && (
          <DeploymentOutputPanel
            loading={eventsLoading}
            output={eventsOutput}
            loadingMessage={t('drilldown.status.fetchingEvents')}
            notConnectedMessage=""
            noResourcesMessage="No events found for this Deployment"
          />
        )}

        {activeTab === 'describe' && (
          <DeploymentOutputPanel
            loading={describeLoading}
            output={describeOutput}
            loadingMessage={t('drilldown.status.runningDescribe')}
            notConnectedMessage=""
            enableCopy
            copyField="describe"
            copiedField={copiedField}
            onCopy={handleCopy}
          />
        )}

        {activeTab === 'yaml' && (
          <DeploymentOutputPanel
            loading={yamlLoading}
            output={yamlOutput}
            loadingMessage={t('drilldown.status.fetchingYaml')}
            notConnectedMessage=""
            enableCopy
            copyField="yaml"
            copiedField={copiedField}
            onCopy={handleCopy}
          />
        )}
      </div>
    </div>
  )
}

export function DeploymentDrillDown(props: Props) {
  return (
    <PageErrorBoundary>
      <DeploymentDrillDownContent {...props} />
    </PageErrorBoundary>
  )
}
