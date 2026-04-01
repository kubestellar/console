/**
 * Individual Dashboard Config Import Tests
 *
 * Validates each dashboard config file exports correctly
 * and has required fields.
 */
import { describe, it, expect } from 'vitest'
import { mainDashboardConfig } from '../main'
import { computeDashboardConfig } from '../compute'
import { securityDashboardConfig } from '../security'
import { gitopsDashboardConfig } from '../gitops'
import { storageDashboardConfig } from '../storage'
import { networkDashboardConfig } from '../network'
import { eventsDashboardConfig } from '../events'
import { workloadsDashboardConfig } from '../workloads'
import { operatorsDashboardConfig } from '../operators'
import { clustersDashboardConfig } from '../clusters'
import { complianceDashboardConfig } from '../compliance'
import { costDashboardConfig } from '../cost'
import { gpuDashboardConfig } from '../gpu'
import { nodesDashboardConfig } from '../nodes'
import { deploymentsDashboardConfig } from '../deployments'
import { podsDashboardConfig } from '../pods'
import { servicesDashboardConfig } from '../services'
import { helmDashboardConfig } from '../helm'
import { alertsDashboardConfig } from '../alerts'
import { aiMlDashboardConfig } from '../ai-ml'
import { ciCdDashboardConfig } from '../ci-cd'
import { karmadaOpsDashboardConfig } from '../karmada-ops'
import { logsDashboardConfig } from '../logs'
import { dataComplianceDashboardConfig } from '../data-compliance'
import { arcadeDashboardConfig } from '../arcade'
import { deployDashboardConfig } from '../deploy'
import { aiAgentsDashboardConfig } from '../ai-agents'
import { llmdBenchmarksDashboardConfig } from '../llmd-benchmarks'
import { clusterAdminDashboardConfig } from '../cluster-admin'
import { insightsDashboardConfig } from '../insights'
import { multiTenancyDashboardConfig } from '../multi-tenancy'

const allConfigs = [
  { name: 'main', config: mainDashboardConfig },
  { name: 'compute', config: computeDashboardConfig },
  { name: 'security', config: securityDashboardConfig },
  { name: 'gitops', config: gitopsDashboardConfig },
  { name: 'storage', config: storageDashboardConfig },
  { name: 'network', config: networkDashboardConfig },
  { name: 'events', config: eventsDashboardConfig },
  { name: 'workloads', config: workloadsDashboardConfig },
  { name: 'operators', config: operatorsDashboardConfig },
  { name: 'clusters', config: clustersDashboardConfig },
  { name: 'compliance', config: complianceDashboardConfig },
  { name: 'cost', config: costDashboardConfig },
  { name: 'gpu', config: gpuDashboardConfig },
  { name: 'nodes', config: nodesDashboardConfig },
  { name: 'deployments', config: deploymentsDashboardConfig },
  { name: 'pods', config: podsDashboardConfig },
  { name: 'services', config: servicesDashboardConfig },
  { name: 'helm', config: helmDashboardConfig },
  { name: 'alerts', config: alertsDashboardConfig },
  { name: 'ai-ml', config: aiMlDashboardConfig },
  { name: 'ci-cd', config: ciCdDashboardConfig },
  { name: 'karmada-ops', config: karmadaOpsDashboardConfig },
  { name: 'logs', config: logsDashboardConfig },
  { name: 'data-compliance', config: dataComplianceDashboardConfig },
  { name: 'arcade', config: arcadeDashboardConfig },
  { name: 'deploy', config: deployDashboardConfig },
  { name: 'ai-agents', config: aiAgentsDashboardConfig },
  { name: 'llm-d-benchmarks', config: llmdBenchmarksDashboardConfig },
  { name: 'cluster-admin', config: clusterAdminDashboardConfig },
  { name: 'insights', config: insightsDashboardConfig },
  { name: 'multi-tenancy', config: multiTenancyDashboardConfig },
]

describe('Individual dashboard configs', () => {
  it.each(allConfigs)('$name has cards array or tabs', ({ config }) => {
    expect(Array.isArray(config.cards)).toBe(true)
    // Dashboards with tabs may have empty top-level cards
    const hasTabs = !!(config as Record<string, unknown>).tabs
    if (!hasTabs) {
      expect(config.cards.length).toBeGreaterThan(0)
    }
  })

  it.each(allConfigs)('$name has valid id', ({ config }) => {
    expect(config.id).toBeTruthy()
    expect(typeof config.id).toBe('string')
  })

  it.each(allConfigs)('$name has valid name', ({ config }) => {
    expect(config.name).toBeTruthy()
    expect(typeof config.name).toBe('string')
  })

  it.each(allConfigs)('$name has valid route starting with /', ({ config }) => {
    expect(config.route).toBeTruthy()
    expect(config.route.startsWith('/')).toBe(true)
  })

  it.each(allConfigs)('$name has availableCardTypes array', ({ config }) => {
    if (config.availableCardTypes) {
      expect(Array.isArray(config.availableCardTypes)).toBe(true)
      expect(config.availableCardTypes.length).toBeGreaterThan(0)
      config.availableCardTypes.forEach(t => {
        expect(typeof t).toBe('string')
        expect(t.length).toBeGreaterThan(0)
      })
    }
  })

  it.each(allConfigs)('$name stats have valid blocks when present', ({ config }) => {
    if (config.stats?.blocks) {
      expect(Array.isArray(config.stats.blocks)).toBe(true)
      config.stats.blocks.forEach(block => {
        expect(block.id).toBeTruthy()
        expect(block.name).toBeTruthy()
      })
    }
  })
})
