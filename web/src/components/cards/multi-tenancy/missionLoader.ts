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

/** Console-kb paths for missions */
export const MISSION_PATHS: Record<string, string> = {
  ovn: 'solutions/cncf-install/install-ovn-kubernetes.json',
  kubeflex: 'solutions/platform-install/platform-kubeflex.json',
  k3s: 'solutions/platform-install/platform-k3s.json',
  'kubeconfig-prune': 'solutions/troubleshoot/kubeconfig-prune.json',
  kubevirt: 'solutions/cncf-install/install-kubevirt.json',
  'multi-tenancy': 'solutions/multi-cluster/multi-tenancy-setup.json',
}

/**
 * Fetch a mission JSON from console-kb and convert it to the format
 * expected by startMission(). Returns the mission steps as a formatted
 * prompt that the AI agent can follow.
 *
 * Falls back to the raw text prompt if the fetch fails.
 */
export async function loadMissionPrompt(
  componentKey: string,
  fallbackPrompt: string,
): Promise<string> {
  const path = MISSION_PATHS[componentKey]
  if (!path) return fallbackPrompt

  try {
    const url = `/api/missions/file?path=${encodeURIComponent(path)}`
    const response = await fetch(url, {
      signal: AbortSignal.timeout(MISSION_FETCH_TIMEOUT_MS),
    })

    if (!response.ok) return fallbackPrompt

    const parsed = await response.json()
    const mission = parsed.mission || parsed

    // Build a structured prompt from the mission steps
    const steps = (mission.steps || []) as Array<{ title: string; description: string }>
    if (steps.length === 0) return fallbackPrompt

    const title = mission.title || 'Install Component'
    const description = mission.description || ''

    let prompt = `# ${title}\n\n${description}\n\n## Steps\n\n`

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i]
      prompt += `### Step ${i + 1}: ${step.title}\n${step.description}\n\n`
    }

    // Add troubleshooting if available
    const troubleshooting = (mission.troubleshooting || []) as Array<{ title: string; description: string }>
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
