// #6231: the regex-based maskSecretYaml that used to live here had two
// real bugs (block-scalar handling, false bundle-bloat claim about
// js-yaml). Replaced by a shared js-yaml-based helper in lib/yamlMask.
// Re-exported here for backward compat with any importer that might
// still reference SecretDrillDown.maskSecretYaml; new code should
// import maskKubernetesYamlData from '../../../lib/yamlMask' directly.
import { maskKubernetesYamlData } from '../../../lib/yamlMask'
/** @deprecated use `maskKubernetesYamlData` from `lib/yamlMask` */
export const maskSecretYaml = maskKubernetesYamlData

import { useSecretDrillDown } from './useSecretDrillDown'
import {
  SecretHeaderBreadcrumbs,
  SecretTabBar,
  SecretOverviewTab,
  SecretDataTab,
  SecretDescribeTab,
  SecretYamlTab,
} from './SecretDrillDown.parts'

interface Props {
  data: Record<string, unknown>
}

export function SecretDrillDown({ data }: Props) {
  const {
    cluster,
    namespace,
    secretName,
    drillToNamespace,
    drillToCluster,
    stackLength,
    pop,
    activeTab,
    setActiveTab,
    tabs,
    secretType,
    dataLoading,
    dataError,
    describeOutput,
    describeLoading,
    yamlOutput,
    yamlLoading,
    yamlRevealed,
    toggleYamlRevealed,
    copiedField,
    handleCopy,
    showAllData,
    setShowAllData,
    revealedKeys,
    toggleReveal,
    dataEntries,
    displayedData,
    labels,
  } = useSecretDrillDown(data)

  return (
    <div className="flex flex-col h-full -m-6">
      <SecretHeaderBreadcrumbs
        cluster={cluster}
        namespace={namespace}
        canGoBack={stackLength > 1}
        onBack={pop}
        onNamespaceClick={() => drillToNamespace(cluster, namespace)}
        onClusterClick={() => drillToCluster(cluster)}
      />
      <SecretTabBar tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {activeTab === 'overview' && (
          <SecretOverviewTab
            secretName={secretName}
            secretType={secretType}
            dataLoading={dataLoading}
            dataError={dataError}
            dataEntries={dataEntries}
            labels={labels}
          />
        )}
        {activeTab === 'data' && (
          <SecretDataTab
            dataEntries={dataEntries}
            displayedData={displayedData}
            revealedKeys={revealedKeys}
            copiedField={copiedField}
            showAllData={showAllData}
            onToggleReveal={toggleReveal}
            onCopy={handleCopy}
            onToggleShowAll={() => setShowAllData(!showAllData)}
          />
        )}
        {activeTab === 'describe' && (
          <SecretDescribeTab
            describeLoading={describeLoading}
            describeOutput={describeOutput}
            copiedField={copiedField}
            onCopy={handleCopy}
          />
        )}
        {activeTab === 'yaml' && (
          <SecretYamlTab
            yamlLoading={yamlLoading}
            yamlOutput={yamlOutput}
            yamlRevealed={yamlRevealed}
            copiedField={copiedField}
            onToggleReveal={toggleYamlRevealed}
            onCopy={handleCopy}
          />
        )}
      </div>
    </div>
  )
}
