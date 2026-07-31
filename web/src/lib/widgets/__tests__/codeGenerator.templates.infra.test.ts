/**
 * Unit tests for generateInfraCardRender from codeGenerator.templates.infra.ts.
 *
 * The infra template dispatcher returns a rendered JSX-in-a-string program
 * per supported infrastructure card type, or null for unknown types. These
 * tests exercise every case branch (9 card types + default) and validate the
 * distinctive markers of each generated render function.
 */
import { describe, it, expect } from 'vitest'
import { generateInfraCardRender } from '../codeGenerator.templates.infra'
import type { TemplateHelpers } from '../codeGenerator.templates'

const helpers: TemplateHelpers = {
  parseBlock: '/*PARSE_BLOCK*/',
  wrapOpen: '/*WRAP_OPEN*/',
  wrapClose: '/*WRAP_CLOSE*/',
  issueButton: '/*ISSUE_BUTTON*/',
  title: 'ignored-title',
}

const INFRA_CARD_TYPES = [
  'storage_overview',
  'pvc_status',
  'network_overview',
  'service_status',
  'operator_status',
  'opencost_overview',
  'active_alerts',
  'helm_releases',
  'provider_health',
] as const

describe('generateInfraCardRender', () => {
  describe('shared render-function structure (every supported case)', () => {
    it.each(INFRA_CARD_TYPES)('returns a non-null string for "%s"', (cardType) => {
      const code = generateInfraCardRender(cardType, helpers)
      expect(code).not.toBeNull()
      expect(typeof code).toBe('string')
      expect((code as string).length).toBeGreaterThan(0)
    })

    it.each(INFRA_CARD_TYPES)('emits a top-level render export for "%s"', (cardType) => {
      const code = generateInfraCardRender(cardType, helpers) as string
      expect(code).toContain('export const render = ({ output }) =>')
    })

    it.each(INFRA_CARD_TYPES)('injects parseBlock, wrap open/close and issueButton helpers for "%s"', (cardType) => {
      const code = generateInfraCardRender(cardType, helpers) as string
      expect(code).toContain(helpers.parseBlock)
      // Every branch has BOTH an error path (wrapOpen + issueButton + wrapClose)
      // AND a happy path (wrapOpen + wrapClose), so wrapOpen/wrapClose appear twice.
      expect(code.split(helpers.wrapOpen).length - 1).toBeGreaterThanOrEqual(2)
      expect(code.split(helpers.wrapClose).length - 1).toBeGreaterThanOrEqual(2)
      expect(code).toContain(helpers.issueButton)
    })

    it.each(INFRA_CARD_TYPES)('renders the standard error branch with Error prefix for "%s"', (cardType) => {
      const code = generateInfraCardRender(cardType, helpers) as string
      expect(code).toContain('if (error) {')
      expect(code).toContain('Error: {error}')
      expect(code).toContain('styles.colors.error')
    })
  })

  describe('storage_overview case', () => {
    const code = generateInfraCardRender('storage_overview', helpers) as string
    it('shows storage title and Bound/Pending buckets', () => {
      expect(code).toContain('Storage Overview')
      expect(code).toContain('Bound')
      expect(code).toContain('Pending')
    })
    it('derives bound count from PVC status field', () => {
      expect(code).toContain("data?.pvcs")
      expect(code).toContain("p.status === 'Bound'")
    })
    it('reports the total PVC count in the footer', () => {
      expect(code).toContain('{pvcs.length} PVCs')
    })
  })

  describe('pvc_status case', () => {
    const code = generateInfraCardRender('pvc_status', helpers) as string
    it('shows PVC status title and per-PVC rows', () => {
      expect(code).toContain('PVC Status')
      expect(code).toContain('data?.pvcs')
    })
    it('caps the visible PVC list to six items', () => {
      expect(code).toContain('.slice(0, 6)')
    })
    it('renders an empty-state fallback when no PVCs are present', () => {
      expect(code).toContain('No PVCs found')
    })
  })

  describe('network_overview case', () => {
    const code = generateInfraCardRender('network_overview', helpers) as string
    it('shows network overview title and policy count', () => {
      expect(code).toContain('Network Overview')
      expect(code).toContain('Network Policies')
      expect(code).toContain('data?.networkpolicies')
    })
    it('renders up to four policy names with their cluster', () => {
      expect(code).toContain('policies.slice(0, 4)')
      expect(code).toContain('({p.cluster})')
    })
  })

  describe('service_status case', () => {
    const code = generateInfraCardRender('service_status', helpers) as string
    it('shows service title, total count and per-cluster breakdown', () => {
      expect(code).toContain('Service Status')
      expect(code).toContain('data?.services')
      expect(code).toContain('data?.clusterCounts')
      expect(code).toContain('clusterCounts.slice(0, 4)')
    })
  })

  describe('operator_status case', () => {
    const code = generateInfraCardRender('operator_status', helpers) as string
    it('renders operator rows with displayName fallback to name', () => {
      expect(code).toContain('Operator Status')
      expect(code).toContain('data?.operators')
      expect(code).toContain('op.displayName || op.name')
      expect(code).toContain('operators.slice(0, 6)')
    })
    it('shows empty state and total count footer', () => {
      expect(code).toContain('No operators found')
      expect(code).toContain('{operators.length} operators')
    })
  })

  describe('opencost_overview case', () => {
    const code = generateInfraCardRender('opencost_overview', helpers) as string
    it('accepts costs field with fallback to root data object', () => {
      expect(code).toContain('OpenCost Overview')
      expect(code).toContain('data?.costs || data || {}')
    })
    it('serializes the cost payload as pretty JSON in a <pre>', () => {
      expect(code).toContain('JSON.stringify(costs, null, 2)')
      expect(code).toContain('<pre')
    })
  })

  describe('active_alerts case', () => {
    const code = generateInfraCardRender('active_alerts', helpers) as string
    it('accepts alerts under either events or alerts key', () => {
      expect(code).toContain('Active Alerts')
      expect(code).toContain('data?.events || data?.alerts || []')
    })
    it('colors the header dot warning when alerts exist, healthy otherwise', () => {
      expect(code).toContain('alerts.length > 0 ? styles.colors.warning : styles.colors.healthy')
    })
    it('shows up to four alert rows and an empty state', () => {
      expect(code).toContain('alerts.slice(0, 4)')
      expect(code).toContain('No active alerts')
    })
  })

  describe('helm_releases case', () => {
    const code = generateInfraCardRender('helm_releases', helpers) as string
    it('counts deployed releases using status field', () => {
      expect(code).toContain('Helm Releases')
      expect(code).toContain("r.status === 'deployed'")
    })
    it('lists up to six releases and shows deployed/total footer', () => {
      expect(code).toContain('releases.slice(0, 6)')
      expect(code).toContain('{deployed}/{releases.length} deployed')
    })
    it('shows empty-state text when no releases are present', () => {
      expect(code).toContain('No releases found')
    })
  })

  describe('provider_health case', () => {
    const code = generateInfraCardRender('provider_health', helpers) as string
    it('maps healthy flag to Healthy/Unhealthy label and color', () => {
      expect(code).toContain('Provider Health')
      expect(code).toContain('data?.providers')
      expect(code).toContain("p.healthy ? 'Healthy' : 'Unhealthy'")
      expect(code).toContain('p.healthy ? styles.colors.healthy : styles.colors.error')
    })
    it('shows a fallback message when no provider data is present', () => {
      expect(code).toContain('No provider data')
    })
  })

  describe('default case (unknown card types)', () => {
    it.each([
      'unknown_card',
      'cluster_health', // owned by cluster template dispatcher, not infra
      '',
      'random-string',
    ])('returns null for unsupported card type "%s"', (cardType) => {
      expect(generateInfraCardRender(cardType, helpers)).toBeNull()
    })
  })

  describe('helper substitution is verbatim (no accidental transformation)', () => {
    it('leaves helper sentinels intact so downstream concatenation is deterministic', () => {
      const custom: TemplateHelpers = {
        parseBlock: '<<PARSE>>',
        wrapOpen: '<<OPEN>>',
        wrapClose: '<<CLOSE>>',
        issueButton: '<<ISSUE>>',
        title: 'unused',
      }
      const code = generateInfraCardRender('helm_releases', custom) as string
      expect(code).toContain('<<PARSE>>')
      expect(code).toContain('<<OPEN>>')
      expect(code).toContain('<<CLOSE>>')
      expect(code).toContain('<<ISSUE>>')
    })
  })
})
