import { describe, expect, it } from 'vitest'

import { formatCardTitle } from './formatCardTitle'

describe('formatCardTitle', () => {
  describe('defensive input handling', () => {
    it('returns "Unknown Card" for null', () => {
      expect(formatCardTitle(null)).toBe('Unknown Card')
    })

    it('returns "Unknown Card" for undefined', () => {
      expect(formatCardTitle(undefined)).toBe('Unknown Card')
    })

    it('returns "Unknown Card" for non-string input (regression for #5902)', () => {
      // The runtime `typeof` guard exists to survive corrupt/legacy dashboard
      // layouts where card_type may be a number or object. Cast through unknown
      // to bypass the TS type — we're intentionally testing the runtime guard.
      expect(formatCardTitle(42 as unknown as string)).toBe('Unknown Card')
      expect(formatCardTitle({} as unknown as string)).toBe('Unknown Card')
    })

    it('preserves the historical empty-string behavior', () => {
      expect(formatCardTitle('')).toBe('')
    })
  })

  describe('custom title overrides', () => {
    it.each([
      ['app_status', 'Workload Status'],
      ['chart_versions', 'Helm Chart Versions'],
      ['deployment_missions', 'Deployment Missions'],
      ['helm_release_status', 'Helm Release Status'],
      ['helm_history', 'Helm History'],
      ['helm_values_diff', 'Helm Values Diff'],
      ['resource_marshall', 'Resource Marshall'],
      ['llmd_flow', 'llm-d Request Flow'],
      ['llmd_stack_monitor', 'llm-d Stack Monitor'],
      ['llmd_ai_insights', 'llm-d AI Insights'],
      ['llmd_configurator', 'llm-d Configurator'],
      ['llm_inference', 'llm-d Inference'],
      ['llm_models', 'llm-d Models'],
      ['kvcache_monitor', 'KV Cache Monitor'],
      ['epp_routing', 'EPP Routing'],
      ['pd_disaggregation', 'P/D Disaggregation'],
    ])('maps %s to %s', (input, expected) => {
      expect(formatCardTitle(input)).toBe(expected)
    })
  })

  describe('acronym handling', () => {
    it('uppercases known acronyms embedded in the card type', () => {
      expect(formatCardTitle('opa_policies')).toBe('OPA Policies')
    })

    it('uppercases GPU', () => {
      expect(formatCardTitle('gpu_usage')).toBe('GPU Usage')
    })

    it('uppercases API', () => {
      expect(formatCardTitle('api_health')).toBe('API Health')
    })

    it('uppercases multi-word acronym combinations', () => {
      expect(formatCardTitle('cpu_ram_stats')).toBe('CPU RAM Stats')
    })

    it('uses the ArgoCD special-case rather than raw uppercase', () => {
      expect(formatCardTitle('argocd_applications')).toBe('ArgoCD Applications')
    })
  })

  describe('generic Title Case', () => {
    it('capitalizes the first letter of each word', () => {
      expect(formatCardTitle('cluster_health_overview')).toBe('Cluster Health Overview')
    })

    it('handles a single word', () => {
      expect(formatCardTitle('overview')).toBe('Overview')
    })

    it('lowercases interior letters when the input is uppercase', () => {
      expect(formatCardTitle('CLUSTER_HEALTH')).toBe('Cluster Health')
    })

    it('lowercases interior letters when the input is mixed case', () => {
      expect(formatCardTitle('ClUsTeR_hEaLtH')).toBe('Cluster Health')
    })

    it('leaves an already-Title-Cased single word alone', () => {
      expect(formatCardTitle('Overview')).toBe('Overview')
    })
  })

  describe('custom overrides win over acronym handling', () => {
    // llm_inference contains 'llm' but the override should win over generic case.
    it('uses the override for llm_inference (not "LLM Inference")', () => {
      expect(formatCardTitle('llm_inference')).toBe('llm-d Inference')
    })
  })
})
