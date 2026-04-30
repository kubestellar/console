/**
 * Tests for cardCatalog shared data module.
 *
 * Covers:
 * - wrapAbbreviations: wraps known abbreviations (GPU, CPU, RBAC, etc.)
 * - CARD_CATALOG: structure and content validation
 * - CardSuggestion and HoveredCard type shapes
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../../shared/TechnicalAcronym', () => ({
  TechnicalAcronym: ({ children }: { children: string }) => children,
}))

import { wrapAbbreviations, CARD_CATALOG, generateCardSuggestions } from '../cardCatalog'

describe('wrapAbbreviations', () => {
  it('returns content for plain text with no abbreviations', () => {
    const result = wrapAbbreviations('Hello world this is a test')
    // wrapAbbreviations may return a string or an array with a single string element
    if (Array.isArray(result)) {
      expect(result.length).toBeGreaterThan(0)
    } else {
      expect(result).toBe('Hello world this is a test')
    }
  })

  it('wraps GPU abbreviation', () => {
    const result = wrapAbbreviations('Check GPU usage')
    // Result should be an array of React nodes, not a plain string
    expect(Array.isArray(result)).toBe(true)
    expect(result).toHaveLength(3) // "Check ", TechnicalAcronym, " usage"
  })

  it('wraps CPU abbreviation', () => {
    const result = wrapAbbreviations('CPU utilization metrics')
    expect(Array.isArray(result)).toBe(true)
  })

  it('wraps RBAC abbreviation', () => {
    const result = wrapAbbreviations('RBAC configuration')
    expect(Array.isArray(result)).toBe(true)
  })

  it('wraps multiple abbreviations in one string', () => {
    const result = wrapAbbreviations('Check GPU and CPU usage with RBAC')
    expect(Array.isArray(result)).toBe(true)
    // Should have text and component nodes for each abbreviation
    const length = (result as unknown[]).length
    expect(length).toBeGreaterThanOrEqual(5) // text + 3 acronyms + text segments
  })

  it('wraps CRD abbreviation', () => {
    const result = wrapAbbreviations('CRD health status')
    expect(Array.isArray(result)).toBe(true)
  })

  it('wraps PVC abbreviation', () => {
    const result = wrapAbbreviations('PVC storage status')
    expect(Array.isArray(result)).toBe(true)
  })

  it('wraps ConfigMap and ConfigMaps', () => {
    const result = wrapAbbreviations('ConfigMaps and ConfigMap data')
    expect(Array.isArray(result)).toBe(true)
  })

  it('returns text as-is for empty string', () => {
    const result = wrapAbbreviations('')
    expect(result).toBe('')
  })
})

describe('CARD_CATALOG', () => {
  it('has more than 10 categories', () => {
    expect(Object.keys(CARD_CATALOG).length).toBeGreaterThan(10)
  })

  it('each category has at least one card', () => {
    for (const [, cards] of Object.entries(CARD_CATALOG)) {
      expect((cards as unknown[]).length).toBeGreaterThan(0)
    }
  })

  it('each card has required fields', () => {
    for (const [, cards] of Object.entries(CARD_CATALOG)) {
      for (const card of cards as Array<{ type: string; title: string; description: string; visualization: string }>) {
        expect(typeof card.type).toBe('string')
        expect(card.type.length).toBeGreaterThan(0)
        expect(typeof card.title).toBe('string')
        expect(card.title.length).toBeGreaterThan(0)
        expect(typeof card.description).toBe('string')
        expect(typeof card.visualization).toBe('string')
      }
    }
  })

  it('has a large number of total cards', () => {
    let totalCards = 0
    for (const [, cards] of Object.entries(CARD_CATALOG)) {
      totalCards += (cards as unknown[]).length
    }
    // Should have a significant number of cards across all categories
    expect(totalCards).toBeGreaterThan(100)
  })

  it('has Cluster Admin category', () => {
    expect(CARD_CATALOG).toHaveProperty('Cluster Admin')
  })

  it('Cluster Admin has control_plane_health card', () => {
    const clusterAdmin = (CARD_CATALOG as Record<string, Array<{ type: string }>>)['Cluster Admin']
    const controlPlane = clusterAdmin.find(c => c.type === 'control_plane_health')
    expect(controlPlane).toBeDefined()
  })
})

// ── generateCardSuggestions ──
// Each branch in the function is covered by one representative keyword test.

describe('generateCardSuggestions', () => {
  it('matches provider keywords → returns provider_health as first suggestion', () => {
    const result = generateCardSuggestions('provider health')
    expect(result[0].type).toBe('provider_health')
  })

  it('matches hardware keywords → returns hardware_health as first suggestion', () => {
    const result = generateCardSuggestions('supermicro hardware')
    expect(result[0].type).toBe('hardware_health')
  })

  it('matches gpu keyword → returns gpu_overview with metric config', () => {
    const result = generateCardSuggestions('gpu utilization')
    expect(result[0].type).toBe('gpu_overview')
    expect(result[0].config).toMatchObject({ metric: 'gpu_utilization' })
  })

  it('matches memory/ram keywords → returns memory_usage', () => {
    const result = generateCardSuggestions('ram usage')
    expect(result[0].type).toBe('memory_usage')
  })

  it('matches cpu keywords → returns cpu_usage', () => {
    const result = generateCardSuggestions('cpu load')
    expect(result[0].type).toBe('cpu_usage')
  })

  it('matches processor keyword → returns cpu_usage', () => {
    const result = generateCardSuggestions('processor utilization')
    expect(result[0].type).toBe('cpu_usage')
  })

  it('matches pod keyword → returns pod_status', () => {
    const result = generateCardSuggestions('pod health')
    expect(result[0].type).toBe('pod_status')
  })

  it('matches cluster keyword → returns cluster_health', () => {
    const result = generateCardSuggestions('cluster overview')
    expect(result[0].type).toBe('cluster_health')
  })

  it('matches namespace keyword → returns namespace_overview', () => {
    const result = generateCardSuggestions('namespace list')
    expect(result[0].type).toBe('namespace_overview')
  })

  it('matches quota keyword → returns namespace_overview', () => {
    const result = generateCardSuggestions('resource quota')
    expect(result[0].type).toBe('namespace_overview')
  })

  it('matches operator keyword → returns operator_status', () => {
    const result = generateCardSuggestions('operator status')
    expect(result[0].type).toBe('operator_status')
  })

  it('matches olm keyword → returns operator_status', () => {
    const result = generateCardSuggestions('olm subscriptions')
    expect(result[0].type).toBe('operator_status')
  })

  it('matches helm keyword → returns helm_release_status', () => {
    const result = generateCardSuggestions('helm status')
    expect(result[0].type).toBe('helm_release_status')
  })

  it('matches release keyword → returns helm_release_status', () => {
    const result = generateCardSuggestions('release management')
    expect(result[0].type).toBe('helm_release_status')
  })

  it('matches harbor/registry keyword → returns harbor_status', () => {
    const result = generateCardSuggestions('harbor registry')
    expect(result[0].type).toBe('harbor_status')
  })

  it('matches vulnerability keyword → returns harbor_status', () => {
    const result = generateCardSuggestions('vulnerability scan')
    expect(result[0].type).toBe('harbor_status')
  })

  it('matches kustomize keyword - returns kustomization_status', () => {
    const result = generateCardSuggestions('kustomize overlay')
    expect(result[0].type).toBe('kustomization_status')
  })

  it('matches flux keyword → returns kustomization_status', () => {
    const result = generateCardSuggestions('flux gitops')
    expect(result[0].type).toBe('kustomization_status')
  })

  it('matches cost keyword → returns cluster_costs', () => {
    const result = generateCardSuggestions('cost estimation')
    expect(result[0].type).toBe('cluster_costs')
  })

  it('matches price keyword → returns cluster_costs', () => {
    const result = generateCardSuggestions('price analysis')
    expect(result[0].type).toBe('cluster_costs')
  })

  it('matches policy keyword → returns opa_policies', () => {
    const result = generateCardSuggestions('policy enforcement')
    expect(result[0].type).toBe('opa_policies')
  })

  it('matches kyverno keyword → returns opa_policies', () => {
    const result = generateCardSuggestions('kyverno rules')
    expect(result[0].type).toBe('opa_policies')
  })

  it('matches keycloak keyword → returns keycloak_status', () => {
    const result = generateCardSuggestions('keycloak realm')
    expect(result[0].type).toBe('keycloak_status')
  })

  it('matches sso keyword - returns keycloak_status', () => {
    const result = generateCardSuggestions('sso login')
    expect(result[0].type).toBe('keycloak_status')
  })

  it('matches oidc keyword - returns keycloak_status', () => {
    const result = generateCardSuggestions('oidc token')
    expect(result[0].type).toBe('keycloak_status')
  })

  it('matches knative keyword → returns knative_status', () => {
    const result = generateCardSuggestions('knative serving')
    expect(result[0].type).toBe('knative_status')
  })

  it('matches serverless keyword → returns knative_status', () => {
    const result = generateCardSuggestions('serverless functions')
    expect(result[0].type).toBe('knative_status')
  })

  it('matches kserve keyword → returns kserve_status', () => {
    const result = generateCardSuggestions('kserve model')
    expect(result[0].type).toBe('kserve_status')
  })

  it('matches inference keyword → returns kserve_status', () => {
    const result = generateCardSuggestions('inference endpoint')
    expect(result[0].type).toBe('kserve_status')
  })

  it('matches fluid/dataset keyword → returns fluid_status', () => {
    const result = generateCardSuggestions('fluid dataset')
    expect(result[0].type).toBe('fluid_status')
  })

  it('matches alluxio keyword → returns fluid_status', () => {
    const result = generateCardSuggestions('alluxio cache')
    expect(result[0].type).toBe('fluid_status')
  })

  it('matches cubefs keyword → returns cubefs_status', () => {
    const result = generateCardSuggestions('cubefs volume')
    expect(result[0].type).toBe('cubefs_status')
  })

  it('matches cube fs keyword → returns cubefs_status', () => {
    const result = generateCardSuggestions('cube fs health')
    expect(result[0].type).toBe('cubefs_status')
  })

  it('matches user keyword → returns user_management', () => {
    const result = generateCardSuggestions('user roles')
    expect(result[0].type).toBe('user_management')
  })

  it('matches access/permission keyword → returns user_management', () => {
    const result = generateCardSuggestions('permission access')
    expect(result[0].type).toBe('user_management')
  })

  it('matches log keyword - returns pod_logs', () => {
    const result = generateCardSuggestions('application log stream')
    expect(result[0].type).toBe('pod_logs')
  })

  it('matches error keyword (no cluster) → returns pod_logs', () => {
    const result = generateCardSuggestions('error monitoring')
    expect(result[0].type).toBe('pod_logs')
  })

  it('matches trend keyword → returns events_timeline as first suggestion', () => {
    const result = generateCardSuggestions('trend analysis')
    expect(result[0].type).toBe('events_timeline')
  })

  it('matches analytics keyword → returns events_timeline', () => {
    const result = generateCardSuggestions('analytics dashboard')
    expect(result[0].type).toBe('events_timeline')
  })

  it('matches history keyword → returns events_timeline', () => {
    const result = generateCardSuggestions('deployment history')
    expect(result[0].type).toBe('events_timeline')
  })

  it('matches jaeger keyword → returns jaeger_status', () => {
    const result = generateCardSuggestions('jaeger tracing')
    expect(result[0].type).toBe('jaeger_status')
  })

  it('matches span keyword → returns jaeger_status', () => {
    const result = generateCardSuggestions('span analysis')
    expect(result[0].type).toBe('jaeger_status')
  })

  it('matches latency keyword → returns jaeger_status', () => {
    const result = generateCardSuggestions('latency profiling')
    expect(result[0].type).toBe('jaeger_status')
  })

  it('returns custom_query for unrecognised query', () => {
    const result = generateCardSuggestions('xyzzy unknown query abc')
    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('custom_query')
    expect(result[0].config).toMatchObject({ query: 'xyzzy unknown query abc' })
  })

  it('is case-insensitive', () => {
    const upper = generateCardSuggestions('GPU OVERVIEW')
    const lower = generateCardSuggestions('gpu overview')
    expect(upper[0].type).toBe(lower[0].type)
  })

  it('returns an array of CardSuggestion objects with required fields', () => {
    const result = generateCardSuggestions('memory')
    for (const suggestion of result) {
      expect(suggestion).toHaveProperty('type')
      expect(suggestion).toHaveProperty('title')
      expect(suggestion).toHaveProperty('description')
      expect(suggestion).toHaveProperty('visualization')
      expect(suggestion).toHaveProperty('config')
    }
  })
})
