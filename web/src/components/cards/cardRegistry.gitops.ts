import type { CardComponent } from './cardRegistry.types'
import { safeLazy } from '../../lib/safeLazy'

const _deployBundle = import('./deploy-bundle').catch(() => undefined as never)
const ArgoCDApplicationSets = safeLazy(() => _deployBundle, 'ArgoCDApplicationSets')
const ArgoCDApplications = safeLazy(() => _deployBundle, 'ArgoCDApplications')
const ArgoCDHealth = safeLazy(() => _deployBundle, 'ArgoCDHealth')
const ArgoCDSyncStatus = safeLazy(() => _deployBundle, 'ArgoCDSyncStatus')
const ChartVersions = safeLazy(() => _deployBundle, 'ChartVersions')
const ClusterGroups = safeLazy(() => _deployBundle, 'ClusterGroups')
const FluxStatus = safeLazy(() => import('./flux_status'), 'FluxStatus')
const _workloadMonitorBundle = import('./workload-monitor').catch(() => undefined as never)
const GitHubCIMonitor = safeLazy(() => _workloadMonitorBundle, 'GitHubCIMonitor')
const GitOpsDrift = safeLazy(() => _deployBundle, 'GitOpsDrift')
const HelmHistory = safeLazy(() => _deployBundle, 'HelmHistory')
const HelmReleaseStatus = safeLazy(() => _deployBundle, 'HelmReleaseStatus')
const HelmValuesDiff = safeLazy(() => import('./HelmValuesDiff'), 'HelmValuesDiff')
const KustomizationStatus = safeLazy(() => _deployBundle, 'KustomizationStatus')
const Missions = safeLazy(() => _deployBundle, 'Missions')
const _pipelinesBundle = import('./pipelines').catch(() => undefined as never)
const NightlyReleasePulse = safeLazy(() => _pipelinesBundle, 'NightlyReleasePulse')
const OverlayComparison = safeLazy(() => _deployBundle, 'OverlayComparison')
const PipelineFlow = safeLazy(() => _pipelinesBundle, 'PipelineFlow')
const ProwCIMonitor = safeLazy(() => _workloadMonitorBundle, 'ProwCIMonitor')
const RecentFailures = safeLazy(() => _pipelinesBundle, 'RecentFailures')
const ResourceMarshall = safeLazy(() => _deployBundle, 'ResourceMarshall')
const WorkflowMatrix = safeLazy(() => _pipelinesBundle, 'WorkflowMatrix')
const WorkloadDeployment = safeLazy(() => _deployBundle, 'WorkloadDeployment')

/**
 * GitOps and deployment cards.
 * Cards:
 * argocd_applications, argocd_applicationsets, argocd_health, argocd_sync_status, chart_versions,
 * cluster_groups, deployment_missions, flux_status, github_ci_monitor, gitops_drift, helm_history,
 * helm_release_status, helm_values_diff, kustomization_status, nightly_release_pulse,
 * overlay_comparison, pipeline_flow, prow_ci_monitor, recent_failures, resource_marshall,
 * workflow_matrix, workload_deployment
 */
export interface CardRegistryDomain {
  components: Record<string, CardComponent>
  demoDataCards: Set<string>
  liveDataCards: Set<string>
  chunkPreloaders: Record<string, () => Promise<unknown>>
  defaultWidths: Record<string, number>
}

const components: Record<string, CardComponent> = {
  argocd_applications: ArgoCDApplications,
  argocd_applicationsets: ArgoCDApplicationSets,
  argocd_health: ArgoCDHealth,
  argocd_sync_status: ArgoCDSyncStatus,
  chart_versions: ChartVersions,
  cluster_groups: ClusterGroups,
  deployment_missions: Missions,
  flux_status: FluxStatus,
  github_ci_monitor: GitHubCIMonitor,
  gitops_drift: GitOpsDrift,
  helm_history: HelmHistory,
  helm_release_status: HelmReleaseStatus,
  helm_values_diff: HelmValuesDiff,
  kustomization_status: KustomizationStatus,
  nightly_release_pulse: NightlyReleasePulse,
  overlay_comparison: OverlayComparison,
  pipeline_flow: PipelineFlow,
  prow_ci_monitor: ProwCIMonitor,
  recent_failures: RecentFailures,
  resource_marshall: ResourceMarshall,
  workflow_matrix: WorkflowMatrix,
  workload_deployment: WorkloadDeployment,
}

export const gitopsCardRegistry: CardRegistryDomain = {
  components,
  demoDataCards: new Set<string>(),
  liveDataCards: new Set([
    'deployment_missions',
    'github_ci_monitor',
    'nightly_release_pulse',
    'pipeline_flow',
    'prow_ci_monitor',
    'recent_failures',
    'workflow_matrix',
  ]),
  chunkPreloaders: {
    argocd_applications: () => import('./deploy-bundle'),
    argocd_applicationsets: () => import('./deploy-bundle'),
    argocd_health: () => import('./deploy-bundle'),
    argocd_sync_status: () => import('./deploy-bundle'),
    chart_versions: () => import('./deploy-bundle'),
    cluster_groups: () => import('./deploy-bundle'),
    deployment_missions: () => import('./deploy-bundle'),
    flux_status: () => import('./flux_status'),
    github_ci_monitor: () => import('./workload-monitor'),
    gitops_drift: () => import('./deploy-bundle'),
    helm_history: () => import('./deploy-bundle'),
    helm_release_status: () => import('./deploy-bundle'),
    helm_values_diff: () => import('./HelmValuesDiff'),
    kustomization_status: () => import('./deploy-bundle'),
    nightly_release_pulse: () => import('./pipelines'),
    overlay_comparison: () => import('./deploy-bundle'),
    pipeline_flow: () => import('./pipelines'),
    prow_ci_monitor: () => import('./workload-monitor'),
    recent_failures: () => import('./pipelines'),
    resource_marshall: () => import('./deploy-bundle'),
    workflow_matrix: () => import('./pipelines'),
    workload_deployment: () => import('./deploy-bundle'),
  },
  defaultWidths: {
    argocd_applications: 6,
    argocd_applicationsets: 6,
    argocd_health: 6,
    argocd_sync_status: 6,
    chart_versions: 6,
    cluster_groups: 4,
    deployment_missions: 5,
    flux_status: 6,
    github_ci_monitor: 8,
    gitops_drift: 6,
    helm_history: 8,
    helm_release_status: 6,
    helm_values_diff: 8,
    kustomization_status: 6,
    nightly_release_pulse: 6,
    overlay_comparison: 8,
    pipeline_flow: 12,
    prow_ci_monitor: 6,
    recent_failures: 6,
    resource_marshall: 6,
    workflow_matrix: 6,
    workload_deployment: 6,
  },
}
