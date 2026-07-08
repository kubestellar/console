/**
 * Unit tests for OPA card types and POLICY_TEMPLATES constants.
 *
 * Validates structural integrity of templates to catch regressions
 * in policy YAML generation and form validation logic.
 */
import { describe, it, expect } from 'vitest'
import { POLICY_TEMPLATES } from '../types'
import type { Violation, Policy, GatekeeperStatus, OPAClusterItem } from '../types'

// ---------------------------------------------------------------------------
// POLICY_TEMPLATES structural validation
// ---------------------------------------------------------------------------

describe('POLICY_TEMPLATES', () => {
  it('has at least 3 templates', () => {
    expect(POLICY_TEMPLATES.length).toBeGreaterThanOrEqual(3)
  })

  it('every template has required fields', () => {
    for (const tmpl of POLICY_TEMPLATES) {
      expect(tmpl.name).toBeTruthy()
      expect(tmpl.description).toBeTruthy()
      expect(tmpl.kind).toBeTruthy()
      expect(tmpl.template).toBeTruthy()
    }
  })

  it('every template name is unique', () => {
    const names = POLICY_TEMPLATES.map(t => t.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('every template kind is unique', () => {
    const kinds = POLICY_TEMPLATES.map(t => t.kind)
    expect(new Set(kinds).size).toBe(kinds.length)
  })

  it('every template YAML contains apiVersion for ConstraintTemplate', () => {
    for (const tmpl of POLICY_TEMPLATES) {
      expect(tmpl.template).toContain('apiVersion: templates.gatekeeper.sh/v1')
    }
  })

  it('every template YAML contains kind: ConstraintTemplate', () => {
    for (const tmpl of POLICY_TEMPLATES) {
      expect(tmpl.template).toContain('kind: ConstraintTemplate')
    }
  })

  it('every template YAML contains a rego policy block', () => {
    for (const tmpl of POLICY_TEMPLATES) {
      expect(tmpl.template).toContain('rego: |')
    }
  })

  it('every template YAML contains violation rule', () => {
    for (const tmpl of POLICY_TEMPLATES) {
      expect(tmpl.template).toContain('violation[')
    }
  })

  it('every template YAML contains a constraint instance (--- separator)', () => {
    for (const tmpl of POLICY_TEMPLATES) {
      expect(tmpl.template).toContain('---')
      // The constraint should reference the template kind
      expect(tmpl.template).toContain(`kind: ${tmpl.kind}`)
    }
  })

  it('every template has enforcementAction set', () => {
    for (const tmpl of POLICY_TEMPLATES) {
      expect(tmpl.template).toMatch(/enforcementAction:\s*(warn|deny|dryrun)/)
    }
  })
})

// ---------------------------------------------------------------------------
// Type guard / shape tests (compile-time + runtime shape validation)
// ---------------------------------------------------------------------------

describe('OPA type shapes', () => {
  it('Violation interface has expected fields', () => {
    const violation: Violation = {
      name: 'pod-no-limits',
      namespace: 'default',
      kind: 'Pod',
      policy: 'require-resource-limits',
      message: 'Container app does not have CPU limits',
      severity: 'warning',
    }
    expect(violation.severity).toMatch(/^(critical|warning|info)$/)
    expect(violation.name).toBeTruthy()
  })

  it('Policy interface has expected fields', () => {
    const policy: Policy = {
      name: 'require-labels',
      kind: 'K8sRequiredLabels',
      violations: 3,
      mode: 'warn',
    }
    expect(policy.mode).toMatch(/^(warn|enforce|dryrun|deny)$/)
    expect(policy.violations).toBeGreaterThanOrEqual(0)
  })

  it('GatekeeperStatus interface fields', () => {
    const status: GatekeeperStatus = {
      cluster: 'prod-east',
      installed: true,
      policyCount: 5,
      violationCount: 12,
      mode: 'warn',
      loading: false,
      policies: [],
      violations: [],
    }
    expect(status.installed).toBe(true)
    expect(status.cluster).toBe('prod-east')
  })

  it('GatekeeperStatus with error state', () => {
    const status: GatekeeperStatus = {
      cluster: 'dev-west',
      installed: false,
      loading: false,
      error: 'Connection refused',
    }
    expect(status.error).toBe('Connection refused')
    expect(status.installed).toBe(false)
  })

  it('OPAClusterItem has cluster field matching name', () => {
    const item: OPAClusterItem = {
      name: 'prod-cluster',
      cluster: 'prod-cluster',
      healthy: true,
      reachable: true,
    }
    expect(item.cluster).toBe(item.name)
  })
})
