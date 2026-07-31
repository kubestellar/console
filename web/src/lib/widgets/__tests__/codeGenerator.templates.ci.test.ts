/**
 * Unit tests for generateCICardRender from codeGenerator.templates.ci.ts.
 *
 * Covers each `case` branch (returning a render code string) plus the
 * fall-through `default` (returning null). Assertions target the label
 * text unique to each card so we detect accidental cross-branch swaps.
 */
import { describe, it, expect } from 'vitest'
import { generateCICardRender } from '../codeGenerator.templates.ci'
import type { TemplateHelpers } from '../codeGenerator.templates'

const helpers: TemplateHelpers = {
  parseBlock: '/*PARSE_BLOCK*/',
  wrapOpen: '/*WRAP_OPEN*/',
  wrapClose: '/*WRAP_CLOSE*/',
  issueButton: '/*ISSUE_BUTTON*/',
  title: 'Test Title',
}

const CI_CARD_TYPES = [
  'nightly_e2e_status',
  'nightly_release_pulse',
  'workflow_matrix',
  'pipeline_flow',
  'recent_failures',
  'issue_activity_chart',
  'github_ci_monitor',
  'github_activity',
] as const

describe('generateCICardRender', () => {
  describe('unknown card types', () => {
    it('returns null for a non-CI card type', () => {
      expect(generateCICardRender('cluster_health', helpers)).toBeNull()
    })

    it('returns null for an empty string', () => {
      expect(generateCICardRender('', helpers)).toBeNull()
    })

    it('returns null for a random unknown key', () => {
      expect(generateCICardRender('not_a_real_card', helpers)).toBeNull()
    })
  })

  describe('known CI card types produce a render function body', () => {
    it.each(CI_CARD_TYPES)('generates code for card type "%s"', (cardType) => {
      const code = generateCICardRender(cardType, helpers)
      expect(code).not.toBeNull()
      expect(typeof code).toBe('string')
      // Exports a render function
      expect(code!).toContain('export const render = ({ output })')
      // Uses provided helper snippets so consumers can splice their own wrappers.
      expect(code!).toContain(helpers.parseBlock)
      expect(code!).toContain(helpers.wrapOpen)
      expect(code!).toContain(helpers.wrapClose)
      // Every card renders an error branch that mounts the issue button.
      expect(code!).toContain('if (error)')
      expect(code!).toContain(helpers.issueButton)
    })
  })

  describe('nightly_e2e_status', () => {
    const code = generateCICardRender('nightly_e2e_status', helpers)!

    it('renders pass rate + guides + failing tiles', () => {
      expect(code).toContain('Pass Rate')
      expect(code).toContain('Guides')
      expect(code).toContain('Failing')
    })

    it('computes passRate from completed runs', () => {
      expect(code).toContain("r.status === 'completed'")
      expect(code).toContain("r.conclusion === 'success'")
      expect(code).toContain('Math.round((passedRuns.length / completedRuns.length) * 100)')
    })

    it('declares platform color map used by chart segments', () => {
      expect(code).toContain('OCP')
      expect(code).toContain('GKE')
      expect(code).toContain('CKS')
      expect(code).toContain('platformColors')
    })
  })

  describe('nightly_release_pulse', () => {
    const code = generateCICardRender('nightly_release_pulse', helpers)!

    it('renders repos + runs stat blocks', () => {
      expect(code).toContain('Nightly Release Pulse')
      expect(code).toContain('Repos')
      expect(code).toContain('Runs')
      expect(code).toContain('data?.repos || []')
      expect(code).toContain('data?.runs || []')
    })
  })

  describe('workflow_matrix', () => {
    const code = generateCICardRender('workflow_matrix', helpers)!

    it('renders workflows/repos/days tiles', () => {
      expect(code).toContain('Workflow Matrix')
      expect(code).toContain('Workflows')
      expect(code).toContain('Repos')
      expect(code).toContain('Days')
      expect(code).toContain('data?.days || 0')
    })
  })

  describe('pipeline_flow', () => {
    const code = generateCICardRender('pipeline_flow', helpers)!

    it('splits runs by conclusion into passed/failed counts', () => {
      expect(code).toContain('Pipeline Flow')
      expect(code).toContain("r.conclusion === 'success'")
      expect(code).toContain("r.conclusion === 'failure'")
      expect(code).toContain('Passed')
      expect(code).toContain('Failed')
    })

    it('shows summary line combining run + repo counts', () => {
      expect(code).toContain('{runs.length} runs across {repos.length} repos')
    })
  })

  describe('recent_failures', () => {
    const code = generateCICardRender('recent_failures', helpers)!

    it('filters runs by conclusion=failure and slices to 6', () => {
      expect(code).toContain('Recent Failures')
      expect(code).toContain(".filter(r => r.conclusion === 'failure').slice(0, 6)")
    })

    it('renders empty-state text when there are no failures', () => {
      expect(code).toContain('No recent failures')
    })
  })

  describe('issue_activity_chart', () => {
    const code = generateCICardRender('issue_activity_chart', helpers)!

    it('renders Daily Issues & PRs header and per-run rows', () => {
      expect(code).toContain('Daily Issues & PRs')
      expect(code).toContain('const recent = runs.slice(0, 6)')
      expect(code).toContain('No recent activity')
    })

    it('colors row status by conclusion', () => {
      expect(code).toContain("r.conclusion === 'success'")
      expect(code).toContain("r.conclusion === 'failure'")
    })
  })

  describe('github_ci_monitor', () => {
    const code = generateCICardRender('github_ci_monitor', helpers)!

    it('renders workflows + repos stat blocks', () => {
      expect(code).toContain('GitHub CI Monitor')
      expect(code).toContain('Workflows')
      expect(code).toContain('Repos')
    })
  })

  describe('github_activity', () => {
    const code = generateCICardRender('github_activity', helpers)!

    it('renders top 6 repos and total run count', () => {
      expect(code).toContain('GitHub Activity')
      expect(code).toContain('repos.slice(0, 6)')
      expect(code).toContain('{runs.length} recent runs')
      expect(code).toContain('No activity data')
    })

    it('handles repo entries that are strings or {name,repo} objects', () => {
      expect(code).toContain("typeof r === 'string' ? r : (r.name || r.repo)")
    })
  })

  describe('helper-string interpolation', () => {
    it('embeds each helper string in every returned template', () => {
      for (const cardType of CI_CARD_TYPES) {
        const code = generateCICardRender(cardType, helpers)!
        expect(code, `${cardType} missing parseBlock`).toContain(helpers.parseBlock)
        expect(code, `${cardType} missing wrapOpen`).toContain(helpers.wrapOpen)
        expect(code, `${cardType} missing wrapClose`).toContain(helpers.wrapClose)
        expect(code, `${cardType} missing issueButton`).toContain(helpers.issueButton)
      }
    })
  })
})
