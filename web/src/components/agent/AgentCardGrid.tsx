import { BookOpen, Check, Play } from "lucide-react";
import { AgentIcon } from "./AgentIcon";
import { cn } from "../../lib/cn";
import { sanitizeUrl } from "../../lib/utils/sanitizeUrl";
import type { AgentInfo } from "../../types/agent";

interface AgentCardGridProps {
  selectedAgentInfo: AgentInfo | null;
  cliAgents: AgentInfo[];
  clusterAgents: AgentInfo[];
  selectedAgent: string | null;
  hasCliAgent: boolean;
  onSelect: (agentName: string) => void;
  onOpenInstallGuide: (missionId: string) => void;
  onInstallMission: (missionId: string, displayName: string) => void;
}

export function AgentCardGrid({
  selectedAgentInfo,
  cliAgents,
  clusterAgents,
  selectedAgent,
  hasCliAgent,
  onSelect,
  onOpenInstallGuide,
  onInstallMission,
}: AgentCardGridProps) {
  const renderAgentRow = (agent: AgentInfo) => (
    <div
      key={agent.name}
      role="option"
      aria-selected={agent.name === selectedAgent}
      aria-disabled={!agent.available}
      tabIndex={agent.available ? 0 : -1}
      className={cn(
        "w-full flex items-start gap-3 px-3 py-2 text-left transition-colors",
        agent.available
          ? "hover:bg-secondary cursor-pointer"
          : "cursor-default",
        agent.name === selectedAgent && "bg-primary/10",
      )}
      onClick={() => agent.available && onSelect(agent.name)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          if (agent.available) onSelect(agent.name);
        }
      }}
    >
      <AgentIcon
        provider={agent.provider}
        className={cn(
          "w-5 h-5 mt-0.5 shrink-0",
          !agent.available && "opacity-40",
        )}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "text-sm font-medium",
              agent.name === selectedAgent
                ? "text-primary"
                : agent.available
                  ? "text-foreground"
                  : "text-muted-foreground",
            )}
          >
            {agent.displayName}
          </span>
          {agent.name === selectedAgent && (
            <Check className="w-4 h-4 text-primary shrink-0" />
          )}
        </div>
        <p
          className={cn(
            "text-xs",
            agent.available
              ? "text-muted-foreground"
              : "text-muted-foreground/60",
          )}
        >
          {agent.description}
        </p>
        {agent.model ? (
          <span className="text-2xs text-muted-foreground bg-secondary/50 px-1.5 py-0.5 rounded">
            {agent.model}
          </span>
        ) : agent.provider === "github-cli" ? (
          <span className="text-2xs text-muted-foreground italic">
            Default model
          </span>
        ) : null}
        {!agent.available && agent.installMissionId && (
          <div className="flex items-center gap-2 mt-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onOpenInstallGuide(agent.installMissionId!);
              }}
              className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
            >
              <BookOpen className="w-3 h-3" />
              Install guide
            </button>
            {hasCliAgent && (
              <>
                <span className="text-xs text-muted-foreground/40">|</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onInstallMission(
                      agent.installMissionId!,
                      agent.displayName,
                    );
                  }}
                  className="flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300 transition-colors"
                >
                  <Play className="w-3 h-3" />
                  Install with AI
                </button>
              </>
            )}
          </div>
        )}
        {!agent.available && agent.installUrl && !agent.installMissionId && (
          <a
            href={sanitizeUrl(agent.installUrl)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors mt-1"
          >
            <BookOpen className="w-3 h-3" />
            Install
          </a>
        )}
      </div>
    </div>
  );

  return (
    <div className="py-1 overflow-y-auto min-h-0">
      {selectedAgentInfo && renderAgentRow(selectedAgentInfo)}

      {cliAgents.length > 0 && (
        <>
          <div className="px-3 pt-2 pb-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
              CLI Agents
            </span>
          </div>
          {cliAgents.map(renderAgentRow)}
        </>
      )}

      {clusterAgents.length > 0 && (
        <>
          <div className="px-3 pt-2 pb-1 border-t border-border/50 mt-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
              Cluster Agents
            </span>
          </div>
          {clusterAgents.map(renderAgentRow)}
        </>
      )}
    </div>
  );
}
