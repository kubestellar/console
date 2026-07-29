import { useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useDrillDownActions, useDrillDown } from '../../../hooks/useDrillDown'
import { useMissions } from '../../../hooks/useMissions'
import { moveFocusByKey } from '../../../lib/a11y/rovingFocus'
import {
  AIActionBar,
  useModalAI,
  type ResourceContext,
} from '../../modals'
import { PageErrorBoundary } from '../../PageErrorBoundary'
import { getConditionStyle, type TabType } from './CRDDrillDown.types'
import { useCRDDrillDown } from './useCRDDrillDown'
import {
  CRDAITab,
  CRDDrillDownHeader,
  CRDInstancesTab,
  CRDOverviewTab,
  CRDSchemaTab,
  CRDTabBar,
  CRDVersionsTab,
} from './CRDDrillDown.parts'

interface Props {
  data: Record<string, unknown>
}

function CRDDrillDownContent({ data }: Props) {
  const cluster = data.cluster as string
  const crdName = data.crd as string

  // Additional CRD data
  const crdGroup = data.group as string | undefined
  const crdKind = (data.kind as string) || 'Unknown'
  const crdScope = (data.scope as string) || 'Namespaced'

  const { drillToCluster, drillToNamespace } = useDrillDownActions()
  const { state, pop, close: closeDrillDown } = useDrillDown()
  const { startMission } = useMissions()

  const [activeTab, setActiveTab] = useState<TabType>('overview')

  const {
    versions,
    versionsLoading,
    versionsError,
    instances,
    instancesLoading,
    instancesError,
    conditions,
    schema,
    schemaLoading,
    isEstablished,
    fetchSchema,
  } = useCRDDrillDown(cluster, crdName)

  // AI analysis is not yet wired to a streaming source; the tab renders its empty state.
  const aiAnalysis: string | null = null
  const aiAnalysisLoading = false

  // Resource context for AI actions
  const resourceContext: ResourceContext = {
    kind: 'CRD',
    name: crdName,
    cluster,
    status: isEstablished ? 'Established' : 'Not Established',
  }

  // Check for issues
  const hasIssues = !isEstablished
  const issues = hasIssues
    ? [{ name: crdName, message: 'CRD not established', severity: 'warning' }]
    : []

  // Use modal AI hook
  const { defaultAIActions, handleAIAction, isAgentConnected } = useModalAI({
    resource: resourceContext,
    issues,
    additionalContext: {
      group: crdGroup,
      kind: crdKind,
      scope: crdScope,
    },
  })

  // Start AI diagnosis
  const handleDiagnose = () => {
    const deprecatedVersions = versions?.filter(v => v.deprecated) || []
    const prompt = `Analyze this CustomResourceDefinition "${crdName}".

CRD Details:
- Name: ${crdName}
- Group: ${crdGroup || 'Unknown'}
- Kind: ${crdKind}
- Scope: ${crdScope}
- Established: ${isEstablished ? 'Yes' : 'No'}

Versions:
${(versions ?? []).map(v => `- ${v.name}: served=${v.served}, storage=${v.storage}${v.deprecated ? ' (DEPRECATED)' : ''}`).join('\n') || 'Unknown'}

${deprecatedVersions.length > 0 ? `
 Deprecated Versions Found:
${deprecatedVersions.map(v => `- ${v.name}: ${v.deprecationWarning || 'No warning message'}`).join('\n')}
` : ''}

Instances: ${instances?.length || 0} found

Please:
1. Assess the CRD health — check versions, deprecations, and schema.
2. Tell me what you found, then ask:
   - "Should I fix the issues I found?"
   - "Show me more details first"
3. If I say fix it, apply changes and verify. Then ask:
   - "Should I check related CRDs?"
   - "All done"`

    closeDrillDown() // Close panel so mission sidebar is visible
    startMission({
      title: `Diagnose CRD: ${crdName}`,
      description: `Analyze CustomResourceDefinition health and versions`,
      type: 'troubleshoot',
      cluster,
      initialPrompt: prompt,
      context: {
        kind: 'CRD',
        name: crdName,
        cluster,
        group: crdGroup,
      },
    })
  }

  const statusStyle = getConditionStyle(isEstablished ? 'True' : 'False')

  const selectTab = (tabId: TabType) => {
    setActiveTab(tabId)
    if (tabId === 'schema' && !schema) {
      fetchSchema()
    }
  }

  const handleTabKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const nextTab = moveFocusByKey(event, { selector: '[role="tab"]', orientation: 'horizontal' })
    const nextTabId = nextTab?.dataset.tabId as TabType | undefined
    if (nextTabId) {
      selectTab(nextTabId)
    }
  }

  return (
    <div className="flex flex-col h-full -m-6">
      <CRDDrillDownHeader
        cluster={cluster}
        crdScope={crdScope}
        isEstablished={isEstablished}
        statusStyle={statusStyle}
        canGoBack={state.stack.length > 1}
        onBack={pop}
        onClusterClick={() => drillToCluster(cluster)}
      />

      {/* AI Action Bar */}
      <div className="px-6 pb-4">
        <AIActionBar
          resource={resourceContext}
          actions={defaultAIActions}
          onAction={handleAIAction}
          issueCount={issues.length}
          compact={false}
        />
      </div>

      <CRDTabBar
        activeTab={activeTab}
        versionCount={versions?.length || 0}
        instanceCount={instances?.length || 0}
        onSelect={selectTab}
        onKeyDown={handleTabKeyDown}
      />

      {/* Tab Content */}
      <div
        id={`crd-panel-${activeTab}`}
        role="tabpanel"
        tabIndex={0}
        aria-labelledby={`crd-tab-${activeTab}`}
        className="flex-1 overflow-y-auto p-6 space-y-6"
      >
        {activeTab === 'overview' && (
          <CRDOverviewTab
            crdName={crdName}
            crdKind={crdKind}
            crdGroup={crdGroup}
            crdScope={crdScope}
            statusStyle={statusStyle}
            versions={versions}
            instances={instances}
            conditions={conditions}
          />
        )}

        {activeTab === 'versions' && (
          <CRDVersionsTab versions={versions} isLoading={versionsLoading} error={versionsError} />
        )}

        {activeTab === 'instances' && (
          <CRDInstancesTab
            instances={instances}
            isLoading={instancesLoading}
            error={instancesError}
            onInstanceClick={(namespace) => drillToNamespace(cluster, namespace)}
          />
        )}

        {activeTab === 'schema' && (
          <CRDSchemaTab schema={schema} isLoading={schemaLoading} />
        )}

        {activeTab === 'ai' && (
          <CRDAITab
            isAgentConnected={isAgentConnected}
            aiAnalysis={aiAnalysis}
            aiAnalysisLoading={aiAnalysisLoading}
            onDiagnose={handleDiagnose}
          />
        )}
      </div>
    </div>
  )
}

export function CRDDrillDown(props: Props) {
  return (
    <PageErrorBoundary>
      <CRDDrillDownContent {...props} />
    </PageErrorBoundary>
  )
}
