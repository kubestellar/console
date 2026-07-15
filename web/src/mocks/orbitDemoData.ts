/**
 * Demo mode mock data for Orbital Maintenance missions.
 * Provides realistic orbit missions with run history for the demo experience.
 */

import type { OrbitConfig } from '../lib/missions/types'

/** Two days ago in ISO format */
const TWO_DAYS_AGO = new Date(Date.now() - 2 * 86_400_000).toISOString()
/** One week ago in ISO format */
const ONE_WEEK_AGO = new Date(Date.now() - 7 * 86_400_000).toISOString()
/** Ten days ago — overdue for a weekly cadence */
const TEN_DAYS_AGO = new Date(Date.now() - 10 * 86_400_000).toISOString()

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString()
}

export interface DemoOrbitMission {
  id: string
  title: string
  description: string
  type: 'maintain'
  status: 'saved' | 'completed'
  importedFrom: {
    title: string
    description: string
    missionClass: 'orbit'
    cncfProject?: string
  }
  context: {
    orbitConfig: OrbitConfig
    category?: string
  }
}

export const DEMO_ORBIT_MISSIONS: DemoOrbitMission[] = [
  {
    id: 'demo-orbit-prometheus-health',
    title: 'Health Check — Prometheus, Grafana',
    description: 'Weekly pod readiness and service endpoint verification for the observability stack.',
    type: 'maintain',
    status: 'saved',
    importedFrom: {
      title: 'Health Check — Prometheus, Grafana',
      description: 'Weekly pod readiness and service endpoint verification for the observability stack.',
      missionClass: 'orbit',
      cncfProject: 'prometheus',
    },
    context: {
      category: 'Observability',
      orbitConfig: {
        cadence: 'weekly',
        orbitType: 'health-check',
        projects: ['prometheus', 'grafana'],
        clusters: ['eks-prod-us-east-1'],
        lastRunAt: TWO_DAYS_AGO,
        lastRunResult: 'success',
        history: [
          { timestamp: TWO_DAYS_AGO, result: 'success', summary: 'All 12 pods healthy, 3 services reachable' },
          { timestamp: daysAgo(9), result: 'success', summary: 'All pods healthy' },
          { timestamp: daysAgo(16), result: 'warning', summary: 'prometheus-server pod restarted 2x in 24h' },
          { timestamp: daysAgo(23), result: 'success', summary: 'All pods healthy' },
        ],
      },
    },
  },
  {
    id: 'demo-orbit-certmanager-certs',
    title: 'Certificate Rotation — cert-manager',
    description: 'Monthly TLS certificate expiry check.',
    type: 'maintain',
    status: 'saved',
    importedFrom: {
      title: 'Certificate Rotation — cert-manager',
      description: 'Monthly TLS certificate expiry check.',
      missionClass: 'orbit',
      cncfProject: 'cert-manager',
    },
    context: {
      category: 'Security',
      orbitConfig: {
        cadence: 'monthly',
        orbitType: 'cert-rotation',
        projects: ['cert-manager'],
        clusters: ['eks-prod-us-east-1', 'aks-dev-westeu'],
        lastRunAt: ONE_WEEK_AGO,
        lastRunResult: 'warning',
        history: [
          { timestamp: ONE_WEEK_AGO, result: 'warning', summary: '1 cert expiring in 14 days: api-gateway-tls' },
          { timestamp: daysAgo(37), result: 'success', summary: 'All 8 certificates valid, earliest expiry in 45 days' },
        ],
      },
    },
  },
  {
    id: 'demo-orbit-argocd-drift',
    title: 'Version Drift — ArgoCD',
    description: 'Weekly Helm chart and image version drift detection.',
    type: 'maintain',
    status: 'saved',
    importedFrom: {
      title: 'Version Drift — ArgoCD',
      description: 'Weekly Helm chart and image version drift detection.',
      missionClass: 'orbit',
      cncfProject: 'argocd',
    },
    context: {
      category: 'App Definition',
      orbitConfig: {
        cadence: 'weekly',
        orbitType: 'version-drift',
        projects: ['argocd'],
        clusters: ['eks-prod-us-east-1'],
        lastRunAt: TEN_DAYS_AGO,
        lastRunResult: 'failure',
        history: [
          { timestamp: TEN_DAYS_AGO, result: 'failure', summary: 'ArgoCD v2.13.1 installed, v2.14.0 available (security fix)' },
          { timestamp: daysAgo(17), result: 'success', summary: 'All charts up to date' },
        ],
      },
    },
  },
]
