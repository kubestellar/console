/**
 * Demo data for the Harbor Registry (CNCF graduated) monitoring card.
 *
 * Represents a typical production environment using Harbor as a
 * container registry on Kubernetes.
 *
 * Harbor terminology:
 * - Project:      a logical grouping of repositories with access control,
 *                 vulnerability scanning policies, and quota limits.
 * - Repository:   a collection of container image tags within a project.
 * - Artifact:     a specific image manifest (tag + digest) in a repository.
 * - Scanner:      vulnerability scanner (Trivy by default) that scans artifacts
 *                 for CVEs and generates reports.
 * - Robot Account: machine-to-machine credentials for CI/CD pipelines.
 */

const DEMO_LAST_CHECK_OFFSET_MS = 30_000

// ---------------------------------------------------------------------------
// Project types
// ---------------------------------------------------------------------------

export type HarborProjectStatus = 'healthy' | 'unhealthy' | 'unknown'

export interface HarborProject {
  name: string
  /** Number of repositories in the project */
  repoCount: number
  /** Whether the project is publicly accessible */
  isPublic: boolean
  /** Total pull count across all repositories */
  pullCount: number
  /** Project storage quota (human-readable, e.g. "10 GiB") */
  storageQuota: string
  /** Currently used storage (human-readable, e.g. "6.2 GiB") */
  storageUsed: string
  /** Storage usage percentage (0–100) */
  storagePercent: number
  /** Vulnerability scan summary */
  vulnerabilities: HarborVulnSummary
  status: HarborProjectStatus
}

// ---------------------------------------------------------------------------
// Repository types
// ---------------------------------------------------------------------------

export interface HarborRepository {
  /** Full repository name (project/repo) */
  name: string
  /** Number of artifact tags */
  artifactCount: number
  /** Total pull count */
  pullCount: number
  /** Last push timestamp (ISO 8601) */
  lastPush: string
  /** Vulnerability scan summary for the latest artifact */
  vulnerabilities: HarborVulnSummary
}

// ---------------------------------------------------------------------------
// Vulnerability summary
// ---------------------------------------------------------------------------

export interface HarborVulnSummary {
  critical: number
  high: number
  medium: number
  low: number
  /** Total scanned artifacts */
  scanned: number
  /** Total artifacts (scanned + unscanned) */
  total: number
}

// ---------------------------------------------------------------------------
// Aggregate type
// ---------------------------------------------------------------------------

export interface HarborDemoData {
  health: 'healthy' | 'degraded' | 'not-installed'
  instanceName: string
  /** Harbor version string (e.g. "v2.11.0") */
  version: string
  projects: HarborProject[]
  repositories: HarborRepository[]
  lastCheckTime: string
}

// ---------------------------------------------------------------------------
// Demo data
// ---------------------------------------------------------------------------

export const HARBOR_DEMO_DATA: HarborDemoData = {
  health: 'degraded',
  instanceName: 'harbor-prod',
  version: 'v2.11.0',
  projects: [
    {
      name: 'platform',
      repoCount: 12,
      isPublic: false,
      pullCount: 45_230,
      storageQuota: '50 GiB',
      storageUsed: '32.4 GiB',
      storagePercent: 65,
      vulnerabilities: { critical: 0, high: 2, medium: 8, low: 14, scanned: 12, total: 12 },
      status: 'healthy',
    },
    {
      name: 'ml-images',
      repoCount: 8,
      isPublic: false,
      pullCount: 18_750,
      storageQuota: '100 GiB',
      storageUsed: '78.6 GiB',
      storagePercent: 79,
      vulnerabilities: { critical: 3, high: 7, medium: 15, low: 22, scanned: 7, total: 8 },
      status: 'unhealthy',
    },
    {
      name: 'public-mirrors',
      repoCount: 25,
      isPublic: true,
      pullCount: 128_400,
      storageQuota: '200 GiB',
      storageUsed: '156 GiB',
      storagePercent: 78,
      vulnerabilities: { critical: 1, high: 5, medium: 20, low: 35, scanned: 23, total: 25 },
      status: 'healthy',
    },
    {
      name: 'staging',
      repoCount: 4,
      isPublic: false,
      pullCount: 3_200,
      storageQuota: '20 GiB',
      storageUsed: '2.1 GiB',
      storagePercent: 11,
      vulnerabilities: { critical: 0, high: 0, medium: 1, low: 3, scanned: 4, total: 4 },
      status: 'healthy',
    },
  ],
  repositories: [
    {
      name: 'platform/api-gateway',
      artifactCount: 18,
      pullCount: 12_450,
      lastPush: new Date(Date.now() - 3_600_000).toISOString(),
      vulnerabilities: { critical: 0, high: 1, medium: 3, low: 5, scanned: 18, total: 18 },
    },
    {
      name: 'platform/auth-service',
      artifactCount: 24,
      pullCount: 8_920,
      lastPush: new Date(Date.now() - 7_200_000).toISOString(),
      vulnerabilities: { critical: 0, high: 0, medium: 2, low: 4, scanned: 24, total: 24 },
    },
    {
      name: 'ml-images/pytorch-train',
      artifactCount: 6,
      pullCount: 5_600,
      lastPush: new Date(Date.now() - 86_400_000).toISOString(),
      vulnerabilities: { critical: 2, high: 4, medium: 8, low: 12, scanned: 5, total: 6 },
    },
    {
      name: 'ml-images/tensorrt-inference',
      artifactCount: 4,
      pullCount: 3_100,
      lastPush: new Date(Date.now() - 172_800_000).toISOString(),
      vulnerabilities: { critical: 1, high: 3, medium: 5, low: 7, scanned: 4, total: 4 },
    },
    {
      name: 'public-mirrors/nginx',
      artifactCount: 32,
      pullCount: 45_200,
      lastPush: new Date(Date.now() - 43_200_000).toISOString(),
      vulnerabilities: { critical: 0, high: 1, medium: 4, low: 8, scanned: 32, total: 32 },
    },
    {
      name: 'public-mirrors/redis',
      artifactCount: 28,
      pullCount: 32_100,
      lastPush: new Date(Date.now() - 259_200_000).toISOString(),
      vulnerabilities: { critical: 0, high: 2, medium: 6, low: 10, scanned: 28, total: 28 },
    },
    {
      name: 'staging/frontend-app',
      artifactCount: 3,
      pullCount: 1_800,
      lastPush: new Date(Date.now() - 1_800_000).toISOString(),
      vulnerabilities: { critical: 0, high: 0, medium: 0, low: 2, scanned: 3, total: 3 },
    },
  ],
  lastCheckTime: new Date(Date.now() - DEMO_LAST_CHECK_OFFSET_MS).toISOString(),
}
