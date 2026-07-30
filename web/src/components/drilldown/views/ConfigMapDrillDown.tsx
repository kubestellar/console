import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useDrillDownActions, useDrillDown } from '../../../hooks/useDrillDown'
import { FileText, Code, Info, Database } from 'lucide-react'
import { cn } from '../../../lib/cn'
import { useTabKeyboardNav } from '../../../hooks/useKeyboardNav'
// #6231: switched from the regex-based maskSecretYaml to the shared js-yaml-based helper.
import { maskKubernetesYamlData } from '../../../lib/yamlMask'
import { Lock } from 'lucide-react'
import { useConfigMapDrillDown } from './useConfigMapDrillDown'
import {
  ConfigMapDrillDownHeader,
  ConfigMapOverviewTab,
  ConfigMapDataTab,
  ConfigMapOutputPane,
} from './ConfigMapDrillDown.parts'

interface Props {
  data: Record<string, unknown>
}

type TabType = 'overview' | 'data' | 'describe' | 'yaml'

export function ConfigMapDrillDown({ data }: Props) {
  const { t } = useTranslation()
  const cluster = typeof data.cluster === 'string' ? data.cluster : ''
  const namespace = typeof data.namespace === 'string' ? data.namespace : ''
  const configmapName = typeof data.configmap === 'string' ? data.configmap : ''
  const { drillToNamespace, drillToCluster } = useDrillDownActions()
  const { state, pop } = useDrillDown()
  const clusterShort = cluster.split('/').pop() || cluster
  const hasRequiredContext = Boolean(cluster && namespace && configmapName)

  const [activeTab, setActiveTab] = useState<TabType>('overview')
  const { tabListProps, getTabProps, getTabPanelProps } = useTabKeyboardNav<TabType>({
    tabs: ['overview', 'data', 'describe', 'yaml'],
    activeTab,
    onChange: setActiveTab,
  })

  const {
    configmapData,
    dataLoading,
    dataError,
    labels,
    describeOutput,
    describeLoading,
    yamlOutput,
    yamlLoading,
    copiedField,
    showAllData,
    revealAll,
    setShowAllData,
    toggleRevealAll,
    toggleReveal,
    isRevealed,
    handleCopy,
  } = useConfigMapDrillDown(cluster, namespace, configmapName, hasRequiredContext)

  const TABS: { id: TabType; label: string; icon: typeof Info }[] = [
    { id: 'overview', label: t('drilldown.tabs.overview', 'Overview'), icon: Info },
    { id: 'data', label: t('drilldown.tabs.data', 'Data'), icon: Database },
    { id: 'describe', label: t('drilldown.tabs.describe', 'Describe'), icon: FileText },
    { id: 'yaml', label: t('drilldown.tabs.yaml', 'YAML'), icon: Code },
  ]

  const dataEntries = Object.entries(configmapData || {}) as [string, string][]
  const displayedData = showAllData ? dataEntries : dataEntries.slice(0, 5)
  const displayedYaml = revealAll ? yamlOutput : (yamlOutput ? maskKubernetesYamlData(yamlOutput) : null)

  return (
    <div className="flex flex-col h-full -m-6">
      <ConfigMapDrillDownHeader
        cluster={cluster}
        namespace={namespace}
        clusterShort={clusterShort}
        canGoBack={state.stack.length > 1}
        onBack={pop}
        onDrillToNamespace={drillToNamespace}
        onDrillToCluster={drillToCluster}
      />

      {/* Tabs */}
      <div className="border-b border-border px-6">
        <div {...tabListProps} className="flex gap-1">
          {TABS.map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                {...getTabProps(tab.id)}
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
          <ConfigMapOverviewTab
            hasRequiredContext={hasRequiredContext}
            dataLoading={dataLoading}
            dataError={dataError}
            configmapName={configmapName}
            dataEntries={dataEntries}
            labels={labels}
            tabPanelProps={getTabPanelProps('overview') as Record<string, unknown>}
          />
        )}
        {activeTab === 'data' && (
          <ConfigMapDataTab
            dataEntries={dataEntries}
            displayedData={displayedData}
            showAllData={showAllData}
            revealAll={revealAll}
            copiedField={copiedField}
            isRevealed={isRevealed}
            toggleReveal={toggleReveal}
            toggleRevealAll={toggleRevealAll}
            handleCopy={handleCopy}
            setShowAllData={setShowAllData}
            tabPanelProps={getTabPanelProps('data') as Record<string, unknown>}
          />
        )}
        {activeTab === 'describe' && (
          <ConfigMapOutputPane
            loading={describeLoading}
            displayedContent={describeOutput}
            copiedField={copiedField}
            copiedFieldKey="describe"
            loadingText={t('drilldown.status.runningDescribe')}
            onCopy={handleCopy}
            tabPanelProps={getTabPanelProps('describe') as Record<string, unknown>}
          />
        )}
        {activeTab === 'yaml' && (
          <ConfigMapOutputPane
            loading={yamlLoading}
            displayedContent={displayedYaml}
            copiedField={copiedField}
            copiedFieldKey="yaml"
            loadingText={t('drilldown.status.fetchingYaml')}
            onCopy={handleCopy}
            tabPanelProps={getTabPanelProps('yaml') as Record<string, unknown>}
            infoBanner={
              /* #6211: masking notice for the YAML tab */
              <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-sm text-yellow-400 flex items-center gap-2 mb-3">
                <Lock className="w-4 h-4" />
                {revealAll
                  ? 'ConfigMap values are visible. Use "Mask all" on the Data tab to hide.'
                  : 'ConfigMap values are hidden by default. Use "Reveal all" on the Data tab to show.'}
              </div>
            }
          />
        )}
      </div>
    </div>
  )
}
