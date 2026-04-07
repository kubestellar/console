/**
 * Demo Mission Control State
 *
 * Pre-populated state for console.kubestellar.io that shows a completed
 * multi-cluster security + observability deployment. Starts on the
 * 'blueprint' phase so visitors see the SVG deployment visualization.
 */

import type {
  MissionControlState,
  PayloadProject,
  ClusterAssignment,
  DeployPhase,
  PhaseProgress,
} from './types'

const DEMO_PROJECTS: PayloadProject[] = [
  {
    name: 'prometheus',
    displayName: 'Prometheus',
    reason: 'Metrics collection and alerting — foundation for cluster observability.',
    category: 'Observability',
    priority: 'required',
    dependencies: [],
    maturity: 'graduated',
    difficulty: 'beginner',
    githubOrg: 'prometheus',
  },
  {
    name: 'grafana',
    displayName: 'Grafana',
    reason: 'Visualization dashboards for Prometheus metrics.',
    category: 'Observability',
    priority: 'recommended',
    dependencies: ['prometheus'],
    maturity: 'graduated',
    difficulty: 'beginner',
    githubOrg: 'grafana',
  },
  {
    name: 'falco',
    displayName: 'Falco Runtime Security',
    reason: 'Runtime threat detection — monitors syscalls for malicious activity.',
    category: 'Security',
    priority: 'required',
    dependencies: ['prometheus'],
    maturity: 'graduated',
    difficulty: 'intermediate',
    githubOrg: 'falcosecurity',
  },
  {
    name: 'kyverno',
    displayName: 'Kyverno',
    reason: 'Policy engine — enforce security policies as Kubernetes resources.',
    category: 'Security',
    priority: 'recommended',
    dependencies: ['cert-manager'],
    maturity: 'graduated',
    difficulty: 'intermediate',
    githubOrg: 'kyverno',
  },
  {
    name: 'cert-manager',
    displayName: 'cert-manager',
    reason: 'TLS certificate lifecycle management — auto-renew certificates.',
    category: 'Security',
    priority: 'required',
    dependencies: [],
    maturity: 'graduated',
    difficulty: 'beginner',
    githubOrg: 'cert-manager',
  },
]

const DEMO_ASSIGNMENTS: ClusterAssignment[] = [
  {
    clusterName: 'eks-prod-us-east-1',
    clusterContext: 'eks-prod-us-east-1',
    provider: 'eks',
    projectNames: ['prometheus', 'grafana', 'falco', 'cert-manager'],
    warnings: [],
    readiness: {
      cpuHeadroomPercent: 68,
      memHeadroomPercent: 72,
      storageHeadroomPercent: 85,
      overallScore: 75,
    },
  },
  {
    clusterName: 'aks-dev-westeu',
    clusterContext: 'aks-dev-westeu',
    provider: 'aks',
    projectNames: ['prometheus', 'kyverno', 'cert-manager'],
    warnings: ['Limited storage headroom (38% remaining)'],
    readiness: {
      cpuHeadroomPercent: 55,
      memHeadroomPercent: 62,
      storageHeadroomPercent: 38,
      overallScore: 52,
    },
  },
  {
    clusterName: 'openshift-prod',
    clusterContext: 'openshift-prod',
    provider: 'openshift',
    projectNames: ['falco', 'kyverno'],
    warnings: [],
    readiness: {
      cpuHeadroomPercent: 78,
      memHeadroomPercent: 81,
      storageHeadroomPercent: 90,
      overallScore: 83,
    },
  },
]

const DEMO_PHASES: DeployPhase[] = [
  {
    phase: 1,
    name: 'Core Infrastructure',
    projectNames: ['cert-manager', 'prometheus'],
    estimatedSeconds: 90,
  },
  {
    phase: 2,
    name: 'Security & Observability',
    projectNames: ['falco', 'kyverno', 'grafana'],
    estimatedSeconds: 150,
  },
]

const DEMO_LAUNCH_PROGRESS: PhaseProgress[] = [
  {
    phase: 1,
    status: 'completed',
    projects: [
      { name: 'cert-manager', missionId: 'demo-mc-certmgr', status: 'completed' },
      { name: 'prometheus', missionId: 'demo-mc-prom', status: 'completed' },
    ],
  },
  {
    phase: 2,
    status: 'completed',
    projects: [
      { name: 'falco', missionId: 'demo-mc-falco', status: 'completed' },
      { name: 'kyverno', missionId: 'demo-mc-kyverno', status: 'completed' },
      { name: 'grafana', missionId: 'demo-mc-grafana', status: 'completed' },
    ],
  },
]

/**
 * Returns a pre-populated MissionControlState for demo mode.
 * Shows the blueprint phase so visitors see the SVG deployment visualization
 * with all projects, clusters, and deployment phases visible.
 */
export function getDemoMissionControlState(): Partial<MissionControlState> {
  return {
    phase: 'blueprint',
    title: 'Security & Observability Stack',
    description: 'Deploy comprehensive security monitoring and observability across production clusters with automated certificate management.',
    projects: DEMO_PROJECTS,
    assignments: DEMO_ASSIGNMENTS,
    phases: DEMO_PHASES,
    launchProgress: DEMO_LAUNCH_PROGRESS,
    overlay: 'architecture',
    deployMode: 'phased',
    isDryRun: false,
    targetClusters: [],
    aiStreaming: false,
    groundControlDashboardId: undefined,
  }
}
