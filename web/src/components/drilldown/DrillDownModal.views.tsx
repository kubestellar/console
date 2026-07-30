import { safeLazy } from '../../lib/safeLazy'
import type { ReactNode } from 'react'
import type { DrillDownView } from '../../hooks/useDrillDown.types'

// Lazy load large components (>300 lines) for better performance
const ClusterDrillDown = safeLazy(() => import('./views/ClusterDrillDown'), 'ClusterDrillDown')
const OperatorDrillDown = safeLazy(() => import('./views/OperatorDrillDown'), 'OperatorDrillDown')
const PolicyDrillDown = safeLazy(() => import('./views/PolicyDrillDown'), 'PolicyDrillDown')
const PodDrillDown = safeLazy(() => import('./views/PodDrillDown'), 'PodDrillDown')
const DeploymentDrillDown = safeLazy(() => import('./views/DeploymentDrillDown'), 'DeploymentDrillDown')
const MultiClusterSummaryDrillDown = safeLazy(() => import('./views/MultiClusterSummaryDrillDown'), 'MultiClusterSummaryDrillDown')
const ReplicaSetDrillDown = safeLazy(() => import('./views/ReplicaSetDrillDown'), 'ReplicaSetDrillDown')
const SecretDrillDown = safeLazy(() => import('./views/SecretDrillDown'), 'SecretDrillDown')
const KustomizationDrillDown = safeLazy(() => import('./views/KustomizationDrillDown'), 'KustomizationDrillDown')
const AlertDrillDown = safeLazy(() => import('./views/AlertDrillDown'), 'AlertDrillDown')
const DriftDrillDown = safeLazy(() => import('./views/DriftDrillDown'), 'DriftDrillDown')
const CRDDrillDown = safeLazy(() => import('./views/CRDDrillDown'), 'CRDDrillDown')
const ResourcesDrillDown = safeLazy(() => import('./views/ResourcesDrillDown'), 'ResourcesDrillDown')
const ServiceAccountDrillDown = safeLazy(() => import('./views/ServiceAccountDrillDown'), 'ServiceAccountDrillDown')
const ArgoAppDrillDown = safeLazy(() => import('./views/ArgoAppDrillDown'), 'ArgoAppDrillDown')
const HelmReleaseDrillDown = safeLazy(() => import('./views/HelmReleaseDrillDown'), 'HelmReleaseDrillDown')
const ConfigMapDrillDown = safeLazy(() => import('./views/ConfigMapDrillDown'), 'ConfigMapDrillDown')
const BuildpackDrillDown = safeLazy(() => import('./views/BuildpackDrillDown'), 'BuildpackDrillDown')
const ServiceDrillDown = safeLazy(() => import('./views/ServiceDrillDown'), 'default')
const RBACDrillDown = safeLazy(() => import('./views/RBACDrillDown'), 'RBACDrillDown')
const CostDrillDown = safeLazy(() => import('./views/CostDrillDown'), 'CostDrillDown')
const ComplianceDrillDown = safeLazy(() => import('./views/ComplianceDrillDown'), 'ComplianceDrillDown')
const PVCDrillDown = safeLazy(() => import('./views/PVCDrillDown'), 'PVCDrillDown')
const QuantumCredentialsDrillDown = safeLazy(() => import('./views/quantum/QuantumCredentialsDrillDown'), 'QuantumCredentialsDrillDown')

const EventsDrillDown = safeLazy(() => import('./views/EventsDrillDown'), 'EventsDrillDown')

const NamespaceDrillDown = safeLazy(() => import('./views/NamespaceDrillDown'), 'NamespaceDrillDown')
const NodeDrillDown = safeLazy(() => import('./views/NodeDrillDown'), 'NodeDrillDown')
const GPUNamespaceDrillDown = safeLazy(() => import('./views/GPUNamespaceDrillDown'), 'GPUNamespaceDrillDown')
const LogsDrillDown = safeLazy(() => import('./views/LogsDrillDown'), 'LogsDrillDown')
const GPUNodeDrillDown = safeLazy(() => import('./views/GPUNodeDrillDown'), 'GPUNodeDrillDown')
const YAMLDrillDown = safeLazy(() => import('./views/YAMLDrillDown'), 'YAMLDrillDown')

type DrillDownViewLike = DrillDownView

/**
 * Maps a drill-down view type to its rendered component. Extracted from
 * DrillDownModal so the lazy-import registry and routing switch can evolve
 * independently of the modal chrome (header/breadcrumbs/footer).
 */
export function renderDrillDownView(currentView: DrillDownViewLike, unknownViewLabel: string, customViewLabel: string): ReactNode {
  const { type, data } = currentView
  switch (type) {
    case 'cluster':
      return <ClusterDrillDown data={data} />
    case 'namespace':
      return <NamespaceDrillDown data={data} />
    case 'deployment':
      return <DeploymentDrillDown data={data} />
    case 'replicaset':
      return <ReplicaSetDrillDown data={data} />
    case 'pod':
      return <PodDrillDown data={data} />
    case 'logs':
      return <LogsDrillDown data={data} />
    case 'events':
      return <EventsDrillDown data={data} />
    case 'node':
      return <NodeDrillDown data={data} />
    case 'gpu-node':
      return <GPUNodeDrillDown data={data} />
    case 'gpu-namespace':
      return <GPUNamespaceDrillDown data={data} />
    case 'yaml':
      return <YAMLDrillDown data={data} />
    case 'resources':
      return <ResourcesDrillDown data={data} />
    case 'configmap':
      return <ConfigMapDrillDown data={data} />
    case 'secret':
      return <SecretDrillDown data={data} />
    case 'serviceaccount':
      return <ServiceAccountDrillDown data={data} />
    case 'pvc':
      return <PVCDrillDown data={data} />
    case 'service':
      return <ServiceDrillDown data={data} />
    // Phase 2 views
    case 'alert':
      return <AlertDrillDown data={data} />
    case 'helm':
      return <HelmReleaseDrillDown data={data} />
    case 'argoapp':
      return <ArgoAppDrillDown data={data} />
    case 'operator':
      return <OperatorDrillDown data={data} />
    case 'policy':
      return <PolicyDrillDown data={data} />
    case 'compliance':
      return <ComplianceDrillDown data={data} />
    case 'kustomization':
      return <KustomizationDrillDown data={data} />
    case 'buildpack':
      return <BuildpackDrillDown data={data} />

    case 'crd':
      return <CRDDrillDown data={data} />
    case 'drift':
      return <DriftDrillDown data={data} />
    case 'rbac':
      return <RBACDrillDown data={data} />
    case 'cost':
      return <CostDrillDown data={data} />
    // Multi-cluster summary views
    case 'all-clusters':
    case 'all-namespaces':
    case 'all-deployments':
    case 'all-pods':
    case 'all-services':
    case 'all-nodes':
    case 'all-events':
    case 'all-alerts':
    case 'all-helm':
    case 'all-operators':
    case 'all-security':
    case 'all-gpu':
    case 'all-storage':
    case 'all-jobs':
      return <MultiClusterSummaryDrillDown data={data} viewType={type} />
    case 'custom':
      return currentView.customComponent || <div>{customViewLabel}</div>
    case 'quantum-credentials':
      return <QuantumCredentialsDrillDown data={data} />
    default:
      return <div>{unknownViewLabel}</div>
  }
}
