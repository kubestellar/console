import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCachedPVCs } from "../../../../hooks/useCachedData";
import { useDrillDownActions } from "../../../../hooks/useDrillDown";
import {
  useClusterHealth,
  useClusters,
  useDeploymentIssues,
  useDeployments,
  useEvents,
  useGPUNodes,
  useNamespaces,
  useNamespaceStats,
  useNodes,
  usePodIssues,
  useServices,
  type ClusterInfo,
} from "../../../../hooks/useMCP";
import { LOADING_TIMEOUT_MS } from "../../../../lib/constants/network";
import {
  buildClusterLookupNames,
  buildFilteredNamespaceStats,
  buildGpuByType,
  buildNamespaceResources,
  buildNamespacesFromIssues,
  computeIssueCounts,
  filterClusterDeploymentIssues,
  filterClusterGPUNodes,
  filterDeploymentsForLens,
  filterNodesForLens,
  filterPVCsForLens,
  filterServicesForLens,
  sumGpuTotals,
} from "./derivedData";
import type { ClusterTab, TreeLens } from "./types";

/** Scroll delay (ms) to let the DOM update after switching tabs */
const SCROLL_AFTER_TAB_SWITCH_MS = 100;

export function useClusterDrillDown(data: Record<string, unknown>) {
  const clusterName = (data.cluster as string) || "";
  const { deduplicatedClusters } = useClusters();
  const {
    drillToNamespace,
    drillToPod,
    drillToGPUNode,
    drillToEvents,
    drillToNode,
  } = useDrillDownActions();
  const clusterInfo = useMemo(
    () =>
      deduplicatedClusters.find(
        (cluster: ClusterInfo) =>
          cluster.name === clusterName ||
          cluster.aliases?.includes(clusterName),
      ),
    [clusterName, deduplicatedClusters],
  );
  const effectiveClusterName = clusterInfo?.name || clusterName;
  const clusterDisplayName = clusterInfo?.name || clusterName;

  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(["cluster", "nodes", "namespaces"]),
  );
  const [searchFilter, setSearchFilter] = useState("");
  const [activeLens, setActiveLens] = useState<TreeLens>("all");
  const [activeTab, setActiveTab] = useState<ClusterTab>("events");
  const resourceTreeRef = useRef<HTMLDivElement | null>(null);
  const resourceTreeScrollTimeoutRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);

  useEffect(() => {
    return () => {
      if (resourceTreeScrollTimeoutRef.current) {
        clearTimeout(resourceTreeScrollTimeoutRef.current);
      }
    };
  }, []);

  const navigateToResourceTree = useCallback((lens: TreeLens) => {
    setActiveTab("resources");
    setActiveLens(lens);
    setExpandedSections((prev) => {
      const next = new Set(prev);
      next.add("cluster");
      if (lens === "nodes") next.add("nodes");
      if (lens === "workloads") next.add("namespaces");
      return next;
    });
    if (resourceTreeScrollTimeoutRef.current) {
      clearTimeout(resourceTreeScrollTimeoutRef.current);
    }
    resourceTreeScrollTimeoutRef.current = setTimeout(() => {
      resourceTreeRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
      resourceTreeScrollTimeoutRef.current = null;
    }, SCROLL_AFTER_TAB_SWITCH_MS);
  }, []);

  const [loadingTimedOut, setLoadingTimedOut] = useState(false);
  useEffect(() => {
    setLoadingTimedOut(false);
    const timer = setTimeout(
      () => setLoadingTimedOut(true),
      LOADING_TIMEOUT_MS,
    );
    return () => clearTimeout(timer);
  }, [effectiveClusterName]);

  const { health, isLoading: healthLoading } =
    useClusterHealth(effectiveClusterName);
  const isLoading = healthLoading && !loadingTimedOut;
  const { issues: podIssues } = usePodIssues(effectiveClusterName);
  const { issues: deploymentIssues } =
    useDeploymentIssues(effectiveClusterName);
  const { nodes: allGPUNodes } = useGPUNodes(effectiveClusterName);
  const { nodes: allNodes } = useNodes(effectiveClusterName);
  const { namespaces: allNamespaces } = useNamespaces(effectiveClusterName);
  const { stats: namespaceStats } = useNamespaceStats(effectiveClusterName);
  const { deployments: allDeployments } = useDeployments(effectiveClusterName);
  const { services: allServices } = useServices(effectiveClusterName);
  const { pvcs: allPVCs } = useCachedPVCs(effectiveClusterName);
  const { events: clusterEvents, isLoading: eventsLoading } = useEvents(
    effectiveClusterName,
    undefined,
    10,
  );

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  };

  const clusterLookupNames = useMemo(
    () =>
      buildClusterLookupNames(
        clusterName,
        effectiveClusterName,
        clusterInfo?.aliases,
      ),
    [clusterInfo?.aliases, clusterName, effectiveClusterName],
  );
  const clusterPrefix = useMemo(
    () => effectiveClusterName.split("/")[0],
    [effectiveClusterName],
  );
  const normalizedSearchFilter = useMemo(
    () => searchFilter.trim().toLowerCase(),
    [searchFilter],
  );

  const clusterGPUNodes = useMemo(
    () =>
      filterClusterGPUNodes(
        allGPUNodes,
        effectiveClusterName,
        clusterLookupNames,
        clusterPrefix,
      ),
    [allGPUNodes, clusterLookupNames, effectiveClusterName, clusterPrefix],
  );

  const clusterDeploymentIssues = useMemo(
    () =>
      filterClusterDeploymentIssues(
        deploymentIssues,
        effectiveClusterName,
        clusterLookupNames,
        clusterPrefix,
      ),
    [clusterLookupNames, effectiveClusterName, clusterPrefix, deploymentIssues],
  );

  const namespaces = useMemo(
    () => buildNamespacesFromIssues(podIssues, clusterDeploymentIssues),
    [podIssues, clusterDeploymentIssues],
  );

  const gpuByType = useMemo(
    () => buildGpuByType(clusterGPUNodes),
    [clusterGPUNodes],
  );

  const filteredNodes = useMemo(
    () => filterNodesForLens(allNodes, normalizedSearchFilter, activeLens),
    [activeLens, allNodes, normalizedSearchFilter],
  );

  const filteredNamespaceStats = useMemo(
    () =>
      buildFilteredNamespaceStats(
        namespaceStats,
        allNamespaces,
        normalizedSearchFilter,
      ),
    [allNamespaces, namespaceStats, normalizedSearchFilter],
  );

  const filteredNamespaces = useMemo(
    () => filteredNamespaceStats.map((ns) => ns.name),
    [filteredNamespaceStats],
  );

  const filteredDeployments = useMemo(
    () =>
      filterDeploymentsForLens(
        allDeployments,
        normalizedSearchFilter,
        activeLens,
      ),
    [activeLens, allDeployments, normalizedSearchFilter],
  );

  const unhealthyDeployments = useMemo(
    () => filteredDeployments.filter((d) => d.readyReplicas < d.replicas),
    [filteredDeployments],
  );

  const filteredServices = useMemo(
    () =>
      filterServicesForLens(allServices, normalizedSearchFilter, activeLens),
    [activeLens, allServices, normalizedSearchFilter],
  );

  const filteredPVCs = useMemo(
    () => filterPVCsForLens(allPVCs, normalizedSearchFilter, activeLens),
    [activeLens, allPVCs, normalizedSearchFilter],
  );

  const namespaceResources = useMemo(
    () => buildNamespaceResources(podIssues, clusterDeploymentIssues),
    [clusterDeploymentIssues, podIssues],
  );

  const hasVisibleResourceData =
    filteredNodes.length > 0 ||
    filteredNamespaces.length > 0 ||
    filteredDeployments.length > 0 ||
    filteredServices.length > 0 ||
    filteredPVCs.length > 0;

  const issueCounts = useMemo(
    () => computeIssueCounts(allNodes, allDeployments, podIssues, allPVCs),
    [allDeployments, allNodes, allPVCs, podIssues],
  );

  const { totalGPUs, allocatedGPUs } = sumGpuTotals(clusterGPUNodes);

  return {
    clusterName,
    effectiveClusterName,
    clusterDisplayName,
    health,
    isLoading,
    podIssues,
    clusterDeploymentIssues,
    clusterGPUNodes,
    clusterEvents,
    eventsLoading,
    namespaces,
    gpuByType,
    totalGPUs,
    allocatedGPUs,
    filteredNodes,
    filteredNamespaces,
    filteredNamespaceStats,
    unhealthyDeployments,
    filteredServices,
    filteredPVCs,
    namespaceResources,
    issueCounts,
    hasVisibleResourceData,
    activeLens,
    setActiveLens,
    searchFilter,
    setSearchFilter,
    expandedSections,
    toggleSection,
    activeTab,
    setActiveTab,
    resourceTreeRef,
    navigateToResourceTree,
    drillToNamespace,
    drillToPod,
    drillToGPUNode,
    drillToEvents,
    drillToNode,
  };
}
