import { describe, it, expect } from 'vitest'
import {
  KUBESCAPE_FRAMEWORKS,
  getFrameworkInfo,
  getScoreContext,
  TRIVY_SEVERITY,
  TOOL_DESCRIPTIONS,
  CARD_DESCRIPTIONS,
} from '../compliance'

describe('constants/compliance', () => {
  describe('KUBESCAPE_FRAMEWORKS', () => {
    it('includes NSA framework (both cases)', () => {
      expect(KUBESCAPE_FRAMEWORKS['NSA']).toBeDefined()
      expect(KUBESCAPE_FRAMEWORKS['nsa']).toBeDefined()
    })

    it('includes MITRE framework', () => {
      expect(KUBESCAPE_FRAMEWORKS['MITRE']).toBeDefined()
    })

    it('includes CIS framework', () => {
      expect(KUBESCAPE_FRAMEWORKS['CIS']).toBeDefined()
    })

    it('every framework has required fields', () => {
      for (const [, info] of Object.entries(KUBESCAPE_FRAMEWORKS)) {
        expect(info.label).toBeTruthy()
        expect(info.description).toBeTruthy()
        expect(info.impact).toBeTruthy()
        expect(info.url).toMatch(/^https?:\/\//)
      }
    })
  })

  describe('getFrameworkInfo', () => {
    it('finds exact match for NSA', () => {
      const info = getFrameworkInfo('NSA')
      expect(info).not.toBeNull()
      expect(info!.label).toBe('NSA-CISA')
    })

    it('finds partial match for NSA-CISA', () => {
      const info = getFrameworkInfo('NSA-CISA')
      expect(info).not.toBeNull()
    })

    it('matches case-insensitively', () => {
      const info = getFrameworkInfo('mitre')
      expect(info).not.toBeNull()
      expect(info!.label).toBe('MITRE ATT&CK')
    })

    it('returns null for unknown framework', () => {
      expect(getFrameworkInfo('totally-unknown-framework')).toBeNull()
    })

    it('finds CIS by exact match', () => {
      const info = getFrameworkInfo('CIS')
      expect(info).not.toBeNull()
      expect(info!.label).toBe('CIS Benchmark')
    })

    it('finds ArmoBest framework', () => {
      const info = getFrameworkInfo('ArmoBest')
      expect(info).not.toBeNull()
      expect(info!.label).toBe('ARMO Best Practices')
    })
  })

  describe('getScoreContext', () => {
    it('returns Excellent for score >= 90', () => {
      const ctx = getScoreContext(95)
      expect(ctx.label).toBe('Excellent')
      expect(ctx.color).toContain('green')
    })

    it('returns Good for score >= 80', () => {
      const ctx = getScoreContext(85)
      expect(ctx.label).toBe('Good')
      expect(ctx.color).toContain('green')
    })

    it('returns Needs Attention for score >= 60', () => {
      const ctx = getScoreContext(65)
      expect(ctx.label).toBe('Needs Attention')
      expect(ctx.color).toContain('yellow')
    })

    it('returns Critical for score < 60', () => {
      const ctx = getScoreContext(45)
      expect(ctx.label).toBe('Critical')
      expect(ctx.color).toContain('red')
    })

    it('returns Excellent for perfect score of 100', () => {
      expect(getScoreContext(100).label).toBe('Excellent')
    })

    it('returns Critical for score of 0', () => {
      expect(getScoreContext(0).label).toBe('Critical')
    })

    it('score 90 is Excellent boundary', () => {
      expect(getScoreContext(90).label).toBe('Excellent')
    })

    it('score 80 is Good boundary', () => {
      expect(getScoreContext(80).label).toBe('Good')
    })

    it('score 60 is Needs Attention boundary', () => {
      expect(getScoreContext(60).label).toBe('Needs Attention')
    })

    it('score 59 is Critical', () => {
      expect(getScoreContext(59).label).toBe('Critical')
    })
  })

  describe('TRIVY_SEVERITY', () => {
    it('has all four severity levels', () => {
      expect(TRIVY_SEVERITY.critical).toBeDefined()
      expect(TRIVY_SEVERITY.high).toBeDefined()
      expect(TRIVY_SEVERITY.medium).toBeDefined()
      expect(TRIVY_SEVERITY.low).toBeDefined()
    })

    it('each severity has label, description, and action', () => {
      for (const [, info] of Object.entries(TRIVY_SEVERITY)) {
        expect(info.label).toBeTruthy()
        expect(info.description).toBeTruthy()
        expect(info.action).toBeTruthy()
      }
    })
  })

  describe('TOOL_DESCRIPTIONS', () => {
    it('includes kyverno, trivy, kubescape, gatekeeper, trestle', () => {
      expect(TOOL_DESCRIPTIONS.kyverno).toBeDefined()
      expect(TOOL_DESCRIPTIONS.trivy).toBeDefined()
      expect(TOOL_DESCRIPTIONS.kubescape).toBeDefined()
      expect(TOOL_DESCRIPTIONS.gatekeeper).toBeDefined()
      expect(TOOL_DESCRIPTIONS.trestle).toBeDefined()
    })

    it('each tool has name, tagline, measures, whyItMatters', () => {
      for (const [, tool] of Object.entries(TOOL_DESCRIPTIONS)) {
        expect(tool.name).toBeTruthy()
        expect(tool.tagline).toBeTruthy()
        expect(tool.measures).toBeTruthy()
        expect(tool.whyItMatters).toBeTruthy()
      }
    })
  })

  describe('CARD_DESCRIPTIONS', () => {
    it('includes fleet_compliance_heatmap', () => {
      expect(CARD_DESCRIPTIONS.fleet_compliance_heatmap).toBeDefined()
      expect(CARD_DESCRIPTIONS.fleet_compliance_heatmap.title).toBeTruthy()
    })

    it('includes compliance_score', () => {
      expect(CARD_DESCRIPTIONS.compliance_score).toBeDefined()
    })
  })
})
