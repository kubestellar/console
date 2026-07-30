import { useTranslation } from "react-i18next";
import type { ClusterEvent } from "../../../../hooks/useMCP";
import { StatusIndicator } from "../../../charts/StatusIndicator";

const EVENT_SKELETON_COUNT = 3;
const MAX_RECENT_EVENTS = 10;

interface ClusterEventsTabProps {
  clusterEvents: ClusterEvent[];
  eventsLoading: boolean;
  effectiveClusterName: string;
  onDrillToEvents: (cluster: string) => void;
}

export function ClusterEventsTab({
  clusterEvents,
  eventsLoading,
  effectiveClusterName,
  onDrillToEvents,
}: ClusterEventsTabProps) {
  const { t } = useTranslation();

  return (
    <div>
      <div className="flex justify-end mb-3">
        <button
          onClick={() => onDrillToEvents(effectiveClusterName)}
          className="text-sm text-purple-400 hover:text-purple-300 transition-colors"
        >
          {t("common.viewAll")} →
        </button>
      </div>
      {eventsLoading ? (
        <div className="space-y-2 animate-pulse">
          {[...Array(EVENT_SKELETON_COUNT)].map((_, i) => (
            <div
              key={i}
              className="p-3 rounded-lg bg-card/30 border border-border"
            >
              <div className="h-4 w-32 bg-secondary rounded mb-2" />
              <div className="h-3 w-full bg-secondary/50 rounded" />
            </div>
          ))}
        </div>
      ) : clusterEvents.length === 0 ? (
        <div className="p-4 rounded-lg bg-card/30 border border-border text-center text-muted-foreground text-sm">
          {t("drilldown.events.noRecentEvents")}
        </div>
      ) : (
        <div className="space-y-2">
          {clusterEvents.slice(0, MAX_RECENT_EVENTS).map((event, i) => (
            <div
              key={i}
              className={`p-3 rounded-lg border-l-4 cursor-pointer hover:bg-card/50 transition-colors ${
                event.type === "Warning"
                  ? "bg-yellow-500/10 border-l-yellow-500"
                  : "bg-card/30 border-l-green-500"
              }`}
              onClick={() => onDrillToEvents(effectiveClusterName)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <StatusIndicator
                    status={event.type === "Warning" ? "warning" : "healthy"}
                    size="sm"
                  />
                  <span className="font-medium text-foreground text-sm">
                    {event.reason}
                  </span>
                </div>
                {event.count > 1 && (
                  <span className="text-xs px-2 py-0.5 rounded bg-card text-muted-foreground">
                    x{event.count}
                  </span>
                )}
              </div>
              <div className="text-xs text-muted-foreground mt-1 truncate">
                {event.namespace}/{event.object}
              </div>
              <p className="text-xs text-foreground mt-1 line-clamp-1">
                {event.message}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
