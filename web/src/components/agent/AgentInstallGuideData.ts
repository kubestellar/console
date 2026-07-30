import type { MissionExport } from "../../lib/missions/types";

/** Timeout (ms) for fetching mission install guide files from the API */
const MISSION_FILE_FETCH_TIMEOUT_MS = 5_000;

/** Known KB paths for install missions (tried in order, first success wins) */
const INSTALL_MISSION_PATHS: Record<string, string[]> = {
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
