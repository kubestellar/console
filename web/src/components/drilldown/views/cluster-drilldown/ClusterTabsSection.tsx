import type { RefObject } from "react";
import { useTranslation } from "react-i18next";
import type {
  ClusterEvent,
  ClusterHealth,
  Deployment,
  NamespaceStats,
  NodeInfo,
  PVC,
  PodIssue,
  Service,
} from "../../../../hooks/useMCP";
import { cn } from "../../../../lib/cn";
import { ClusterEventsTab } from "./ClusterEventsTab";
import { ClusterResourceTree } from "./ClusterResourceTree";
import type { ClusterTab, TreeLens } from "./types";

interface ClusterTabsSectionProps {
  resourceTreeRef: RefObject<HTMLDivElement | null>;
  activeTab: ClusterTab;
  setActiveTab: (tab: ClusterTab) => void;
  clusterEvents: ClusterEvent[];
  issueCounts: {
    nodes: number;
    deployments: number;
    pods: number;
    pvcs: number;
    total: number;
  };
  effectiveClusterName: string;
  clusterDisplayName: string;
  health: ClusterHealth | null | undefined;
  filteredNodes: NodeInfo[];
  filteredNamespaces: string[];
  filteredNamespaceStats: NamespaceStats[];
  unhealthyDeployments: Deployment[];
  filteredServices: Service[];
  filteredPVCs: PVC[];
  namespaceResources: {
    podIssueCounts: Record<string, number>;
    deploymentIssueCounts: Record<string, number>;
  };
  hasVisibleResourceData: boolean;
  activeLens: TreeLens;
  setActiveLens: (lens: TreeLens) => void;
  searchFilter: string;
  setSearchFilter: (filter: string) => void;
  expandedSections: Set<string>;
  toggleSection: (section: string) => void;
  podIssues: PodIssue[];
  eventsLoading: boolean;
  drillToNode: (
    cluster: string,
    node: string,
    data?: Record<string, unknown>,
  ) => void;
  drillToNamespace: (cluster: string, namespace: string) => void;
  drillToPod: (
    cluster: string,
    namespace: string,
    pod: string,
    data?: Record<string, unknown>,
  ) => void;
  drillToEvents: (cluster: string) => void;
}

export function ClusterTabsSection({
  resourceTreeRef,
  activeTab,
  setActiveTab,
  clusterEvents,
  issueCounts,
  effectiveClusterName,
  clusterDisplayName,
  health,
  filteredNodes,
  filteredNamespaces,
  filteredNamespaceStats,
  unhealthyDeployments,
  filteredServices,
  filteredPVCs,
  namespaceResources,
  hasVisibleResourceData,
  activeLens,
  setActiveLens,
  searchFilter,
  setSearchFilter,
  expandedSections,
  toggleSection,
  podIssues,
  eventsLoading,
  drillToNode,
  drillToNamespace,
  drillToPod,
  drillToEvents,
}: ClusterTabsSectionProps) {
  const { t } = useTranslation(["common", "cards"]);

  return (
    <div ref={resourceTreeRef} className="border-t border-border pt-4">
      <div className="border-b border-border mb-4">
        <div className="flex gap-0">
          {[
            {
              id: "events" as ClusterTab,
              label: t("drilldown.fields.recentEvents"),
              count: clusterEvents.length,
            },
            {
              id: "resources" as ClusterTab,
              label: t("workloadMonitor.resourceTree", { ns: "cards" }),
              count: issueCounts.total > 0 ? issueCounts.total : undefined,
            },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "px-4 py-2 text-sm font-medium flex items-center gap-2 border-b-2 transition-colors",
                activeTab === tab.id
                  ? "text-primary border-primary"
                  : "text-muted-foreground border-transparent hover:text-foreground hover:border-border",
              )}
            >
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span
                  className={cn(
                    "text-xs px-1.5 py-0.5 rounded-full",
                    activeTab === tab.id
                      ? "bg-primary/20 text-primary"
                      : tab.id === "resources"
                        ? "bg-red-500/20 text-red-400"
                        : "bg-secondary text-muted-foreground",
                  )}
                >
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "events" && (
        <ClusterEventsTab
          clusterEvents={clusterEvents}
          eventsLoading={eventsLoading}
          effectiveClusterName={effectiveClusterName}
          onDrillToEvents={drillToEvents}
        />
      )}

      {activeTab === "resources" && (
        <ClusterResourceTree
          effectiveClusterName={effectiveClusterName}
          clusterDisplayName={clusterDisplayName}
          health={health}
          filteredNodes={filteredNodes}
          filteredNamespaces={filteredNamespaces}
          filteredNamespaceStats={filteredNamespaceStats}
          unhealthyDeployments={unhealthyDeployments}
          filteredServices={filteredServices}
          filteredPVCs={filteredPVCs}
          namespaceResources={namespaceResources}
          issueCounts={issueCounts}
          hasVisibleResourceData={hasVisibleResourceData}
          activeLens={activeLens}
          setActiveLens={setActiveLens}
          searchFilter={searchFilter}
          setSearchFilter={setSearchFilter}
          expandedSections={expandedSections}
          toggleSection={toggleSection}
          podIssues={podIssues}
          drillToNode={drillToNode}
          drillToNamespace={drillToNamespace}
          drillToPod={drillToPod}
        />
      )}
    </div>
  );
}
