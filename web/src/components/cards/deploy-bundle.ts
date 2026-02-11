/**
 * Deploy Dashboard Cards — barrel export
 *
 * Groups all 17 cards used on the Deploy dashboard into a single chunk.
 * When `import('./deploy-bundle')` is eagerly started at module parse time
 * and shared across all lazy() references, the browser downloads one chunk
 * instead of 17, eliminating HTTP connection contention.
 */

// Deployment core
export { DeploymentStatus } from './DeploymentStatus'
export { DeploymentProgress } from './DeploymentProgress'
export { DeploymentIssues } from './DeploymentIssues'
export { WorkloadDeployment } from './WorkloadDeployment'
export { ClusterGroups } from './ClusterGroups'
export { Missions } from './Missions'
export { ResourceMarshall } from './ResourceMarshall'

// GitOps & ArgoCD
export { GitOpsDrift } from './GitOpsDrift'
export { ArgoCDApplications } from './ArgoCDApplications'
export { ArgoCDSyncStatus } from './ArgoCDSyncStatus'
export { ArgoCDHealth } from './ArgoCDHealth'

// Helm & Kustomize
export { HelmReleaseStatus } from './HelmReleaseStatus'
export { HelmHistory } from './HelmHistory'
export { ChartVersions } from './ChartVersions'
export { KustomizationStatus } from './KustomizationStatus'
export { OverlayComparison } from './OverlayComparison'
