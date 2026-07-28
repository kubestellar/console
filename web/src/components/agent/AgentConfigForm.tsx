import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Loader2, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import { useModalState } from "../../lib/modals";
import { safeGetItem, safeSetItem } from "../../lib/utils/localStorage";
import { useProviderConnection } from "../../hooks/useProviderConnection";
import { AgentApprovalDialog, hasApprovedAgents } from "./AgentApprovalDialog";
import { AgentIcon } from "./AgentIcon";
import type { AgentInfo } from "../../types/agent";
import { PROVIDER_PREREQUISITES } from "../../types/agent";
import { AgentCardGrid } from "./AgentCardGrid";
import { CapabilityDetailPanel } from "./CapabilityDetailPanel";

const PREV_AGENT_KEY = "kc_previous_agent";

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
  const { isOpen, close: closeDropdown, toggle: toggleDropdown } = useModalState();
  const previousAgentRef = useRef<string | null>(
    typeof window !== "undefined" ? safeGetItem(PREV_AGENT_KEY) : null,
  );
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const pendingAgentRef = useRef<string | null>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; right: number } | null>(null);
  const [showApproval, setShowApproval] = useState(false);

  const {
    connectionState,
    startConnection,
    retry,
    reset: resetConnection,
    dismiss: dismissConnection,
  } = useProviderConnection();

  useEffect(() => {
    if (
      isOpen &&
      agents.length === 0 &&
      !agentsLoading &&
      !isDemoMode &&
      activeBackend === "kc-agent"
    ) {
      connectToAgent();
    }
  }, [
    isOpen,
    agents.length,
    agentsLoading,
    isDemoMode,
    connectToAgent,
    activeBackend,
  ]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(target) &&
        (!panelRef.current || !panelRef.current.contains(target))
      ) {
        closeDropdown();
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [closeDropdown]);

  useEffect(() => {
    if (!isOpen) return;

    const updatePosition = () => {
      if (!buttonRef.current) return;
      const rect = buttonRef.current.getBoundingClientRect();
      const DROPDOWN_GAP_PX = 4;
      setDropdownPos({
        top: rect.bottom + DROPDOWN_GAP_PX,
        right: window.innerWidth - rect.right,
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, {
      capture: true,
      passive: true,
    });

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, { capture: true });
    };
  }, [isOpen]);

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeDropdown();
      }
    }

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      return () => document.removeEventListener("keydown", handleEscape);
    }
  }, [isOpen, closeDropdown]);

  useEffect(() => {
    if (isDemoMode) {
      closeDropdown();
    }
  }, [isDemoMode, closeDropdown]);

  useEffect(() => {
    if (!isOpen && connectionState.phase !== "idle") {
      resetConnection();
    }
  }, [isOpen, connectionState.phase, resetConnection]);

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
        <button
          ref={buttonRef}
          onClick={() => !isDemoMode && toggleDropdown()}
          aria-label={t("agent.selectAgent")}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          className={cn(
            "flex items-center rounded-lg border transition-colors",
            compact ? "p-1.5 gap-1" : "px-3 py-1.5 h-9 gap-2",
            "bg-secondary/50 border-border hover:bg-secondary",
            isOpen && "ring-1 ring-primary",
          )}
        >
          {isNoneSelected ? (
            <Sparkles className="w-4 h-4 text-muted-foreground" />
          ) : hasAvailableAgents && currentAgent ? (
            <AgentIcon provider={currentAgent.provider} className="w-4 h-4" />
          ) : (
            <AgentIcon provider="default" className="w-4 h-4" />
          )}
          {!compact && (
            <span className="text-sm font-medium text-foreground truncate max-w-[120px]">
              {isNoneSelected
                ? t("agent.noneAgent")
                : hasAvailableAgents && currentAgent
                  ? currentAgent.displayName
                  : "AI Agent"}
            </span>
          )}
          <ChevronDown
            className={cn(
              "w-4 h-4 text-muted-foreground transition-transform",
              isOpen && "rotate-180",
            )}
          />
        </button>

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
              <div className="px-3 py-3 border-b border-border shrink-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles
                      className={cn(
                        "w-4 h-4",
                        isNoneSelected
                          ? "text-muted-foreground"
                          : "text-primary",
                      )}
                    />
                    <div>
                      <span className="text-sm font-medium text-foreground">
                        {t("agent.aiAgentToggle")}
                      </span>
                      <p className="text-xs text-muted-foreground">
                        {isNoneSelected
                          ? t("agent.noneAgentDesc")
                          : t("agent.aiAgentOnDesc")}
                      </p>
                    </div>
                  </div>
                  <button
                    role="switch"
                    aria-checked={!isNoneSelected}
                    onClick={() => {
                      if (isNoneSelected) {
                        const prev = previousAgentRef.current;
                        const restored = prev
                          ? sortedAgents.find(
                              (a) => a.name === prev && a.available,
                            )
                          : undefined;
                        const targetAgent =
                          restored?.name ||
                          sortedAgents.find((a) => a.available)?.name ||
                          "";

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
                    className={cn(
                      "relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0",
                      !isNoneSelected ? "bg-primary" : "bg-secondary",
                    )}
                  >
                    <span
                      className={cn(
                        "inline-block h-4 w-4 transform rounded-full bg-white dark:bg-gray-200 transition-transform",
                        !isNoneSelected ? "translate-x-6" : "translate-x-1",
                      )}
                    />
                  </button>
                </div>
              </div>

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
                  {agentsLoading ? (
                    <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>{t("agent.connectingToAgent")}</span>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-sm text-muted-foreground">
                        {t("agent.noAgentsAvailable")}
                      </p>
                      <button
                        onClick={() => connectToAgent()}
                        className="text-xs text-primary hover:underline"
                      >
                        Retry connection
                      </button>
                    </div>
                  )}
                </div>
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
