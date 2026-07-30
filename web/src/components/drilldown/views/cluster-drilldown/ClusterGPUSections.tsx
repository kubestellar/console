import { useTranslation } from "react-i18next";
import type { GPUNode } from "../../../../hooks/useMCP";
import { Gauge } from "../../../charts/Gauge";

interface ClusterGPUTypeBreakdownProps {
  gpuByType: Record<
    string,
    { total: number; allocated: number; nodes: number }
  >;
}

export function ClusterGPUTypeBreakdown({
  gpuByType,
}: ClusterGPUTypeBreakdownProps) {
  const { t } = useTranslation();

  if (Object.keys(gpuByType).length === 0) {
    return null;
  }

  return (
    <div>
      <h3 className="text-lg font-semibold text-foreground mb-3">
        {t("common.gpuTypes")}
      </h3>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {Object.entries(gpuByType).map(([type, info]) => (
          <div
            key={type}
            className="p-3 rounded-lg bg-purple-500/10 border border-purple-500/20"
          >
            <div className="text-sm font-medium text-purple-400">{type}</div>
            <div className="text-xl font-bold text-foreground mt-1">
              {info.total} {t("common.gpus")}
            </div>
            <div className="text-xs text-muted-foreground">
              {info.allocated} {t("clusterDetail.allocated")} •{" "}
              {t("clusterDetail.nodeCount", { count: info.nodes })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

interface ClusterGPUNodesSectionProps {
  clusterGPUNodes: GPUNode[];
  effectiveClusterName: string;
  onDrillToGPUNode: (
    cluster: string,
    node: string,
    data?: Record<string, unknown>,
  ) => void;
}

export function ClusterGPUNodesSection({
  clusterGPUNodes,
  effectiveClusterName,
  onDrillToGPUNode,
}: ClusterGPUNodesSectionProps) {
  const { t } = useTranslation();

  if (clusterGPUNodes.length === 0) {
    return null;
  }

  return (
    <div>
      <h3 className="text-lg font-semibold text-foreground mb-4">
        {t("drilldown.cluster.gpuNodesCount", {
          count: clusterGPUNodes.length,
        })}
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {clusterGPUNodes.map((node, i) => (
          <div
            key={i}
            onClick={() =>
              onDrillToGPUNode(effectiveClusterName, node.name, { ...node })
            }
            className="p-4 rounded-lg bg-card/50 border border-border flex items-center justify-between cursor-pointer hover:bg-card hover:border-primary/50 transition-colors"
          >
            <div className="min-w-0 flex-1">
              <div className="font-medium text-foreground text-sm truncate">
                {node.name}
              </div>
              <div className="text-xs text-muted-foreground">
                {node.gpuType}
              </div>
            </div>
            <div className="flex items-center gap-3 ml-4">
              <Gauge value={node.gpuAllocated} max={node.gpuCount} size="sm" />
              <div className="text-sm text-muted-foreground whitespace-nowrap">
                {t("drilldown.cluster.gpuAllocatedSummary", {
                  allocated: node.gpuAllocated,
                  total: node.gpuCount,
                })}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
