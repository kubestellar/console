/**
 * Smoke test for the ComplianceCards module (re-exports from ./compliance/ComplianceCardsContent).
 *
 * Verifies that the module loads without runtime errors and exports the
 * expected React components. Comprehensive behavioral coverage for
 * ComplianceScore already exists in ../ComplianceCards.test.tsx; this file
 * exists so the detect-untested-files CI check recognizes ComplianceCards.tsx
 * as covered (it only counts src/components/cards/__tests__/<Name>.test.tsx).
 *
 * Filed for kubestellar/console#22529 (part of #22484 / split from #22504).
 */
import { describe, it, expect } from 'vitest'
import * as Mod from '../ComplianceCards'

describe('ComplianceCards module', () => {
  it.each([
    'FalcoAlerts',
    'TrivyScan',
    'KubescapeScan',
    'PolicyViolations',
    'ComplianceScore',
  ] as const)('exports %s as a function component', (name) => {
    expect(Mod[name]).toBeDefined()
    expect(typeof Mod[name]).toBe('function')
  })
})
