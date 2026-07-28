import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useMissions } from "../../hooks/useMissions";
import { useDemoMode, getDemoMode } from "../../hooks/useDemoMode";
import { useKagentBackend } from "../../hooks/useKagentBackend";
import type { AgentInfo, AgentProvider } from "../../types/agent";
import { cn } from "../../lib/cn";
import { AgentInstallGuide } from "./AgentInstallGuide";
import { fetchMissionFile } from "./AgentInstallGuideData";
import type { MissionExport, MissionStep } from "../../lib/missions/types";
import { ClusterSelectionDialog } from "../missions/ClusterSelectionDialog";
import {
  CLUSTER_PROVIDER_KEYS,
  buildVisibleAgents,
  sectionAgents,
} from "./agentSelectorUtils";
import { AgentConfigForm } from "./AgentConfigForm";

const AGENT_TO_PROVIDER_KEY: Record<string, string> = {
  vscode: "vscode",
  antigravity: "antigravity",
};

const CLUSTER_PROVIDERS: Set<AgentProvider> = new Set(CLUSTER_PROVIDER_KEYS);

const ALWAYS_SHOW_CLI: AgentInfo[] = [
  {
    name: "goose",
    displayName: "Goose",
    description: "Open-source AI agent by Block with MCP support",
    provider: "block",
    available: false,
    installUrl: "https://github.com/block/goose",
  },
  {
    name: "copilot-cli",
    displayName: "Copilot CLI",
    description: "GitHub Copilot in the terminal",
    provider: "github-cli",
    available: false,
    installUrl:
      "https://docs.github.com/en/copilot/github-copilot-in-the-cli",
  },
];

interface AgentSelectorProps {
  compact?: boolean;
  className?: string;
}

export function AgentSelector({
  compact = false,
  className = "",
}: AgentSelectorProps) {
  const { t } = useTranslation();
  const {
    agents,
    selectedAgent,
    agentsLoading,
    selectAgent,
    connectToAgent,
    startMission,
    openSidebar,
  } = useMissions();
  const { isDemoMode: isDemoModeHook } = useDemoMode();
  const {
    kagentAvailable,
    kagentiAvailable,
    selectedKagentAgent,
    selectedKagentiAgent,
    activeBackend,
    hasPolled,
  } = useKagentBackend();

  const isDemoMode = isDemoModeHook || getDemoMode();
  const [installGuideMissionId, setInstallGuideMissionId] = useState<string | null>(null);
  const [pendingInstall, setPendingInstall] = useState<{
    missionId: string;
    displayName: string;
    mission: MissionExport;
  } | null>(null);

  const visibleAgents = buildVisibleAgents(agents, ALWAYS_SHOW_CLI, {
    kagentAvailable,
    kagentiAvailable,
    selectedKagentAgent,
    selectedKagentiAgent,
  });

  const hasCliAgent = agents.some((a) => a.available);

  const handleInstallMission = async (
    missionId: string,
    displayName: string,
  ) => {
    const missionData = await fetchMissionFile(missionId, displayName);
    if (!missionData) {
      startMission({
        title: `Install ${displayName}`,
        description: `Install ${displayName} in the cluster`,
        type: "deploy",
        initialPrompt: `Install ${displayName} in the cluster`,
      });
      return;
    }
    setPendingInstall({ missionId, displayName, mission: missionData.mission });
  };

  const { selectedAgentInfo, cliAgents, clusterAgents } = sectionAgents(
    visibleAgents,
    selectedAgent,
    CLUSTER_PROVIDERS,
  );

  const sortedAgents = (() => {
    const list: AgentInfo[] = [];
    if (selectedAgentInfo) list.push(selectedAgentInfo);
    list.push(...cliAgents, ...clusterAgents);
    return list;
  })();

  const currentAgent =
    visibleAgents.find((a) => a.name === selectedAgent) || visibleAgents[0];
  const hasAvailableAgents = visibleAgents.some((a) => a.available);

  useEffect(() => {
    if (!isDemoMode && activeBackend === "kc-agent") {
      connectToAgent();
    }
  }, [connectToAgent, isDemoMode, activeBackend]);

  useEffect(() => {
    if (isDemoMode) return;
    if (agents.length > 0) return;
    const isClusterBackendSelected =
      selectedAgent === "kagenti" || selectedAgent === "kagent";
    if (isClusterBackendSelected) return;

    if (kagentiAvailable) {
      selectAgent("kagenti");
    } else if (kagentAvailable) {
      selectAgent("kagent");
    }
  }, [
    isDemoMode,
    kagentiAvailable,
    kagentAvailable,
    agents.length,
    selectedAgent,
    selectAgent,
  ]);

  const hasClusterAgents = kagentAvailable || kagentiAvailable;

  if (!hasPolled && !isDemoMode && agents.length === 0) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 text-sm text-muted-foreground",
          className,
        )}
      >
        <Loader2 className="w-4 h-4 animate-spin" />
        {!compact && <span>{t("common.loading")}</span>}
      </div>
    );
  }

  if (agentsLoading && !isDemoMode && !hasClusterAgents) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 text-sm text-muted-foreground",
          className,
        )}
      >
        <Loader2 className="w-4 h-4 animate-spin" />
        {!compact && <span>{t("common.loading")}</span>}
      </div>
    );
  }

  if (agents.length === 0 && !agentsLoading && !isDemoMode && !hasClusterAgents) {
    return null;
  }

  return (
    <>
      <AgentConfigForm
        compact={compact}
        className={className}
        isDemoMode={isDemoMode}
        activeBackend={activeBackend}
        agents={agents}
        agentsLoading={agentsLoading}
        selectedAgent={selectedAgent}
        selectedAgentInfo={selectedAgentInfo}
        cliAgents={cliAgents}
        clusterAgents={clusterAgents}
        sortedAgents={sortedAgents}
        currentAgent={currentAgent}
        hasAvailableAgents={hasAvailableAgents}
        hasCliAgent={hasCliAgent}
        agentToProviderKey={AGENT_TO_PROVIDER_KEY}
        selectAgent={selectAgent}
        connectToAgent={connectToAgent}
        openInstallGuide={(missionId) => setInstallGuideMissionId(missionId)}
        handleInstallMission={handleInstallMission}
      />

      <AgentInstallGuide
        missionId={installGuideMissionId}
        onClose={() => setInstallGuideMissionId(null)}
        onRunInstall={(mid, displayName) => {
          setInstallGuideMissionId(null);
          handleInstallMission(mid, displayName);
        }}
      />

      {pendingInstall && (
        <ClusterSelectionDialog
          open
          missionTitle={`Install ${pendingInstall.displayName}`}
          onSelect={(clusters) => {
            const m = pendingInstall.mission;
            const stepsText =
              (m.steps ?? [])
                .map(
                  (s: MissionStep, i: number) =>
                    `${i + 1}. ${s.title}${s.description ? ": " + s.description : ""}`,
                )
                .join("\n") || m.description;
            startMission({
              title: `Install ${pendingInstall.displayName}`,
              description: m.description,
              type: "deploy",
              cluster: clusters.length > 0 ? clusters.join(",") : undefined,
              initialPrompt: stepsText,
            });
            openSidebar();
            setPendingInstall(null);
          }}
          onCancel={() => setPendingInstall(null)}
        />
      )}
    </>
  );
}
