/**
 * Load and import missions from console-kb for multi-tenancy cards.
 *
 * Each technology card's "Install with AI Agent" button fetches the
 * structured mission JSON from console-kb (via /api/missions/file)
 * and passes it to startMission() so the AI agent follows the
 * exact step-by-step installation procedure.
 */

import type { MissionExport } from '../../../lib/missions/types'

/** Timeout for fetching a mission file from console-kb (ms) */
const MISSION_FETCH_TIMEOUT_MS = 10_000

/** Console-kb paths for missions (legacy keys used by multi-tenancy cards) */
export const MISSION_PATHS: Record<string, string> = {
  ovn: 'fixes/cncf-install/install-ovn-kubernetes.json',
  kubeflex: 'fixes/platform-install/platform-kubeflex.json',
  k3s: 'fixes/platform-install/platform-k3s.json',
  'kubeconfig-prune': 'fixes/troubleshoot/kubeconfig-prune.json',
  kubevirt: 'fixes/cncf-install/install-kubevirt.json',
  'multi-tenancy': 'fixes/multi-cluster/multi-tenancy-setup.json',
}

/**
 * Fetch a mission JSON from console-kb and convert it to the format
 * expected by startMission(). Returns the mission steps as a formatted
 * prompt that the AI agent can follow.
 *
 * Accepts either a componentKey (looked up in MISSION_PATHS) or a
 * kbPaths array (tried in order) for direct path resolution.
 *
 * Falls back to the raw text prompt if the fetch fails.
 */
export async function loadMissionPrompt(
  componentKey: string,
  fallbackPrompt: string,
  kbPaths?: string[],
): Promise<string> {
  // Try kbPaths first, then legacy MISSION_PATHS lookup
  const path = kbPaths?.[0] ?? MISSION_PATHS[componentKey]
  if (!path) return fallbackPrompt

  try {
    const url = `/api/missions/file?path=${encodeURIComponent(path)}`
    const response = await fetch(url, {
      signal: AbortSignal.timeout(MISSION_FETCH_TIMEOUT_MS),
    })

    if (!response.ok) return fallbackPrompt

    const parsed = await response.json()
    const mission = parsed.mission || parsed

    // issue 6430 — Guard every field access against schema drift. Old v1
    // exports may omit `troubleshooting`/`prerequisites`; v2+ exports may
    // add new nested shapes. Never trust the incoming object's shape —
    // check `typeof` / `Array.isArray` before dereferencing.
    const rawSteps: unknown = mission?.steps
    const steps = Array.isArray(rawSteps)
      ? (rawSteps.filter(
          (s): s is { title: string; description: string } =>
            !!s && typeof s === 'object'
            && typeof (s as { title?: unknown }).title === 'string'
            && typeof (s as { description?: unknown }).description === 'string',
        ))
      : []
    if (steps.length === 0) return fallbackPrompt

    const title = typeof mission?.title === 'string' ? mission.title : 'Install Component'
    const description = typeof mission?.description === 'string' ? mission.description : ''

    let prompt = `# ${title}\n\n${description}\n\n## Steps\n\n`

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i]
      prompt += `### Step ${i + 1}: ${step.title}\n${step.description}\n\n`
    }

    // Add troubleshooting if available (v2+ schema field — absent in older exports)
    const rawTroubleshooting: unknown = mission?.troubleshooting
    const troubleshooting = Array.isArray(rawTroubleshooting)
      ? (rawTroubleshooting.filter(
          (t): t is { title: string; description: string } =>
            !!t && typeof t === 'object'
            && typeof (t as { title?: unknown }).title === 'string'
            && typeof (t as { description?: unknown }).description === 'string',
        ))
      : []
    if (troubleshooting.length > 0) {
      prompt += `## Troubleshooting\n\n`
      for (const item of troubleshooting) {
        prompt += `**${item.title}**\n${item.description}\n\n`
      }
    }

    return prompt
  } catch {
    // Network error, timeout, parse error — fall back to raw prompt
    return fallbackPrompt
  }
}

/**
 * Fetch the full MissionExport object from console-kb.
 * Used by the Tenant Isolation Setup card for the combined mission.
 */
export async function loadMissionExport(
  componentKey: string,
): Promise<MissionExport | null> {
  const path = MISSION_PATHS[componentKey]
  if (!path) return null

  try {
    const url = `/api/missions/file?path=${encodeURIComponent(path)}`
    const response = await fetch(url, {
      signal: AbortSignal.timeout(MISSION_FETCH_TIMEOUT_MS),
    })

    if (!response.ok) return null

    const parsed = await response.json()
    const nested = parsed.mission || {}
    const fileMeta = parsed.metadata || {}

    return {
      version: parsed.version || 'kc-mission-v1',
      name: parsed.name || componentKey,
      missionClass: parsed.missionClass || 'install',
      title: nested.title || parsed.title || '',
      description: nested.description || parsed.description || '',
      type: nested.type || 'deploy',
      steps: nested.steps || parsed.steps || [],
      uninstall: nested.uninstall,
      upgrade: nested.upgrade,
      troubleshooting: nested.troubleshooting,
      resolution: nested.resolution,
      prerequisites: parsed.prerequisites,
      metadata: {
        ...fileMeta,
        source: path,
      },
    } as unknown as MissionExport
  } catch {
    return null
  }
}
