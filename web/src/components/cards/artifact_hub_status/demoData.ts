/**
 * Demo data for the Artifact Hub status card.
 *
 * Representative counts for a healthy public Artifact Hub instance.
 * Used when the dashboard is in demo mode or live data is disabled.
 */

export interface ArtifactHubDemoData {
  packages: number
  repositories: number
  organizations: number
  users: number
  health: 'healthy' | 'degraded'
  lastCheckTime: string
}

/** Demo counts aligned with typical public-hub scale (order of magnitude). */
const DEMO_PACKAGES = 12_847
const DEMO_REPOSITORIES = 942
const DEMO_ORGANIZATIONS = 318
const DEMO_USERS = 5_200
const DEMO_LAST_CHECK_MINUTES_AGO = 2

export const ARTIFACT_HUB_DEMO_DATA: ArtifactHubDemoData = {
  packages: DEMO_PACKAGES,
  repositories: DEMO_REPOSITORIES,
  organizations: DEMO_ORGANIZATIONS,
  users: DEMO_USERS,
  health: 'healthy',
  lastCheckTime: new Date(Date.now() - DEMO_LAST_CHECK_MINUTES_AGO * 60 * 1000).toISOString(),
}
