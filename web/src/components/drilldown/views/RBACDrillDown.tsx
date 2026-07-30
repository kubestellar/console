import { useState } from 'react'
import { useDrillDownActions } from '../../../hooks/useDrillDown'
import { FileText, Code, Shield, Info } from 'lucide-react'
import { cn } from '../../../lib/cn'
import { useTranslation } from 'react-i18next'
import { useRBACDrillDown, type DrillDownKind } from './useRBACDrillDown'
import { RBACDrillDownHeader, RBACOverviewTab, RBACOutputPane } from './RBACDrillDown.parts'

interface Props {
  data: Record<string, unknown>
}

type TabType = 'overview' | 'describe' | 'yaml'

export function RBACDrillDown({ data }: Props) {
  const { t } = useTranslation()
  const cluster = data.cluster as string
  const namespace = data.namespace as string | undefined
  const subject = data.subject as string
  const subjectType = ((data.type as string) || 'User') as DrillDownKind
  const { drillToCluster, drillToNamespace } = useDrillDownActions()

  const [activeTab, setActiveTab] = useState<TabType>('overview')

  const {
    agentConnected,
    clusterBindings,
    roleBindings,
    loading,
    loadError,
    describeOutput,
    describeLoading,
    yamlOutput,
    yamlLoading,
    copiedField,
    refreshing,
    totalBindings,
    hiddenBindingCount,
    fetchDescribe,
    fetchYaml,
    handleRefresh,
    handleCopy,
  } = useRBACDrillDown(cluster, namespace, subject, subjectType)

  const TABS: { id: TabType; label: string; icon: typeof Info }[] = [
    { id: 'overview', label: t('drilldown.rbac.bindingsTab', { count: totalBindings }), icon: Shield },
    { id: 'describe', label: t('drilldown.rbac.describeTab'), icon: FileText },
    { id: 'yaml', label: t('drilldown.rbac.yamlTab'), icon: Code },
  ]

  return (
    <div className="flex flex-col h-full -m-6">
      <RBACDrillDownHeader
        subjectType={subjectType}
        subject={subject}
        namespace={namespace}
        cluster={cluster}
        agentConnected={agentConnected}
        refreshing={refreshing}
        onDrillToNamespace={drillToNamespace}
        onDrillToCluster={drillToCluster}
        onRefresh={handleRefresh}
      />

      {/* Tabs */}
      <div className="border-b border-border px-6">
        <div className="flex gap-1">
          {TABS.map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id)
                  if (tab.id === 'describe') fetchDescribe()
                  if (tab.id === 'yaml') fetchYaml()
                }}
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
          <RBACOverviewTab
            loadError={loadError}
            loading={loading}
            totalBindings={totalBindings}
            subjectType={subjectType}
            subject={subject}
            clusterBindings={clusterBindings}
            roleBindings={roleBindings}
          />
        )}
        {activeTab === 'describe' && (
          <div>
            <RBACOutputPane
              loading={describeLoading}
              output={describeOutput}
              copiedField={copiedField}
              copiedFieldKey="describe"
              hiddenBindingCount={hiddenBindingCount}
              totalBindings={totalBindings}
              loadingText={t('drilldown.status.runningDescribe')}
              onCopy={handleCopy}
            />
          </div>
        )}
        {activeTab === 'yaml' && (
          <div>
            <RBACOutputPane
              loading={yamlLoading}
              output={yamlOutput}
              copiedField={copiedField}
              copiedFieldKey="yaml"
              hiddenBindingCount={hiddenBindingCount}
              totalBindings={totalBindings}
              loadingText={t('drilldown.status.fetchingYaml')}
              onCopy={handleCopy}
            />
          </div>
        )}
      </div>
    </div>
  )
}
