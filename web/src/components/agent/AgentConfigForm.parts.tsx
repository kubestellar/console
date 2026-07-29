import { ChevronDown, Loader2, Sparkles } from "lucide-react";
import { cn } from "../../lib/cn";
import { AgentIcon } from "./AgentIcon";
import type { AgentInfo } from "../../types/agent";

/** Collapsed trigger button that opens the agent selector dropdown. */
export function AgentToggleButton({
  buttonRef,
  compact,
  isDemoMode,
  isOpen,
  toggleDropdown,
  ariaLabel,
  isNoneSelected,
  noneLabel,
  hasAvailableAgents,
  currentAgent,
}: {
  buttonRef: React.RefObject<HTMLButtonElement | null>;
  compact: boolean;
  isDemoMode: boolean;
  isOpen: boolean;
  toggleDropdown: () => void;
  ariaLabel: string;
  isNoneSelected: boolean;
  noneLabel: string;
  hasAvailableAgents: boolean;
  currentAgent?: AgentInfo;
}) {
  return (
    <button
      ref={buttonRef}
      onClick={() => !isDemoMode && toggleDropdown()}
      aria-label={ariaLabel}
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
          {isNoneSelected ? noneLabel : hasAvailableAgents && currentAgent ? currentAgent.displayName : "AI Agent"}
        </span>
      )}
      <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
    </button>
  );
}

/** Header row inside the dropdown panel with the on/off switch for enabling an agent. */
export function AgentDropdownHeader({
  isNoneSelected,
  toggleTitle,
  toggleDesc,
  onToggle,
}: {
  isNoneSelected: boolean;
  toggleTitle: string;
  toggleDesc: string;
  onToggle: () => void;
}) {
  return (
    <div className="px-3 py-3 border-b border-border shrink-0">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className={cn("w-4 h-4", isNoneSelected ? "text-muted-foreground" : "text-primary")} />
          <div>
            <span className="text-sm font-medium text-foreground">{toggleTitle}</span>
            <p className="text-xs text-muted-foreground">{toggleDesc}</p>
          </div>
        </div>
        <button
          role="switch"
          aria-checked={!isNoneSelected}
          onClick={onToggle}
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
  );
}

/** Empty-state shown in the dropdown panel when there are no available agents. */
export function AgentEmptyState({
  agentsLoading,
  connectingLabel,
  noAgentsLabel,
  onRetry,
}: {
  agentsLoading: boolean;
  connectingLabel: string;
  noAgentsLabel: string;
  onRetry: () => void;
}) {
  return (
    <div className="py-4 text-center">
      {agentsLoading ? (
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>{connectingLabel}</span>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">{noAgentsLabel}</p>
          <button onClick={onRetry} className="text-xs text-primary hover:underline">
            Retry connection
          </button>
        </div>
      )}
    </div>
  );
}
