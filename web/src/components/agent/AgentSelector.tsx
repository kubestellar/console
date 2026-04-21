import { useRef, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { createPortal } from "react-dom";
import {
  ChevronDown,
  Check,
  Loader2,
  Sparkles,
  Play,
  BookOpen,
  X,
  RefreshCw,
  AlertTriangle,
  ExternalLink,
} from "lucide-react";
import { useMissions } from "../../hooks/useMissions";
import { useDemoMode, getDemoMode } from "../../hooks/useDemoMode";
import { useKagentBackend } from "../../hooks/useKagentBackend";
import { useProviderConnection } from "../../hooks/useProviderConnection";
import { AgentIcon } from "./AgentIcon";
import type { AgentInfo, AgentProvider } from "../../types/agent";

/** Timeout (ms) for fetching mission install guide files from the API */
const MISSION_FILE_FETCH_TIMEOUT_MS = 5_000;
import { PROVIDER_PREREQUISITES} from "../../types/agent";
import type { MissionExport } from "../../lib/missions/types";
import { cn } from "../../lib/cn";
import { useModalState } from "../../lib/modals";
import { safeGetItem, safeSetItem } from "../../lib/utils/localStorage";
import { sanitizeUrl } from '../../lib/utils/sanitizeUrl'
import { AgentApprovalDialog, hasApprovedAgents } from "./AgentApprovalDialog";
import { MissionDetailView } from "../missions/MissionDetailView";
import { ClusterSelectionDialog } from "../missions/ClusterSelectionDialog";
import {
  CLUSTER_PROVIDER_KEYS,
  buildVisibleAgents,
  sectionAgents,
} from "./agentSelectorUtils";

/** Map agent names to their backend provider key for prerequisite lookup */
const AGENT_TO_PROVIDER_KEY: Record<string, string> = {
  vscode: "vscode",
  antigravity: "antigravity",
};

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
  // Synchronous fallback prevents flash during React transitions
  const isDemoMode = isDemoModeHook || getDemoMode();
  const {
    isOpen,
    close: closeDropdown,
    toggle: toggleDropdown,
  } = useModalState();
  const PREV_AGENT_KEY = "kc_previous_agent";
  const previousAgentRef = useRef<string | null>(
    typeof window !== "undefined" ? safeGetItem(PREV_AGENT_KEY) : null,
  );
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [dropdownPos, setDropdownPos] = useState<{
    top: number;
    right: number;
  } | null>(null);
  const [showApproval, setShowApproval] = useState(false);
  // Provider connection lifecycle tracking
  const {
    connectionState,
    startConnection,
    retry,
    reset: resetConnection,
    dismiss: dismissConnection,
  } = useProviderConnection();
  // Stash the agent name the user intended to select when approval was triggered
  const pendingAgentRef = useRef<string | null>(null);
  // Install guide modal state
  const [installGuide, setInstallGuide] = useState<{
    mission: MissionExport;
    raw: string;
  } | null>(null);
  const [installGuideLoading, setInstallGuideLoading] = useState(false);
  const [installGuideError, setInstallGuideError] = useState(false);
  const [installGuideShowRaw, setInstallGuideShowRaw] = useState(false);
  // Cluster selection for AI install
  const [pendingInstall, setPendingInstall] = useState<{
    missionId: string;
    displayName: string;
    mission: MissionExport;
  } | null>(null);

  // Providers that are cluster-based (rendered in bottom section)
  const CLUSTER_PROVIDERS: Set<AgentProvider> = new Set(CLUSTER_PROVIDER_KEYS);

  // Always-show CLI agents (appear grayed out when not detected)
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

  // Merge local agents with always-show CLI agents and in-cluster backends
  const visibleAgents = buildVisibleAgents(agents, ALWAYS_SHOW_CLI, {
    kagentAvailable,
    kagentiAvailable,
    selectedKagentAgent,
    selectedKagentiAgent,
  });

  // Check if any CLI agent is available (can run install missions)
  const hasCliAgent = agents.some((a) => a.available);

  // Known KB paths for install missions (stable reference to avoid recreating callbacks)
  const INSTALL_MISSION_PATHS = useMemo<Record<string, string[]>>(
    () => ({
      "install-kagent": ["fixes/cncf-install/install-kagent.json"],
      "install-kagenti": ["fixes/platform-install/install-kagenti.json"],
    }),
    [],
  );

  const openInstallGuide = async (missionId: string) => {
    closeDropdown();
    setInstallGuideLoading(true);
    setInstallGuideError(false);
    const paths = INSTALL_MISSION_PATHS[missionId] || [
      `fixes/cncf-install/${missionId}.json`,
      `fixes/platform-install/${missionId}.json`,
    ];
    for (const path of paths) {
      try {
        const res = await fetch(
          `/api/missions/file?path=${encodeURIComponent(path)}`,
          { signal: AbortSignal.timeout(MISSION_FILE_FETCH_TIMEOUT_MS) },
        );
        if (!res.ok) continue;
        const raw = await res.text();
        const parsed = JSON.parse(raw);
        const nested = parsed.mission || {};
        const mission: MissionExport = {
          version: parsed.version || "1.0",
          title: nested.title || parsed.title || missionId,
          description: nested.description || parsed.description || "",
          type: nested.type || parsed.type || "deploy",
          steps: nested.steps || parsed.steps || [],
          uninstall: nested.uninstall || parsed.uninstall,
          upgrade: nested.upgrade || parsed.upgrade,
          troubleshooting: nested.troubleshooting || parsed.troubleshooting,
          tags: nested.tags || parsed.tags,
          missionClass: "install",
        };
        setInstallGuide({ mission, raw });
        setInstallGuideLoading(false);
        return;
      } catch {
        continue;
      }
    }
    setInstallGuideError(true);
    setInstallGuideLoading(false);
  };

  const handleInstallMission = async (
    missionId: string,
    displayName: string,
  ) => {
    closeDropdown();
    // Fetch the actual mission content
    const paths = INSTALL_MISSION_PATHS[missionId] || [
      `fixes/cncf-install/${missionId}.json`,
      `fixes/platform-install/${missionId}.json`,
    ];
    let missionData: MissionExport | null = null;
    for (const path of paths) {
      try {
        const res = await fetch(
          `/api/missions/file?path=${encodeURIComponent(path)}`,
          { signal: AbortSignal.timeout(MISSION_FILE_FETCH_TIMEOUT_MS) },
        );
        if (!res.ok) continue;
        const raw = await res.text();
        const parsed = JSON.parse(raw);
        const nested = parsed.mission || {};
        missionData = {
          version: parsed.version || "1.0",
          title: nested.title || parsed.title || displayName,
          description:
            nested.description ||
            parsed.description ||
            `Install ${displayName}`,
          type: "deploy",
          tags: nested.tags || parsed.tags || [],
          steps: nested.steps || parsed.steps || [],
        };
        break;
      } catch {
        continue;
      }
    }
    if (!missionData) {
      // Fallback: start with simple prompt
      startMission({
        title: `Install ${displayName}`,
        description: `Install ${displayName} in the cluster`,
        type: "deploy",
        initialPrompt: `Install ${displayName} in the cluster`,
      });
      return;
    }
    // Show cluster selection dialog before running
    setPendingInstall({ missionId, displayName, mission: missionData });
  };

  // Split agents into sections: selected at top, then CLI, then Cluster
  const { selectedAgentInfo, cliAgents, clusterAgents } = sectionAgents(
    visibleAgents,
    selectedAgent,
    CLUSTER_PROVIDERS,
  );

  // Flat list for keyboard navigation and length checks
  const sortedAgents = (() => {
    const list: AgentInfo[] = [];
    if (selectedAgentInfo) list.push(selectedAgentInfo);
    list.push(...cliAgents, ...clusterAgents);
    return list;
  })();

  const currentAgent =
    visibleAgents.find((a) => a.name === selectedAgent) || visibleAgents[0];
  const hasAvailableAgents = visibleAgents.some((a) => a.available);

  // Connect to agent WebSocket on mount and when leaving demo mode
  useEffect(() => {
    if (!isDemoMode && activeBackend === "kc-agent") {
      connectToAgent();
    }
  }, [connectToAgent, isDemoMode, activeBackend]);

  // Auto-select kagenti/kagent when running in-cluster with no kc-agent.
  // Without this, the user lands in-cluster with no selected agent and the
  // missions chat is disconnected until they manually open the dropdown.
  //
  // #7xxx — The previous guard `if (selectedAgent && selectedAgent !== "none") return`
  // was too weak: when the WS opens it fires an `agent_selected` message (e.g.
  // "claude-code") which set selectedAgent before this effect ran, causing it to
  // bail and never switch to kagenti. In-cluster with no real kc-agent (agents=[]),
  // a WS-based selectedAgent is always stale — override it unless we are already
  // on a cluster backend.
  useEffect(() => {
    if (isDemoMode) return;
    if (agents.length > 0) return; // kc-agent WS has real agents — respect selection
    // If already on a cluster backend, nothing to do
    const isClusterBackendSelected =
      selectedAgent === "kagenti" || selectedAgent === "kagent";
    if (isClusterBackendSelected) return;
    // Force-select cluster backend, overriding any stale WS agent in state/localStorage
    if (kagentiAvailable) {
      selectAgent("kagenti");
    } else if (kagentAvailable) {
      selectAgent("kagent");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isDemoMode,
    kagentiAvailable,
    kagentAvailable,
    agents.length,
    selectedAgent,
  ]);

  // Retry connection when dropdown is opened and agents are empty
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

  // Close dropdown when clicking outside (check both trigger and portal panel)
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

  // Compute dropdown position when opened (portal needs absolute screen coords)
  // Recompute on resize/scroll so the menu stays attached to its trigger
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
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isOpen]);

  // Close on escape
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

  // Close dropdown when entering demo mode
  useEffect(() => {
    if (isDemoMode) {
      closeDropdown();
    }
  }, [isDemoMode, closeDropdown]);

  // Reset connection lifecycle state when dropdown closes
  useEffect(() => {
    if (!isOpen && connectionState.phase !== "idle") {
      resetConnection();
    }
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // In-cluster deployments can have no kc-agent (agents=[]), so compute this
  // before loading/null guards.
  const hasClusterAgents = kagentAvailable || kagentiAvailable;

  // Hold rendering until the first kagenti/kagent poll completes, otherwise
  // we'd hit the return-null guard below while kagentiAvailable is still false
  // (the poll hasn't fired yet) — causing the selector to blink and disappear.
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

  // Loading state — keep a stable visual instead of returning null to avoid
  // trigger blink/disappear during transient reconnect/poll windows.
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

  // No agents available and not in demo mode — hide selector unless cluster agents are available.
  // In-cluster deployments have no kc-agent (agents=[]) but may have kagenti/kagent.
  if (agents.length === 0 && !agentsLoading && !isDemoMode && !hasClusterAgents)
    return null;

  // Only gray out in demo mode - allow interaction during loading/reconnection
  const isGreyedOut = isDemoMode;

  const isNoneSelected = selectedAgent === "none";

  // Always show dropdown (even with 1 agent) so user can access "None" option

  const handleSelect = (agentName: string) => {
    // Gate agent activation behind approval for all non-none selections
    if (agentName !== "none" && !hasApprovedAgents()) {
      pendingAgentRef.current = agentName;
      setShowApproval(true);
      return;
    }

    // For providers with prerequisites (e.g. VS Code), run a readiness check
    // with clear lifecycle feedback instead of silently timing out
    const providerKey = AGENT_TO_PROVIDER_KEY[agentName];
    if (providerKey && PROVIDER_PREREQUISITES[providerKey]) {
      // Persist the selection immediately so it is not lost on timeout
      selectAgent(agentName);
      startConnection(agentName, () => {
        // Connection confirmed - dropdown can close
        closeDropdown();
      });
      return;
    }

    selectAgent(agentName);
    closeDropdown();
  };

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
      onClick={() => agent.available && handleSelect(agent.name)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          if (agent.available) handleSelect(agent.name);
        }
      }}
    >
      <AgentIcon
        provider={agent.provider}
        className={cn(
          "w-5 h-5 mt-0.5 flex-shrink-0",
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
            <Check className="w-4 h-4 text-primary flex-shrink-0" />
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
                openInstallGuide(agent.installMissionId!);
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
                    handleInstallMission(
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

  // Always show the dropdown trigger — never a standalone gear.
  // When no agents are available, show a generic agent icon; settings gear
  // lives only inside the dropdown as a footer item.
  return (
    <>
      <div
        ref={dropdownRef}
        className={cn(
          "relative flex items-center gap-1",
          className,
          isGreyedOut && "opacity-40 pointer-events-none",
        )}
      >
        <button
          ref={buttonRef}
          onClick={() => !isDemoMode && toggleDropdown()}
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
                if (e.key === "ArrowDown")
                  items[Math.min(idx + 1, items.length - 1)]?.focus();
                else items[Math.max(idx - 1, 0)]?.focus();
              }}
            >
              {/* AI Agent toggle — ON by default, OFF disables AI processing */}
              <div className="px-3 py-3 border-b border-border flex-shrink-0">
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
                        // Turn AI on — require approval on first use
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

                        // Guard: don't select an empty agent ID (#5673)
                        if (!targetAgent) return;

                        if (!hasApprovedAgents()) {
                          // Show approval dialog before enabling
                          pendingAgentRef.current = targetAgent;
                          setShowApproval(true);
                          return;
                        }
                        handleSelect(targetAgent);
                      } else {
                        // Save current agent before turning AI off
                        previousAgentRef.current = selectedAgent || null;
                        if (selectedAgent)
                          safeSetItem(PREV_AGENT_KEY, selectedAgent);
                        handleSelect("none");
                      }
                    }}
                    className={cn(
                      "relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0",
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
                <div className="py-1 overflow-y-auto min-h-0">
                  {/* Selected agent at the very top */}
                  {selectedAgentInfo && renderAgentRow(selectedAgentInfo)}

                  {/* CLI Agents section */}
                  {cliAgents.length > 0 && (
                    <>
                      <div className="px-3 pt-2 pb-1">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                          CLI Agents
                        </span>
                      </div>
                      {cliAgents.map(renderAgentRow)}
                    </>
                  )}

                  {/* Cluster Agents section */}
                  {clusterAgents.length > 0 && (
                    <>
                      <div className="px-3 pt-2 pb-1 border-t border-border/50 mt-1">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                          Cluster Agents
                        </span>
                      </div>
                      {clusterAgents.map(renderAgentRow)}
                    </>
                  )}
                </div>
              )}
              {/* Provider connection lifecycle feedback */}
              {connectionState.phase !== "idle" && (
                <div className="px-3 py-3 border-t border-border bg-secondary/20">
                  {(connectionState.phase === "starting" ||
                    connectionState.phase === "handshake") && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin text-yellow-400 flex-shrink-0" />
                        <span className="text-sm font-medium text-foreground">
                          {connectionState.phase === "starting"
                            ? t("agent.providerStarting", {
                                provider: connectionState.provider,
                              })
                            : t("agent.providerHandshake", {
                                provider: connectionState.provider,
                              })}
                        </span>
                      </div>
                      {connectionState.prerequisite && (
                        <p className="text-xs text-muted-foreground ml-6">
                          {connectionState.prerequisite}
                        </p>
                      )}
                      {connectionState.error && (
                        <p className="text-xs text-yellow-400 ml-6">
                          {connectionState.error}
                        </p>
                      )}
                    </div>
                  )}
                  {connectionState.phase === "connected" && (
                    <div className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-green-400 flex-shrink-0" />
                      <span className="text-sm font-medium text-green-400">
                        {t("agent.providerConnected", {
                          provider: connectionState.provider,
                        })}
                      </span>
                    </div>
                  )}
                  {connectionState.phase === "failed" && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
                        <span className="text-sm font-medium text-red-400">
                          {t("agent.providerFailed", {
                            provider: connectionState.provider,
                          })}
                        </span>
                      </div>
                      {connectionState.error && (
                        <p className="text-xs text-muted-foreground ml-6">
                          {connectionState.error}
                        </p>
                      )}
                      {/* Backend handshake prerequisites (from /provider/check) */}
                      {connectionState.prerequisites.length > 0 && (
                        <ul className="ml-6 space-y-1">
                          {connectionState.prerequisites.map((prereq, i) => (
                            <li
                              key={i}
                              className="flex items-start gap-1.5 text-xs text-muted-foreground"
                            >
                              <span className="text-muted-foreground/60 mt-0.5">
                                -
                              </span>
                              <span>{prereq}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                      {/* Static prerequisite from PROVIDER_PREREQUISITES config */}
                      {connectionState.prerequisites.length === 0 &&
                        connectionState.provider &&
                        PROVIDER_PREREQUISITES[
                          AGENT_TO_PROVIDER_KEY[connectionState.provider] ?? ""
                        ] && (
                          <div className="ml-6 space-y-1">
                            <p className="text-xs text-muted-foreground">
                              {t("agent.providerPrerequisite")}:
                            </p>
                            <a
                              href={
                                PROVIDER_PREREQUISITES[
                                  AGENT_TO_PROVIDER_KEY[
                                    connectionState.provider
                                  ] ?? ""
                                ]?.installUrl
                              }
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80"
                            >
                              <ExternalLink className="w-3 h-3" />
                              {
                                PROVIDER_PREREQUISITES[
                                  AGENT_TO_PROVIDER_KEY[
                                    connectionState.provider
                                  ] ?? ""
                                ]?.label
                              }
                            </a>
                          </div>
                        )}
                      <div className="flex items-center gap-2 ml-6">
                        <button
                          onClick={() => retry(() => closeDropdown())}
                          className="flex items-center gap-1 text-xs text-primary hover:text-primary/80"
                        >
                          <RefreshCw className="w-3 h-3" />
                          {t("agent.providerRetry")}
                        </button>
                        <span className="text-xs text-muted-foreground/40">
                          |
                        </span>
                        <button
                          onClick={dismissConnection}
                          className="text-xs text-muted-foreground hover:text-foreground"
                        >
                          {t("actions.dismiss")}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
              {sortedAgents.length === 0 && (
                <div className="py-4 text-center">
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
            // Run the same readiness lifecycle as handleSelect (#5677)
            const providerKey = AGENT_TO_PROVIDER_KEY[target];
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
      {/* Install guide modal */}
      {(installGuide || installGuideLoading || installGuideError) &&
        createPortal(
          <div
            className="fixed inset-0 z-modal flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setInstallGuide(null);
                setInstallGuideLoading(false);
                setInstallGuideError(false);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setInstallGuide(null);
                setInstallGuideLoading(false);
                setInstallGuideError(false);
              }
            }}
            tabIndex={-1}
            ref={(el) => el?.focus()}
          >
            <div className="relative bg-card border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col w-[900px] max-h-[85vh]">
              <button
                onClick={() => {
                  setInstallGuide(null);
                  setInstallGuideLoading(false);
                  setInstallGuideError(false);
                }}
                className="absolute top-3 right-3 z-10 p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
              <div className="flex-1 overflow-y-auto scroll-enhanced p-6">
                {installGuideLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : installGuideError ? (
                  <div
                    role="alert"
                    className="flex flex-col items-center justify-center py-12 gap-3 text-center"
                  >
                    <p className="text-sm text-red-400">
                      {t(
                        "agent.installGuideLoadError",
                        "Failed to load install guide",
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t(
                        "agent.installGuideLoadErrorHint",
                        "Check your connection or try again later",
                      )}
                    </p>
                  </div>
                ) : installGuide ? (
                  <MissionDetailView
                    mission={installGuide.mission}
                    rawContent={installGuide.raw}
                    showRaw={installGuideShowRaw}
                    onToggleRaw={() => setInstallGuideShowRaw((prev) => !prev)}
                    onImport={() => {
                      const missionId = installGuide.mission.title
                        .toLowerCase()
                        .includes("kagenti")
                        ? "install-kagenti"
                        : "install-kagent";
                      handleInstallMission(
                        missionId,
                        installGuide.mission.title,
                      );
                      setInstallGuide(null);
                    }}
                    onBack={() => setInstallGuide(null)}
                    importLabel="Run"
                    hideBackButton
                  />
                ) : null}
              </div>
            </div>
          </div>,
          document.body,
        )}
      {/* Cluster selection for AI install */}
      {pendingInstall && (
        <ClusterSelectionDialog
          open
          missionTitle={`Install ${pendingInstall.displayName}`}
          onSelect={(clusters) => {
            const m = pendingInstall.mission;
            const stepsText =
              (m.steps ?? [])
                .map(
                  (s, i) =>
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
