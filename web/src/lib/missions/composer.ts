/**
 * Holistic Mission Composer
 *
 * Composes a user's imported YAML/Markdown runbook with matched console-kb
 * install missions into a single "holistic" MissionExport. The user's content
 * can replace or augment the community install missions depending on what
 * CNCF projects were detected in their YAML.
 */

import type { MissionExport, MissionStep } from './types'
import type { ApiGroupMapping } from './apiGroupMapping'

// ============================================================================
// Types
// ============================================================================

export interface CompositionSource {
  /** User's imported YAML/MD content, parsed to MissionExport */
  userMission: MissionExport
  /** CNCF projects detected from API groups in the user's YAML */
  detectedProjects: ApiGroupMapping[]
  /** Available console-kb install missions (from missionCache.installers) */
  availableInstallers: MissionExport[]
  /** Whether to replace matched install missions with user's YAML (true) or prepend them (false) */
  replaceInstallers?: boolean
}

export interface CompositionResult {
  /** The composed holistic mission */
  mission: MissionExport
  /** Console-kb install missions that the user's YAML replaces */
  replacedMissions: MissionExport[]
  /** Console-kb install missions prepended as prerequisites */
  supplementaryMissions: MissionExport[]
  /** Detected projects with no matching console-kb mission */
  unmatchedProjects: ApiGroupMapping[]
}

// ============================================================================
// Constants
// ============================================================================

/** Prefix for holistic mission titles */
const HOLISTIC_TITLE_PREFIX = 'Holistic'

/** Source marker for composed missions */
const HOLISTIC_SOURCE = 'holistic-composed'

// ============================================================================
// Composer
// ============================================================================

/**
 * Compose a holistic mission from user YAML + matched community installers.
 *
 * For each detected CNCF project:
 * - If a console-kb install mission matches AND replaceInstallers is false:
 *   → prepend the install mission steps as prerequisites
 * - If a console-kb install mission matches AND replaceInstallers is true:
 *   → skip the install mission (user's YAML replaces it)
 * - If no install mission matches:
 *   → user's YAML is the only source
 *
 * Final step order:
 *   1. Supplementary install steps (prerequisites)
 *   2. User's mission steps
 */
export function composeHolisticMission(source: CompositionSource): CompositionResult {
  const {
    userMission,
    detectedProjects,
    availableInstallers,
    replaceInstallers = false,
  } = source

  const replacedMissions: MissionExport[] = []
  const supplementaryMissions: MissionExport[] = []
  const unmatchedProjects: ApiGroupMapping[] = []

  // Match detected projects to available installers
  for (const project of detectedProjects) {
    const matchedInstaller = findInstallerForProject(project, availableInstallers)
    if (matchedInstaller) {
      if (replaceInstallers) {
        replacedMissions.push(matchedInstaller)
      } else {
        supplementaryMissions.push(matchedInstaller)
      }
    } else {
      unmatchedProjects.push(project)
    }
  }

  // Build composed steps
  const composedSteps: MissionStep[] = []

  // Phase 1: Supplementary install steps (prerequisites)
  for (const installer of supplementaryMissions) {
    const phaseLabel = `[Prerequisite: ${installer.title}]`
    for (const step of installer.steps || []) {
      composedSteps.push({
        ...step,
        title: `${phaseLabel} ${step.title}`,
      })
    }
  }

  // Phase 2: User's mission steps
  for (const step of userMission.steps || []) {
    composedSteps.push(step)
  }

  // Merge tags from all sources (deduplicated)
  const mergedTags = new Set<string>(userMission.tags || [])
  for (const project of detectedProjects) {
    for (const tag of project.tags) mergedTags.add(tag)
  }
  for (const installer of supplementaryMissions) {
    for (const tag of installer.tags || []) mergedTags.add(tag)
  }

  // Build prerequisite names list
  const prerequisites = [
    ...(userMission.prerequisites || []),
    ...supplementaryMissions.map((m) => m.title),
  ]

  // Compose the mission
  const mission: MissionExport = {
    version: 'kc-mission-v1',
    title: `${HOLISTIC_TITLE_PREFIX}: ${userMission.title}`,
    description: buildDescription(userMission, supplementaryMissions, replacedMissions, unmatchedProjects),
    type: userMission.type,
    tags: [...mergedTags],
    steps: composedSteps,
    ...(userMission.cncfProject ? { cncfProject: userMission.cncfProject } : {}),
    ...(prerequisites.length > 0 ? { prerequisites } : {}),
    ...(userMission.uninstall ? { uninstall: userMission.uninstall } : {}),
    ...(userMission.troubleshooting ? { troubleshooting: userMission.troubleshooting } : {}),
    metadata: {
      source: HOLISTIC_SOURCE,
      ...(userMission.metadata?.sourceUrls ? { sourceUrls: userMission.metadata.sourceUrls } : {}),
    },
  }

  return {
    mission,
    replacedMissions,
    supplementaryMissions,
    unmatchedProjects,
  }
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Find a console-kb installer that matches a detected CNCF project.
 * Matches on the `cncfProject` field or by install mission filename pattern.
 */
function findInstallerForProject(
  project: ApiGroupMapping,
  installers: MissionExport[],
): MissionExport | null {
  // Primary: match by cncfProject field
  const byProject = installers.find(
    (m) => m.cncfProject?.toLowerCase() === project.project.toLowerCase()
  )
  if (byProject) return byProject

  // Fallback: match by title containing the project name
  const byTitle = installers.find(
    (m) => m.title.toLowerCase().includes(project.project.toLowerCase())
  )
  if (byTitle) return byTitle

  return null
}

/** Build a description summarizing the composition */
function buildDescription(
  userMission: MissionExport,
  supplementary: MissionExport[],
  replaced: MissionExport[],
  unmatched: ApiGroupMapping[],
): string {
  const parts: string[] = []

  if (userMission.description) {
    parts.push(userMission.description)
  }

  if (supplementary.length > 0) {
    parts.push(
      `Includes prerequisite steps from: ${supplementary.map((m) => m.title).join(', ')}.`
    )
  }

  if (replaced.length > 0) {
    parts.push(
      `Replaces community install missions: ${replaced.map((m) => m.title).join(', ')}.`
    )
  }

  if (unmatched.length > 0) {
    parts.push(
      `Custom content for: ${unmatched.map((p) => p.displayName).join(', ')} (no community install mission available).`
    )
  }

  return parts.join(' ')
}
