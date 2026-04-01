/**
 * Resource, Namespace, Node, Pod Card Config Tests
 */
import { describe, it, expect } from 'vitest'
import { nodeStatusConfig } from '../node-status'
import { podIssuesConfig } from '../pod-issues'
import { podHealthTrendConfig } from '../pod-health-trend'
import { topPodsConfig } from '../top-pods'
import { namespaceOverviewConfig } from '../namespace-overview'
import { namespaceQuotasConfig } from '../namespace-quotas'
import { namespaceStatusConfig } from '../namespace-status'
import { namespaceEventsConfig } from '../namespace-events'
import { namespaceMonitorConfig } from '../namespace-monitor'
import { namespaceRbacConfig } from '../namespace-rbac'
import { configMapStatusConfig } from '../configmap-status'
import { crdHealthConfig } from '../crd-health'
import { limitRangeStatusConfig } from '../limit-range-status'
import { resourceCapacityConfig } from '../resource-capacity'
import { resourceQuotaStatusConfig } from '../resource-quota-status'
import { resourceTrendConfig } from '../resource-trend'
import { resourceUsageConfig } from '../resource-usage'
import { resourceImbalanceDetectorConfig } from '../resource-imbalance-detector'
import { computeOverviewConfig } from '../compute-overview'
import { hardwareHealthConfig } from '../hardware-health'
import { upgradeStatusConfig } from '../upgrade-status'

const resourceCards = [
  { name: 'nodeStatus', config: nodeStatusConfig },
  { name: 'podIssues', config: podIssuesConfig },
  { name: 'podHealthTrend', config: podHealthTrendConfig },
  { name: 'topPods', config: topPodsConfig },
  { name: 'namespaceOverview', config: namespaceOverviewConfig },
  { name: 'namespaceQuotas', config: namespaceQuotasConfig },
  { name: 'namespaceStatus', config: namespaceStatusConfig },
  { name: 'namespaceEvents', config: namespaceEventsConfig },
  { name: 'namespaceMonitor', config: namespaceMonitorConfig },
  { name: 'namespaceRbac', config: namespaceRbacConfig },
  { name: 'configMapStatus', config: configMapStatusConfig },
  { name: 'crdHealth', config: crdHealthConfig },
  { name: 'limitRangeStatus', config: limitRangeStatusConfig },
  { name: 'resourceCapacity', config: resourceCapacityConfig },
  { name: 'resourceQuotaStatus', config: resourceQuotaStatusConfig },
  { name: 'resourceTrend', config: resourceTrendConfig },
  { name: 'resourceUsage', config: resourceUsageConfig },
  { name: 'resourceImbalanceDetector', config: resourceImbalanceDetectorConfig },
  { name: 'computeOverview', config: computeOverviewConfig },
  { name: 'hardwareHealth', config: hardwareHealthConfig },
  { name: 'upgradeStatus', config: upgradeStatusConfig },
]

describe('Resource, namespace, node card configs', () => {
  it.each(resourceCards)('$name has valid structure', ({ config }) => {
    expect(config.type).toBeTruthy()
    expect(config.title).toBeTruthy()
    expect(config.category).toBeTruthy()
    expect(config.content).toBeDefined()
    expect(config.dataSource).toBeDefined()
  })
})
