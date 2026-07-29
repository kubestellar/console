import { useEffect, useRef, useState } from "react";
import { useModalState } from "../../lib/modals";
import { safeGetItem } from "../../lib/utils/localStorage";
import { useProviderConnection } from "../../hooks/useProviderConnection";

const PREV_AGENT_KEY = "kc_previous_agent";
const DROPDOWN_GAP_PX = 4;

export interface UseAgentConfigDropdownArgs {
  agentsLength: number;
  agentsLoading: boolean;
  isDemoMode: boolean;
  activeBackend: string | null;
  connectToAgent: () => void;
}

/**
 * Encapsulates all dropdown-open/close state, positioning, and outside-click/escape/demo-mode
 * effects for AgentConfigForm, so the component itself only needs to call one hook.
 */
export function useAgentConfigDropdown({
  agentsLength,
  agentsLoading,
  isDemoMode,
  activeBackend,
  connectToAgent,
}: UseAgentConfigDropdownArgs) {
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
      agentsLength === 0 &&
      !agentsLoading &&
      !isDemoMode &&
      activeBackend === "kc-agent"
    ) {
      connectToAgent();
    }
  }, [isOpen, agentsLength, agentsLoading, isDemoMode, connectToAgent, activeBackend]);

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

  return {
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
    resetConnection,
    dismissConnection,
  };
}

export { PREV_AGENT_KEY };
