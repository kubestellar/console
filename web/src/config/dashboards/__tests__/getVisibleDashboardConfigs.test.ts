/**
 * Tests for getVisibleDashboardConfigs — the project-visibility filter used by
 * white-label deployments to hide dashboards tagged for other projects.
 *
 * getDashboardConfig / hasUnifiedDashboardConfig / getUnifiedDashboardIds /
 * getDefaultCards / getDefaultCardsForDashboard are already covered by
 * dashboard-configs.test.ts. getVisibleDashboardConfigs had no direct unit
 * coverage prior to this file.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  DASHBOARD_CONFIGS,
  getVisibleDashboardConfigs,
  getUnifiedDashboardIds,
} from '../index'
import { setActiveProject } from '../../../lib/project/context'

const DEFAULT_PROJECT = 'kubestellar'

describe('getVisibleDashboardConfigs', () => {
  beforeEach(() => {
    setActiveProject(DEFAULT_PROJECT)
  })

  afterEach(() => {
    setActiveProject(DEFAULT_PROJECT)
  })

  it('returns an object (registry shape)', () => {
    const result = getVisibleDashboardConfigs()
    expect(result).toBeDefined()
    expect(typeof result).toBe('object')
    expect(Array.isArray(result)).toBe(false)
  })

  it('returns at least one dashboard for the default project', () => {
    const result = getVisibleDashboardConfigs()
    expect(Object.keys(result).length).toBeGreaterThan(0)
  })

  it('includes dashboards without a projects field (universal)', () => {
    const result = getVisibleDashboardConfigs()
    // 'main' has no projects field so it must always be visible
    expect(result.main).toBeDefined()
    expect(result.main).toBe(DASHBOARD_CONFIGS.main)
  })

  it('includes dashboards tagged for the active project', () => {
    setActiveProject('kubestellar')
    const result = getVisibleDashboardConfigs()
    // llm-d-benchmarks is tagged projects: ['kubestellar']
    expect(result['llm-d-benchmarks']).toBeDefined()
    expect(result['llm-d-benchmarks']).toBe(DASHBOARD_CONFIGS['llm-d-benchmarks'])
  })

  it('excludes dashboards not tagged for the active project', () => {
    setActiveProject('some-other-project')
    const result = getVisibleDashboardConfigs()
    // llm-d-benchmarks is tagged only for 'kubestellar'
    expect(result['llm-d-benchmarks']).toBeUndefined()
    // deploy is tagged only for 'kubestellar'
    expect(result.deploy).toBeUndefined()
  })

  it('still includes universal dashboards when active project is unknown', () => {
    setActiveProject('some-other-project')
    const result = getVisibleDashboardConfigs()
    // 'main' has no projects field — should always be visible
    expect(result.main).toBeDefined()
    // 'security' has no projects field — should always be visible
    expect(result.security).toBeDefined()
  })

  it('includes dashboards tagged for multiple projects when active project matches any', () => {
    setActiveProject('kagent')
    const result = getVisibleDashboardConfigs()
    // ai-agents is tagged projects: ['kubestellar', 'kagent', 'kagenti']
    expect(result['ai-agents']).toBeDefined()
    expect(result['ai-agents']).toBe(DASHBOARD_CONFIGS['ai-agents'])
  })

  it('excludes multi-project dashboards when active project matches none', () => {
    setActiveProject('unrelated-project')
    const result = getVisibleDashboardConfigs()
    // ai-agents is tagged for kubestellar/kagent/kagenti — not unrelated-project
    expect(result['ai-agents']).toBeUndefined()
  })

  it('returns fewer or equal entries than the full registry', () => {
    setActiveProject('some-other-project')
    const visible = getVisibleDashboardConfigs()
    const all = getUnifiedDashboardIds()
    expect(Object.keys(visible).length).toBeLessThanOrEqual(all.length)
  })

  it('returns registry entries by reference (does not clone)', () => {
    const result = getVisibleDashboardConfigs()
    for (const key of Object.keys(result)) {
      expect(result[key]).toBe(DASHBOARD_CONFIGS[key])
    }
  })

  it('reflects project changes between calls', () => {
    setActiveProject('kubestellar')
    const withKS = getVisibleDashboardConfigs()
    expect(withKS['llm-d-benchmarks']).toBeDefined()

    setActiveProject('someone-else')
    const withOther = getVisibleDashboardConfigs()
    expect(withOther['llm-d-benchmarks']).toBeUndefined()

    // 'main' remains visible in both
    expect(withKS.main).toBeDefined()
    expect(withOther.main).toBeDefined()
  })

  it('every returned config has a defined id field matching the registry', () => {
    const result = getVisibleDashboardConfigs()
    for (const [key, config] of Object.entries(result)) {
      expect(config).toBeDefined()
      // Sanity: the visible config should equal the registry lookup
      expect(config).toStrictEqual(DASHBOARD_CONFIGS[key])
    }
  })
})
