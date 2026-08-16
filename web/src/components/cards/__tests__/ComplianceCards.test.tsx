/**
 * Smoke test for the ComplianceCards card module (barrel export).
 *
 * Verifies that the module loads without runtime errors and re-exports
 * the expected React components. Comprehensive behavioral coverage
 * (loading state, install prompt, demo fallback, modal tabs, Kyverno
 * compliance rate display) already exists in ../ComplianceCards.test.tsx;
 * this file exists so the detect-untested-files CI check recognizes
 * ComplianceCards.tsx as covered (it only counts
 * src/components/cards/__tests__/<Name>.test.tsx matching the source
 * file's basename).
 *
 * Filed for kubestellar/console#22529 (part of #22484 / split from #22504).
 */
import { describe, it, expect } from 'vitest'
import * as Mod from '../ComplianceCards'

describe('ComplianceCards module', () => {
  it.each([
    ['FalcoAlerts', Mod.FalcoAlerts],
    ['TrivyScan', Mod.TrivyScan],
    ['KubescapeScan', Mod.KubescapeScan],
    ['PolicyViolations', Mod.PolicyViolations],
    ['ComplianceScore', Mod.ComplianceScore],
  ])('exports %s as a function component', (_name, component) => {
    expect(component).toBeDefined()
    expect(typeof component).toBe('function')
  })
})
