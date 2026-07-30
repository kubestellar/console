/**
 * Drilldown Views Export Tests
 *
 * Validates that all drilldown view components are properly exported.
 */
import { describe, it, expect } from 'vitest'
import * as BuildpackDrillDown from '../BuildpackDrillDown'
import * as ComplianceDrillDown from '../ComplianceDrillDown'
import * as ConfigMapDrillDown from '../ConfigMapDrillDown'
import * as CostDrillDown from '../CostDrillDown'
import * as CRDDrillDown from '../CRDDrillDown'
import * as DeploymentDrillDown from '../DeploymentDrillDown'
import * as DriftDrillDown from '../DriftDrillDown'
import * as EventsDrillDown from '../EventsDrillDown'
import * as GPUNamespaceDrillDown from '../GPUNamespaceDrillDown'
import * as GPUNodeDrillDown from '../GPUNodeDrillDown'
import * as HelmReleaseDrillDown from '../HelmReleaseDrillDown'
import * as KustomizationDrillDown from '../KustomizationDrillDown'
import * as LogsDrillDown from '../LogsDrillDown'
import * as MultiClusterSummaryDrillDown from '../MultiClusterSummaryDrillDown'
import * as NamespaceDrillDown from '../NamespaceDrillDown'
import * as NodeDrillDown from '../NodeDrillDown'
import * as PodDrillDown from '../PodDrillDown'
import * as RBACDrillDown from '../RBACDrillDown'
import * as ReplicaSetDrillDown from '../ReplicaSetDrillDown'
import * as ResourcesDrillDown from '../ResourcesDrillDown'
import * as SecretDrillDown from '../SecretDrillDown'
import * as ServiceAccountDrillDown from '../ServiceAccountDrillDown'

const modules = [
  { name: 'BuildpackDrillDown', mod: BuildpackDrillDown },
  { name: 'ComplianceDrillDown', mod: ComplianceDrillDown },
  { name: 'ConfigMapDrillDown', mod: ConfigMapDrillDown },
  { name: 'CostDrillDown', mod: CostDrillDown },
  { name: 'CRDDrillDown', mod: CRDDrillDown },
  { name: 'DeploymentDrillDown', mod: DeploymentDrillDown },
  { name: 'DriftDrillDown', mod: DriftDrillDown },
  { name: 'EventsDrillDown', mod: EventsDrillDown },
  { name: 'GPUNamespaceDrillDown', mod: GPUNamespaceDrillDown },
  { name: 'GPUNodeDrillDown', mod: GPUNodeDrillDown },
  { name: 'HelmReleaseDrillDown', mod: HelmReleaseDrillDown },
  { name: 'KustomizationDrillDown', mod: KustomizationDrillDown },
  { name: 'LogsDrillDown', mod: LogsDrillDown },
  { name: 'MultiClusterSummaryDrillDown', mod: MultiClusterSummaryDrillDown },
  { name: 'NamespaceDrillDown', mod: NamespaceDrillDown },
  { name: 'NodeDrillDown', mod: NodeDrillDown },
  { name: 'PodDrillDown', mod: PodDrillDown },
  { name: 'RBACDrillDown', mod: RBACDrillDown },
  { name: 'ReplicaSetDrillDown', mod: ReplicaSetDrillDown },
  { name: 'ResourcesDrillDown', mod: ResourcesDrillDown },
  { name: 'SecretDrillDown', mod: SecretDrillDown },
  { name: 'ServiceAccountDrillDown', mod: ServiceAccountDrillDown },
]

describe('Drilldown view exports', () => {
  it.each(modules)('$name is exported', ({ name, mod }) => {
    expect((mod as Record<string, unknown>)[name]).toBeDefined()
  })
})
