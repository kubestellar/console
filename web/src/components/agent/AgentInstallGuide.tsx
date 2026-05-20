import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { MissionDetailView } from "../missions/MissionDetailView";
import type { MissionExport } from "../../lib/missions/types";

/** Timeout (ms) for fetching mission install guide files from the API */
const MISSION_FILE_FETCH_TIMEOUT_MS = 5_000;

/** Known KB paths for install missions (tried in order, first success wins) */
export const INSTALL_MISSION_PATHS: Record<string, string[]> = {
  "install-kagent": ["fixes/cncf-install/install-kagent.json"],
  "install-kagenti": ["fixes/platform-install/install-kagenti.json"],
};

/** Fetches and parses a mission file from the API. Returns null if all paths fail. */
export async function fetchMissionFile(
  missionId: string,
  displayName?: string,
): Promise<{ mission: MissionExport; raw: string } | null> {
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
        title: nested.title || parsed.title || displayName || missionId,
        description:
          nested.description ||
          parsed.description ||
          (displayName ? `Install ${displayName}` : ""),
        type: nested.type || parsed.type || "deploy",
        steps: nested.steps || parsed.steps || [],
        tags: nested.tags || parsed.tags || [],
        uninstall: nested.uninstall || parsed.uninstall,
        upgrade: nested.upgrade || parsed.upgrade,
        troubleshooting: nested.troubleshooting || parsed.troubleshooting,
        missionClass: "install",
      };
      return { mission, raw };
    } catch {
      continue;
    }
  }
  return null;
}

interface AgentInstallGuideProps {
  /** Mission ID to load. null means the modal is closed. */
  missionId: string | null;
  onClose: () => void;
  /** Called when the user clicks "Run" to execute the install mission. */
  onRunInstall: (missionId: string, displayName: string) => void;
}

/** Modal portal that shows the install guide for an agent's install mission. */
export function AgentInstallGuide({
  missionId,
  onClose,
  onRunInstall,
}: AgentInstallGuideProps) {
  const { t } = useTranslation();
  const [guide, setGuide] = useState<{
    mission: MissionExport;
    raw: string;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  useEffect(() => {
    if (!missionId) {
      setGuide(null);
      setIsLoading(false);
      setHasError(false);
      setShowRaw(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setHasError(false);
    setGuide(null);

    fetchMissionFile(missionId).then((result) => {
      if (cancelled) return;
      if (result) {
        setGuide(result);
      } else {
        setHasError(true);
      }
      setIsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [missionId]);

  if (!missionId && !isLoading && !hasError) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-modal flex items-center justify-center bg-black/60 backdrop-blur-xs"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
      tabIndex={-1}
      ref={(el) => el?.focus()}
    >
      <div className="relative bg-card border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col w-[900px] max-h-[85vh]">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
        <div className="flex-1 overflow-y-auto scroll-enhanced p-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : hasError ? (
            <div
              role="alert"
              className="flex flex-col items-center justify-center py-12 gap-3 text-center"
            >
              <p className="text-sm text-red-400">
                {t("agent.installGuideLoadError", "Failed to load install guide")}
              </p>
              <p className="text-xs text-muted-foreground">
                {t(
                  "agent.installGuideLoadErrorHint",
                  "Check your connection or try again later",
                )}
              </p>
            </div>
          ) : guide ? (
            <MissionDetailView
              mission={guide.mission}
              rawContent={guide.raw}
              showRaw={showRaw}
              onToggleRaw={() => setShowRaw((prev) => !prev)}
              onImport={() => {
                onRunInstall(missionId!, guide.mission.title);
                onClose();
              }}
              onBack={onClose}
              importLabel="Run"
              hideBackButton
            />
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
