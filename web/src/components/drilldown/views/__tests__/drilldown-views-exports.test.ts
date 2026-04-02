/**
 * Drilldown Views Export Tests
 *
 * Validates that all drilldown view components are properly exported.
 */
import { describe, it, expect } from 'vitest'
import { BuildpackDrillDown } from '../BuildpackDrillDown'
import { ComplianceDrillDown } from '../ComplianceDrillDown'
import { ConfigMapDrillDown } from '../ConfigMapDrillDown'
import { CostDrillDown } from '../CostDrillDown'
import { CRDDrillDown } from '../CRDDrillDown'
import { DeploymentDrillDown } from '../DeploymentDrillDown'
import { DriftDrillDown } from '../DriftDrillDown'
import { EventsDrillDown } from '../EventsDrillDown'
import { GPUNamespaceDrillDown } from '../GPUNamespaceDrillDown'
import { GPUNodeDrillDown } from '../GPUNodeDrillDown'
import { HelmReleaseDrillDown } from '../HelmReleaseDrillDown'
import { KustomizationDrillDown } from '../KustomizationDrillDown'
import { LogsDrillDown } from '../LogsDrillDown'
import { MultiClusterSummaryDrillDown } from '../MultiClusterSummaryDrillDown'
import { NamespaceDrillDown } from '../NamespaceDrillDown'
import { NodeDrillDown } from '../NodeDrillDown'
import { PodDrillDown } from '../PodDrillDown'
import { RBACDrillDown } from '../RBACDrillDown'
import { ReplicaSetDrillDown } from '../ReplicaSetDrillDown'
import { ResourcesDrillDown } from '../ResourcesDrillDown'
import { SecretDrillDown } from '../SecretDrillDown'
import { ServiceAccountDrillDown } from '../ServiceAccountDrillDown'

const components = [
  { name: 'BuildpackDrillDown', component: BuildpackDrillDown },
  { name: 'ComplianceDrillDown', component: ComplianceDrillDown },
  { name: 'ConfigMapDrillDown', component: ConfigMapDrillDown },
  { name: 'CostDrillDown', component: CostDrillDown },
  { name: 'CRDDrillDown', component: CRDDrillDown },
  { name: 'DeploymentDrillDown', component: DeploymentDrillDown },
  { name: 'DriftDrillDown', component: DriftDrillDown },
  { name: 'EventsDrillDown', component: EventsDrillDown },
  { name: 'GPUNamespaceDrillDown', component: GPUNamespaceDrillDown },
  { name: 'GPUNodeDrillDown', component: GPUNodeDrillDown },
  { name: 'HelmReleaseDrillDown', component: HelmReleaseDrillDown },
  { name: 'KustomizationDrillDown', component: KustomizationDrillDown },
  { name: 'LogsDrillDown', component: LogsDrillDown },
  { name: 'MultiClusterSummaryDrillDown', component: MultiClusterSummaryDrillDown },
  { name: 'NamespaceDrillDown', component: NamespaceDrillDown },
  { name: 'NodeDrillDown', component: NodeDrillDown },
  { name: 'PodDrillDown', component: PodDrillDown },
  { name: 'RBACDrillDown', component: RBACDrillDown },
  { name: 'ReplicaSetDrillDown', component: ReplicaSetDrillDown },
  { name: 'ResourcesDrillDown', component: ResourcesDrillDown },
  { name: 'SecretDrillDown', component: SecretDrillDown },
  { name: 'ServiceAccountDrillDown', component: ServiceAccountDrillDown },
]

describe('Drilldown view exports', () => {
  it.each(components)('$name is exported', ({ component }) => {
    expect(component).toBeDefined()
  })
})
