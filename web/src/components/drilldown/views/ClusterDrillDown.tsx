import { useTranslation } from "react-i18next";
import { useClusterDrillDown } from "./cluster-drilldown/ClusterDrillDown.hooks";
import { ClusterDrillDownSkeleton } from "./cluster-drilldown/ClusterDrillDownSkeleton";
import {
  ClusterGPUNodesSection,
  ClusterGPUTypeBreakdown,
} from "./cluster-drilldown/ClusterGPUSections";
import {
  ClusterIssuesSection,
  ClusterNamespacesSection,
} from "./cluster-drilldown/ClusterIssuesSections";
import { ClusterOverviewStats } from "./cluster-drilldown/ClusterOverviewStats";
import { ClusterTabsSection } from "./cluster-drilldown/ClusterTabsSection";

interface Props {
  data: Record<string, unknown>;
}

export function ClusterDrillDown({ data }: Props) {
  const { t } = useTranslation();
  const drillDown = useClusterDrillDown(data);

  if (!drillDown.clusterName) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        {t("drilldown.empty.noClusterSelected")}
      </div>
    );
  }

  if (drillDown.isLoading) {
    return <ClusterDrillDownSkeleton />;
  }

  return (
    <div className="space-y-6">
      <ClusterOverviewStats
        health={drillDown.health}
        totalGPUs={drillDown.totalGPUs}
        allocatedGPUs={drillDown.allocatedGPUs}
        onNavigateToResourceTree={drillDown.navigateToResourceTree}
      />

      <ClusterGPUTypeBreakdown gpuByType={drillDown.gpuByType} />

      <ClusterIssuesSection
        podIssues={drillDown.podIssues}
        clusterDeploymentIssues={drillDown.clusterDeploymentIssues}
        effectiveClusterName={drillDown.effectiveClusterName}
        onDrillToPod={drillDown.drillToPod}
        onDrillToNamespace={drillDown.drillToNamespace}
      />

      <ClusterNamespacesSection
        namespaces={drillDown.namespaces}
        namespaceResources={drillDown.namespaceResources}
        effectiveClusterName={drillDown.effectiveClusterName}
        onDrillToNamespace={drillDown.drillToNamespace}
      />

      <ClusterGPUNodesSection
        clusterGPUNodes={drillDown.clusterGPUNodes}
        effectiveClusterName={drillDown.effectiveClusterName}
        onDrillToGPUNode={drillDown.drillToGPUNode}
      />

      <ClusterTabsSection
        resourceTreeRef={drillDown.resourceTreeRef}
        activeTab={drillDown.activeTab}
        setActiveTab={drillDown.setActiveTab}
        clusterEvents={drillDown.clusterEvents}
        issueCounts={drillDown.issueCounts}
        effectiveClusterName={drillDown.effectiveClusterName}
        clusterDisplayName={drillDown.clusterDisplayName}
        health={drillDown.health}
        filteredNodes={drillDown.filteredNodes}
        filteredNamespaces={drillDown.filteredNamespaces}
        filteredNamespaceStats={drillDown.filteredNamespaceStats}
        unhealthyDeployments={drillDown.unhealthyDeployments}
        filteredServices={drillDown.filteredServices}
        filteredPVCs={drillDown.filteredPVCs}
        namespaceResources={drillDown.namespaceResources}
        hasVisibleResourceData={drillDown.hasVisibleResourceData}
        activeLens={drillDown.activeLens}
        setActiveLens={drillDown.setActiveLens}
        searchFilter={drillDown.searchFilter}
        setSearchFilter={drillDown.setSearchFilter}
        expandedSections={drillDown.expandedSections}
        toggleSection={drillDown.toggleSection}
        podIssues={drillDown.podIssues}
        eventsLoading={drillDown.eventsLoading}
        drillToNode={drillDown.drillToNode}
        drillToNamespace={drillDown.drillToNamespace}
        drillToPod={drillDown.drillToPod}
        drillToEvents={drillDown.drillToEvents}
      />
    </div>
  );
}
