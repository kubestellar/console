import { useTranslation } from "react-i18next";
import type { ClusterHealth } from "../../../../hooks/useMCP";
import { StatusIndicator } from "../../../charts/StatusIndicator";
import type { TreeLens } from "./types";

interface ClusterOverviewStatsProps {
  health: ClusterHealth | null | undefined;
  totalGPUs: number;
  allocatedGPUs: number;
  onNavigateToResourceTree: (lens: TreeLens) => void;
}

export function ClusterOverviewStats({
  health,
  totalGPUs,
  allocatedGPUs,
  onNavigateToResourceTree,
}: ClusterOverviewStatsProps) {
  const { t } = useTranslation();

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div className="p-4 rounded-lg bg-card/50 border border-border">
        <div className="flex items-center gap-2 mb-2">
          <StatusIndicator
            status={
              health?.reachable === false
                ? "unreachable"
                : health?.nodeCount && health.nodeCount > 0
                  ? health.readyNodes === health.nodeCount
                    ? "healthy"
                    : "warning"
                  : health?.healthy
                    ? "healthy"
                    : "error"
            }
          />
          <span className="text-sm text-muted-foreground">
            {t("common.status")}
          </span>
        </div>
        <div className="text-2xl font-bold text-foreground">
          {health?.reachable === false
            ? t("common.offline")
            : health?.nodeCount && health.nodeCount > 0
              ? health.readyNodes === health.nodeCount
                ? t("common.healthy")
                : t("common.degraded")
              : health?.healthy
                ? t("common.healthy")
                : t("common.unknown")}
        </div>
      </div>

      <button
        onClick={() => onNavigateToResourceTree("nodes")}
        className="p-4 rounded-lg bg-card/50 border border-border text-left hover:bg-card hover:border-primary/50 transition-colors cursor-pointer w-full"
      >
        <div className="text-sm text-muted-foreground mb-2">
          {t("common.nodes")}
        </div>
        <div className="text-2xl font-bold text-foreground">
          {health?.nodeCount || 0}
        </div>
        <div className="text-xs text-green-400">
          {health?.readyNodes || 0} {t("clusterDetail.ready")}
        </div>
      </button>

      <button
        onClick={() => onNavigateToResourceTree("workloads")}
        className="p-4 rounded-lg bg-card/50 border border-border text-left hover:bg-card hover:border-primary/50 transition-colors cursor-pointer w-full"
      >
        <div className="text-sm text-muted-foreground mb-2">
          {t("common.pods")}
        </div>
        <div className="text-2xl font-bold text-foreground">
          {health?.podCount || 0}
        </div>
      </button>

      <div className="p-4 rounded-lg bg-card/50 border border-border">
        <div className="text-sm text-muted-foreground mb-2">
          {t("common.gpus")}
        </div>
        <div className="text-2xl font-bold text-foreground">{totalGPUs}</div>
        <div className="text-xs text-yellow-400">
          {allocatedGPUs} {t("clusterDetail.allocated")}
        </div>
      </div>
    </div>
  );
}
