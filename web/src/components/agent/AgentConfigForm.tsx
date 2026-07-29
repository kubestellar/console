import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import { safeSetItem } from "../../lib/utils/localStorage";
import { AgentApprovalDialog, hasApprovedAgents } from "./AgentApprovalDialog";
import type { AgentInfo } from "../../types/agent";
import { PROVIDER_PREREQUISITES } from "../../types/agent";
import { AgentCardGrid } from "./AgentCardGrid";
import { CapabilityDetailPanel } from "./CapabilityDetailPanel";
import { useAgentConfigDropdown, PREV_AGENT_KEY } from "./AgentConfigForm.hooks";
import { AgentToggleButton, AgentDropdownHeader, AgentEmptyState } from "./AgentConfigForm.parts";

interface AgentConfigFormProps {
  compact: boolean;
  className: string;
  isDemoMode: boolean;
  activeBackend: string | null;
  agents: AgentInfo[];
  agentsLoading: boolean;
  selectedAgent: string | null;
  selectedAgentInfo: AgentInfo | null;
  cliAgents: AgentInfo[];
  clusterAgents: AgentInfo[];
  sortedAgents: AgentInfo[];
  currentAgent?: AgentInfo;
  hasAvailableAgents: boolean;
  hasCliAgent: boolean;
  agentToProviderKey: Record<string, string>;
  selectAgent: (agentName: string) => void;
  connectToAgent: () => void;
  openInstallGuide: (missionId: string) => void;
  handleInstallMission: (missionId: string, displayName: string) => void;
}

export function AgentConfigForm({
  compact,
  className,
  isDemoMode,
  activeBackend,
  agents,
  agentsLoading,
  selectedAgent,
  selectedAgentInfo,
  cliAgents,
  clusterAgents,
  sortedAgents,
  currentAgent,
  hasAvailableAgents,
  hasCliAgent,
  agentToProviderKey,
  selectAgent,
  connectToAgent,
  openInstallGuide,
  handleInstallMission,
}: AgentConfigFormProps) {
  const { t } = useTranslation();
  const {
    isOpen,
    closeDropdown,
    toggleDropdown,
    previousAgentRef,
    dropdownRef,
    buttonRef,
    panelRef,
    pendingAgentRef,
    dropdownPos,
    showApproval,
    setShowApproval,
    connectionState,
    startConnection,
    retry,
    dismissConnection,
  } = useAgentConfigDropdown({
    agentsLength: agents.length,
    agentsLoading,
    isDemoMode,
    activeBackend,
    connectToAgent,
  });

  const handleSelect = (agentName: string) => {
    if (agentName !== "none" && !hasApprovedAgents()) {
      pendingAgentRef.current = agentName;
      setShowApproval(true);
      return;
    }

    const providerKey = agentToProviderKey[agentName];
    if (providerKey && PROVIDER_PREREQUISITES[providerKey]) {
      selectAgent(agentName);
      startConnection(agentName, () => {
        closeDropdown();
      });
      return;
    }

    selectAgent(agentName);
    closeDropdown();
  };

  const isNoneSelected = selectedAgent === "none";

  return (
    <>
      <div
        ref={dropdownRef}
        className={cn(
          "relative flex items-center gap-1",
          className,
          isDemoMode && "opacity-40 pointer-events-none",
        )}
      >
        <AgentToggleButton
          buttonRef={buttonRef}
          compact={compact}
          isDemoMode={isDemoMode}
          isOpen={isOpen}
          toggleDropdown={toggleDropdown}
          ariaLabel={t("agent.selectAgent")}
          isNoneSelected={isNoneSelected}
          noneLabel={t("agent.noneAgent")}
          hasAvailableAgents={hasAvailableAgents}
          currentAgent={currentAgent}
        />

        {isOpen &&
          dropdownPos &&
          createPortal(
            <div
              ref={panelRef}
              role="listbox"
              aria-label={t("agent.selectAgent")}
              className="fixed z-modal w-96 max-h-[calc(100vh-8rem)] rounded-lg bg-card border border-border shadow-lg overflow-hidden flex flex-col"
              style={{ top: dropdownPos.top, right: dropdownPos.right }}
              onKeyDown={(e) => {
                if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
                e.preventDefault();
                const items = e.currentTarget.querySelectorAll<HTMLElement>(
                  '[role="option"]:not([aria-disabled="true"])',
                );
                const idx = Array.from(items).indexOf(
                  document.activeElement as HTMLElement,
                );
                if (e.key === "ArrowDown") {
                  items[Math.min(idx + 1, items.length - 1)]?.focus();
                } else {
                  items[Math.max(idx - 1, 0)]?.focus();
                }
              }}
            >
              <AgentDropdownHeader
                isNoneSelected={isNoneSelected}
                toggleTitle={t("agent.aiAgentToggle")}
                toggleDesc={isNoneSelected ? t("agent.noneAgentDesc") : t("agent.aiAgentOnDesc")}
                onToggle={() => {
                  if (isNoneSelected) {
                    const prev = previousAgentRef.current;
                    const restored = prev
                      ? sortedAgents.find((a) => a.name === prev && a.available)
                      : undefined;
                    const targetAgent =
                      restored?.name || sortedAgents.find((a) => a.available)?.name || "";

                    if (!targetAgent) return;

                    if (!hasApprovedAgents()) {
                      pendingAgentRef.current = targetAgent;
                      setShowApproval(true);
                      return;
                    }
                    handleSelect(targetAgent);
                  } else {
                    previousAgentRef.current = selectedAgent || null;
                    if (selectedAgent) {
                      safeSetItem(PREV_AGENT_KEY, selectedAgent);
                    }
                    handleSelect("none");
                  }
                }}
              />

              {sortedAgents.length > 0 && (
                <AgentCardGrid
                  selectedAgentInfo={selectedAgentInfo}
                  cliAgents={cliAgents}
                  clusterAgents={clusterAgents}
                  selectedAgent={selectedAgent}
                  hasCliAgent={hasCliAgent}
                  onSelect={handleSelect}
                  onOpenInstallGuide={(missionId) => {
                    closeDropdown();
                    openInstallGuide(missionId);
                  }}
                  onInstallMission={(missionId, displayName) => {
                    closeDropdown();
                    handleInstallMission(missionId, displayName);
                  }}
                />
              )}

              <CapabilityDetailPanel
                connectionState={connectionState}
                agentToProviderKey={agentToProviderKey}
                onRetry={() => retry(() => closeDropdown())}
                onDismiss={dismissConnection}
                t={t as (key: string, options?: Record<string, unknown>) => string}
              />

              {sortedAgents.length === 0 && (
                <AgentEmptyState
                  agentsLoading={agentsLoading}
                  connectingLabel={t("agent.connectingToAgent")}
                  noAgentsLabel={t("agent.noAgentsAvailable")}
                  onRetry={() => connectToAgent()}
                />
              )}
            </div>,
            document.body,
          )}
      </div>

      <AgentApprovalDialog
        isOpen={showApproval}
        agents={agents}
        onApprove={() => {
          setShowApproval(false);
          const target = pendingAgentRef.current;
          pendingAgentRef.current = null;
          if (target) {
            const providerKey = agentToProviderKey[target];
            if (providerKey && PROVIDER_PREREQUISITES[providerKey]) {
              selectAgent(target);
              startConnection(target, () => closeDropdown());
            } else {
              selectAgent(target);
              closeDropdown();
            }
          }
        }}
        onCancel={() => {
          setShowApproval(false);
          pendingAgentRef.current = null;
        }}
      />
    </>
  );
}
