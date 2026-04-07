/**
 * Orbit Mission Templates
 *
 * Pre-built recurring maintenance mission templates for each orbit type.
 * Each template includes steps with validation commands that the AI agent
 * or user can execute to verify system health.
 */

import type { OrbitType, OrbitCadence, MissionStep } from '../missions/types'

export interface OrbitTemplate {
  orbitType: OrbitType
  title: string
  description: string
  suggestedCadence: OrbitCadence
  /** CNCF landscape categories where this orbit type is applicable */
  applicableCategories: string[]
  steps: MissionStep[]
}

export const ORBIT_TEMPLATES: OrbitTemplate[] = [
  {
    orbitType: 'health-check',
    title: 'Health Check',
    description: 'Verify pod readiness, service endpoints, and resource availability across deployed workloads.',
    suggestedCadence: 'weekly',
    applicableCategories: ['*'],
    steps: [
      {
        title: 'Check pod health',
        description: 'Verify all pods are Running and Ready with no restarts.',
      },
      {
        title: 'Verify service endpoints',
        description: 'Ensure all services have healthy endpoints and are reachable.',
      },
      {
        title: 'Check resource utilization',
        description: 'Verify CPU and memory usage are within acceptable thresholds.',
      },
    ],
  },
  {
    orbitType: 'cert-rotation',
    title: 'Certificate Rotation Check',
    description: 'Check TLS certificate expiry dates and flag certificates expiring within 30 days.',
    suggestedCadence: 'monthly',
    applicableCategories: ['Security', 'Networking', 'Service Mesh'],
    steps: [
      {
        title: 'List certificates',
        description: 'Enumerate all TLS certificates and their expiry dates.',
      },
      {
        title: 'Flag expiring certificates',
        description: 'Identify certificates expiring within 30 days.',
      },
      {
        title: 'Verify cert-manager issuer health',
        description: 'Check that certificate issuers are ready and able to renew.',
      },
    ],
  },
  {
    orbitType: 'version-drift',
    title: 'Version Drift Detection',
    description: 'Compare installed Helm chart versions and container images against latest available releases.',
    suggestedCadence: 'weekly',
    applicableCategories: ['*'],
    steps: [
      {
        title: 'Check Helm chart versions',
        description: 'Compare installed chart versions against the upstream repository.',
      },
      {
        title: 'Check container image versions',
        description: 'Compare running image tags against latest available tags.',
      },
      {
        title: 'Report drift summary',
        description: 'Summarize which components are behind and by how many versions.',
      },
    ],
  },
  {
    orbitType: 'resource-quota',
    title: 'Resource Quota Check',
    description: 'Monitor namespace resource quotas and alert when usage approaches limits.',
    suggestedCadence: 'daily',
    applicableCategories: ['*'],
    steps: [
      {
        title: 'Check namespace quotas',
        description: 'List all namespaces with resource quotas and their current utilization.',
      },
      {
        title: 'Flag high utilization',
        description: 'Alert on namespaces using more than 80% of their quota.',
      },
    ],
  },
  {
    orbitType: 'backup-verification',
    title: 'Backup Verification',
    description: 'Verify that backup jobs completed successfully and backup data is accessible.',
    suggestedCadence: 'weekly',
    applicableCategories: ['Storage', 'Runtime'],
    steps: [
      {
        title: 'Check backup job status',
        description: 'Verify that recent CronJob/Job backups completed successfully.',
      },
      {
        title: 'Verify backup data integrity',
        description: 'Confirm backup storage is accessible and data is not corrupted.',
      },
      {
        title: 'Check backup age',
        description: 'Flag backups that are older than the expected retention policy.',
      },
    ],
  },
]

/**
 * Get applicable orbit templates for a set of CNCF categories.
 * Returns templates whose `applicableCategories` include '*' (universal)
 * or match any of the provided categories.
 */
export function getApplicableOrbitTemplates(categories: string[]): OrbitTemplate[] {
  return ORBIT_TEMPLATES.filter(template =>
    template.applicableCategories.includes('*') ||
    (categories || []).some(cat => template.applicableCategories.includes(cat))
  )
}
