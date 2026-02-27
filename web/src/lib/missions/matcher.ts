/**
 * Mission Matcher
 *
 * Matches missions to cluster characteristics for "Recommended for You" section.
 */

import type { MissionExport, MissionMatch } from './types'

interface ClusterInfo {
  name: string
  provider?: string
  version?: string
  resources?: string[]
  issues?: string[]
  labels?: Record<string, string>
}

/**
 * Score and rank missions against cluster data.
 * Returns missions sorted by match score (highest first).
 */
export function matchMissionsToCluster(
  missions: MissionExport[],
  cluster: ClusterInfo
): MissionMatch[] {
  const results: MissionMatch[] = []

  for (const mission of missions) {
    let score = 0
    const matchReasons: string[] = []

    // Match by tags against cluster resources
    if (mission.tags && cluster.resources) {
      const lowerResources = cluster.resources.map((r) => r.toLowerCase())
      for (const tag of mission.tags) {
        if (lowerResources.some((r) => r.includes(tag.toLowerCase()))) {
          score += 20
          matchReasons.push(`Tag "${tag}" matches cluster resource`)
        }
      }
    }

    // Match by CNCF project against cluster labels
    if (mission.cncfProject && cluster.labels) {
      const projectLower = mission.cncfProject.toLowerCase()
      for (const [key, value] of Object.entries(cluster.labels)) {
        if (
          key.toLowerCase().includes(projectLower) ||
          value.toLowerCase().includes(projectLower)
        ) {
          score += 30
          matchReasons.push(`CNCF project "${mission.cncfProject}" found in cluster labels`)
          break
        }
      }
    }

    // Match troubleshoot missions against cluster issues
    if (mission.type === 'troubleshoot' && cluster.issues) {
      const descLower = mission.description.toLowerCase()
      for (const issue of cluster.issues) {
        if (descLower.includes(issue.toLowerCase())) {
          score += 40
          matchReasons.push(`Addresses cluster issue: ${issue}`)
        }
      }
    }

    // Match upgrade missions against version
    if (mission.type === 'upgrade' && cluster.version) {
      const descLower = mission.description.toLowerCase()
      if (descLower.includes(cluster.version) || descLower.includes('upgrade')) {
        score += 15
        matchReasons.push('Relevant to cluster version')
      }
    }

    // Boost deploy missions for matching provider
    if (mission.type === 'deploy' && cluster.provider && mission.tags) {
      if (mission.tags.some((t) => t.toLowerCase() === cluster.provider?.toLowerCase())) {
        score += 25
        matchReasons.push(`Matches cluster provider: ${cluster.provider}`)
      }
    }

    if (score > 0) {
      results.push({ mission, score, matchReasons })
    }
  }

  return results.sort((a, b) => b.score - a.score)
}
