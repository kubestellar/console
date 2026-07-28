import { ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { DeploymentIssue, PodIssue } from "../../../../hooks/useMCP";
import { StatusBadge } from "../../../ui/StatusBadge";

interface ClusterIssuesSectionProps {
  podIssues: PodIssue[];
  clusterDeploymentIssues: DeploymentIssue[];
  effectiveClusterName: string;
  onDrillToPod: (
    cluster: string,
    namespace: string,
    pod: string,
    data?: Record<string, unknown>,
  ) => void;
  onDrillToNamespace: (cluster: string, namespace: string) => void;
}

export function ClusterIssuesSection({
  podIssues,
  clusterDeploymentIssues,
  effectiveClusterName,
  onDrillToPod,
  onDrillToNamespace,
}: ClusterIssuesSectionProps) {
  const { t } = useTranslation();
  const totalIssueCount = podIssues.length + clusterDeploymentIssues.length;

  if (totalIssueCount === 0) {
    return null;
  }

  return (
    <div>
      <h3 className="text-lg font-semibold text-foreground mb-4">
        {t("clusterDetail.issuesCount", { count: totalIssueCount })}
      </h3>

      {podIssues.length > 0 && (
        <div className="mb-4">
          <h4 className="text-sm font-medium text-muted-foreground mb-2">
            {t("drilldown.namespace.podIssues")}
          </h4>
          <div className="space-y-2">
            {podIssues.map((issue) => (
              <div
                key={`${issue.namespace}/${issue.name}`}
                onClick={() =>
                  onDrillToPod(
                    effectiveClusterName,
                    issue.namespace,
                    issue.name,
                    { ...issue },
                  )
                }
                className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 cursor-pointer hover:bg-red-500/20 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-foreground">
                      {issue.name}
                    </span>
                    <div className="text-xs text-muted-foreground mt-1">
                      {issue.namespace} •{" "}
                      {t("clusterDetail.restarts", { count: issue.restarts })}
                    </div>
                    {(issue.issues || []).length > 0 && (
                      <div className="text-xs text-red-400 mt-1">
                        {(issue.issues || []).join(", ")}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <StatusBadge color="red" size="xs">
                      {issue.status}
                    </StatusBadge>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {clusterDeploymentIssues.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-2">
            {t("drilldown.namespace.deploymentIssues")}
          </h4>
          <div className="space-y-2">
            {clusterDeploymentIssues.map((issue) => (
              <div
                key={`${issue.namespace}/${issue.name}`}
                onClick={() =>
                  onDrillToNamespace(effectiveClusterName, issue.namespace)
                }
                className="p-3 rounded-lg bg-orange-500/10 border border-orange-500/20 cursor-pointer hover:bg-orange-500/20 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-foreground">
                      {issue.name}
                    </span>
                    <div className="text-xs text-muted-foreground mt-1">
                      {issue.namespace}
                    </div>
                    {issue.message && (
                      <div className="text-xs text-orange-400 mt-1">
                        {issue.message}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <StatusBadge color="orange" size="xs">
                      {t("cluster.readyReplicas", {
                        ready: issue.readyReplicas,
                        total: issue.replicas,
                      })}
                    </StatusBadge>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface ClusterNamespacesSectionProps {
  namespaces: string[];
  namespaceResources: {
    podIssueCounts: Record<string, number>;
    deploymentIssueCounts: Record<string, number>;
  };
  effectiveClusterName: string;
  onDrillToNamespace: (cluster: string, namespace: string) => void;
}

export function ClusterNamespacesSection({
  namespaces,
  namespaceResources,
  effectiveClusterName,
  onDrillToNamespace,
}: ClusterNamespacesSectionProps) {
  const { t } = useTranslation();

  if (namespaces.length === 0) {
    return null;
  }

  return (
    <div>
      <h3 className="text-lg font-semibold text-foreground mb-4">
        {t("drilldown.cluster.namespacesWithActivity")}
      </h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {namespaces.map((ns) => {
          const nsIssues =
            (namespaceResources.podIssueCounts[ns] || 0) +
            (namespaceResources.deploymentIssueCounts[ns] || 0);
          return (
            <button
              key={ns}
              onClick={() => onDrillToNamespace(effectiveClusterName, ns)}
              className="p-3 rounded-lg bg-card/50 border border-border text-left hover:bg-card hover:border-primary/50 transition-colors"
            >
              <div className="font-medium text-foreground text-sm truncate">
                {ns}
              </div>
              {nsIssues > 0 && (
                <div className="text-xs text-red-400 mt-1">
                  {t("drilldown.cluster.namespaceIssueCount", {
                    count: nsIssues,
                  })}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
