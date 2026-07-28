import {
  AlertTriangle,
  Check,
  ExternalLink,
  Loader2,
  RefreshCw,
} from "lucide-react";
import type { ProviderConnectionState } from "../../types/agent";
import { PROVIDER_PREREQUISITES } from "../../types/agent";

interface CapabilityDetailPanelProps {
  connectionState: ProviderConnectionState;
  agentToProviderKey: Record<string, string>;
  onRetry: () => void;
  onDismiss: () => void;
  t: (key: string, options?: Record<string, unknown>) => string;
}

export function CapabilityDetailPanel({
  connectionState,
  agentToProviderKey,
  onRetry,
  onDismiss,
  t,
}: CapabilityDetailPanelProps) {
  if (connectionState.phase === "idle") {
    return null;
  }

  return (
    <div className="px-3 py-3 border-t border-border bg-secondary/20">
      {(connectionState.phase === "starting" ||
        connectionState.phase === "handshake") && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-yellow-400 shrink-0" />
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
          <Check className="w-4 h-4 text-green-400 shrink-0" />
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
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
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
          {connectionState.prerequisites.length > 0 && (
            <ul className="ml-6 space-y-1">
              {connectionState.prerequisites.map((prereq, i) => (
                <li
                  key={i}
                  className="flex items-start gap-1.5 text-xs text-muted-foreground"
                >
                  <span className="text-muted-foreground/60 mt-0.5">-</span>
                  <span>{prereq}</span>
                </li>
              ))}
            </ul>
          )}
          {connectionState.prerequisites.length === 0 &&
            connectionState.provider &&
            PROVIDER_PREREQUISITES[
              agentToProviderKey[connectionState.provider] ?? ""
            ] && (
              <div className="ml-6 space-y-1">
                <p className="text-xs text-muted-foreground">
                  {t("agent.providerPrerequisite")}:
                </p>
                <a
                  href={
                    PROVIDER_PREREQUISITES[
                      agentToProviderKey[connectionState.provider] ?? ""
                    ]?.installUrl
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80"
                >
                  <ExternalLink className="w-3 h-3" />
                  {
                    PROVIDER_PREREQUISITES[
                      agentToProviderKey[connectionState.provider] ?? ""
                    ]?.label
                  }
                </a>
              </div>
            )}
          <div className="flex items-center gap-2 ml-6">
            <button
              onClick={onRetry}
              className="flex items-center gap-1 text-xs text-primary hover:text-primary/80"
            >
              <RefreshCw className="w-3 h-3" />
              {t("agent.providerRetry")}
            </button>
            <span className="text-xs text-muted-foreground/40">|</span>
            <button
              onClick={onDismiss}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              {t("actions.dismiss")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
