/**
 * Network, Service, Storage Card Config Tests
 */
import { describe, it, expect } from 'vitest'
import { networkOverviewConfig } from '../network-overview'
import { networkPolicyStatusConfig } from '../network-policy-status'
import { networkUtilsConfig } from '../network-utils'
import { serviceStatusConfig } from '../service-status'
import { serviceTopologyConfig } from '../service-topology'
import { serviceExportsConfig } from '../service-exports'
import { serviceImportsConfig } from '../service-imports'
import { ingressStatusConfig } from '../ingress-status'
import { gatewayStatusConfig } from '../gateway-status'
import { storageOverviewConfig } from '../storage-overview'
import { pvStatusConfig } from '../pv-status'
import { pvcStatusConfig } from '../pvc-status'

const infraCards = [
  { name: 'networkOverview', config: networkOverviewConfig },
  { name: 'networkPolicyStatus', config: networkPolicyStatusConfig },
  { name: 'networkUtils', config: networkUtilsConfig },
  { name: 'serviceStatus', config: serviceStatusConfig },
  { name: 'serviceTopology', config: serviceTopologyConfig },
  { name: 'serviceExports', config: serviceExportsConfig },
  { name: 'serviceImports', config: serviceImportsConfig },
  { name: 'ingressStatus', config: ingressStatusConfig },
  { name: 'gatewayStatus', config: gatewayStatusConfig },
  { name: 'storageOverview', config: storageOverviewConfig },
  { name: 'pvStatus', config: pvStatusConfig },
  { name: 'pvcStatus', config: pvcStatusConfig },
]

describe('Network, service, storage card configs', () => {
  it.each(infraCards)('$name has valid structure', ({ config }) => {
    expect(config.type).toBeTruthy()
    expect(config.title).toBeTruthy()
    expect(config.category).toBeTruthy()
    expect(config.content).toBeDefined()
    expect(config.dataSource).toBeDefined()
  })
})
